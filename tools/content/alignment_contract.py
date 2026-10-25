"""Shared, ML-free identity of the website audio verification recipe."""
import hashlib
import json
from boundary_quality import POLICY as BOUNDARY_POLICY
from joint_boundaries import JOINT_CONTEXT

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
FULL_MODEL = 'Systran/faster-whisper-large-v3'
FULL_REVISION = 'edaa852ec7e145841d8ffdb056a99866b5f0a478'
FULL_MODEL_SHA256 = '69f74147e3334731bc3a76048724833325d2ec74642fb52620eda87352e3d4f1'
DEEP_RECOGNIZER = 'whisper-small+ct2-large-v3-turbo+ct2-large-v3'
BOUNDARY_RECOGNIZER = 'whisper-small-anchors+wav2vec2-verse-edges'
RECOGNIZERS = {'Systran/faster-whisper-small': RECOGNIZER_REVISION,
               TURBO_MODEL: TURBO_REVISION,
               HYBRID_MODEL: RECOGNIZER_REVISION + '+' + TURBO_REVISION,
               CPU_HYBRID_MODEL: RECOGNIZER_REVISION + '+' + CPU_TURBO_REVISION,
               DEEP_RECOGNIZER: RECOGNIZER_REVISION + '+' + CPU_TURBO_REVISION + '+' + FULL_REVISION,
               BOUNDARY_RECOGNIZER: RECOGNIZER_REVISION}
CLIP_PROFILE = 'atrim-mono-24khz-mp3-64k-v1'
LEGACY_QUALITY_RECIPE = 'independent-retry-en025-zh10-full-narration-phonetic-heading-v3'
ACOUSTIC_QUALITY_RECIPE = 'independent-en025-zh10-cmu113-acoustic-recovery-heading-proof2-v6'
PREVIOUS_QUALITY_RECIPE = 'independent-en025-zh10-source-meta-075d7c318fcb-coverage-proof-v8'
QUALITY_RECIPE = 'independent-en025-zh10-attested-glosses-coverage-proof-v9'
PREVIOUS_SOURCE_REVIEW_RECIPE = 'independent-en025-zh10-vad-source-meta-075d7c318fcb-coverage-proof-v8'
SOURCE_REVIEW_RECIPE = 'independent-en025-zh10-vad-attested-glosses-coverage-proof-v9'
DEEP_REVIEW_RECIPE = 'independent-en025-zh10-full-v3-attested-glosses-coverage-proof-v10'
BOUNDARY_REVIEW_RECIPE = 'acoustic-verse-boundaries-v11-' + hashlib.sha256(
    json.dumps(BOUNDARY_POLICY, sort_keys=True).encode()).hexdigest()[:12]
BOUNDARY_CONTEXT_RECIPE = 'acoustic-joint-verse-boundaries-v12-' + hashlib.sha256(
    json.dumps([BOUNDARY_POLICY, JOINT_CONTEXT], sort_keys=True).encode()).hexdigest()[:12]
PREVIOUS_BOUNDARY_CONTEXT_RECIPE = 'acoustic-joint-verse-boundaries-v12-6610408fda43'
BOUNDARY_CONTEXT_RECIPES = {PREVIOUS_BOUNDARY_CONTEXT_RECIPE, BOUNDARY_CONTEXT_RECIPE}
BOUNDARY_RECIPES = {BOUNDARY_REVIEW_RECIPE, *BOUNDARY_CONTEXT_RECIPES}
CONTEXT_REVIEW_RECIPE = 'independent-en025-zh10-bounded-context-replay-v7'
PSALM_CAPTION_REFERENCE_SHA256 = '075d7c318fcbb805afce9a8613547c4cfc910cf695fa86b9a31ade7ddaa9a644'
SUPPORTED_RECIPES = {LEGACY_QUALITY_RECIPE,
                     'independent-en025-zh10-spoken-notes-numbers-superscriptions-v5',
                     'independent-en025-zh10-spoken-notes-numbers-heading-v4', QUALITY_RECIPE,
                     CONTEXT_REVIEW_RECIPE, ACOUSTIC_QUALITY_RECIPE, SOURCE_REVIEW_RECIPE,
                     PREVIOUS_QUALITY_RECIPE, PREVIOUS_SOURCE_REVIEW_RECIPE, DEEP_REVIEW_RECIPE,
                     *BOUNDARY_RECIPES}


def site_fingerprint(media_sha, text_sha, locale, recipe=QUALITY_RECIPE,
                     recognizer='Systran/faster-whisper-small'):
    identity = ('whisper-small:' + RECOGNIZER_REVISION if recipe == LEGACY_QUALITY_RECIPE
                else recognizer + ':' + RECOGNIZERS[recognizer])
    return hashlib.sha256(json.dumps([
        METHOD, ALIGN_REVISIONS[locale], identity,
        CLIP_PROFILE, recipe, media_sha, text_sha,
    ]).encode()).hexdigest()
