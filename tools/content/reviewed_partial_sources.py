"""Registered source-bound repairs with independently verified missing narration.

The rejected partial report remains intact in baseEvidence. The temporary model
witness contains only source-authorized narrated roots; the original joint
proof is checked in its original cue context before any reviewed cut moves.
"""
import copy
import hashlib
import json
from audio_coverage import COVERAGE_POLICY,candidate_roles,narrated_verses,verified_coverage
from quiet_gaps import GAP_POLICY,digest
from reviewed_source_windows import REVIEWED_WINDOW_POLICY,derive_source_window_case
from spoken_projection import PROJECTION_POLICY,projection_matches,project_text
from spoken_text import boundary_text
from user_source_seams import USER_PRESERVED_SEAM_POLICY

REVIEWED_PARTIAL_SOURCE_POLICY={
    'version':'registered-narrated-roots-source-window-recovery-v1',
    'coveragePolicy':COVERAGE_POLICY,'projectionPolicy':PROJECTION_POLICY,
    'sourcePolicy':REVIEWED_WINDOW_POLICY,
    'base':'original-rejected-partial-report-with-unmaterialized-confirmed-coverage',
    'coverageFailure':'exact-one-original-coverage-neighbor-or-boundary-unverified-issue-is-replaced-by-strict-source-coverage',
    'roles':'exact-original-NIV-source-absence-and-original-full-source-VAD-bound-to-byte-identical-original-base-report',
    'modelProof':'all-narrated-roots-original-checks-and-joint-windows-verified-before-source-cut',
    'coverageProof':'all-missing-verse-blocks-strict-existing-coverage-proof-and-original-pcm-remeasured',
    'outputs':'only-narrated-original-source-cues; missing-verses-explicit-and-never-fabricated',
    'originalFacts':'complete-rejected-report-and-original-canonical-verses-retained',
}
REVIEWED_PARTIAL_HUMAN_POLICY={**REVIEWED_PARTIAL_SOURCE_POLICY,
    'version':'registered-narrated-roots-user-source-seam-v1',
    'sourcePolicy':USER_PRESERVED_SEAM_POLICY,
    'seam':'one-exact-user-accepted-natural-seam-with-all-model-word-clocks-retained',
}


def _material(receipt,materials,name):
    if not materials or len({x['file'] for x in materials})!=len(materials) or len({x['file'] for x in receipt['evidence']})!=len(receipt['evidence']):
        raise ValueError('Need distinct fixed source coverage materials')
    actual={x['file']:x['utf8'] for x in materials};approved={x['file']:x['sha256'] for x in receipt['evidence']}
    raw=actual[name]
    if hashlib.sha256(raw.encode()).hexdigest()!=approved[name]:raise ValueError('Original source coverage evidence changed')
    return json.loads(raw)


def derive_partial_source_case(base,receipt,materials):
    from alignment_contract import PARTIAL_REVIEW_RECIPE,BOUNDARY_REVIEW_RECIPE,BOUNDARY_CONTEXT_RECIPE,PADDING_REVIEW_RECIPE,BOUNDARY_RECOGNIZER,site_fingerprint
    from partial_audio import source_text_sha
    if (receipt['schemaVersion'] not in {11,12} or base['qualityRecipe']!=PARTIAL_REVIEW_RECIPE
        or base.get('accepted') is not False or not base['key'].endswith(':en')
        or base.get('confirmedCoverage') is not None or base.get('missingVerses')
        or base.get('coverageDiagnostic')!='Coverage must retain full source identity and exactly the narrated cue/check roots'
        or base['issues'].count('coverage-neighbor-or-boundary-unverified')!=1
        or base['textSha256']!=source_text_sha(base['boundarySourceVerses'])
        or base['expectedVerseNumbers']!=[v['number'] for v in base['boundarySourceVerses']]
        or not projection_matches(base)
        or base['fingerprint']!=site_fingerprint(base['sourceAudioSha256'],base['textSha256'],'en',PARTIAL_REVIEW_RECIPE,BOUNDARY_RECOGNIZER)):
        raise ValueError('Need the unchanged original rejected partial source report')
    reuse=base['boundaryEvidenceReuse'];model=reuse['sourceRecipe']
    if (model not in {BOUNDARY_REVIEW_RECIPE,BOUNDARY_CONTEXT_RECIPE,PADDING_REVIEW_RECIPE}
        or reuse['sourceFingerprint']!=site_fingerprint(base['sourceAudioSha256'],base['textSha256'],'en',model,BOUNDARY_RECOGNIZER)):
        raise ValueError('Original model reuse provenance differs')
    doc=_material(receipt,materials,receipt['coverageEvidenceFile']);audit=_material(receipt,materials,receipt['speechAuditFile'])
    original=_material(receipt,materials,receipt['baseReportFile'])
    approved={x['file']:x['sha256'] for x in receipt['evidence']}
    coverage=doc['confirmedCoverage'];roles=coverage['roles']
    if (doc['key']!=base['key'] or doc['sourceAudioSha256']!=base['sourceAudioSha256'] or doc['textSha256']!=base['textSha256']
        or doc['originalBaseEvidenceSha256']!=digest(base)
        or original!=base or audit['key']!=base['key'] or audit['sourceAudioSha256']!=base['sourceAudioSha256']
        or audit['originalRecipe']!=base['qualityRecipe'] or audit['sourceReportSha256']!=approved[receipt['baseReportFile']]
        or audit['sampleCount']!=round(base['duration']*16000) or audit['vadModelSha256']!=GAP_POLICY['vadModelSha256']
        or audit['speechSegments']!=coverage['speechSegments']
        or roles!=candidate_roles(base['key'],base['boundarySourceVerses'],coverage['nivEvidence'])
        or not roles['missingVerses'] or roles['aliases']):
        raise ValueError('Missing-narration evidence is not bound to the exact source and VAD')
    roots=narrated_verses({**base,'confirmedCoverage':{'roles':roles}})
    if ([c['verse'] for c in base['checks']]!=[v['number'] for v in roots]
        or any(project_text(base['key'],v['number'],v['text'])!=boundary_text(v['text'],'en') for v in roots)):
        raise ValueError('Original narrated root or projection inventory differs')
    witness=copy.deepcopy(base)
    for field in ['spokenProjection','coverageDiagnostic','boundaryEvidenceReuse']:witness.pop(field)
    witness['issues']=[i for i in witness['issues'] if i!='coverage-neighbor-or-boundary-unverified']
    sha=source_text_sha(roots)
    witness.update(boundarySourceVerses=roots,expectedVerseNumbers=[v['number'] for v in roots],textSha256=sha,
                   qualityRecipe=model,fingerprint=site_fingerprint(base['sourceAudioSha256'],sha,'en',model,BOUNDARY_RECOGNIZER))
    source_receipt={**receipt,'schemaVersion':8 if receipt['schemaVersion']==12 else 4}
    result=derive_source_window_case(witness,source_receipt,materials)
    result.update(boundarySourceVerses=copy.deepcopy(base['boundarySourceVerses']),expectedVerseNumbers=copy.deepcopy(base['expectedVerseNumbers']),
                  textSha256=base['textSha256'],qualityRecipe=base['qualityRecipe'],fingerprint=base['fingerprint'],
                  spokenProjection=copy.deepcopy(base['spokenProjection']),boundaryEvidenceReuse=copy.deepcopy(reuse),
                  missingVerses=copy.deepcopy(roles['missingVerses']),confirmedCoverage=copy.deepcopy(coverage))
    if not verified_coverage(result):raise ValueError('Original-source missing narration did not pass strict coverage')
    return result
