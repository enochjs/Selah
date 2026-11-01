"""Shared, ML-free identity of the website audio verification recipe."""
import hashlib
import json
from boundary_quality import POLICY as BOUNDARY_POLICY
from joint_boundaries import JOINT_CONTEXT
from quiet_gaps import GAP_POLICY
from joint_padding import PADDING_POLICY
from spoken_projection import PROJECTION_POLICY
from audio_coverage import COVERAGE_POLICY
from numeric_alignment import NUMERIC_POLICY
from anchor_windows import ANCHOR_WINDOW_POLICY
from case_evidence import CASE_POLICY
from speech_span import SPAN_POLICY
from speech_context import CONTEXT_POLICY
from word_pause import WORD_PAUSE_POLICY
from individual_boundaries import INDIVIDUAL_POLICY
from source_edges import SOURCE_EDGE_POLICY
from verse_completion import COMPLETION_POLICY
from gap_edges import GAP_EDGE_POLICY
from clock_edges import CLOCK_EDGE_POLICY,PHRASE_EDGE_POLICY
from reading_order import READING_ORDER_POLICY
from source_fragments import FRAGMENT_POLICY
from context_padding import CONTEXT_PADDING_POLICY,COMPLETE_HEAD_PADDING_POLICY
from reviewed_boundaries import REVIEWED_BOUNDARY_POLICY,HUMAN_SEAM_POLICY
from reviewed_weak_boundaries import REVIEWED_WEAK_POLICY
from reviewed_source_windows import REVIEWED_WINDOW_POLICY
from user_source_seams import USER_SOURCE_SEAM_POLICY,USER_PRESERVED_SEAM_POLICY
from official_source_prefixes import OFFICIAL_PREFIX_POLICY
from source_quantization import QUANTIZATION_POLICY
from reviewed_numeric_sources import REVIEWED_NUMERIC_SOURCE_POLICY,REVIEWED_NUMERIC_USER_POLICY
from reviewed_gap_sources import REVIEWED_GAP_SOURCE_POLICY
from reviewed_partial_sources import REVIEWED_PARTIAL_SOURCE_POLICY,REVIEWED_PARTIAL_HUMAN_POLICY
from reviewed_heading_sources import REVIEWED_HEADING_POLICY
from reviewed_source_context import REVIEWED_CONTEXT_POLICY
from reviewed_absent_fragments import REVIEWED_ABSENT_FRAGMENT_POLICY
from reviewed_user_gap_sources import REVIEWED_USER_GAP_POLICY
from reviewed_source_placeholders import REVIEWED_PLACEHOLDER_POLICY
from reviewed_confirmed_sources import REVIEWED_CONFIRMED_SOURCE_POLICY,REVIEWED_CONFIRMED_GAP_POLICY
from reviewed_coverage_windows import REVIEWED_COVERAGE_WINDOW_POLICY
from reviewed_background_sources import REVIEWED_BACKGROUND_SOURCE_POLICY
from reviewed_numbered_sources import REVIEWED_NUMBERED_SOURCE_POLICY
from reviewed_next_chapter_sources import REVIEWED_NEXT_CHAPTER_SOURCE_POLICY
from reviewed_saying_sources import REVIEWED_SAYING_SOURCE_POLICY
from reviewed_partitioned_zero_sources import REVIEWED_PARTITIONED_ZERO_POLICY
from reviewed_caption_models import REVIEWED_CAPTION_MODEL_POLICY
from reviewed_chronicles21_sources import REVIEWED_CHRONICLES21_SOURCE_POLICY
from reviewed_nehemiah7_sources import REVIEWED_NEHEMIAH7_SOURCE_POLICY,REVIEWED_NEHEMIAH7_USER_POLICY
from reviewed_saying_sources import REVIEWED_SAYING_USER_POLICY
from reviewed_psalm136_final import REVIEWED_PSALM136_FINAL_POLICY
from reviewed_companion_fragments import REVIEWED_COMPANION_FRAGMENT_POLICY
from reviewed_closing_captions import REVIEWED_CLOSING_CAPTION_POLICY
from reviewed_zero_clocks import REVIEWED_ZERO_CLOCK_POLICY
from reviewed_terminal_source_fragments import REVIEWED_TERMINAL_SOURCE_FRAGMENT_POLICY
from reviewed_missing_source_fragments import REVIEWED_MISSING_SOURCE_FRAGMENT_POLICY
from reviewed_anchor_sources import REVIEWED_ANCHOR_SOURCE_POLICY,REVIEWED_ANCHOR_USER_POLICY,REVIEWED_HUMAN_SOURCE_POLICY
from reviewed_ending_sources import REVIEWED_ENDING_SOURCE_POLICY
from reviewed_human_partial_sources import REVIEWED_HUMAN_PARTIAL_POLICY,REVIEWED_HUMAN_PROJECTED_PARTIAL_POLICY

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
PADDING_REVIEW_RECIPE = 'acoustic-joint-padding-v14-' + hashlib.sha256(
    json.dumps([BOUNDARY_POLICY, JOINT_CONTEXT, PADDING_POLICY],sort_keys=True).encode()).hexdigest()[:12]
BOUNDARY_CONTEXT_RECIPES = {PREVIOUS_BOUNDARY_CONTEXT_RECIPE, BOUNDARY_CONTEXT_RECIPE, PADDING_REVIEW_RECIPE}
GAP_REVIEW_RECIPE = 'acoustic-quiet-gap-v13-' + hashlib.sha256(
    json.dumps([BOUNDARY_POLICY, GAP_POLICY],sort_keys=True).encode()).hexdigest()[:12]
PROJECTION_REVIEW_RECIPE = 'acoustic-spoken-projection-v15-' + hashlib.sha256(
    json.dumps([BOUNDARY_POLICY, PROJECTION_POLICY],sort_keys=True).encode()).hexdigest()[:12]
PARTIAL_REVIEW_RECIPE = 'acoustic-confirmed-coverage-v16-' + hashlib.sha256(
    json.dumps([BOUNDARY_POLICY, PROJECTION_POLICY, COVERAGE_POLICY,
                'complete-unpadded-source-bound-group-reuse-v1'],sort_keys=True).encode()).hexdigest()[:12]
NUMERIC_REVIEW_RECIPE = 'acoustic-numeric-reading-v17-' + hashlib.sha256(
    json.dumps([BOUNDARY_POLICY, NUMERIC_POLICY, JOINT_CONTEXT, PADDING_POLICY, GAP_POLICY],sort_keys=True).encode()).hexdigest()[:12]
ANCHOR_WINDOW_RECIPE = 'acoustic-pause-anchor-v18-' + hashlib.sha256(
    json.dumps([BOUNDARY_POLICY, ANCHOR_WINDOW_POLICY, JOINT_CONTEXT, PADDING_POLICY],sort_keys=True).encode()).hexdigest()[:12]
CASE_REVIEW_RECIPE = 'acoustic-case-review-v19-' + hashlib.sha256(
    json.dumps([BOUNDARY_POLICY, CASE_POLICY, NUMERIC_POLICY, PADDING_POLICY, GAP_POLICY, COVERAGE_POLICY],sort_keys=True).encode()).hexdigest()[:12]
SPEECH_SPAN_RECIPE = 'acoustic-speech-span-v20-' + hashlib.sha256(
    json.dumps([BOUNDARY_POLICY, SPAN_POLICY],sort_keys=True).encode()).hexdigest()[:12]
SPEECH_CONTEXT_RECIPE = 'acoustic-speech-context-v21-' + hashlib.sha256(
    json.dumps([BOUNDARY_POLICY, CONTEXT_POLICY],sort_keys=True).encode()).hexdigest()[:12]
WORD_PAUSE_RECIPE = 'acoustic-local-word-pause-v22-' + hashlib.sha256(
    json.dumps([BOUNDARY_POLICY, WORD_PAUSE_POLICY],sort_keys=True).encode()).hexdigest()[:12]
INDIVIDUAL_REVIEW_RECIPE = 'acoustic-individual-boundaries-v23-' + hashlib.sha256(
    json.dumps([BOUNDARY_POLICY, INDIVIDUAL_POLICY],sort_keys=True).encode()).hexdigest()[:12]
SOURCE_EDGE_RECIPE = 'acoustic-source-voice-edges-v24-' + hashlib.sha256(
    json.dumps([BOUNDARY_POLICY,CASE_POLICY,SOURCE_EDGE_POLICY],sort_keys=True).encode()).hexdigest()[:12]
COMPLETION_RECIPE = 'acoustic-niv-table-continuations-v25-' + hashlib.sha256(
    json.dumps([BOUNDARY_POLICY,CASE_POLICY,SOURCE_EDGE_POLICY,COMPLETION_POLICY],sort_keys=True).encode()).hexdigest()[:12]
GAP_EDGE_RECIPE = 'acoustic-source-gap-ownership-v26-' + hashlib.sha256(
    json.dumps([BOUNDARY_POLICY,CASE_POLICY,GAP_EDGE_POLICY],sort_keys=True).encode()).hexdigest()[:12]
CLOCK_EDGE_RECIPE = 'acoustic-dual-clock-source-edges-v27-' + hashlib.sha256(
    json.dumps([BOUNDARY_POLICY,CLOCK_EDGE_POLICY],sort_keys=True).encode()).hexdigest()[:12]
PHRASE_EDGE_RECIPE = 'acoustic-independent-head-context-v28-' + hashlib.sha256(
    json.dumps([BOUNDARY_POLICY,PHRASE_EDGE_POLICY],sort_keys=True).encode()).hexdigest()[:12]
READING_ORDER_RECIPE = 'acoustic-source-reading-order-v29-' + hashlib.sha256(
    json.dumps([BOUNDARY_POLICY,CASE_POLICY,SOURCE_EDGE_POLICY,READING_ORDER_POLICY],sort_keys=True).encode()).hexdigest()[:12]
FRAGMENT_RECIPE = 'acoustic-source-terminal-fragment-v30-' + hashlib.sha256(
    json.dumps([BOUNDARY_POLICY,CASE_POLICY,SOURCE_EDGE_POLICY,FRAGMENT_POLICY],sort_keys=True).encode()).hexdigest()[:12]
CONTEXT_PADDING_RECIPE = 'acoustic-source-context-padding-v31-' + hashlib.sha256(
    json.dumps([BOUNDARY_POLICY,CONTEXT_PADDING_POLICY],sort_keys=True).encode()).hexdigest()[:12]
COMPLETE_HEAD_PADDING_RECIPE = 'acoustic-source-complete-head-padding-v32-' + hashlib.sha256(
    json.dumps([BOUNDARY_POLICY,COMPLETE_HEAD_PADDING_POLICY],sort_keys=True).encode()).hexdigest()[:12]
CONTEXT_PADDING_RECIPES={CONTEXT_PADDING_RECIPE,COMPLETE_HEAD_PADDING_RECIPE}
REVIEWED_BOUNDARY_RECIPE='acoustic-reviewed-source-boundaries-v33-'+hashlib.sha256(json.dumps(REVIEWED_BOUNDARY_POLICY,sort_keys=True).encode()).hexdigest()[:12]
REVIEWED_WEAK_RECIPE='acoustic-reviewed-weak-source-edges-v34-'+hashlib.sha256(json.dumps(REVIEWED_WEAK_POLICY,sort_keys=True).encode()).hexdigest()[:12]
HUMAN_SEAM_RECIPE='user-reviewed-natural-source-seam-v35-'+hashlib.sha256(json.dumps(HUMAN_SEAM_POLICY,sort_keys=True).encode()).hexdigest()[:12]
REVIEWED_WINDOW_RECIPE='acoustic-reviewed-original-source-window-v36-'+hashlib.sha256(json.dumps(REVIEWED_WINDOW_POLICY,sort_keys=True).encode()).hexdigest()[:12]
USER_SOURCE_SEAM_RECIPE='user-reviewed-source-seam-clock-v37-'+hashlib.sha256(json.dumps(USER_SOURCE_SEAM_POLICY,sort_keys=True).encode()).hexdigest()[:12]
OFFICIAL_PREFIX_RECIPE='acoustic-reviewed-official-source-prefix-v38-'+hashlib.sha256(json.dumps(OFFICIAL_PREFIX_POLICY,sort_keys=True).encode()).hexdigest()[:12]
QUANTIZATION_RECIPE='acoustic-reviewed-source-quantization-floor-v39-'+hashlib.sha256(json.dumps(QUANTIZATION_POLICY,sort_keys=True).encode()).hexdigest()[:12]
USER_PRESERVED_SEAM_RECIPE='user-reviewed-source-seam-preserved-clocks-v40-'+hashlib.sha256(json.dumps(USER_PRESERVED_SEAM_POLICY,sort_keys=True).encode()).hexdigest()[:12]
REVIEWED_NUMERIC_SOURCE_RECIPE='acoustic-reviewed-numeric-source-windows-v41-'+hashlib.sha256(json.dumps(REVIEWED_NUMERIC_SOURCE_POLICY,sort_keys=True).encode()).hexdigest()[:12]
REVIEWED_GAP_SOURCE_RECIPE='acoustic-reviewed-source-gap-ownership-v42-'+hashlib.sha256(json.dumps(REVIEWED_GAP_SOURCE_POLICY,sort_keys=True).encode()).hexdigest()[:12]
REVIEWED_PARTIAL_SOURCE_RECIPE='acoustic-reviewed-partial-source-windows-v43-'+hashlib.sha256(json.dumps(REVIEWED_PARTIAL_SOURCE_POLICY,sort_keys=True).encode()).hexdigest()[:12]
REVIEWED_PARTIAL_HUMAN_RECIPE='user-reviewed-partial-source-seam-v44-'+hashlib.sha256(json.dumps(REVIEWED_PARTIAL_HUMAN_POLICY,sort_keys=True).encode()).hexdigest()[:12]
REVIEWED_HEADING_RECIPE='user-reviewed-niv-heading-source-seam-v45-'+hashlib.sha256(json.dumps(REVIEWED_HEADING_POLICY,sort_keys=True).encode()).hexdigest()[:12]
REVIEWED_CONTEXT_RECIPE='acoustic-reviewed-previous-passage-source-context-v46-'+hashlib.sha256(json.dumps(REVIEWED_CONTEXT_POLICY,sort_keys=True).encode()).hexdigest()[:12]
REVIEWED_ABSENT_FRAGMENT_RECIPE='acoustic-reviewed-absent-doxology-source-fragment-v47-'+hashlib.sha256(json.dumps(REVIEWED_ABSENT_FRAGMENT_POLICY,sort_keys=True).encode()).hexdigest()[:12]
REVIEWED_USER_GAP_RECIPE='user-reviewed-shared-source-gap-seam-v48-'+hashlib.sha256(json.dumps(REVIEWED_USER_GAP_POLICY,sort_keys=True).encode()).hexdigest()[:12]
REVIEWED_NUMERIC_USER_RECIPE='user-reviewed-numeric-original-source-seam-v49-'+hashlib.sha256(json.dumps(REVIEWED_NUMERIC_USER_POLICY,sort_keys=True).encode()).hexdigest()[:12]
REVIEWED_PLACEHOLDER_RECIPE='acoustic-reviewed-imported-editorial-placeholder-v50-'+hashlib.sha256(json.dumps(REVIEWED_PLACEHOLDER_POLICY,sort_keys=True).encode()).hexdigest()[:12]
REVIEWED_CONFIRMED_SOURCE_RECIPE='acoustic-reviewed-user-source-absence-seam-v51-'+hashlib.sha256(json.dumps(REVIEWED_CONFIRMED_SOURCE_POLICY,sort_keys=True).encode()).hexdigest()[:12]
REVIEWED_COVERAGE_WINDOW_RECIPE='acoustic-reviewed-source-coverage-padding-v52-'+hashlib.sha256(json.dumps(REVIEWED_COVERAGE_WINDOW_POLICY,sort_keys=True).encode()).hexdigest()[:12]
REVIEWED_CONFIRMED_GAP_RECIPE='acoustic-reviewed-user-source-absence-gap-v55-'+hashlib.sha256(json.dumps(REVIEWED_CONFIRMED_GAP_POLICY,sort_keys=True).encode()).hexdigest()[:12]
REVIEWED_HUMAN_PARTIAL_RECIPE='user-reviewed-complete-verse-numeric-partial-source-v56-'+hashlib.sha256(json.dumps(REVIEWED_HUMAN_PARTIAL_POLICY,sort_keys=True).encode()).hexdigest()[:12]
REVIEWED_HUMAN_PROJECTED_PARTIAL_RECIPE='user-reviewed-complete-verse-projected-partial-source-v57-'+hashlib.sha256(json.dumps(REVIEWED_HUMAN_PROJECTED_PARTIAL_POLICY,sort_keys=True).encode()).hexdigest()[:12]
REVIEWED_PARTIAL_SOURCE_RECIPES={REVIEWED_HUMAN_PROJECTED_PARTIAL_RECIPE,REVIEWED_HUMAN_PARTIAL_RECIPE,REVIEWED_CONFIRMED_GAP_RECIPE,REVIEWED_COVERAGE_WINDOW_RECIPE,REVIEWED_CONFIRMED_SOURCE_RECIPE,REVIEWED_PARTIAL_SOURCE_RECIPE,REVIEWED_PARTIAL_HUMAN_RECIPE,REVIEWED_PLACEHOLDER_RECIPE}
REVIEWED_BACKGROUND_SOURCE_RECIPE='acoustic-reviewed-source-background-ownership-v53-'+hashlib.sha256(json.dumps(REVIEWED_BACKGROUND_SOURCE_POLICY,sort_keys=True).encode()).hexdigest()[:12]
REVIEWED_NUMBERED_SOURCE_RECIPE='user-reviewed-numeric-numbered-source-seam-v54-'+hashlib.sha256(json.dumps(REVIEWED_NUMBERED_SOURCE_POLICY,sort_keys=True).encode()).hexdigest()[:12]
REVIEWED_ENDING_SOURCE_RECIPE='user-reviewed-scripture-ending-background-source-v58-'+hashlib.sha256(json.dumps(REVIEWED_ENDING_SOURCE_POLICY,sort_keys=True).encode()).hexdigest()[:12]
REVIEWED_ANCHOR_SOURCE_RECIPE='acoustic-reviewed-independent-complete-source-edges-v59-'+hashlib.sha256(json.dumps(REVIEWED_ANCHOR_SOURCE_POLICY,sort_keys=True).encode()).hexdigest()[:12]
REVIEWED_ANCHOR_USER_RECIPE='user-reviewed-seams-independent-complete-source-edges-v60-'+hashlib.sha256(json.dumps(REVIEWED_ANCHOR_USER_POLICY,sort_keys=True).encode()).hexdigest()[:12]
REVIEWED_HUMAN_SOURCE_RECIPE='user-reviewed-complete-original-source-verse-v61-'+hashlib.sha256(json.dumps(REVIEWED_HUMAN_SOURCE_POLICY,sort_keys=True).encode()).hexdigest()[:12]
REVIEWED_MISSING_SOURCE_FRAGMENT_RECIPE='user-reviewed-unspoken-source-clause-v62-'+hashlib.sha256(json.dumps(REVIEWED_MISSING_SOURCE_FRAGMENT_POLICY,sort_keys=True).encode()).hexdigest()[:12]
REVIEWED_TERMINAL_SOURCE_FRAGMENT_RECIPE='acoustic-reviewed-next-chapter-terminal-clause-v63-'+hashlib.sha256(json.dumps(REVIEWED_TERMINAL_SOURCE_FRAGMENT_POLICY,sort_keys=True).encode()).hexdigest()[:12]
REVIEWED_ZERO_CLOCK_RECIPE='acoustic-reviewed-zero-duration-numeric-diagnostics-v64-'+hashlib.sha256(json.dumps(REVIEWED_ZERO_CLOCK_POLICY,sort_keys=True).encode()).hexdigest()[:12]
REVIEWED_CLOSING_CAPTION_RECIPE='acoustic-reviewed-original-musical-closing-v65-'+hashlib.sha256(json.dumps(REVIEWED_CLOSING_CAPTION_POLICY,sort_keys=True).encode()).hexdigest()[:12]
REVIEWED_COMPANION_FRAGMENT_RECIPE='acoustic-reviewed-both-source-terminal-clause-v66-'+hashlib.sha256(json.dumps(REVIEWED_COMPANION_FRAGMENT_POLICY,sort_keys=True).encode()).hexdigest()[:12]
REVIEWED_NEXT_CHAPTER_SOURCE_RECIPE='acoustic-reviewed-next-source-introduction-v67-'+hashlib.sha256(json.dumps(REVIEWED_NEXT_CHAPTER_SOURCE_POLICY,sort_keys=True).encode()).hexdigest()[:12]
REVIEWED_SAYING_SOURCE_RECIPE='acoustic-reviewed-saying-source-v68-'+hashlib.sha256(json.dumps(REVIEWED_SAYING_SOURCE_POLICY,sort_keys=True).encode()).hexdigest()[:12]
REVIEWED_PARTITIONED_ZERO_RECIPE='acoustic-reviewed-partitioned-zero-source-v69-'+hashlib.sha256(json.dumps(REVIEWED_PARTITIONED_ZERO_POLICY,sort_keys=True).encode()).hexdigest()[:12]
REVIEWED_CAPTION_MODEL_RECIPE='acoustic-reviewed-caption-source-model-v70-'+hashlib.sha256(json.dumps(REVIEWED_CAPTION_MODEL_POLICY,sort_keys=True).encode()).hexdigest()[:12]
REVIEWED_CHRONICLES21_SOURCE_RECIPE='acoustic-reviewed-chronicles21-source-v71-'+hashlib.sha256(json.dumps(REVIEWED_CHRONICLES21_SOURCE_POLICY,sort_keys=True).encode()).hexdigest()[:12]
REVIEWED_NEHEMIAH7_SOURCE_RECIPE='acoustic-reviewed-nehemiah7-source-v72-'+hashlib.sha256(json.dumps(REVIEWED_NEHEMIAH7_SOURCE_POLICY,sort_keys=True).encode()).hexdigest()[:12]
REVIEWED_NEHEMIAH7_USER_RECIPE='user-reviewed-nehemiah7-final-source-v73-'+hashlib.sha256(json.dumps(REVIEWED_NEHEMIAH7_USER_POLICY,sort_keys=True).encode()).hexdigest()[:12]
REVIEWED_SAYING_USER_RECIPE='user-reviewed-saying-nine-source-v74-'+hashlib.sha256(json.dumps(REVIEWED_SAYING_USER_POLICY,sort_keys=True).encode()).hexdigest()[:12]
REVIEWED_PSALM136_FINAL_RECIPE='user-reviewed-psalm136-final-source-v75-'+hashlib.sha256(json.dumps(REVIEWED_PSALM136_FINAL_POLICY,sort_keys=True).encode()).hexdigest()[:12]
REVIEWED_WEAK_RECIPES={REVIEWED_NEHEMIAH7_USER_RECIPE,REVIEWED_SAYING_USER_RECIPE,REVIEWED_PSALM136_FINAL_RECIPE,REVIEWED_NEHEMIAH7_SOURCE_RECIPE,REVIEWED_CHRONICLES21_SOURCE_RECIPE,REVIEWED_CAPTION_MODEL_RECIPE,REVIEWED_PARTITIONED_ZERO_RECIPE,REVIEWED_SAYING_SOURCE_RECIPE,REVIEWED_NEXT_CHAPTER_SOURCE_RECIPE,REVIEWED_COMPANION_FRAGMENT_RECIPE,REVIEWED_CLOSING_CAPTION_RECIPE,REVIEWED_ZERO_CLOCK_RECIPE,REVIEWED_TERMINAL_SOURCE_FRAGMENT_RECIPE,REVIEWED_MISSING_SOURCE_FRAGMENT_RECIPE,REVIEWED_HUMAN_SOURCE_RECIPE,REVIEWED_ANCHOR_USER_RECIPE,REVIEWED_ANCHOR_SOURCE_RECIPE,REVIEWED_ENDING_SOURCE_RECIPE,REVIEWED_NUMBERED_SOURCE_RECIPE,REVIEWED_BACKGROUND_SOURCE_RECIPE,REVIEWED_WEAK_RECIPE,REVIEWED_WINDOW_RECIPE,USER_SOURCE_SEAM_RECIPE,OFFICIAL_PREFIX_RECIPE,QUANTIZATION_RECIPE,USER_PRESERVED_SEAM_RECIPE,REVIEWED_NUMERIC_SOURCE_RECIPE,REVIEWED_NUMERIC_USER_RECIPE,REVIEWED_GAP_SOURCE_RECIPE,REVIEWED_HEADING_RECIPE,REVIEWED_CONTEXT_RECIPE,REVIEWED_ABSENT_FRAGMENT_RECIPE,REVIEWED_USER_GAP_RECIPE,*REVIEWED_PARTIAL_SOURCE_RECIPES}
REVIEWED_SOURCE_RECIPES={REVIEWED_BOUNDARY_RECIPE,HUMAN_SEAM_RECIPE}
BOUNDARY_RECIPES = {BOUNDARY_REVIEW_RECIPE, *BOUNDARY_CONTEXT_RECIPES, GAP_REVIEW_RECIPE, PROJECTION_REVIEW_RECIPE, PARTIAL_REVIEW_RECIPE, NUMERIC_REVIEW_RECIPE, ANCHOR_WINDOW_RECIPE, CASE_REVIEW_RECIPE, SPEECH_SPAN_RECIPE, SPEECH_CONTEXT_RECIPE, WORD_PAUSE_RECIPE, INDIVIDUAL_REVIEW_RECIPE, SOURCE_EDGE_RECIPE, COMPLETION_RECIPE, GAP_EDGE_RECIPE, CLOCK_EDGE_RECIPE, PHRASE_EDGE_RECIPE, READING_ORDER_RECIPE, FRAGMENT_RECIPE, *CONTEXT_PADDING_RECIPES, REVIEWED_BOUNDARY_RECIPE}
CONTEXT_REVIEW_RECIPE = 'independent-en025-zh10-bounded-context-replay-v7'
BOUNDARY_RECIPES.add(REVIEWED_WEAK_RECIPE)
BOUNDARY_RECIPES.add(HUMAN_SEAM_RECIPE)
BOUNDARY_RECIPES.add(REVIEWED_WINDOW_RECIPE)
BOUNDARY_RECIPES.add(USER_SOURCE_SEAM_RECIPE)
BOUNDARY_RECIPES.add(OFFICIAL_PREFIX_RECIPE)
BOUNDARY_RECIPES.add(QUANTIZATION_RECIPE)
BOUNDARY_RECIPES.add(USER_PRESERVED_SEAM_RECIPE)
BOUNDARY_RECIPES.add(REVIEWED_NUMERIC_SOURCE_RECIPE)
BOUNDARY_RECIPES.add(REVIEWED_GAP_SOURCE_RECIPE)
BOUNDARY_RECIPES.update(REVIEWED_PARTIAL_SOURCE_RECIPES)
BOUNDARY_RECIPES.add(REVIEWED_HEADING_RECIPE)
BOUNDARY_RECIPES.add(REVIEWED_CONTEXT_RECIPE)
BOUNDARY_RECIPES.add(REVIEWED_ABSENT_FRAGMENT_RECIPE)
BOUNDARY_RECIPES.add(REVIEWED_USER_GAP_RECIPE)
BOUNDARY_RECIPES.add(REVIEWED_NUMERIC_USER_RECIPE)
BOUNDARY_RECIPES.add(REVIEWED_BACKGROUND_SOURCE_RECIPE)
BOUNDARY_RECIPES.add(REVIEWED_NUMBERED_SOURCE_RECIPE)
BOUNDARY_RECIPES.add(REVIEWED_ENDING_SOURCE_RECIPE)
BOUNDARY_RECIPES.add(REVIEWED_ANCHOR_SOURCE_RECIPE)
BOUNDARY_RECIPES.add(REVIEWED_ANCHOR_USER_RECIPE)
BOUNDARY_RECIPES.add(REVIEWED_HUMAN_SOURCE_RECIPE)
BOUNDARY_RECIPES.add(REVIEWED_MISSING_SOURCE_FRAGMENT_RECIPE)
BOUNDARY_RECIPES.add(REVIEWED_TERMINAL_SOURCE_FRAGMENT_RECIPE)
BOUNDARY_RECIPES.add(REVIEWED_ZERO_CLOCK_RECIPE)
BOUNDARY_RECIPES.add(REVIEWED_CLOSING_CAPTION_RECIPE)
BOUNDARY_RECIPES.add(REVIEWED_COMPANION_FRAGMENT_RECIPE)
BOUNDARY_RECIPES.add(REVIEWED_NEXT_CHAPTER_SOURCE_RECIPE)
BOUNDARY_RECIPES.add(REVIEWED_SAYING_SOURCE_RECIPE)
BOUNDARY_RECIPES.add(REVIEWED_PARTITIONED_ZERO_RECIPE)
BOUNDARY_RECIPES.add(REVIEWED_CAPTION_MODEL_RECIPE)
BOUNDARY_RECIPES.add(REVIEWED_CHRONICLES21_SOURCE_RECIPE)
BOUNDARY_RECIPES.add(REVIEWED_NEHEMIAH7_SOURCE_RECIPE)
BOUNDARY_RECIPES.update({REVIEWED_NEHEMIAH7_USER_RECIPE,REVIEWED_SAYING_USER_RECIPE,REVIEWED_PSALM136_FINAL_RECIPE})
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

