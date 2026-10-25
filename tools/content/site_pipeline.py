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


def alignment_revision(snapshot):
    reports = list((snapshot / 'alignment').glob('*.json'))
    return len(reports), sum(path.stat().st_mtime_ns for path in reports)


def worker_environment(threads):
    if not 1 <= threads <= 8:
        raise ValueError('Worker threads must be between 1 and 8')
    environment = os.environ.copy()
    for name in ['SELAH_ALIGNMENT_THREADS', 'OMP_NUM_THREADS', 'MKL_NUM_THREADS', 'OPENBLAS_NUM_THREADS']:
        environment[name] = str(threads)
    environment['HF_HUB_OFFLINE'] = '1'
    environment['TRANSFORMERS_OFFLINE'] = '1'
    return environment


def aggregate_worker_status(snapshot, locale, shards, run_id):
    statuses = []
    for shard in range(shards):
        path = snapshot / f'alignment-status-{locale}-{shard}.json'
        if path.is_file():
            status = json.loads(path.read_text())
            if status.get('runId') == run_id:
                statuses.append(status)
    if not statuses:
        return
    latest = max(statuses, key=lambda status: status['updatedAt'])
    combined = {**latest, 'shardCount': shards, 'workers': statuses}
    for name in ['completed', 'total', 'accepted']:
        combined[name] = sum(status[name] for status in statuses)
    write_json(snapshot / f'alignment-status-{locale}.json', combined)


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
        deep_review = getattr(args, 'deep_review', False)
        boundary_review = getattr(args, 'boundary_review', False)
        if deep_review and args.locale != 'en':
            raise ValueError('Full model review requires --locale en')
        if args.source_review or deep_review:
            from source_metadata import load_psalm_captions
            load_psalm_captions(snapshot, required=True)
        python = ROOT / 'tools/content/.venv-align/bin/python'
        if not python.is_file():
            raise RuntimeError('Install the offline alignment environment described in tools/content/README.md')
        workers, logs = [], []
        locales = [args.locale] if args.locale else ['en', 'zh']
        environment = worker_environment(args.threads_per_worker)
        run_id = datetime.now(timezone.utc).isoformat()
        environment['SELAH_ALIGNMENT_RUN_ID'] = run_id
        try:
            for locale in locales:
                for shard in range(args.jobs_per_locale):
                    suffix = f'-{shard}' if args.jobs_per_locale > 1 else ''
                    log = open(snapshot / f'worker-{locale}{suffix}.log', 'a')
                    logs.append(log)
                    command = [str(python), '-u', str(ROOT / 'tools/content/align_site.py'),
                               '--snapshot', str(snapshot), '--locale', locale,
                               '--shard-count', str(args.jobs_per_locale), '--shard-index', str(shard)]
                    if args.keys:
                        command.extend(['--keys', args.keys])
                    if args.limit:
                        command.extend(['--limit', str(args.limit)])
                    if args.review_rejected:
                        command.append('--review-rejected')
                    if args.source_review:
                        command.append('--source-review')
                    if deep_review:
                        command.append('--deep-review')
                    if boundary_review:
                        command.append('--boundary-review')
                    workers.append(subprocess.Popen(command, cwd=ROOT, env=environment, stdout=log, stderr=log))
            status = {'status': 'running', 'snapshot': snapshot.name,
                      'jobsPerLocale': args.jobs_per_locale, 'threadsPerWorker': args.threads_per_worker,
                      'startedAt': datetime.now(timezone.utc).isoformat(), 'workerPids': [p.pid for p in workers]}
            write_json(snapshot / 'pipeline-status.json', status)
            published = (-1, -1)
            last_publication = 0
            while True:
                if args.jobs_per_locale > 1:
                    for locale in locales:
                        aggregate_worker_status(snapshot, locale, args.jobs_per_locale, run_id)
                failed = [worker.returncode for worker in workers if worker.poll() not in (None, 0)]
                if failed:
                    raise RuntimeError('Alignment worker failed; inspect the snapshot worker logs')
                revision = alignment_revision(snapshot)
                completed = revision[0]
                finished = all(worker.poll() is not None for worker in workers)
                if (published[0] < 0 or completed - published[0] >= 10 or finished
                        or (revision != published and time.monotonic() - last_publication >= 30)):
                    manifest = publish(snapshot)
                    published = revision
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
    parser.add_argument('--jobs-per-locale', type=int, choices=range(1, 9), default=1)
    parser.add_argument('--threads-per-worker', type=int, choices=range(1, 9), default=4)
    review = parser.add_mutually_exclusive_group()
    review.add_argument('--review-rejected', action='store_true')
    review.add_argument('--source-review', action='store_true')
    review.add_argument('--deep-review', action='store_true')
    review.add_argument('--boundary-review', action='store_true')
    args = parser.parse_args()
    if args.resume_current:
        manifest = json.loads((ROOT / 'packages/content/data/resource-manifest.json').read_text())
        name = manifest.get('sourceSnapshot', '')
        if not name or Path(name).name != name:
            parser.error('The current resource set has no resumable website snapshot')
        args.snapshot = ROOT / 'storage/resources/cache' / name
    run(args)
