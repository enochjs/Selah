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
from alignment_contract import (METHOD, site_fingerprint, LEGACY_QUALITY_RECIPE,
                                SUPPORTED_RECIPES, RECOGNIZERS, DEEP_REVIEW_RECIPE, DEEP_RECOGNIZER,
                                BOUNDARY_REVIEW_RECIPE, BOUNDARY_RECOGNIZER,
                                BOUNDARY_RECIPES, BOUNDARY_CONTEXT_RECIPES, GAP_REVIEW_RECIPE, PARTIAL_REVIEW_RECIPE, NUMERIC_REVIEW_RECIPE, ANCHOR_WINDOW_RECIPE, CASE_REVIEW_RECIPE, SPEECH_SPAN_RECIPE, SPEECH_CONTEXT_RECIPE, WORD_PAUSE_RECIPE, INDIVIDUAL_REVIEW_RECIPE, SOURCE_EDGE_RECIPE, COMPLETION_RECIPE, GAP_EDGE_RECIPE)
from boundary_quality import verified_boundary_artifact
from joint_boundaries import verified_joint_proofs
from alignment_contract import CLOCK_EDGE_RECIPE,PHRASE_EDGE_RECIPE,READING_ORDER_RECIPE,FRAGMENT_RECIPE,CONTEXT_PADDING_RECIPE,CONTEXT_PADDING_RECIPES
from alignment_contract import REVIEWED_BOUNDARY_RECIPE,REVIEWED_SOURCE_RECIPES
from alignment_contract import REVIEWED_WEAK_RECIPES,REVIEWED_NUMERIC_SOURCE_RECIPE,REVIEWED_PARTIAL_SOURCE_RECIPES,REVIEWED_BACKGROUND_SOURCE_RECIPE,REVIEWED_NUMBERED_SOURCE_RECIPE,REVIEWED_HUMAN_PARTIAL_RECIPE
from alignment_contract import REVIEWED_NEHEMIAH7_USER_RECIPE,REVIEWED_NEHEMIAH7_SOURCE_RECIPE,REVIEWED_NEXT_CHAPTER_SOURCE_RECIPE,REVIEWED_COMPANION_FRAGMENT_RECIPE,REVIEWED_TERMINAL_SOURCE_FRAGMENT_RECIPE,REVIEWED_MISSING_SOURCE_FRAGMENT_RECIPE,REVIEWED_ABSENT_FRAGMENT_RECIPE,REVIEWED_NUMERIC_USER_RECIPE

ROOT = Path(__file__).resolve().parents[2]


def recording_entry(receipt, artifact, text_sha):
    from partial_audio import verified_partial_files
    from numeric_alignment import verified_numeric_files
    from case_evidence import verified_case_files
    from reviewed_boundaries import verified_reviewed_output_inventory
    from reviewed_weak_boundaries import verified_reviewed_weak_output_inventory
    result = {'path': receipt['path'], 'originalPath': receipt['path'],
              'duration': receipt['duration'], 'segments': [], 'timingQuality': 'unaligned',
              'alignmentStatus': 'pending', 'mediaSha256': receipt['sha256'],
              'sourceUrl': receipt['url'], 'sourceSite': SITE,
              'voiceType': 'human', 'translationId': 'niv' if receipt['locale'] == 'en' else 'cuv'}
    recipe = (artifact or {}).get('qualityRecipe', LEGACY_QUALITY_RECIPE)
    recognizer = (artifact or {}).get('recognizer', 'Systran/faster-whisper-small')
    if (not artifact or recipe not in SUPPORTED_RECIPES
            or (recipe not in REVIEWED_WEAK_RECIPES and 'reviewedWeakReview' in artifact)
            or (recipe in REVIEWED_WEAK_RECIPES and artifact.get('accepted') and not verified_reviewed_weak_output_inventory(artifact))
            or (recipe not in REVIEWED_SOURCE_RECIPES and 'reviewedSourceReview' in artifact)
            or (recipe in REVIEWED_SOURCE_RECIPES and artifact.get('accepted') and not verified_reviewed_output_inventory(artifact))
            or (recipe not in CONTEXT_PADDING_RECIPES and 'contextPaddingReview' in artifact)
            or (recipe in CONTEXT_PADDING_RECIPES and artifact.get('accepted') and not verified_numeric_files(artifact))
            or (recipe != FRAGMENT_RECIPE and 'sourceFragmentReview' in artifact)
            or (recipe not in {FRAGMENT_RECIPE,REVIEWED_ABSENT_FRAGMENT_RECIPE,REVIEWED_MISSING_SOURCE_FRAGMENT_RECIPE,REVIEWED_TERMINAL_SOURCE_FRAGMENT_RECIPE,REVIEWED_COMPANION_FRAGMENT_RECIPE,REVIEWED_NEXT_CHAPTER_SOURCE_RECIPE} and 'missingFragments' in artifact)
            or (recipe == FRAGMENT_RECIPE and artifact.get('accepted') and not verified_numeric_files(artifact))
            or (recipe != READING_ORDER_RECIPE and 'readingOrderReview' in artifact)
            or (recipe == READING_ORDER_RECIPE and artifact.get('accepted') and not verified_numeric_files(artifact))
            or (recipe not in {CLOCK_EDGE_RECIPE,PHRASE_EDGE_RECIPE} and 'clockEdgeReview' in artifact)
            or (recipe in {CLOCK_EDGE_RECIPE,PHRASE_EDGE_RECIPE} and artifact.get('accepted') and not verified_numeric_files(artifact))
            or (recipe not in {GAP_EDGE_RECIPE,COMPLETION_RECIPE,*CONTEXT_PADDING_RECIPES,*REVIEWED_SOURCE_RECIPES} and 'sourceGapReview' in artifact)
            or (recipe == GAP_EDGE_RECIPE and artifact.get('accepted') and not verified_numeric_files(artifact))
            or (recipe != COMPLETION_RECIPE and 'referenceCompletionReview' in artifact)
            or (recipe == COMPLETION_RECIPE and artifact.get('accepted') and not verified_numeric_files(artifact))
            or (recipe not in {SOURCE_EDGE_RECIPE,COMPLETION_RECIPE,GAP_EDGE_RECIPE,READING_ORDER_RECIPE,FRAGMENT_RECIPE,*CONTEXT_PADDING_RECIPES,*REVIEWED_SOURCE_RECIPES} and 'sourceEdgeReview' in artifact)
            or (recipe == SOURCE_EDGE_RECIPE and artifact.get('accepted') and not verified_numeric_files(artifact))
            or (recipe != INDIVIDUAL_REVIEW_RECIPE and any(k in artifact for k in ['individualBoundaryReview','individualGapReview']))
            or (recipe == INDIVIDUAL_REVIEW_RECIPE and artifact.get('accepted') and not verified_numeric_files(artifact))
            or (recipe != WORD_PAUSE_RECIPE and 'wordPauseReview' in artifact)
            or (recipe == WORD_PAUSE_RECIPE and artifact.get('accepted') and not verified_numeric_files(artifact))
            or (recipe not in {CASE_REVIEW_RECIPE,SOURCE_EDGE_RECIPE,COMPLETION_RECIPE,GAP_EDGE_RECIPE,READING_ORDER_RECIPE,FRAGMENT_RECIPE,*CONTEXT_PADDING_RECIPES,*REVIEWED_SOURCE_RECIPES} and not (recipe==INDIVIDUAL_REVIEW_RECIPE and artifact.get('individualBoundaryReview',{}).get('baseRecipe')==CASE_REVIEW_RECIPE)
                and ('caseReviewPolicy' in artifact or 'caseBaseRecipe' in artifact))
            or (recipe == CASE_REVIEW_RECIPE and artifact.get('accepted') and not verified_case_files(artifact))
            or (recipe == SPEECH_SPAN_RECIPE and artifact.get('accepted') and not verified_numeric_files(artifact))
            or (recipe != SPEECH_CONTEXT_RECIPE and any(k in artifact for k in ['speechContextReview','speechContextBaseRecipe','speechContextGapReview']))
            or (recipe == SPEECH_CONTEXT_RECIPE and artifact.get('accepted') and not verified_numeric_files(artifact))
            or (recipe != ANCHOR_WINDOW_RECIPE and 'anchorWindowPolicy' in artifact)
            or (recipe == ANCHOR_WINDOW_RECIPE and artifact.get('accepted') and not verified_numeric_files(artifact))
            or (recipe not in {NUMERIC_REVIEW_RECIPE,REVIEWED_NEHEMIAH7_USER_RECIPE,REVIEWED_NEHEMIAH7_SOURCE_RECIPE,REVIEWED_NUMERIC_SOURCE_RECIPE,REVIEWED_NUMERIC_USER_RECIPE,REVIEWED_BACKGROUND_SOURCE_RECIPE,REVIEWED_NUMBERED_SOURCE_RECIPE,REVIEWED_HUMAN_PARTIAL_RECIPE} and not (recipe==SPEECH_CONTEXT_RECIPE and artifact.get('speechContextBaseRecipe')==NUMERIC_REVIEW_RECIPE)
                and not (recipe==INDIVIDUAL_REVIEW_RECIPE and artifact.get('individualBoundaryReview',{}).get('baseRecipe')==NUMERIC_REVIEW_RECIPE)
                and ('numericAlignmentPolicy' in artifact or 'numericBaseRecipe' in artifact))
            or (recipe == NUMERIC_REVIEW_RECIPE and artifact.get('accepted') and not verified_numeric_files(artifact))
            or (recipe not in {PARTIAL_REVIEW_RECIPE,*REVIEWED_PARTIAL_SOURCE_RECIPES} and not (recipe==CASE_REVIEW_RECIPE and artifact.get('caseBaseRecipe')==PARTIAL_REVIEW_RECIPE)
                and ('missingVerses' in artifact or 'confirmedCoverage' in artifact))
            or (recipe == PARTIAL_REVIEW_RECIPE and artifact.get('accepted')
                and not verified_partial_files(artifact))
            or recognizer not in RECOGNIZERS
            or (recipe == DEEP_REVIEW_RECIPE and (recognizer != DEEP_RECOGNIZER or receipt['locale'] != 'en'))
            or (recipe in BOUNDARY_RECIPES and (recognizer != BOUNDARY_RECOGNIZER
                or (artifact.get('accepted') and not verified_boundary_artifact(artifact))))
            or (recipe == GAP_REVIEW_RECIPE and artifact.get('accepted')
                and artifact.get('gapReview',{}).get('recipe') != recipe)
            or (recipe in BOUNDARY_CONTEXT_RECIPES and artifact.get('accepted')
                and (artifact.get('boundaryContextReview', {}).get('recipe') != recipe
                     or not verified_joint_proofs(artifact)))
            or artifact.get('recognizerRevision', RECOGNIZERS[recognizer]) != RECOGNIZERS[recognizer]
            or (recipe == LEGACY_QUALITY_RECIPE and recognizer != 'Systran/faster-whisper-small')
            or artifact.get('method') != METHOD or artifact.get('key') != receipt['key']
            or artifact.get('sourceAudioSha256') != receipt['sha256']
            or artifact.get('textSha256') != text_sha
            or artifact.get('fingerprint') != site_fingerprint(receipt['sha256'], text_sha, receipt['locale'],
                                                               recipe, recognizer)):
        return result
    result.update(alignmentStatus='review-required', alignmentIssues=artifact['issues'])
    if artifact['accepted']:
        result.update(timingQuality='verse-file', alignmentStatus=('partial' if artifact.get('missingVerses') or artifact.get('missingFragments') else 'aligned'),
                      verseFiles=artifact['verseFiles'], vttFile=artifact['vttFile'],
                      vttSha256=artifact['vttSha256'],
                      alignment={'method': METHOD, 'fingerprint': artifact['fingerprint'],
                                 'textSha256': text_sha, 'sourceAudioSha256': receipt['sha256']})
        if artifact.get('missingVerses'):
            result['missingVerses']=artifact['missingVerses']
        if artifact.get('missingFragments'):
            result['missingFragments']=artifact['missingFragments']
        if recipe in BOUNDARY_RECIPES:
            result['alignment'].update(verificationScope='verse-boundaries', qualityRecipe=recipe)
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
                if entry['alignmentStatus'] in {'aligned','partial'} and artifact.get('qualityRecipe') in REVIEWED_WEAK_RECIPES:
                    from reviewed_weak_boundaries import verify_reviewed_weak_output_media
                    if not verify_reviewed_weak_output_media(artifact,root / 'storage/resources/media' / (receipts[key]['sha256']+'.mp3')):
                        raise ValueError('Registered weak-edge source/output media proof did not verify: '+key)
                if entry['alignmentStatus']=='aligned' and artifact.get('qualityRecipe') in REVIEWED_SOURCE_RECIPES:
                    from reviewed_boundaries import verify_reviewed_output_media
                    if not verify_reviewed_output_media(artifact,root / 'storage/resources/media' / (receipts[key]['sha256']+'.mp3')):
                        raise ValueError('Registered source review/output media proof did not verify: '+key)
                if entry['alignmentStatus']=='aligned' and artifact.get('qualityRecipe') in CONTEXT_PADDING_RECIPES:
                    from context_padding import verify_context_padding_media
                    if not verify_context_padding_media(artifact,root / 'storage/resources/media' / (receipts[key]['sha256']+'.mp3')):
                        raise ValueError('Source context padding/media proof did not verify: '+key)
                if entry['alignmentStatus']=='partial' and artifact.get('qualityRecipe')==FRAGMENT_RECIPE:
                    from source_fragments import verify_fragment_media
                    if not verify_fragment_media(artifact,root / 'storage/resources/media' / (receipts[key]['sha256']+'.mp3')):
                        raise ValueError('Original missing fragment/media proof did not verify: '+key)
                if entry['alignmentStatus']=='aligned' and artifact.get('qualityRecipe')==READING_ORDER_RECIPE:
                    from reading_order import verify_reading_order_media
                    if not verify_reading_order_media(artifact,root / 'storage/resources/media' / (receipts[key]['sha256']+'.mp3')):
                        raise ValueError('Source reading order/media proof did not verify: '+key)
                if entry['alignmentStatus']=='aligned' and artifact.get('qualityRecipe') in {CLOCK_EDGE_RECIPE,PHRASE_EDGE_RECIPE}:
                    from clock_edges import verify_clock_edge_media
                    if not verify_clock_edge_media(artifact,root / 'storage/resources/media' / (receipts[key]['sha256']+'.mp3')):
                        raise ValueError('Independent clock/source voice proof did not verify: '+key)
                if entry['alignmentStatus']=='aligned' and artifact.get('qualityRecipe')==GAP_EDGE_RECIPE:
                    from gap_edges import verify_gap_edge_media
                    if not verify_gap_edge_media(artifact,root / 'storage/resources/media' / (receipts[key]['sha256']+'.mp3')):
                        raise ValueError('Original source gap ownership proof did not verify: '+key)
                if entry['alignmentStatus']=='aligned' and artifact.get('qualityRecipe')==COMPLETION_RECIPE:
                    from verse_completion import verify_completion_media
                    if not verify_completion_media(artifact,root / 'storage/resources/media' / (receipts[key]['sha256']+'.mp3')):
                        raise ValueError('Original source/reference completion proof did not verify: '+key)
                if entry['alignmentStatus']=='aligned' and artifact.get('qualityRecipe')==SOURCE_EDGE_RECIPE:
                    from source_edges import verify_source_edge_media
                    if not verify_source_edge_media(artifact,root / 'storage/resources/media' / (receipts[key]['sha256']+'.mp3')):
                        raise ValueError('Original voice boundary proof did not verify: '+key)
                if entry['alignmentStatus']=='aligned' and artifact.get('qualityRecipe')==INDIVIDUAL_REVIEW_RECIPE:
                    from individual_boundaries import verify_individual_media
                    if not verify_individual_media(artifact,root / 'storage/resources/media' / (receipts[key]['sha256']+'.mp3')):
                        raise ValueError(f'Individual boundary proof differs from original: {key}')
                if entry['alignmentStatus']=='aligned' and artifact.get('qualityRecipe')==WORD_PAUSE_RECIPE:
                    from word_pause import verify_word_pause_media
                    if not verify_word_pause_media(artifact,root / 'storage/resources/media' / (receipts[key]['sha256']+'.mp3')):
                        raise ValueError(f'Local word pause differs from original: {key}')
                if entry['alignmentStatus']=='aligned' and artifact.get('qualityRecipe')==SPEECH_CONTEXT_RECIPE:
                    from speech_context import verify_context_media
                    if not verify_context_media(artifact,root / 'storage/resources/media' / (receipts[key]['sha256']+'.mp3')):
                        raise ValueError(f'Context interval measurements differ from original: {key}')
                if entry['alignmentStatus']=='aligned' and artifact.get('qualityRecipe')==SPEECH_SPAN_RECIPE:
                    from speech_span import verify_span_media
                    if not verify_span_media(artifact,root / 'storage/resources/media' / (receipts[key]['sha256']+'.mp3')):
                        raise ValueError(f'Speech interval measurements differ from original: {key}')
                if entry['alignmentStatus'] in {'aligned','partial'} and artifact.get('qualityRecipe')==CASE_REVIEW_RECIPE:
                    from case_evidence import verify_case_media
                    if not verify_case_media(artifact,root / 'storage/resources/media' / (receipts[key]['sha256']+'.mp3')):
                        raise ValueError(f'Per-chapter proof differs from original: {key}')
                if entry['alignmentStatus']=='aligned' and artifact.get('qualityRecipe')==ANCHOR_WINDOW_RECIPE:
                    from anchor_windows import verify_anchor_media
                    if not verify_anchor_media(artifact,root / 'storage/resources/media' / (receipts[key]['sha256']+'.mp3')):
                        raise ValueError(f'Pause measurements differ from original: {key}')
                if entry['alignmentStatus'] in {'aligned','partial'} and artifact.get('qualityRecipe')==PARTIAL_REVIEW_RECIPE:
                    from partial_audio import verify_partial_media
                    if not verify_partial_media(artifact,root / 'storage/resources/media' / (receipts[key]['sha256']+'.mp3')):
                        raise ValueError(f'Coverage measurements differ from original: {key}')
                if entry['alignmentStatus']=='aligned' and (artifact.get('qualityRecipe')==GAP_REVIEW_RECIPE
                        or (artifact.get('qualityRecipe')==NUMERIC_REVIEW_RECIPE and artifact.get('numericBaseRecipe')==GAP_REVIEW_RECIPE)):
                    from gap_review import verify_gap_media
                    if not verify_gap_media(artifact,root / 'storage/resources/media' / (receipts[key]['sha256']+'.mp3')):
                        raise ValueError(f'Acoustic gap measurements differ from original: {key}')
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
    aligned = sum(r['alignmentStatus']=='aligned' for r in catalog.values())
    partial = sum(r['alignmentStatus']=='partial' for r in catalog.values())
    manifest = {
        'resourceSet': 'chineseandenglishbible-v2', 'sourceSite': SITE,
        'importedAt': datetime.now(timezone.utc).isoformat(),
        'sourceSnapshot': snapshot.name, 'timedTextFormat': 'WebVTT', 'alignmentMethod': METHOD,
        'books': 66, 'chapters': 1189, 'recordings': 2378,
        'alignedRecordings': aligned, 'partialRecordings':partial, 'verseFileRecordings': aligned+partial,
        'missingFragmentCount':sum(len(r.get('missingFragments',[])) for r in catalog.values()),
        'missingVerseCount':sum(len(r.get('missingVerses',[])) for r in catalog.values()),
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
    print(json.dumps({k: manifest[k] for k in ['recordings', 'alignedRecordings', 'partialRecordings', 'missingVerseCount', 'pendingRecordings',
                                              'reviewRecordings', 'verseBoundaries']}), flush=True)
    return manifest


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--snapshot', type=Path, required=True)
    args = parser.parse_args()
    publish(args.snapshot)
