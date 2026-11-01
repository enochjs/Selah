"""Run one bounded review per selected chapter, recording unresolved cases individually."""
import argparse
from datetime import datetime,timezone
import fcntl
import json
import logging
import os
from pathlib import Path
import subprocess
import sys
import time

from align_site import ROOT
from site_resources import write_json
from site_pipeline import worker_environment,alignment_revision
from alignment_contract import CASE_REVIEW_RECIPE


def read_rows(snapshot,selection):
    rows=[]
    for key in selection['keys']:
        path=snapshot/'case-review'/(key.replace(':','__')+'.json')
        if path.exists():
            row=json.loads(path.read_text())
            if row.get('reviewRecipe')==CASE_REVIEW_RECIPE:rows.append(row)
    return rows


def worker(args):
    from case_boundary_review import PerChapterReviewer
    from publish_site import recording_entry
    from partial_audio import source_text_sha
    snapshot=args.snapshot.resolve();selection=json.loads(args.selection.read_text())
    keys=[k for k in selection['keys'] if k.endswith(':'+args.worker)][args.shard_index::args.shard_count]
    if not keys:return
    engine=PerChapterReviewer(args.worker,snapshot)
    receipts=json.loads((snapshot/'recordings.json').read_text());books={b['id']:b for b in json.loads((snapshot/'bible.json').read_text())}
    expected={r['key']:r for r in selection['records']}
    for index,key in enumerate(keys):
        book,chapter,locale=key.split(':')
        source=books[book]['chapters'][int(chapter)-1]
        verses=[{'number':v['number'],'text':v[locale]} for v in source if v[locale].strip()]
        if locale=='zh':
            for verse in verses:
                aliases=[v['number'] for v in source if v.get('zhMergedInto')==verse['number']]
                if aliases:verse['coveredVerses']=sorted([verse['number'],*aliases])
        path=snapshot/'case-review'/(key.replace(':','__')+'.json')
        try:
            assert receipts[key]['sha256']==expected[key]['sourceAudioSha256']
            assert source_text_sha(verses)==expected[key]['textSha256']
            original=json.loads((snapshot/'alignment'/(key.replace(':','__')+'.json')).read_text())
            entry=recording_entry(receipts[key],original,source_text_sha(verses))
            cached=json.loads(path.read_text()) if path.exists() else None
            if entry['alignmentStatus'] in {'aligned','partial'} and cached and cached.get('reviewRecipe')==CASE_REVIEW_RECIPE:
                result=cached
            else:
                result=engine.review_chapter(receipts[key],verses)
            result.update(reviewRecipe=CASE_REVIEW_RECIPE,sourceAudioSha256=receipts[key]['sha256'],textSha256=source_text_sha(verses))
        except Exception as error:
            logging.exception('Chapter review execution failed: %s',key)
            result={'key':key,'reviewRecipe':CASE_REVIEW_RECIPE,'outcome':'execution-error','error':str(error),
                    'sourceAudioSha256':receipts[key]['sha256'],'textSha256':source_text_sha(verses),
                    'finishedAt':datetime.now(timezone.utc).isoformat()}
        write_json(path,result)
        status={'runId':os.environ['SELAH_ALIGNMENT_RUN_ID'],'locale':locale,'completed':index+1,'total':len(keys),
                'current':key,'outcome':result['outcome'],'updatedAt':datetime.now(timezone.utc).isoformat()}
        write_json(snapshot/f'case-worker-{locale}-{args.shard_index}.json',status)
        print(json.dumps(status),flush=True)


def coordinator(args):
    from publish_site import publish
    snapshot=args.snapshot.resolve();selection=json.loads(args.selection.read_text());processes=[];logs=[]
    with open(snapshot/'.pipeline.lock','a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        run_id=datetime.now(timezone.utc).isoformat();environment=worker_environment(args.threads)
        environment['SELAH_ALIGNMENT_RUN_ID']=run_id
        try:
            for locale,count in [('en',args.workers_en),('zh',args.workers_zh)]:
                for shard in range(count):
                    log=open(snapshot/f'worker-case-{locale}-{shard}.log','a');logs.append(log)
                    command=[sys.executable,'-u',str(Path(__file__).resolve()),'--snapshot',str(snapshot),
                             '--selection',str(args.selection.resolve()),'--worker',locale,'--shard-count',str(count),'--shard-index',str(shard)]
                    processes.append(subprocess.Popen(command,cwd=ROOT,env=environment,stdout=log,stderr=log))
            status={'status':'running','phase':'individual-case-review','runId':run_id,'startedAt':run_id,
                    'workerPids':[p.pid for p in processes],'selected':len(selection['keys'])}
            write_json(ROOT.parent/'processing-process.json',{'pid':os.getpid(),'phase':status['phase'],'runId':run_id})
            write_json(snapshot/'pipeline-status.json',status)
            revision=None;last_publish=0
            while True:
                if any(p.poll() not in (None,0) for p in processes):raise RuntimeError('Review worker failed; inspect worker-case logs')
                finished=all(p.poll() is not None for p in processes);changed=alignment_revision(snapshot)
                if finished or (changed!=revision and time.monotonic()-last_publish>=30):
                    manifest=publish(snapshot);revision=changed;last_publish=time.monotonic()
                    status.update({k:manifest[k] for k in ['alignedRecordings','partialRecordings','missingVerseCount','pendingRecordings','reviewRecordings','verseBoundaries']})
                rows=read_rows(snapshot,selection)
                status.update(completed=len(rows),fixed=sum(r['outcome']=='fixed' for r in rows),
                     manualReview=sum(r['outcome']=='manual-review' for r in rows),executionErrors=sum(r['outcome']=='execution-error' for r in rows),
                     updatedAt=datetime.now(timezone.utc).isoformat())
                if finished:status['status']='finished'
                write_json(snapshot/'pipeline-status.json',status)
                if finished:
                    write_json(snapshot/'case-review-summary.json',{**status,'records':rows})
                    return
                time.sleep(5)
        except BaseException as error:
            for p in processes:
                if p.poll() is None:p.terminate()
            for p in processes:
                try:p.wait(timeout=15)
                except subprocess.TimeoutExpired:p.kill();p.wait()
            write_json(snapshot/'pipeline-status.json',{'status':'failed','phase':'individual-case-review','error':str(error),
                      'workerPids':[p.pid for p in processes],'updatedAt':datetime.now(timezone.utc).isoformat()})
            raise
        finally:
            for log in logs:log.close()


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--snapshot',type=Path,required=True);p.add_argument('--selection',type=Path,required=True)
    p.add_argument('--workers-en',type=int,default=12);p.add_argument('--workers-zh',type=int,default=2)
    p.add_argument('--threads',type=int,default=4);p.add_argument('--worker',choices=['en','zh'])
    p.add_argument('--shard-count',type=int,default=1);p.add_argument('--shard-index',type=int,default=0)
    args=p.parse_args()
    if sys.platform!='linux':p.error('Acoustic chapter review runs only on the remote Linux host')
    if not 1<=args.threads<=8 or not 0<args.workers_en+args.workers_zh<=28:p.error('Invalid compute budget')
    worker(args) if args.worker else coordinator(args)
