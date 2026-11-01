"""Remote-only acoustic cardinal repair; publish only source-bound verified results."""
import argparse
import copy
from datetime import datetime,timezone
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time

from align_site import ROOT,SiteAligner
from alignment_contract import (NUMERIC_REVIEW_RECIPE,BOUNDARY_REVIEW_RECIPE,PADDING_REVIEW_RECIPE,
                                GAP_REVIEW_RECIPE,site_fingerprint)
from boundary_context_review import PaddingBoundaryAligner,review_joint_artifact
from boundary_quality import verified_boundary_artifact,boundary_gap_issues,verse_boundary
from numeric_alignment import NUMERIC_POLICY,expansion,collapse_words
from spoken_text import boundary_text
from site_resources import write_json


def restore_nonnumeric_boundaries(artifact,original,receipt):
    """Recheck unaffected single-verse evidence instead of losing it on a rerun."""
    from publish_site import recording_entry
    if (original.get('textSha256')!=artifact.get('textSha256')
            or recording_entry(receipt,original,artifact['textSha256'])['alignmentStatus']=='pending'):
        return []
    source={v['number']:v for v in artifact['boundarySourceVerses']}
    checks={c['verse']:c for c in artifact['checks']};cues={c['verse']:c for c in artifact['cues']}
    recognized=[w for segment in artifact.get('recognition',[]) for w in segment.get('words',[])]
    restored=[]
    for old in original['checks']:
        number=old['verse'];verse=source.get(number);current=checks.get(number)
        if (not verse or re.search(r'\d',verse['text']) or old['text']!=verse['text']
                or not isinstance(old.get('alignedWords'),list) or not old['alignedWords']
                or not isinstance(old.get('searchRange'),list) or len(old['searchRange'])!=2
                or old.get('jointProofId') or old.get('jointClipRange') is not None
                or (current and current.get('jointProofId')) or number in cues):continue
        anchors=old.get('asrEdgeAnchors',[])
        if anchors and any(a not in recognized for a in anchors):continue
        try:
            edges,evidence=verse_boundary(old['alignedWords'],old['searchRange'],artifact['duration'],'en',
                reference=boundary_text(verse['text'],'en'),signal=old.get('boundarySignal'),anchors=anchors)
        except (KeyError,TypeError,ValueError,IndexError):continue
        if edges is None:continue
        cue={'verse':number,'text':verse['text'],'start':edges[0],'end':edges[1]}
        candidate=sorted([*cues.values(),cue],key=lambda c:c['verse'])
        if any(a['end']>b['start'] for a,b in zip(candidate,candidate[1:])):continue
        checks[number]={**copy.deepcopy(old),'boundaryVerified':True,'boundaryEvidence':evidence}
        cues[number]=cue;restored.append(number)
    if restored:
        artifact['checks']=[checks[n] for n in sorted(checks)];artifact['cues']=[cues[n] for n in sorted(cues)]
        artifact['issues']=[issue for issue in artifact['issues'] if issue not in
            {f'{kind}:{n}' for n in restored for kind in ['unreliable-verse-boundary','invalid-phoneme-boundary']}
            and not issue.startswith('boundary-unassigned-speech:')]
        artifact['issues'].extend(boundary_gap_issues(artifact['unclaimedSpeech'],artifact['cues']))
        artifact['accepted']=not artifact['issues'] and len(cues)==len(source)
        artifact['numericUnaffectedReuse']={'sourceFingerprint':original['fingerprint'],'verses':restored}
    return restored


class NumericBoundaryAligner(PaddingBoundaryAligner):
    force_realign=True
    def __init__(self,locale,snapshot):
        if locale!='en':raise ValueError('This cardinal repair is English only')
        super().__init__(locale,snapshot)
        self.recipe=NUMERIC_REVIEW_RECIPE

    def word_candidates(self,audio,text,bounds):
        from whisperx.alignment import align
        candidates=[]
        for variant in (NUMERIC_POLICY['variants'] if re.search(r'\d',text) else ['plain']):
            try:reference,groups=expansion(text,self.locale,variant)
            except ValueError:return []
            aligned=align([{'start':bounds[0],'end':bounds[1],'text':reference}],self.model,self.metadata,
                          audio,self.device,interpolate_method='ignore',return_char_alignments=False)
            raw=[w for segment in aligned['segments'] for w in segment['words']]
            try:candidates.append(collapse_words(raw,groups,variant))
            except ValueError:continue
        return candidates

    def align_words(self,audio,text,bounds):
        candidates=self.word_candidates(audio,text,bounds)
        if not candidates:return []
        return max(candidates,key=lambda words:sum(w['score'] for w in words)/max(1,len(words)))

    def verify_range(self,audio,window,start,end,initial=None):
        candidates=self.word_candidates(audio,boundary_text(window['text'],self.locale),[start,end])
        assessed=[self.assess_words(audio,window,words,start,end,initial=initial) for words in candidates]
        if not assessed:return self.assess_words(audio,window,[],start,end,initial=initial)
        return max(assessed,key=lambda pair:(pair[0] is not None,pair[1]['meanAlignmentScore']))

    def align_recording(self,receipt,verses,**unused):
        path=self.snapshot/'alignment'/(receipt['key'].replace(':','__')+'.json')
        if path.exists():
            original=json.loads(path.read_text())
            if original.get('qualityRecipe')==NUMERIC_REVIEW_RECIPE:
                from publish_site import recording_entry
                text_sha=hashlib.sha256(json.dumps(verses,ensure_ascii=False,sort_keys=True).encode()).hexdigest()
                if recording_entry(receipt,original,text_sha)['alignmentStatus']=='aligned':
                    audio_path=ROOT/'storage/resources/media'/(receipt['sha256']+'.mp3')
                    SiteAligner.materialize(self,original,receipt,verses,audio_path)
                    write_json(path,original)
                    return original
            backup=self.snapshot/'alignment-before-numeric-review'/path.name
            if not backup.exists():write_json(backup,original)
        return SiteAligner.align_recording(self,receipt,verses)

    def materialize(self,artifact,receipt,verses,audio_path):
        from whisperx.audio import load_audio
        from gap_review import decode_pcm
        from quiet_gaps import GAP_POLICY,measure_gaps,verified_quiet_gaps
        from media_assets import file_matches
        text_sha=artifact['textSha256'];base=BOUNDARY_REVIEW_RECIPE
        result=copy.deepcopy(artifact)
        result.pop('numericBaseRecipe',None);result.pop('numericAlignmentPolicy',None)
        result.update(qualityRecipe=base,fingerprint=site_fingerprint(receipt['sha256'],text_sha,self.locale,base,self.recognizer_name))
        backup=self.snapshot/'alignment-before-numeric-review'/(receipt['key'].replace(':','__')+'.json')
        if backup.exists():restore_nonnumeric_boundaries(result,json.loads(backup.read_text()),receipt)
        if not result['accepted']:
            saved=self.recipe;self.recipe=PADDING_REVIEW_RECIPE
            try:result=review_joint_artifact(self,result,receipt,verses,load_audio(str(audio_path)))
            finally:self.recipe=saved
            base=PADDING_REVIEW_RECIPE
        if (not result['accepted'] and result['issues']
                and all(issue.startswith('boundary-unassigned-speech:') for issue in result['issues'])):
            import numpy as np
            from faster_whisper import vad
            model=Path(vad.__file__).parent/'assets/silero_vad_v6.onnx'
            if not file_matches(model,GAP_POLICY['vadModelSha256']):raise ValueError('Unexpected VAD model')
            pcm=decode_pcm(audio_path);audio=np.asarray(pcm,dtype=np.float32)/32768
            options=vad.VadOptions(threshold=GAP_POLICY['vadThreshold'],neg_threshold=GAP_POLICY['vadNegativeThreshold'],
                min_speech_duration_ms=GAP_POLICY['vadMinimumSpeechMs'],min_silence_duration_ms=GAP_POLICY['vadMinimumSilenceMs'],
                speech_pad_ms=GAP_POLICY['vadPaddingMs'])
            speech=[[v['start'],v['end']] for v in vad.get_speech_timestamps(audio,vad_options=options)]
            proof=measure_gaps(result,pcm,speech)
            if verified_quiet_gaps({**result,'acousticGapReview':proof}):
                base=GAP_REVIEW_RECIPE
                result.update(accepted=True,issues=[],acousticGapReview=proof,
                              gapReview={'recipe':base,'sourceFingerprint':result['fingerprint']})
        result.update(qualityRecipe=NUMERIC_REVIEW_RECIPE,numericBaseRecipe=base,
                      numericAlignmentPolicy=NUMERIC_POLICY,
                      fingerprint=site_fingerprint(receipt['sha256'],text_sha,self.locale,NUMERIC_REVIEW_RECIPE,self.recognizer_name))
        if result['accepted'] and not verified_boundary_artifact(result):raise ValueError('Numeric boundary publication verification failed')
        artifact.clear();artifact.update(result)
        SiteAligner.materialize(self,artifact,receipt,verses,audio_path)


def worker(args):
    from site_pipeline import worker_environment
    os.environ.update(worker_environment(args.threads))
    snapshot=args.snapshot.resolve();keys=json.loads(args.selection.read_text())['keys']
    selected=keys[args.worker_index::args.workers]
    if not selected:return
    engine=NumericBoundaryAligner('en',snapshot)
    receipts=json.loads((snapshot/'recordings.json').read_text())
    books={b['id']:b for b in json.loads((snapshot/'bible.json').read_text())}
    for index,key in enumerate(selected):
        book,chapter,locale=key.split(':')
        verses=[{'number':v['number'],'text':v[locale]} for v in books[book]['chapters'][int(chapter)-1] if v[locale].strip()]
        result=engine.align_recording(receipts[key],verses)
        status={'runId':os.environ.get('SELAH_ALIGNMENT_RUN_ID'),'locale':'en','completed':index+1,'total':len(selected),
                'current':key,'accepted':result['accepted'],'issues':result['issues'],'updatedAt':datetime.now(timezone.utc).isoformat()}
        write_json(snapshot/f'numeric-status-{args.worker_index}.json',status)
        print(json.dumps(status),flush=True)


def coordinator(args):
    from site_pipeline import worker_environment,alignment_revision
    from publish_site import publish
    snapshot=args.snapshot.resolve();processes=[];logs=[]
    with open(snapshot/'.pipeline.lock','a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        environment=worker_environment(args.threads);run_id=datetime.now(timezone.utc).isoformat()
        environment['SELAH_ALIGNMENT_RUN_ID']=run_id
        try:
            for index in range(args.workers):
                log=open(snapshot/f'worker-numeric-{index}.log','a');logs.append(log)
                command=[sys.executable,'-u',str(Path(__file__).resolve()),'--snapshot',str(snapshot),'--selection',str(args.selection.resolve()),
                         '--workers',str(args.workers),'--threads',str(args.threads),'--worker-index',str(index)]
                processes.append(subprocess.Popen(command,env=environment,stdout=log,stderr=log,cwd=ROOT))
            status={'status':'running','phase':'numeric-reading-repair','runId':run_id,'startedAt':run_id,'workerPids':[p.pid for p in processes]}
            write_json(snapshot/'pipeline-status.json',status)
            process_file=ROOT.parent/'processing-process.json'
            write_json(process_file,{'pid':os.getpid(),'phase':'numeric-reading-repair','runId':run_id})
            last_revision=None;last_publish=0
            while True:
                failed=[p.returncode for p in processes if p.poll() not in (None,0)]
                if failed:raise RuntimeError('Numeric worker failed; inspect worker-numeric logs')
                finished=all(p.poll() is not None for p in processes)
                revision=alignment_revision(snapshot)
                if finished or (revision!=last_revision and time.monotonic()-last_publish>=30):
                    manifest=publish(snapshot);last_revision=revision;last_publish=time.monotonic()
                    status.update({k:manifest[k] for k in ['alignedRecordings','partialRecordings','missingVerseCount','pendingRecordings','reviewRecordings','verseBoundaries']})
                states=[]
                for index in range(args.workers):
                    path=snapshot/f'numeric-status-{index}.json'
                    if path.exists():
                        item=json.loads(path.read_text())
                        if item.get('runId')==run_id:states.append(item)
                status.update(completed=sum(item['completed'] for item in states),total=len(json.loads(args.selection.read_text())['keys']),
                              updatedAt=datetime.now(timezone.utc).isoformat(),workers=states)
                if finished:status['status']='finished'
                write_json(snapshot/'pipeline-status.json',status)
                if finished:return
                time.sleep(5)
        except BaseException as error:
            for process in processes:
                if process.poll() is None:process.terminate()
            for process in processes:
                try:process.wait(timeout=15)
                except subprocess.TimeoutExpired:process.kill();process.wait()
            write_json(snapshot/'pipeline-status.json',{'status':'failed','phase':'numeric-reading-repair',
                       'error':str(error),'workerPids':[p.pid for p in processes],
                       'updatedAt':datetime.now(timezone.utc).isoformat()})
            raise
        finally:
            for log in logs:log.close()


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--snapshot',type=Path,required=True)
    parser.add_argument('--selection',type=Path,required=True)
    parser.add_argument('--workers',type=int,default=14)
    parser.add_argument('--threads',type=int,default=4)
    parser.add_argument('--worker-index',type=int)
    args=parser.parse_args()
    if sys.platform!='linux':parser.error('Acoustic numeric repair must run on the remote Linux machine')
    if not 1<=args.workers<=28 or not 1<=args.threads<=8:parser.error('Invalid worker/thread budget')
    worker(args) if args.worker_index is not None else coordinator(args)
