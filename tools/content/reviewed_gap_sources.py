"""Registered real-verse ownership of a previously rejected quiet ASR gap.

The old report stays a failed quiet proof. Its original measurements are
remeasured, while exact source cuts retain the speech in its verified verse.
"""
import copy
from boundary_quality import finite,boundary_gap_issues
from quiet_gaps import GAP_POLICY,digest,reference_ranges,uncovered_samples,context_range,measure_gaps,verified_quiet_gaps
from reviewed_source_windows import REVIEWED_WINDOW_POLICY,derive_source_window_case

REVIEWED_GAP_SOURCE_POLICY={
    'version':'registered-source-owned-failed-quiet-gap-v1',
    'originalGapPolicy':GAP_POLICY,'sourcePolicy':REVIEWED_WINDOW_POLICY,
    'scope':'all-original-verse-checks-pass; only-rejected-unassigned-gap-issues',
    'originalProof':'complete-failed-quiet-report-remeasured-with-original-cues-gaps-and-vad',
    'sourceProof':'each-original-unowned-gap-fully-contained-in-exact-registered-real-verse',
    'originalFacts':'failed-quiet-report-model-clocks-and-false-gap-flags-retained-verbatim',
    'clockExceptions':False,'headingReclassification':False,
}


def _failed_report(base):
    r=base['acousticGapReview'];count=round(base['duration']*16000)
    if (r['policy']!=GAP_POLICY or r['sampleCount']!=count or count<320
        or r['sourceAudioSha256']!=base['sourceAudioSha256']
        or r['cueSha256']!=digest(base['cues']) or r['gapSha256']!=digest(base['unclaimedSpeech'])
        or r['jointProofIds']!=[p['id'] for p in base.get('jointAlignments',[])]
        or r['id']!=digest({k:v for k,v in r.items() if k!='id'}) or verified_quiet_gaps(base)):
        raise ValueError('Need the unchanged original failed quiet-gap proof')
    previous=0
    for lo,hi in r['speechSegments']:
        if type(lo) is not int or type(hi) is not int or not previous<=lo<hi<=count:raise ValueError('Invalid original speech sample range')
        previous=hi
    expected=[i for i,g in enumerate(base['unclaimedSpeech']) if boundary_gap_issues([g],base['cues'])]
    if not expected or [p['gapIndex'] for p in r['proofs']]!=expected:raise ValueError('Wrong original failed gap inventory')
    for proof in r['proofs']:
        gap=base['unclaimedSpeech'][proof['gapIndex']];refs=reference_ranges(gap,base['cues']);parts=uncovered_samples(gap,base['cues'],count)
        if set(proof)!={'gapIndex','references','parts'} or len(refs)!=len(proof['references']) or len(parts)!=len(proof['parts']):raise ValueError('Incomplete original gap geometry')
        for ref,saved in zip(refs,proof['references']):
            if (set(saved)!={'verse','samples','rms'} or ref!={k:v for k,v in saved.items() if k!='rms'}
                or not finite(saved['rms']) or not 0<saved['rms']<=1):raise ValueError('Invalid original volume reference')
        for bounds,saved in zip(parts,proof['parts']):
            lo,hi=context_range(bounds,count)
            if (set(saved)!={'samples','context','frames'} or saved['samples']!=bounds or saved['context']!=[lo,hi]
                or len(saved['frames'])!=len(range(lo,hi,GAP_POLICY['hopSamples']))
                or any(not finite(v) or not 0<=v<=1 for v in saved['frames'])):raise ValueError('Invalid original rejected frame measurements')


def derive_gap_source_case(base,receipt,materials):
    from alignment_contract import GAP_REVIEW_RECIPE,BOUNDARY_REVIEW_RECIPE,BOUNDARY_CONTEXT_RECIPE,PADDING_REVIEW_RECIPE,BOUNDARY_RECOGNIZER,site_fingerprint
    model=base.get('boundaryContextReview',{}).get('recipe',BOUNDARY_REVIEW_RECIPE)
    locale=base['key'].split(':')[-1]
    if (receipt['schemaVersion']!=10 or receipt['weakVerses'] or receipt['failureReasons'] or not receipt['cuts']
        or base['qualityRecipe']!=GAP_REVIEW_RECIPE or model not in {BOUNDARY_REVIEW_RECIPE,BOUNDARY_CONTEXT_RECIPE,PADDING_REVIEW_RECIPE}
        or base['fingerprint']!=site_fingerprint(base['sourceAudioSha256'],base['textSha256'],locale,GAP_REVIEW_RECIPE,BOUNDARY_RECOGNIZER)
        or base['gapReview']!={'recipe':GAP_REVIEW_RECIPE,'sourceFingerprint':site_fingerprint(base['sourceAudioSha256'],base['textSha256'],locale,model,BOUNDARY_RECOGNIZER)}):
        raise ValueError('Need a complete original failed gap report with verified model boundaries')
    _failed_report(base)
    witness=copy.deepcopy(base)
    for field in ['acousticGapReview','gapReview']:witness.pop(field)
    witness.update(qualityRecipe=model,fingerprint=base['gapReview']['sourceFingerprint'])
    result=derive_source_window_case(witness,receipt,materials)
    result.update(acousticGapReview=copy.deepcopy(base['acousticGapReview']),gapReview=copy.deepcopy(base['gapReview']),
                  qualityRecipe=base['qualityRecipe'],fingerprint=base['fingerprint'])
    return result


def original_gap_measurements_match(base,pcm):
    try:
        _failed_report(base);saved=base['acousticGapReview']
        measured=measure_gaps(base,pcm,saved['speechSegments'])
        if verified_quiet_gaps({**base,'acousticGapReview':measured}):return False
        def close(left,right,key=None):
            if isinstance(left,dict) and isinstance(right,dict):return left.keys()==right.keys() and all(close(left[k],right[k],k) for k in left if k!='id')
            if isinstance(left,list) and isinstance(right,list):return len(left)==len(right) and all(close(a,b,key) for a,b in zip(left,right))
            if key in {'rms','frames'} and finite(left) and finite(right):return abs(left-right)<=1/32768
            return left==right
        return close(saved,measured)
    except (KeyError,TypeError,ValueError,IndexError,ZeroDivisionError):return False
