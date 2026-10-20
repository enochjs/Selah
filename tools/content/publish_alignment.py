"""Publish only fingerprint-matched, quality-checked acoustic timestamps."""
import fcntl
import json
from pathlib import Path
from forced_alignment import MODELS, METHOD, SCHEMA_VERSION, alignment_fingerprint, verified_alignment, file_sha256

ROOT = Path(__file__).resolve().parents[2]


def apply_artifact(recording, artifact, fingerprint, verses, locale, alignment_root):
    # Published provider audio is paired with its own text/time base. Legacy
    # local alignment caches must never overwrite these resources.
    if recording.get('provider'):
        return dict(recording)
    recording = dict(recording)
    recording.update(path=recording.get('originalPath', recording['path']),
                     duration=recording.get('originalDuration', recording['duration']),
                     segments=[], timingQuality='unaligned', alignmentStatus='pending')
    recording.pop('alignment', None)
    recording.pop('alignmentIssues', None)
    if not artifact or artifact.get('schemaVersion') != SCHEMA_VERSION or artifact.get('fingerprint') != fingerprint or artifact.get('method') != METHOD:
        return recording
    recording.update(alignmentStatus='review-required', alignmentIssues=artifact.get('quality', {}).get('reasons', []))
    media_path = artifact.get('mediaPath', '')
    name = media_path.rsplit('/', 1)[-1]
    import re
    if not re.fullmatch(r'[a-f0-9]{64}\.mp3', name): return recording
    media = alignment_root/'media'/name
    if not media.is_file() or file_sha256(media) != artifact.get('mediaSha256'): return recording
    recording.update(path=media_path, duration=round(artifact['duration'], 3), alignmentStatus='review-required',
                     alignment={'method':METHOD,'fingerprint':fingerprint,'model':artifact['model'],
                                'mediaSha256':artifact['mediaSha256'],'sourceAudioSha256':artifact['audioSha256']})
    verified = verified_alignment(artifact, fingerprint, verses, artifact['duration'], locale)
    if verified:
        from forced_alignment import assess_alignment
        checked = assess_alignment(verses, verified['segments'], artifact['duration'], locale)
        recording.update(segments=checked['segments'], timingQuality='forced-alignment', alignmentStatus='aligned')
    else:
        recording.update(segments=[], timingQuality='unaligned', alignmentIssues=artifact.get('quality', {}).get('reasons', []))
    return recording


def update_manifest(catalog, manifest):
    manifest.update(recordings=len(catalog), alignedRecordings=sum(bool(r['segments']) for r in catalog.values()),
                    verseBoundaries=sum(len(r['segments']) for r in catalog.values()),
                    chapterOnlyRecordings=[key for key,r in catalog.items() if not r['segments']],
                    pendingRecordings=sum(r.get('alignmentStatus') == 'pending' for r in catalog.values()),
                    reviewRecordings=sum(r.get('alignmentStatus') == 'review-required' for r in catalog.values()),
                    timingQuality='acoustic CTC forced alignment; unverified/low-confidence chapters play as whole chapters',
                    alignmentMethod=METHOD, models={k:{'id':v[0],'revision':v[1]} for k,v in MODELS.items()})


def publish(paths, root=ROOT):
    directory = root/'storage/alignment'
    directory.mkdir(exist_ok=True)
    with open(directory/'.publish.lock', 'a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        books = json.loads((root/'packages/content/data/bible.json').read_text())
        catalog = json.loads((root/'packages/content/data/chapter-audio.json').read_text())
        if any(r.get('provider') for r in catalog.values()):
            print('Provider resources are active; legacy alignment publication is ignored.')
            return
        manifest = json.loads((root/'packages/content/data/resource-manifest.json').read_text())
        lookup = {(b['id'], i+1): c for b in books for i,c in enumerate(b['chapters'])}
        for path in paths:
            artifact = json.loads(path.read_text())
            key = artifact['key']; book, chapter, locale = key.split(':')
            verses = [{'number':v['number'],'text':v[locale]} for v in lookup[(book,int(chapter))] if v[locale].strip()]
            fingerprint = alignment_fingerprint(artifact['audioSha256'], verses, locale, MODELS[locale][1])
            if key in catalog:
                catalog[key] = apply_artifact(catalog[key], artifact, fingerprint, verses, locale, directory)
        update_manifest(catalog, manifest)
        for name, data in [('chapter-audio.json', catalog), ('resource-manifest.json', manifest)]:
            target = root/'packages/content/data'/name; temporary = target.with_suffix('.tmp')
            temporary.write_text(json.dumps(data,ensure_ascii=False,separators=(',',':'))+'\n')
            temporary.replace(target)


if __name__ == '__main__':
    publish(sorted((ROOT/'storage/alignment/chapters').glob('*.json')))
