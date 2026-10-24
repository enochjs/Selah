"""Validate published Bible text, provider timings and verse MP3s without ML."""
import math
import re
import hashlib
import json
from forced_alignment import assess_alignment, MODELS, METHOD


def canonical_text_sha256(verses):
    return hashlib.sha256(json.dumps(verses,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()).hexdigest()


def verified_local_timing(override, key, media_sha, verses, duration, audit):
    """Accept a local supplement only for the exact, independently checked asset."""
    try:
        if (override['schemaVersion']!=1 or override['key']!=key or not key.endswith(':en')
            or override['translationId']!='BSB' or override['reader']!='Barry Hays'
            or override['method']!=METHOD or override['model']!={'id':MODELS['en'][0],'revision':MODELS['en'][1]}
            or override['mediaSha256']!=media_sha or override['textSha256']!=canonical_text_sha256(verses)
            or not override['quality']['accepted'] or override['unclaimedSpeech']): return None
        checked=assess_alignment(verses,override['segments'],duration,'en')
        if not checked['accepted']: return None
        if (audit['key']!=key or audit['mediaSha256']!=media_sha or audit['recognizer']!='Systran/faster-whisper-small'
            or not 0 <= audit['globalNormalizedErrorRate'] <= .05
            or [v['verse'] for v in audit['checks']] != [v['number'] for v in verses]
            or len(audit['boundaryDbfs'])!=len(verses)+1
            or not all(math.isfinite(v) and v<=-45 for v in audit['boundaryDbfs'])): return None
        for verse,segment,check in zip(verses,override['segments'],audit['checks']):
            if (not 0 <= check['normalizedErrorRate'] <= .1 or check['printedText']!=verse['text']
                or check['start']!=segment['start'] or check['end']!=segment['end']): return None
        return checked['segments']
    except (KeyError,TypeError,ValueError,OverflowError):
        return None


def assert_legacy_catalog(catalog):
    if any(r.get('provider') for r in catalog.values()):
        raise ValueError('This dataset uses paired provider resources. Use npm run resources:import; legacy jobs cannot replace it.')
    if any(r.get('sourceSite') for r in catalog.values()):
        raise ValueError('Website resources are active. Use npm run resources:align; legacy jobs cannot replace them.')


def merged_verse_aliases(verses):
    aliases = {}
    for number,text in verses.items():
        match = re.fullmatch(r'〔(\d+)[～~–-](\d+)〕',text)
        if not match: continue
        start,end = map(int,match.groups())
        if not start <= number < end or end not in verses or not re.search(r'[\u3400-\u9fff]',verses[end]):
            raise ValueError(f'Unresolved merged verse: {number}: {text}')
        aliases[number]=end
    return aliases


def flatten_content(content):
    parts = []
    for item in content:
        if isinstance(item, str):
            parts.append(item)
        elif isinstance(item, dict) and 'text' in item:
            parts.append(item['text'])
        elif isinstance(item, dict) and item.get('lineBreak'):
            parts.append('\n')
    return re.sub(r' *\n *', '\n', ' '.join(parts)).strip()


def provider_segments(numbers, starts, duration):
    if not numbers or len(numbers) != len(starts) or len(set(numbers)) != len(numbers):
        raise ValueError('Provider timing does not cover the canonical verses')
    if not math.isfinite(duration) or duration <= 0:
        raise ValueError('Invalid recording duration')
    result = []
    for i, (verse, start) in enumerate(zip(numbers, starts)):
        end = starts[i+1] if i+1 < len(starts) else duration
        if not all(isinstance(v, (int,float)) and math.isfinite(v) for v in [start,end]) or not 0 <= start < end <= duration:
            raise ValueError(f'Invalid provider timing for verse {verse}')
        result.append([verse, start, end])
    return result


def verse_audio_reference(name, book):
    match = re.fullmatch(r'(\d+)_(\d+)/CUVs_(\d+)_(\d+)_(\d+)\.mp3', name)
    if not match:
        raise ValueError(f'Unexpected verse filename: {name}')
    folder_book, folder_chapter, file_book, chapter, verse = map(int, match.groups())
    if folder_book != book or file_book != book or folder_chapter != chapter or min(chapter,verse) < 1:
        raise ValueError(f'Inconsistent verse filename: {name}')
    return chapter, verse


def validate_verse_files(numbers, files):
    if [f['verse'] for f in files] != numbers:
        raise ValueError('Verse files must cover each canonical verse exactly once, in order')
    for f in files:
        if not re.fullmatch(r'/api/audio/resources/[a-f0-9]{64}\.mp3', f['path']) or not math.isfinite(f['duration']) or f['duration'] <= 0:
            raise ValueError(f'Invalid verse file: {f}')
