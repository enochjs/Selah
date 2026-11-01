"""Zero-length numeric ASR diagnostics do not define positive audio spans."""
import copy
from boundary_quality import finite,boundary_gap_issues
from quiet_gaps import digest
from reviewed_gap_sources import _failed_report
from timed_text import normalized

REVIEWED_ZERO_CLOCK_POLICY={
    'version':'registered-zero-duration-numeric-ASR-diagnostics-v1',
    'scope':'exact-original-numeric-between-verse-points-with-no-positive-source-extent',
    'original':'complete-failed-gap-report-and-all-ASR-text-clocks-and-flags-retained',
    'model':'every-real-verse-body-and-original-joint-proof-must-pass-source-window-verification',
    'positiveIntervals':'all-positive-ASR-intervals-still-require-strict-complete-source-ownership',
    'zeroPointSource':'one-real-original-sample-at-each-exact-point-remains-in-a-verified-verse-output',
    'source':'original-failed-gap-measurements-replayed-and-all-changed-cuts-remeasured',
    'silenceClaim':False,'unspokenNumberClaim':False,
}


def zero_clock_roles(base,receipt):
    entries=receipt['zeroClocks'];gaps=base['unclaimedSpeech'];expected={i for i,g in enumerate(gaps) if g['start']==g['end']};seen=set()
    if not entries:raise ValueError('No fixed original zero-duration markers')
    for e in entries:
        i=e['index']
        if type(i) is not int or not 0<=i<len(gaps) or i in seen:raise ValueError('Unknown or duplicate zero-duration marker')
        g=gaps[i]
        if (e['gapSha256']!=digest(g) or g['kind']!='between-verses' or g.get('allowedHeadingOrClosing') is not False
            or not normalized(g['text']).isdigit() or not all(finite(g[k]) for k in ['start','end'])
            or not 0<=g['start']==g['end']<=base['duration']):
            raise ValueError('A positive interval, lexical word, or source heading is not a numeric zero clock')
        seen.add(i)
    if seen!=expected:raise ValueError('Every original zero-duration diagnostic must be preserved explicitly')
    return seen


def derive_zero_clock_case(base,receipt,materials):
    from alignment_contract import GAP_REVIEW_RECIPE,BOUNDARY_RECOGNIZER,site_fingerprint
    from reviewed_source_windows import derive_source_window_case
    if (receipt['schemaVersion']!=32 or base['qualityRecipe']!=GAP_REVIEW_RECIPE or base.get('accepted') is not False
        or digest(base)!=receipt['baseEvidenceSha256'] or receipt['weakVerses'] or receipt['failureReasons']
        or base['issues']!=boundary_gap_issues(base['unclaimedSpeech'],base['cues'])
        or base['fingerprint']!=site_fingerprint(base['sourceAudioSha256'],base['textSha256'],base['key'].split(':')[-1],GAP_REVIEW_RECIPE,BOUNDARY_RECOGNIZER)):
        raise ValueError('Need the complete failed gap source with no failed verse-model checks')
    _failed_report(base);excluded=zero_clock_roles(base,receipt);w=copy.deepcopy(base)
    for i in excluded:
        sample=round(base['unclaimedSpeech'][i]['start']*16000)
        owners=[c for c in receipt['finalCues'] if round(c['start']*16000)<=sample<sample+1<=round(c['end']*16000)]
        if len(owners)!=1:raise ValueError('The exact zero-marker source sample must remain in one verified real output')
    model=base.get('boundaryContextReview',{}).get('recipe')
    if model is None:
        from alignment_contract import BOUNDARY_REVIEW_RECIPE
        model=BOUNDARY_REVIEW_RECIPE
    expected=dict(recipe=GAP_REVIEW_RECIPE,sourceFingerprint=site_fingerprint(base['sourceAudioSha256'],base['textSha256'],base['key'].split(':')[-1],model,BOUNDARY_RECOGNIZER))
    if base['gapReview']!=expected:raise ValueError('The original model source identity changed')
    for name in ['acousticGapReview','gapReview']:w.pop(name)
    w.update(qualityRecipe=model,fingerprint=base['gapReview']['sourceFingerprint'],unclaimedSpeech=[g for i,g in enumerate(base['unclaimedSpeech']) if i not in excluded])
    w['issues']=boundary_gap_issues(w['unclaimedSpeech'],w['cues']);inner=copy.deepcopy(receipt);inner.update(schemaVersion=10,gapAssignments=[])
    for a in receipt['gapAssignments']:
        if a['index'] in excluded:raise ValueError('A zero-duration diagnostic cannot impersonate a positive spoken word')
        inner['gapAssignments'].append({**a,'index':a['index']-sum(i<a['index'] for i in excluded)})
    result=derive_source_window_case(w,inner,materials)
    result.update(qualityRecipe=base['qualityRecipe'],fingerprint=base['fingerprint'],acousticGapReview=copy.deepcopy(base['acousticGapReview']),gapReview=copy.deepcopy(base['gapReview']),unclaimedSpeech=copy.deepcopy(base['unclaimedSpeech']),sourceZeroClockReview=copy.deepcopy(receipt['zeroClocks']))
    return result
