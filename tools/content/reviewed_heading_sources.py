"""Fixed user acceptance of a same-edition Psalm title/body source seam.

The rejected gap report remains intact. Only its exact registered leading title
is excluded from the temporary model witness; every original verse proof reruns.
"""
import copy
import hashlib
import json

from boundary_quality import boundary_gap_issues, finite, verified_boundary_artifact
from quiet_gaps import digest
from reviewed_gap_sources import _failed_report
from timed_text import normalized

REVIEWED_HEADING_POLICY = {
    'version': 'registered-user-niv-psalm-heading-seam-v1',
    'scope': 'one-leading-unnumbered-same-edition-title-and-first-verse-head-only',
    'authority': 'pinned-original-caption-manifest-and-byte-identical-NIV-HTML',
    'modelProof': 'all-original-model-checks-and-joint-proofs-rerun-in-original-context',
    'originalFacts': 'failed-quiet-proof-and-original-gap-flags-and-word-clocks-retained',
    'seam': 'exact-user-decision-and-maximum-40ms-uncertainty; nonquiet-source-remeasured',
    'clockExceptions': False,
    'maximumHeadDisplacementSeconds': .2,
    'outputs': 'fixed-complete-original-source-inventory-and-vtt',
}


def _caption(base, receipt, materials):
    from alignment_contract import PSALM_CAPTION_REFERENCE_SHA256
    from source_metadata import extract_psalm_captions, validate_document_url
    heading = receipt['heading']
    if (not materials or len({m['file'] for m in materials}) != len(materials)
            or len({m['file'] for m in receipt['evidence']}) != len(receipt['evidence'])):
        raise ValueError('Need distinct immutable heading reference materials')
    actual = {m['file']: m['utf8'] for m in materials}
    approved = {m['file']: m['sha256'] for m in receipt['evidence']}
    def read(name):
        raw = actual[name]
        if hashlib.sha256(raw.encode()).hexdigest() != approved[name]:
            raise ValueError('Heading reference material changed')
        return raw
    raw = read(heading['manifestFile'])
    if (hashlib.sha256(raw.encode()).hexdigest() != PSALM_CAPTION_REFERENCE_SHA256
            or base['sourceMetadata']['captionManifestSha256'] != PSALM_CAPTION_REFERENCE_SHA256):
        raise ValueError('Need the original pinned NIV caption manifest')
    manifest = json.loads(raw)
    if manifest['book'] != 'psalms' or manifest['version'] != 'NIV':
        raise ValueError('Wrong heading edition or book')
    chapter = int(base['key'].split(':')[1])
    docs = [d for d in manifest['documents'] if d['firstChapter'] <= chapter <= d['lastChapter']]
    if len(docs) != 1:
        raise ValueError('Need one exact original caption document')
    doc = docs[0]; validate_document_url(doc)
    if heading['htmlFile'].split('/')[-1] != doc['file']:
        raise ValueError('Wrong caption reference document')
    html = read(heading['htmlFile'])
    if hashlib.sha256(html.encode()).hexdigest() != doc['sha256']:
        raise ValueError('Original NIV caption HTML changed')
    caption = extract_psalm_captions(html, doc['firstChapter'], doc['lastChapter']).get(chapter)
    if not caption or normalized(caption) != normalized(heading['caption']):
        raise ValueError('The registered title is not the original unnumbered NIV heading')


def derive_heading_source_case(base, receipt, materials):
    from alignment_contract import (GAP_REVIEW_RECIPE, BOUNDARY_REVIEW_RECIPE,
        BOUNDARY_CONTEXT_RECIPE, PADDING_REVIEW_RECIPE, BOUNDARY_RECOGNIZER, site_fingerprint)
    if (receipt['schemaVersion'] != 13 or not base['key'].startswith('psalms:')
            or not base['key'].endswith(':en') or base.get('accepted') is not False
            or base['qualityRecipe'] != GAP_REVIEW_RECIPE
            or base['fingerprint'] != site_fingerprint(base['sourceAudioSha256'], base['textSha256'], 'en', GAP_REVIEW_RECIPE, BOUNDARY_RECOGNIZER)
            or receipt['weakVerses'] or receipt['failureReasons'] or receipt['gapAssignments']
            or receipt['approvedBy'] != 'user-natural-seam-tolerance'
            or receipt['sourceAcousticApproval'] is not False
            or not isinstance(receipt['humanDecision'], str) or not receipt['humanDecision'].strip()):
        raise ValueError('Need a fixed user-approved Psalm title seam on an original failed gap report')
    _failed_report(base)
    _caption(base, receipt, materials)
    h = receipt['heading']; i = h['gapIndex']; gaps = base['unclaimedSpeech']
    if type(i) is not int or not 0 <= i < len(gaps):
        raise ValueError('Missing original title gap')
    gap = gaps[i]; first = base['cues'][0]; seam = receipt['naturalSeam']
    cut = seam['cut']; uncertainty = seam['uncertainty']
    required = [j for j, g in enumerate(gaps) if boundary_gap_issues([g], base['cues'])]
    if (required != [i] or base['issues'] != ['boundary-unassigned-speech:leading']
            or gap['kind'] != 'leading' or gap.get('allowedHeadingOrClosing') is not False
            or not normalized(gap['text']) or h['gapSha256'] != digest(gap)
            or h['sourceRange'] != [gap['start'], gap['end']] or gap['end'] != cut
            or not 0 <= gap['start'] < gap['end'] < first['end']
            or first['verse'] != 1 or seam['rightVerse'] != 1 or not finite(cut)
            or len(uncertainty) != 2 or not all(finite(t) for t in uncertainty)
            or not 0 < uncertainty[1]-uncertainty[0] <= .040000001
            or not uncertainty[0] <= cut <= uncertainty[1]
            or abs(cut-first['start']) > REVIEWED_HEADING_POLICY['maximumHeadDisplacementSeconds']):
        raise ValueError('Only the exact original leading title and accepted first-verse seam may change')
    model = base.get('boundaryContextReview', {}).get('recipe', BOUNDARY_REVIEW_RECIPE)
    if model not in {BOUNDARY_REVIEW_RECIPE, BOUNDARY_CONTEXT_RECIPE, PADDING_REVIEW_RECIPE}:
        raise ValueError('Unsupported original model proof')
    if base['gapReview'] != dict(recipe=GAP_REVIEW_RECIPE,
            sourceFingerprint=site_fingerprint(base['sourceAudioSha256'], base['textSha256'], 'en', model, BOUNDARY_RECOGNIZER)):
        raise ValueError('Original gap model identity differs')
    witness = copy.deepcopy(base)
    for field in ['acousticGapReview', 'gapReview']:
        witness.pop(field)
    witness.update(qualityRecipe=model, fingerprint=base['gapReview']['sourceFingerprint'], accepted=True, issues=[])
    witness['unclaimedSpeech'] = [g for j, g in enumerate(gaps) if j != i]
    if not verified_boundary_artifact(witness):
        raise ValueError('Another complete original chapter proof failed')
    final = copy.deepcopy(base['cues']); final[0]['start'] = cut
    if final != receipt['finalCues'] or len(receipt['cuts']) != 1:
        raise ValueError('Only one registered first-verse head may change')
    edge = receipt['cuts'][0]; lo, hi = edge['window']; core = edge['protectedCore']
    if (edge['verse'] != 1 or edge['side'] != 'head' or edge['measurementKind'] != 'user-natural-seam'
            or edge['before'] != [first['start'],first['end']] or edge['after'] != [cut,first['end']]
            or edge['window'] != [round(t*16000) for t in uncertainty]
            or type(lo) is not int or type(hi) is not int or not 160 <= hi-lo <= 640 or (hi-lo)%160
            or not all(finite(t) for t in [*core,edge['previousVoiceEnd'],edge['nextVoiceStart']])
            or not 0 <= edge['previousVoiceEnd'] <= uncertainty[0] <= cut <= uncertainty[1] <= core[0] < core[1] <= first['end'] <= edge['nextVoiceStart'] <= base['duration']
            or len(edge['referenceRanges']) != 2
            or any(type(x) is not int or type(y) is not int or not 0 <= x < y <= round(base['duration']*16000) for x,y in edge['referenceRanges'])):
        raise ValueError('Invalid accepted title seam source geometry')
    for c, check in zip(final, base['checks']):
        words = [w for w in check['alignedWords'] if normalized(w.get('word',''))]
        if not words or any(not c['start'] <= w['start'] < w['end'] <= c['end'] for w in words):
            raise ValueError('A final verse loses an original complete word body')
        if c['verse'] == 1 and any(not core[0] <= w['start'] < w['end'] <= core[1] for w in words):
            raise ValueError('First-verse protected core loses an original word')
    result = copy.deepcopy(base)
    result.update(accepted=True, issues=[], cues=final)
    return result
