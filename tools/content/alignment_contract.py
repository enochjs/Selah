"""Shared, ML-free identity of the website audio verification recipe."""
import hashlib
import json

METHOD = 'whisperx-3.8.6-phoneme-alignment-v1'
ALIGN_MODELS = {'en': 'facebook/wav2vec2-base-960h',
                'zh': 'jonatasgrosman/wav2vec2-large-xlsr-53-chinese-zh-cn'}
ALIGN_REVISIONS = {'en': '22aad52d435eb6dbaf354bdad9b0da84ce7d6156',
                   'zh': '99ccb2737be22b8bb50dcfcc39ad4d567fb90cfd'}
RECOGNIZER_REVISION = '536b0662742c02347bc0e980a01041f333bce120'
CLIP_PROFILE = 'atrim-mono-24khz-mp3-64k-v1'
QUALITY_RECIPE = 'independent-retry-en025-zh10-full-narration-phonetic-heading-v3'


def site_fingerprint(media_sha, text_sha, locale):
    return hashlib.sha256(json.dumps([
        METHOD, ALIGN_REVISIONS[locale], 'whisper-small:' + RECOGNIZER_REVISION,
        CLIP_PROFILE, QUALITY_RECIPE, media_sha, text_sha,
    ]).encode()).hexdigest()
