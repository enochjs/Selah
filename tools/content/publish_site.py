"""Publish a complete website snapshot and only its matching WhisperX results."""
import argparse
from datetime import datetime, timezone
import fcntl
import hashlib
import json
from pathlib import Path
import shutil
import tempfile

from site_resources import SITE, write_json
from media_assets import file_matches
from alignment_contract import METHOD, site_fingerprint

ROOT = Path(__file__).resolve().parents[2]


def recording_entry(receipt, artifact, text_sha):
    result = {'path': receipt['path'], 'originalPath': receipt['path'],
              'duration': receipt['duration'], 'segments': [], 'timingQuality': 'unaligned',
              'alignmentStatus': 'pending', 'mediaSha256': receipt['sha256'],
              'sourceUrl': receipt['url'], 'sourceSite': SITE,
              'voiceType': 'human', 'translationId': 'niv' if receipt['locale'] == 'en' else 'cuv'}
    if (not artifact or artifact.get('method') != METHOD or artifact.get('key') != receipt['key']
            or artifact.get('sourceAudioSha256') != receipt['sha256']
            or artifact.get('textSha256') != text_sha
            or artifact.get('fingerprint') != site_fingerprint(receipt['sha256'], text_sha, receipt['locale'])):
        return result
    result.update(alignmentStatus='review-required', alignmentIssues=artifact['issues'])
    if artifact['accepted']:
        result.update(timingQuality='verse-file', alignmentStatus='aligned',
                      verseFiles=artifact['verseFiles'], vttFile=artifact['vttFile'],
                      vttSha256=artifact['vttSha256'],
                      alignment={'method': METHOD, 'fingerprint': artifact['fingerprint'],
                                 'textSha256': text_sha, 'sourceAudioSha256': receipt['sha256']})
    return result


def publish(snapshot, root=ROOT):
    with open(root / 'storage/resources/.import.lock', 'a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        return publish_locked(snapshot, root)


def publish_locked(snapshot, root):
    snapshot = snapshot.resolve()
    if not (snapshot / 'download-complete.json').is_file():
        raise ValueError('Finish downloading all website resources before publication')
    books = json.loads((snapshot / 'bible.json').read_text())
    receipts = json.loads((snapshot / 'recordings.json').read_text())
    if (len(books) != 66 or sum(len(b['chapters']) for b in books) != 1189
            or len(receipts) != 2378):
        raise ValueError('Incomplete website snapshot')
    catalog = {}
    for book in books:
        for chapter, verses in enumerate(book['chapters'], 1):
            for locale in ['en', 'zh']:
                key = f"{book['id']}:{chapter}:{locale}"
                texts = [{'number': v['number'], 'text': v[locale]} for v in verses if v[locale].strip()]
                if locale == 'zh':
                    for text in texts:
                        aliases = [v['number'] for v in verses if v.get('zhMergedInto') == text['number']]
                        if aliases:
                            text['coveredVerses'] = sorted([text['number'], *aliases])
                text_sha = hashlib.sha256(json.dumps(texts, ensure_ascii=False, sort_keys=True).encode()).hexdigest()
                artifact_path = snapshot / 'alignment' / (key.replace(':', '__') + '.json')
                artifact = json.loads(artifact_path.read_text()) if artifact_path.is_file() else None
                entry = recording_entry(receipts[key], artifact, text_sha)
                if not file_matches(root / 'storage/resources/media' / (receipts[key]['sha256'] + '.mp3'),
                                    receipts[key]['sha256']):
                    raise ValueError(f'Missing or corrupt source recording: {key}')
                if entry.get('verseFiles'):
                    if not file_matches(root / 'storage/resources/timings' / entry['vttFile'], entry['vttSha256']):
                        raise ValueError(f'Missing or corrupt WebVTT: {key}')
                    for item in entry['verseFiles']:
                        if not file_matches(root / 'storage/resources/media' / (item['sha256'] + '.mp3'), item['sha256']):
                            raise ValueError(f'Missing or corrupt verse clip: {key}:{item["verse"]}')
                catalog[key] = entry
    aligned = sum(bool(r.get('verseFiles')) for r in catalog.values())
    manifest = {
        'resourceSet': 'chineseandenglishbible-v2', 'sourceSite': SITE,
        'importedAt': datetime.now(timezone.utc).isoformat(),
        'sourceSnapshot': snapshot.name, 'timedTextFormat': 'WebVTT', 'alignmentMethod': METHOD,
        'books': 66, 'chapters': 1189, 'recordings': 2378,
        'alignedRecordings': aligned, 'verseFileRecordings': aligned,
        'pendingRecordings': sum(r['alignmentStatus'] == 'pending' for r in catalog.values()),
        'reviewRecordings': sum(r['alignmentStatus'] == 'review-required' for r in catalog.values()),
        'verseBoundaries': sum(len(r.get('verseFiles', [])) for r in catalog.values()),
        'chapterOnlyRecordings': [key for key, r in catalog.items() if not r.get('verseFiles')],
        'timingQuality': 'WhisperX phoneme alignment, independent ASR correspondence, isolated MP3 verse files',
        'versions': {
            'en': {'id': 'niv', 'name': 'New International Version', 'voiceType': 'human',
                   'reader': 'NIV dramatized · BibleGateway', 'textSource': SITE + '/bible/niv/',
                   'audioSource': 'https://stream.biblegateway.com/bibles/32/niv-dramatized/',
                   'attribution': 'Holy Bible, New International Version®, NIV®. Copyright © 1973, 1978, 1984, 2011 by Biblica, Inc.®',
                   'license': 'Copyright retained by the original rights holders'},
            'zh': {'id': 'cuv', 'name': '和合本', 'voiceType': 'human',
                   'reader': 'WordProject 普通话真人朗读', 'textSource': SITE + '/bible/mandarin/',
                   'audioSource': 'https://wordproaudio.org/bibles/app/audio/4/',
                   'attribution': '中文和合本；普通话录音来自 WordProject，按站点当前资源地址重新下载。',
                   'license': 'Original source terms; no additional redistribution license granted'},
        },
    }
    resources = root / 'storage/resources'
    content = root / 'packages/content/data'
    previous = json.loads((content / 'resource-manifest.json').read_text())
    if previous.get('sourceSnapshot') != snapshot.name:
        backup_root = resources / 'backups'
        backup_root.mkdir(exist_ok=True)
        backup = Path(tempfile.mkdtemp(prefix='content-', dir=backup_root))
        for name in ['bible.json', 'chapter-audio.json', 'resource-manifest.json']:
            shutil.copy2(content / name, backup / name)
        print('Previous content backed up:', backup, flush=True)
    for name, value in [('bible.json', books), ('chapter-audio.json', catalog),
                        ('resource-manifest.json', manifest)]:
        write_json(content / name, value)
    print(json.dumps({k: manifest[k] for k in ['recordings', 'alignedRecordings', 'pendingRecordings',
                                              'reviewRecordings', 'verseBoundaries']}), flush=True)
    return manifest


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--snapshot', type=Path, required=True)
    args = parser.parse_args()
    publish(args.snapshot)
