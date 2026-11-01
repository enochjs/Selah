"""Complete original source padding around confirmed missing narration.

Retain the original rejected coverage, prove the real model roots first, then
require the original full-source VAD and strict missing-narration policy to pass.
"""
import copy,hashlib
from audio_coverage import COVERAGE_POLICY,candidate_roles,narrated_verses,verified_coverage,coverage_media_matches
from boundary_quality import verified_boundary_artifact,boundary_gap_issues
from quiet_gaps import GAP_POLICY,digest
from reviewed_partial_sources import _material
from reviewed_source_windows import derive_source_window_case,REVIEWED_WINDOW_POLICY
from spoken_projection import projection_matches,project_text
from spoken_text import boundary_text

REVIEWED_COVERAGE_WINDOW_POLICY={
    'version':'registered-existing-partial-source-window-coverage-v1',
    'coveragePolicy':COVERAGE_POLICY,'sourcePolicy':REVIEWED_WINDOW_POLICY,
    'original':'complete-rejected-partial-report-with-original-failed-coverage-preserved',
    'model':'all-real-original-cues-and-model-clocks-reverified-before-source-padding',
    'missing':'same-edition-reference-plus-original-source-VAD-and-strict-remeasured-coverage',
    'source':'every-changed-cut-measured-and-complete-original-word-bodies-retained',
    'humanOverride':False,'outputs':'only-verified-real-narrated-verses',
}


def coverage_model_witness(base):
    from alignment_contract import BOUNDARY_REVIEW_RECIPE,BOUNDARY_RECOGNIZER,site_fingerprint
    from partial_audio import source_text_sha
    cov=base['confirmedCoverage'];roles=cov['roles']
    if (not base['key'].endswith(':en') or not roles['missingVerses'] or roles['aliases']
        or roles!=candidate_roles(base['key'],base['boundarySourceVerses'],cov['nivEvidence'])
        or not projection_matches(base) or base['textSha256']!=source_text_sha(base['boundarySourceVerses'])
        or base['expectedVerseNumbers']!=[v['number'] for v in base['boundarySourceVerses']]
        or any(c.get('jointClipRange') is not None for c in base['checks'])):
        raise ValueError('Need unchanged independently verified narrated source roots')
    roots=narrated_verses(base)
    if any(project_text(base['key'],v['number'],v['text'])!=boundary_text(v['text'],'en') for v in roots):
        raise ValueError('Source window review cannot change a projected reference')
    w=copy.deepcopy(base)
    for key in ['confirmedCoverage','spokenProjection']:w.pop(key)
    sha=source_text_sha(roots);w.update(qualityRecipe=BOUNDARY_REVIEW_RECIPE,boundarySourceVerses=roots,
        expectedVerseNumbers=[v['number'] for v in roots],textSha256=sha,
        fingerprint=site_fingerprint(base['sourceAudioSha256'],sha,'en',BOUNDARY_REVIEW_RECIPE,BOUNDARY_RECOGNIZER))
    if not verified_boundary_artifact({**w,'accepted':True,'issues':[],'unclaimedSpeech':[]}):
        raise ValueError('An original actual-verse proof failed')
    w.update(accepted=False,issues=boundary_gap_issues(base['unclaimedSpeech'],base['cues']))
    return w


def _inputs(base,receipt,materials):
    from alignment_contract import PARTIAL_REVIEW_RECIPE,BOUNDARY_RECOGNIZER,site_fingerprint
    if (receipt['schemaVersion']!=20 or base.get('accepted') is not False or base['qualityRecipe']!=PARTIAL_REVIEW_RECIPE
        or base['issues']!=boundary_gap_issues(base['unclaimedSpeech'],base['cues'])+['missing-narration-evidence-unconfirmed'] or base.get('missingVerses')
        or receipt['weakVerses'] or receipt['failureReasons'] or not receipt['cuts']
        or base['fingerprint']!=site_fingerprint(base['sourceAudioSha256'],base['textSha256'],'en',PARTIAL_REVIEW_RECIPE,BOUNDARY_RECOGNIZER)
        or digest(base)!=receipt['baseEvidenceSha256'] or _material(receipt,materials,receipt['baseReportFile'])!=base):
        raise ValueError('Need the unchanged rejected coverage-only chapter')
    audit=_material(receipt,materials,receipt['sourceAuditFile']);cov=base['confirmedCoverage'];raw=next(m['utf8'] for m in materials if m['file']==receipt['baseReportFile'])
    if (cov['policy']!=COVERAGE_POLICY or cov['id']!=digest({k:v for k,v in cov.items() if k!='id'})
        or audit['key']!=base['key'] or cov['key']!=base['key'] or cov['sourceAudioSha256']!=base['sourceAudioSha256']
        or cov['textSha256']!=base['textSha256'] or cov['cueSha256']!=digest(base['cues'])
        or audit['sourceReportSha256']!=hashlib.sha256(raw.encode()).hexdigest() or audit['sourceAudioSha256']!=base['sourceAudioSha256']
        or audit['sampleCount']!=round(base['duration']*16000) or cov['sampleCount']!=audit['sampleCount']
        or audit['vadModelSha256']!=GAP_POLICY['vadModelSha256'] or audit['speechSegments']!=cov['speechSegments']):
        raise ValueError('Original source coverage or full VAD identity changed')
    coverage=_material(receipt,materials,receipt['coverageEvidenceFile'])
    if (coverage['roles']!=cov['roles'] or coverage['nivEvidence']!=cov['nivEvidence']
        or coverage['speechSegments']!=cov['speechSegments']):raise ValueError('Recovered coverage changes original source authority')
    return coverage


def derive_coverage_window_case(base,receipt,materials):
    coverage=_inputs(base,receipt,materials);w=coverage_model_witness(base)
    recovered=derive_source_window_case(w,{**receipt,'schemaVersion':10},materials)
    result=copy.deepcopy(base);result.update(accepted=True,issues=[],cues=copy.deepcopy(recovered['cues']),
        confirmedCoverage=copy.deepcopy(coverage),missingVerses=copy.deepcopy(coverage['roles']['missingVerses']))
    if not verified_coverage(result):raise ValueError('Missing narration still lacks strict source coverage')
    return result


def coverage_window_measurements_match(base,receipt,materials,pcm):
    try:
        result=derive_coverage_window_case(base,receipt,materials)
        return coverage_media_matches(result,pcm)
    except (KeyError,TypeError,ValueError,IndexError,StopIteration):return False
