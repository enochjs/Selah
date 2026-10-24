"""Shared, ML-free identity of the website audio verification recipe."""
import hashlib
import json

METHOD = 'whisperx-3.8.6-phoneme-alignment-v1'
ALIGN_MODELS = {'en': 'facebook/wav2vec2-base-960h',
                'zh': 'jonatasgrosman/wav2vec2-large-xlsr-53-chinese-zh-cn'}
ALIGN_REVISIONS = {'en': '22aad52d435eb6dbaf354bdad9b0da84ce7d6156',
                   'zh': '99ccb2737be22b8bb50dcfcc39ad4d567fb90cfd'}
RECOGNIZER_REVISION = '536b0662742c02347bc0e980a01041f333bce120'
TURBO_MODEL = 'mlx-community/whisper-large-v3-turbo'
TURBO_REVISION = 'a4aaeec0636e6fef84abdcbe3544cb2bf7e9f6fb'
HYBRID_MODEL = 'whisper-small+large-v3-turbo'
CPU_TURBO_MODEL = 'mobiuslabsgmbh/faster-whisper-large-v3-turbo'
CPU_TURBO_REVISION = '0a363e9161cbc7ed1431c9597a8ceaf0c4f78fcf'
CPU_HYBRID_MODEL = 'whisper-small+ct2-large-v3-turbo'
RECOGNIZERS = {'Systran/faster-whisper-small': RECOGNIZER_REVISION,
               TURBO_MODEL: TURBO_REVISION,
               HYBRID_MODEL: RECOGNIZER_REVISION + '+' + TURBO_REVISION,
               CPU_HYBRID_MODEL: RECOGNIZER_REVISION + '+' + CPU_TURBO_REVISION}
CLIP_PROFILE = 'atrim-mono-24khz-mp3-64k-v1'
LEGACY_QUALITY_RECIPE = 'independent-retry-en025-zh10-full-narration-phonetic-heading-v3'
QUALITY_RECIPE = 'independent-en025-zh10-cmu113-acoustic-recovery-heading-proof2-v6'
SUPPORTED_RECIPES = {LEGACY_QUALITY_RECIPE,
                     'independent-en025-zh10-spoken-notes-numbers-superscriptions-v5',
                     'independent-en025-zh10-spoken-notes-numbers-heading-v4', QUALITY_RECIPE}


def site_fingerprint(media_sha, text_sha, locale, recipe=QUALITY_RECIPE,
                     recognizer='Systran/faster-whisper-small'):
    identity = ('whisper-small:' + RECOGNIZER_REVISION if recipe == LEGACY_QUALITY_RECIPE
                else recognizer + ':' + RECOGNIZERS[recognizer])
    return hashlib.sha256(json.dumps([
        METHOD, ALIGN_REVISIONS[locale], identity,
        CLIP_PROFILE, recipe, media_sha, text_sha,
    ]).encode()).hexdigest()
