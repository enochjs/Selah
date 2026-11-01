"""Lightweight remote status, verified result import, and guarded task cleanup.

This command never starts a local recognizer or acoustic alignment model.
"""
import argparse
import fcntl
import hashlib
import json
from pathlib import Path
import re
import shlex
import subprocess
import tempfile

from publish_site import publish
from site_resources import write_json
from media_assets import file_matches

ROOT = Path(__file__).resolve().parents[2]
CONFIG = ROOT / 'storage/resources/remote-audio-repair.json'


def temporary_root(value):
    if not re.fullmatch(r'/home/linkmore/selah-audio-repair-\d{8}-[a-z0-9_]{6,32}', value):
        raise ValueError('Refusing a path outside the dedicated temporary task directory')
    return value


def required_files(artifacts):
    media, timings = set(), set()
    for artifact in artifacts:
        if not artifact.get('accepted'):
            continue
        hashes = [artifact['sourceAudioSha256'], *[item['sha256'] for item in artifact['verseFiles']]]
        if not all(re.fullmatch('[a-f0-9]{64}', value) for value in hashes):
            raise ValueError('Invalid content-addressed audio file')
        vtt = artifact['vttSha256']
        if not re.fullmatch('[a-f0-9]{64}', vtt) or artifact['vttFile'] != vtt + '.vtt':
            raise ValueError('Invalid content-addressed timing file')
        media.update(value + '.mp3' for value in hashes)
        timings.add(vtt + '.vtt')
    return media, timings


def files_to_copy(destination, names):
    return {name for name in names if not file_matches(destination / name, name.split('.')[0])}


def cleanup_ready(status, alive, local_catalog_hash, remote_catalog_hash):
    full,partial=status.get('alignedRecordings'),status.get('partialRecordings',0)
    return (status.get('status') == 'finished' and not alive
            and type(full) is int and type(partial) is int and full>=0 and partial>=0
            and full+partial == status.get('recordings',2378)
            and status.get('pendingRecordings') == 0 and status.get('reviewRecordings') == 0
            and bool(local_catalog_hash) and local_catalog_hash == remote_catalog_hash)


def ssh_arguments(config):
    if not re.fullmatch('[a-zA-Z0-9_.-]+', config['host']) or not re.fullmatch('[a-zA-Z0-9_]+', config['user']):
        raise ValueError('Invalid SSH destination')
    port = int(config['port'])
    if not 1 <= port <= 65535:
        raise ValueError('Invalid SSH port')
    return ['ssh', '-p', str(port), '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15']


def remote_python(config, code):
    target = config['user'] + '@' + config['host']
    result = subprocess.run([*ssh_arguments(config), target, 'python3 -c ' + shlex.quote(code)],
                            capture_output=True, text=True, check=True, timeout=60)
    return json.loads(result.stdout)


def remote_status(config):
    directory = temporary_root(config['temporaryRoot'])
    snapshot = config['sourceSnapshot']
    if not re.fullmatch('[a-zA-Z0-9_-]+', snapshot):
        raise ValueError('Invalid snapshot')
    return remote_python(config, f'''
from pathlib import Path
import json,os,hashlib
root=Path({directory!r});project=root/'project';snapshot=project/'storage/resources/cache'/{snapshot!r}
def read(path):
    try:return json.loads(path.read_text())
    except (FileNotFoundError,json.JSONDecodeError):return {{}}
def alive(pid):
    if not isinstance(pid,int):return False
    try:
        stat=Path('/proc')/str(pid)/'stat'
        if not stat.exists() or stat.read_text().split()[2]=='Z':return False
        proc=Path('/proc')/str(pid)
        return str(root) in (proc/'cmdline').read_text() or (proc/'cwd').resolve().is_relative_to(root)
    except OSError:return False
process=read(root/'processing-process.json');pipeline=read(snapshot/'pipeline-status.json')
diagnostic_process=read(root/'remaining-gap-diagnostics-process.json')
diagnostic_workers=[]
for proc in Path('/proc').glob('[0-9]*'):
    try:
        pid=int(proc.name)
        if pid not in [os.getpid(),diagnostic_process.get('pid')] and 'python' in (proc/'exe').resolve().name and 'remaining_gap_diagnostics.py' in (proc/'cmdline').read_text() and alive(pid):
            diagnostic_workers.append({{'pid':pid,'alive':True}})
    except (OSError,ValueError):pass
catalog=project/'packages/content/data/chapter-audio.json'
manifest=read(project/'packages/content/data/resource-manifest.json')
summary={{key:manifest.get(key) for key in ['recordings','alignedRecordings','partialRecordings','missingVerseCount','missingFragmentCount','verseFileRecordings','pendingRecordings',
    'reviewRecordings','verseBoundaries','importedAt','sourceSnapshot']}}
print(json.dumps({{'pipeline':pipeline,'manifest':summary,
    'pid':process.get('pid'),'alive':alive(process.get('pid')),
    'workers':[{{'pid':pid,'alive':alive(pid)}} for pid in pipeline.get('workerPids',[])],
    'diagnostics':{{'pid':diagnostic_process.get('pid'),'alive':alive(diagnostic_process.get('pid')),
        'workers':diagnostic_workers,'progress':read(snapshot/'remaining-gap-diagnostics-status.json')}},
    'languages':{{locale:read(snapshot/f'alignment-status-{{locale}}.json') for locale in ['en','zh']}},
    'markers':[p.name for p in root.glob('*-ready')],
    'catalogSha256':hashlib.sha256(catalog.read_bytes()).hexdigest() if catalog.exists() else None}}))
''')


def copy_remote(config, source, destination, names=None, compress=False):
    destination.mkdir(parents=True, exist_ok=True)
    if names is not None:
        names = files_to_copy(destination, names)
        if not names:
            return
    with tempfile.TemporaryDirectory(prefix='selah-audio-sync-') as directory:
        command = ['rsync', '-rlt', '--partial']
        if compress:
            command.append('-z')
        if names is not None:
            listing = Path(directory) / 'files.txt'
            listing.write_text('\n'.join(sorted(names)) + '\n')
            command.extend(['--ignore-times', '--files-from=' + str(listing)])
        command.extend(['-e', shlex.join(ssh_arguments(config)),
                        config['user'] + '@' + config['host'] + ':' + source + '/', str(destination) + '/'])
        subprocess.run(command, check=True)


def synchronize(config):
    directory = temporary_root(config['temporaryRoot'])
    snapshot = ROOT / 'storage/resources/cache' / config['sourceSnapshot']
    staging = ROOT / 'storage/resources/remote-import' / Path(directory).name
    reports = staging / 'alignment'
    copy_remote(config, directory + '/project/storage/resources/cache/' + config['sourceSnapshot'] + '/alignment',
                reports, compress=True)
    paths = list(reports.glob('*.json'))
    artifacts = [json.loads(path.read_text()) for path in paths]
    media, timings = required_files(artifacts)
    copy_remote(config, directory + '/project/storage/resources/media', ROOT / 'storage/resources/media', media)
    copy_remote(config, directory + '/project/storage/resources/timings', ROOT / 'storage/resources/timings', timings)
    backup = staging / 'before-sync'
    backup.mkdir(exist_ok=True)
    for path, artifact in zip(paths, artifacts):
        name = artifact['key'].replace(':', '__') + '.json'
        if path.name != name or not re.fullmatch(r'[a-z0-9-]+__[0-9]+__(en|zh)\.json', name):
            raise ValueError('Invalid alignment report filename')
        target = snapshot / 'alignment' / name
        if target.exists() and target.read_bytes() == path.read_bytes():
            continue
        if target.exists() and not (backup / name).exists():
            (backup / name).write_bytes(target.read_bytes())
        write_json(target, artifact)
    # Publication checks every source MP3, verified clip, VTT and fingerprint
    # before replacing the canonical content catalog. No ML model is loaded.
    manifest = publish(snapshot)
    config['state'] = 'synced'
    config['lastSyncedRecordings'] = manifest['alignedRecordings']
    config['lastSyncedPartialRecordings'] = manifest.get('partialRecordings',0)
    config['lastSyncedReviewRecordings'] = manifest['reviewRecordings']
    config['lastSyncedMissingVerseCount'] = manifest.get('missingVerseCount',0)
    config['lastSyncedMissingFragmentCount'] = manifest.get('missingFragmentCount',0)
    write_json(CONFIG, config)
    return {key: manifest[key] for key in ['alignedRecordings', 'partialRecordings', 'missingVerseCount', 'pendingRecordings', 'reviewRecordings']}


def cleanup(config):
    state = remote_status(config)
    status = {**state['pipeline'], **state['manifest']}
    local_hash = hashlib.sha256((ROOT / 'packages/content/data/chapter-audio.json').read_bytes()).hexdigest()
    diagnostics=state.get('diagnostics',{})
    if not cleanup_ready(status, state['alive'] or any(w['alive'] for w in state['workers'])
                         or diagnostics.get('alive',False) or any(w['alive'] for w in diagnostics.get('workers',[])),
                         local_hash, state['catalogSha256']):
        raise RuntimeError('Remote work is unfinished or its results have not been fully synchronized and verified')
    # Verify actual local media again immediately before deleting the only
    # remote task copy, rather than relying only on a prior catalog checksum.
    verified_manifest = publish(ROOT / 'storage/resources/cache' / config['sourceSnapshot'])
    verified_hash = hashlib.sha256((ROOT / 'packages/content/data/chapter-audio.json').read_bytes()).hexdigest()
    if not cleanup_ready({**state['pipeline'], **verified_manifest}, False,
                         verified_hash, state['catalogSha256']):
        raise RuntimeError('Final local media or alignment verification changed the published results')
    directory = temporary_root(config['temporaryRoot'])
    result = remote_python(config, f'''
from pathlib import Path
import json,shutil,fcntl,hashlib,os
root=Path({directory!r})
if root.is_symlink() or str(root.resolve())!={directory!r}:raise RuntimeError('Unsafe cleanup path')
marker=json.loads((root/'selah-temporary-task.json').read_text())
if marker.get('purpose')!='Selah audio alignment temporary task':raise RuntimeError('Missing task ownership marker')
snapshot=root/'project/storage/resources/cache'/{config['sourceSnapshot']!r}
lock=open(snapshot/'.pipeline.lock','a')
fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
review_lock=open(snapshot/'.remaining-gap-diagnostics.lock','a')
fcntl.flock(review_lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
for proc in Path('/proc').glob('[0-9]*'):
    try:
        if int(proc.name)!=os.getpid() and (proc/'stat').read_text().split()[2]!='Z' and (proc/'cwd').resolve().is_relative_to(root):
            raise RuntimeError('A process is still using the temporary task directory')
    except (FileNotFoundError,PermissionError,ProcessLookupError):pass
status=json.loads((snapshot/'pipeline-status.json').read_text())
manifest=json.loads((root/'project/packages/content/data/resource-manifest.json').read_text())
if status.get('status')!='finished' or manifest.get('pendingRecordings')!=0 or manifest.get('reviewRecordings')!=0:raise RuntimeError('Remote task is not complete')
catalog=root/'project/packages/content/data/chapter-audio.json'
if hashlib.sha256(catalog.read_bytes()).hexdigest()!={state['catalogSha256']!r}:raise RuntimeError('Remote catalog changed during verification')
shutil.rmtree(root)
print(json.dumps({{'deleted':str(root),'exists':root.exists()}}))
''')
    config['state'] = 'cleaned-up'
    write_json(CONFIG, config)
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['status', 'sync', 'cleanup'])
    args = parser.parse_args()
    config = json.loads(CONFIG.read_text())
    with open(ROOT / 'storage/resources/.remote-audio-sync.lock', 'a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        operation = {'status': remote_status, 'sync': synchronize, 'cleanup': cleanup}[args.action]
        print(json.dumps(operation(config), ensure_ascii=False))
