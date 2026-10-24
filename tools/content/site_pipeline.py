"""Download, independently align and publish the website's full resource set."""
import argparse
from datetime import datetime, timezone
import fcntl
import json
import os
from pathlib import Path
import subprocess
import sys
import time

from download_site import run as download
from publish_site import publish
from site_resources import write_json

ROOT = Path(__file__).resolve().parents[2]


def run(args):
    snapshot = args.snapshot.resolve()
    snapshot.mkdir(parents=True, exist_ok=True)
    with open(snapshot / '.pipeline.lock', 'a') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise RuntimeError('A pipeline is already processing this snapshot')
        if not (snapshot / 'download-complete.json').is_file():
            download(snapshot, args.workers)
        if args.download_only:
            return
        python = ROOT / 'tools/content/.venv-align/bin/python'
        if not python.is_file():
            raise RuntimeError('Install the offline alignment environment described in tools/content/README.md')
        workers, logs = [], []
        locales = [args.locale] if args.locale else ['en', 'zh']
        environment = os.environ.copy()
        environment['HF_HUB_OFFLINE'] = '1'
        environment['TRANSFORMERS_OFFLINE'] = '1'
        try:
            for locale in locales:
                log = open(snapshot / f'worker-{locale}.log', 'a')
                logs.append(log)
                command = [str(python), '-u', str(ROOT / 'tools/content/align_site.py'),
                           '--snapshot', str(snapshot), '--locale', locale]
                if args.keys:
                    command.extend(['--keys', args.keys])
                if args.limit:
                    command.extend(['--limit', str(args.limit)])
                workers.append(subprocess.Popen(command, cwd=ROOT, env=environment, stdout=log, stderr=log))
            status = {'status': 'running', 'snapshot': snapshot.name,
                      'startedAt': datetime.now(timezone.utc).isoformat(), 'workerPids': [p.pid for p in workers]}
            write_json(snapshot / 'pipeline-status.json', status)
            published = -1
            last_publication = 0
            while True:
                failed = [worker.returncode for worker in workers if worker.poll() not in (None, 0)]
                if failed:
                    raise RuntimeError('Alignment worker failed; inspect the snapshot worker logs')
                completed = len(list((snapshot / 'alignment').glob('*.json')))
                finished = all(worker.poll() is not None for worker in workers)
                if (published < 0 or completed - published >= 10 or finished
                        or (completed > published and time.monotonic() - last_publication >= 30)):
                    manifest = publish(snapshot)
                    published = completed
                    last_publication = time.monotonic()
                    status.update(processed=completed, **{key: manifest[key] for key in
                                  ['alignedRecordings', 'pendingRecordings', 'reviewRecordings', 'verseBoundaries']})
                    status['updatedAt'] = datetime.now(timezone.utc).isoformat()
                    write_json(snapshot / 'pipeline-status.json', status)
                if finished:
                    status['status'] = 'finished'
                    write_json(snapshot / 'pipeline-status.json', status)
                    return
                time.sleep(5)
        except BaseException as error:
            write_json(snapshot / 'pipeline-status.json', {'status': 'failed', 'error': str(error),
                       'updatedAt': datetime.now(timezone.utc).isoformat()})
            for worker in workers:
                if worker.poll() is None:
                    worker.terminate()
            for worker in workers:
                try:
                    worker.wait(timeout=15)
                except subprocess.TimeoutExpired:
                    worker.kill()
            raise
        finally:
            for log in logs:
                log.close()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--snapshot', type=Path, default=ROOT / 'storage/resources/cache' /
                        ('site-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')))
    parser.add_argument('--workers', type=int, default=6)
    parser.add_argument('--resume-current', action='store_true')
    parser.add_argument('--download-only', action='store_true')
    parser.add_argument('--locale', choices=['en', 'zh'])
    parser.add_argument('--keys')
    parser.add_argument('--limit', type=int, default=0)
    args = parser.parse_args()
    if args.resume_current:
        manifest = json.loads((ROOT / 'packages/content/data/resource-manifest.json').read_text())
        name = manifest.get('sourceSnapshot', '')
        if not name or Path(name).name != name:
            parser.error('The current resource set has no resumable website snapshot')
        args.snapshot = ROOT / 'storage/resources/cache' / name
    run(args)
