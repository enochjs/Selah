"""Retain numeric zero samples and an early positive clock at a quiet source seam."""
import copy
from boundary_quality import boundary_gap_issues
from quiet_gaps import digest
from reviewed_zero_clocks import REVIEWED_ZERO_CLOCK_POLICY,zero_clock_roles
from reviewed_gap_sources import _failed_report
from reviewed_saying_sources import _partitioned_clocks

REVIEWED_PARTITIONED_ZERO_POLICY={**REVIEWED_ZERO_CLOCK_POLICY,
 'version':'registered-zero-points-with-positive-quiet-source-partition-v1',
 'positivePartition':'complete-original-coarse-word-clock-retained-in-contiguous-real-source-outputs',
 'seam':'both-source-edges-pass-unchanged-strict-quiet-PCM-cut-verification',
}


def partitioned_zero_roles(base,receipt,checks):
    zeros=zero_clock_roles(base,receipt)
    for i in zeros:
        sample=round(base['unclaimedSpeech'][i]['start']*16000)
        if len([c for c in receipt['finalCues'] if round(c['start']*16000)<=sample<sample+1<=round(c['end']*16000)])!=1:
            raise ValueError('An exact zero-clock source sample was omitted')
    partitions=_partitioned_clocks(base,receipt,checks)
    if not partitions or zeros&partitions:raise ValueError('Need distinct positive source and zero-clock diagnostics')
    return zeros|partitions


def derive_partitioned_zero_case(base,receipt,materials):
    from alignment_contract import GAP_REVIEW_RECIPE,BOUNDARY_REVIEW_RECIPE,BOUNDARY_RECOGNIZER,site_fingerprint
    from reviewed_source_windows import derive_source_window_case
    if (receipt['schemaVersion']!=37 or base['key']!='proverbs:14:en' or base.get('accepted') is not False
        or base['qualityRecipe']!=GAP_REVIEW_RECIPE or digest(base)!=receipt['baseEvidenceSha256']
        or receipt['weakVerses'] or receipt['failureReasons']
        or base['issues']!=boundary_gap_issues(base['unclaimedSpeech'],base['cues'])):
        raise ValueError('Need the complete original failed Proverbs14 gap source')
    _failed_report(base);excluded=partitioned_zero_roles(base,receipt,{c['verse']:c for c in base['checks']});model=base.get('boundaryContextReview',{}).get('recipe',BOUNDARY_REVIEW_RECIPE)
    if (base['gapReview']!=dict(recipe=GAP_REVIEW_RECIPE,sourceFingerprint=site_fingerprint(base['sourceAudioSha256'],base['textSha256'],'en',model,BOUNDARY_RECOGNIZER))
        or base['fingerprint']!=site_fingerprint(base['sourceAudioSha256'],base['textSha256'],'en',GAP_REVIEW_RECIPE,BOUNDARY_RECOGNIZER)):
        raise ValueError('Original source model identity changed')
    w=copy.deepcopy(base)
    for name in ['acousticGapReview','gapReview']:w.pop(name)
    w.update(qualityRecipe=model,fingerprint=base['gapReview']['sourceFingerprint'],unclaimedSpeech=[g for i,g in enumerate(base['unclaimedSpeech']) if i not in excluded]);w['issues']=boundary_gap_issues(w['unclaimedSpeech'],w['cues'])
    inner=copy.deepcopy(receipt);inner.update(schemaVersion=10,gapAssignments=[])
    for a in receipt['gapAssignments']:
        if a['index'] in excluded:raise ValueError('Already classified clock received another source owner')
        inner['gapAssignments'].append({**a,'index':a['index']-sum(i<a['index'] for i in excluded)})
    result=derive_source_window_case(w,inner,materials)
    result.update(qualityRecipe=base['qualityRecipe'],fingerprint=base['fingerprint'],acousticGapReview=copy.deepcopy(base['acousticGapReview']),gapReview=copy.deepcopy(base['gapReview']),unclaimedSpeech=copy.deepcopy(base['unclaimedSpeech']),sourceZeroClockReview=copy.deepcopy(receipt['zeroClocks']),sourcePartitionedClockReview=copy.deepcopy(receipt['clockPartitions']))
    return result
