"""Registered human decisions for an original voiced shared missing-verse seam.

The original failed silence/coverage report is retained, never relabeled quiet.
Only the exact source and seam accepted by the user can pass this separate proof.
"""
import copy,hashlib
from boundary_quality import finite,verified_boundary_artifact
from quiet_gaps import GAP_POLICY,digest,same_source_measurements
from audio_coverage import COVERAGE_POLICY,candidate_roles,narrated_verses,measure_coverage
from reviewed_partial_sources import _material
from timed_text import normalized
from user_source_seams import measure_user_source_cut

REVIEWED_CONFIRMED_SOURCE_POLICY={
    'version':'registered-user-confirmed-source-absence-shared-seam-v1',
    'authority':'exact-registered-receipt-with-recorded-human-source-absence-and-natural-seam-decision',
    'coverage':'same-edition-NIV-absence-and-exact-original-canonical-source-partition',
    'model':'all-original-narrated-verse-checks-pass-with-unchanged-clocks-and-cues',
    'source':'complete-original-failed-coverage-remeasured-with-original-full-source-VAD',
    'quietClaim':False,'clockExceptions':False,'cutChanges':False,
    'outputs':'only-original-real-narrated-verses; no-missing-verse-clip-or-clock',
}


def confirmed_absence_seam(base,receipt):
    coverage=base['confirmedCoverage'];roles=coverage['roles'];missing=roles['missingVerses'];s=receipt['naturalSeam'];lo,hi=s['uncertainty'];cut=s['cut']
    if (not base['key'].endswith(':en') or roles!=candidate_roles(base['key'],base['boundarySourceVerses'],coverage['nivEvidence'])
        or roles['aliases'] or not missing or receipt['userConfirmedMissingVerses']!=[x['verse'] for x in missing]
        or receipt['approvedBy']!='user-natural-seam-and-source-absence' or receipt['sourceAcousticApproval'] is not False
        or not isinstance(receipt['humanDecision'],str) or not receipt['humanDecision'].strip()
        or any(receipt[k] for k in ['cuts','weakVerses','failureReasons','gapAssignments']) or receipt['finalCues']!=base['cues']
        or not all(finite(t) for t in [lo,cut,hi]) or not lo<=cut<=hi or not 0<hi-lo<=.040000001):
        raise ValueError('Need exact user-confirmed source absence and unchanged shared source seam')
    cues=base['cues'];numbers=[c['verse'] for c in cues];left,right=s['leftVerse'],s['rightVerse']
    if (left not in numbers or right not in numbers or numbers.index(right)!=numbers.index(left)+1
        or [x['verse'] for x in missing]!=list(range(left+1,right))
        or cues[numbers.index(left)]['end']!=cut or cues[numbers.index(right)]['start']!=cut):
        raise ValueError('Accepted seam is not the exact adjacent real source boundary around the confirmed missing block')
    for cue,check in zip(cues,base['checks']):
        words=[w for w in check['alignedWords'] if normalized(w.get('word',''))]
        if not words or any(not cue['start']<=w['start']<w['end']<=cue['end'] for w in words):
            raise ValueError('Accepted seam loses a real original model word body')
    return copy.deepcopy(missing)


REVIEWED_CONFIRMED_GAP_POLICY={**REVIEWED_CONFIRMED_SOURCE_POLICY,'version':'registered-user-confirmed-source-absence-existing-gap-v1','seam':'exact-original-left-tail-and-right-head-with-recorded-human-completeness-decision'}

def _inputs(base,receipt,materials):
    from alignment_contract import PARTIAL_REVIEW_RECIPE,BOUNDARY_RECOGNIZER,site_fingerprint
    from partial_audio import source_text_sha
    if (receipt['schemaVersion'] not in {19,23} or base.get('accepted') is not False
        or base['qualityRecipe']!=PARTIAL_REVIEW_RECIPE or base['issues']!=['missing-narration-evidence-unconfirmed']
        or base.get('missingVerses') or (receipt['schemaVersion']==19 and (base.get('jointAlignments') or any(c.get('jointProofId') for c in base['checks']))) or any(c.get('jointClipRange') is not None for c in base['checks'])
        or base['textSha256']!=source_text_sha(base['boundarySourceVerses'])
        or base['fingerprint']!=site_fingerprint(base['sourceAudioSha256'],base['textSha256'],'en',PARTIAL_REVIEW_RECIPE,BOUNDARY_RECOGNIZER)
        or digest(base)!=receipt['baseEvidenceSha256'] or _material(receipt,materials,receipt['baseReportFile'])!=base):
        raise ValueError('Need the exact original rejected missing-narration source report')
    cov=base['confirmedCoverage'];audit=_material(receipt,materials,receipt['sourceAuditFile']);raw=next(m['utf8'] for m in materials if m['file']==receipt['baseReportFile'])
    if (cov['policy']!=COVERAGE_POLICY or cov['id']!=digest({k:v for k,v in cov.items() if k!='id'})
        or cov['key']!=base['key'] or cov['sourceAudioSha256']!=base['sourceAudioSha256'] or cov['textSha256']!=base['textSha256'] or cov['cueSha256']!=digest(base['cues'])
        or audit['key']!=base['key'] or audit['sourceAudioSha256']!=base['sourceAudioSha256']
        or audit['sourceReportSha256']!=hashlib.sha256(raw.encode()).hexdigest() or audit['speechSegments']!=cov['speechSegments']
        or audit['sampleCount']!=round(base['duration']*16000) or cov['sampleCount']!=audit['sampleCount'] or audit['vadModelSha256']!=GAP_POLICY['vadModelSha256']):
        raise ValueError('Original failed coverage or full source VAD changed')
    previous=0
    for x,y in audit['speechSegments']:
        if type(x) is not int or type(y) is not int or not previous<=x<y<=audit['sampleCount']:raise ValueError('Invalid original VAD range')
        previous=y
    return cov


def derive_confirmed_source_case(base,receipt,materials):
    from alignment_contract import PROJECTION_REVIEW_RECIPE
    from spoken_projection import projection_for,projection_matches
    from partial_audio import source_text_sha
    cov=_inputs(base,receipt,materials);missing=confirmed_absence_gap(base,receipt) if receipt['schemaVersion']==23 else confirmed_absence_seam(base,receipt)
    if not projection_matches(base):raise ValueError('Canonical projection changed')
    roots=narrated_verses(base);witness=copy.deepcopy(base);witness.pop('confirmedCoverage')
    witness.update(qualityRecipe=PROJECTION_REVIEW_RECIPE,accepted=True,issues=[],boundarySourceVerses=roots,
        expectedVerseNumbers=[v['number'] for v in roots],textSha256=source_text_sha(roots),spokenProjection=projection_for(base['key'],roots))
    if receipt['schemaVersion']==23:
        from reviewed_coverage_windows import coverage_model_witness
        witness=coverage_model_witness(base);witness.update(accepted=True,issues=[])
    if not verified_boundary_artifact(witness):raise ValueError('An unrelated original narrated-verse proof failed')
    result=copy.deepcopy(base);result.update(accepted=True,issues=[],missingVerses=missing,
        confirmedCoverage=dict(policy=REVIEWED_CONFIRMED_GAP_POLICY if receipt['schemaVersion']==23 else REVIEWED_CONFIRMED_SOURCE_POLICY,roles=copy.deepcopy(cov['roles']),
            originalFailedCoverageSha256=digest(cov),userDecision=receipt['humanDecision'],**({'sourceGap':copy.deepcopy(receipt['sourceGap'])} if receipt['schemaVersion']==23 else {'naturalSeam':copy.deepcopy(receipt['naturalSeam'])})))
    return result


def confirmed_source_measurements_match(base,receipt,materials,pcm):
    try:
        cov=_inputs(base,receipt,materials)
        if len(pcm)!=round(base['duration']*16000):return False
        measured=measure_coverage(base,pcm,cov['speechSegments'],cov['roles'],cov['nivEvidence'])
        if not same_source_measurements(cov,measured):return False
        # Reproduce the nonquiet, user-accepted source context; never call it a silence proof.
        proof=_material(receipt,materials,receipt['seamEvidenceFile'])
        for cut,saved in zip(proof['cuts'],proof['measurements']):
            actual=measure_user_source_cut(cut,pcm)
            if not same_source_measurements(saved,actual):return False
        s=receipt['sourceGap'] if receipt['schemaVersion']==23 else receipt['naturalSeam']
        if (len(proof['cuts'])!=len(proof['measurements']) or len(proof['cuts'])!=2
            or [(c['verse'],c['side']) for c in proof['cuts']]!=[(s['leftVerse'],'tail'),(s['rightVerse'],'head')]):return False
        if receipt['schemaVersion']==23:
            for c in proof['cuts']:
                cue=next(x for x in base['cues'] if x['verse']==c['verse']);edge=cue['end' if c['side']=='tail' else 'start'];lo,hi=c['window']
                if (c['measurementKind']!='user-natural-seam' or c['window']!=receipt['sourceGapWindows'][str(c['verse'])]
                    or c['before']!=[cue['start'],cue['end']] or c['after']!=c['before']
                    or not 160<=hi-lo<=640 or not lo<=round(edge*16000)<=hi):return False
            return True
        return all(c['measurementKind']=='user-natural-seam' and c['window']==[round(t*16000) for t in s['uncertainty']] for c in proof['cuts'])
    except (KeyError,TypeError,ValueError,IndexError,StopIteration):return False


def confirmed_absence_gap(base,receipt):
    cov=base['confirmedCoverage'];roles=cov['roles'];missing=roles['missingVerses'];gap=receipt['sourceGap'];lo,hi=gap['range']
    if (receipt['schemaVersion']!=23 or not base['key'].endswith(':en') or roles['aliases'] or not missing
        or roles!=candidate_roles(base['key'],base['boundarySourceVerses'],cov['nivEvidence'])
        or receipt['userConfirmedMissingVerses']!=[m['verse'] for m in missing]
        or receipt['approvedBy']!='user-natural-gap-and-source-absence' or receipt['sourceAcousticApproval'] is not False
        or not isinstance(receipt['humanDecision'],str) or not receipt['humanDecision'].strip()
        or any(receipt[k] for k in ['cuts','weakVerses','failureReasons','gapAssignments']) or receipt['finalCues']!=base['cues']
        or not all(finite(t) for t in [lo,hi]) or not 0<=lo<hi<=base['duration']):
        raise ValueError('Need the exact unchanged source gap and human absence decision')
    cues=base['cues'];numbers=[c['verse'] for c in cues];left,right=gap['leftVerse'],gap['rightVerse']
    if (left not in numbers or right not in numbers or numbers.index(right)!=numbers.index(left)+1
        or [m['verse'] for m in missing]!=list(range(left+1,right))
        or cues[numbers.index(left)]['end']!=lo or cues[numbers.index(right)]['start']!=hi):
        raise ValueError('Human gap does not match the original actual neighboring cuts')
    for cue,check in zip(cues,base['checks']):
        words=[w for w in check['alignedWords'] if normalized(w.get('word',''))]
        if not words or any(not cue['start']<=w['start']<w['end']<=cue['end'] for w in words):raise ValueError('An original real word body is incomplete')
    return copy.deepcopy(missing)
