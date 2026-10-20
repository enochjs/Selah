"""Quality/provenance contract for acoustic CTC alignment (no ML dependency).

CTC scores are log posteriors, not calibrated probabilities of correctness.
The decoder CER catches a forced path through words that were never spoken.
"""
import hashlib
import json
import math
import re

SCHEMA_VERSION = 5
MEDIA_PROFILE = 'mono-24khz-mp3-64k-v1'
METHOD = 'ctc-forced-alignment'
TEXT_RECIPE = {'en': 'english-spoken-numbers-v1', 'zh': 'mandarin-complete-numerals-v2'}
QUALITY_LIMITS = {'en': {'minScore': -2.5, 'maxCer': .20}, 'zh': {'minScore': -1.5, 'maxCer': .15}}
MODELS = {
    'en': ('facebook/wav2vec2-base-960h', '22aad52d435eb6dbaf354bdad9b0da84ce7d6156'),
    'zh': ('MahmoudAshraf/mms-300m-1130-forced-aligner', '49402e9577b1158620820667c218cd494cc44486'),
}

def assess_alignment(verses, segments, duration, locale):
    expected = [v['number'] for v in verses if v['text'].strip()]
    reasons = []
    if [s['verse'] for s in segments] != expected:
        reasons.append('missing-verses')
    previous_end = 0
    texts = {v['number']: v['text'] for v in verses}
    for segment in segments:
        start, end = segment['start'], segment['end']
        score, cer = segment['score'], segment['cer']
        if not all(math.isfinite(v) for v in [start, end, score, cer, duration]):
            reasons.append(f"nonfinite:{segment['verse']}")
            continue
        if not 0 <= previous_end <= start < end <= duration or end-start < .35:
            reasons.append(f"invalid-range:{segment['verse']}")
        units = len(re.findall(r'[\u3400-\u9fff]', texts.get(segment['verse'], ''))) if locale == 'zh' else len(texts.get(segment['verse'], '').split())
        if units / max(end-start, .001) > (12 if locale == 'zh' else 8):
            reasons.append(f"implausible-speech-rate:{segment['verse']}")
        if score < QUALITY_LIMITS[locale]['minScore'] or score > .001 or not 0 <= cer <= QUALITY_LIMITS[locale]['maxCer']:
            reasons.append(f"text-audio-mismatch:{segment['verse']}")
        previous_end = end
    return {'accepted': not reasons, 'segments': [[s['verse'], s['start'], s['end']] for s in segments] if not reasons else [], 'reasons': reasons}

def alignment_fingerprint(audio_sha256, verses, locale, model_revision):
    payload = [SCHEMA_VERSION, MEDIA_PROFILE, METHOD, TEXT_RECIPE[locale], QUALITY_LIMITS[locale], audio_sha256, verses, locale, model_revision]
    return hashlib.sha256(json.dumps(payload, ensure_ascii=False, sort_keys=True).encode()).hexdigest()

def verified_alignment(artifact, fingerprint, verses=None, duration=None, locale=None):
    if not artifact or artifact.get('schemaVersion') != SCHEMA_VERSION or artifact.get('method') != METHOD or artifact.get('fingerprint') != fingerprint:
        return None
    if verses is not None:
        try:
            if not assess_alignment(verses, artifact['segments'], duration, locale)['accepted']:
                return None
        except (KeyError, TypeError, ValueError):
            return None
    return artifact if artifact.get('quality', {}).get('accepted') else None

def file_sha256(path):
    digest = hashlib.sha256()
    with open(path, 'rb') as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()

def reusable_artifact(artifact, fingerprint, media_root):
    if not artifact or artifact.get('schemaVersion') != SCHEMA_VERSION or artifact.get('method') != METHOD or artifact.get('fingerprint') != fingerprint:
        return False
    path = artifact.get('mediaPath', '')
    if not re.fullmatch(r'/api/audio/aligned/[a-f0-9]{64}\.mp3', path): return False
    media = media_root/path.rsplit('/', 1)[-1]
    return media.is_file() and file_sha256(media) == artifact.get('mediaSha256')

def character_error_rate(reference, hypothesis):
    reference = ''.join(c for c in reference.casefold() if c.isalnum())
    hypothesis = ''.join(c for c in hypothesis.casefold() if c.isalnum())
    row = list(range(len(hypothesis)+1))
    for i, a in enumerate(reference, 1):
        following = [i]
        for j, b in enumerate(hypothesis, 1):
            following.append(min(row[j]+1, following[-1]+1, row[j-1]+(a != b)))
        row = following
    return row[-1] / max(1, len(reference))
