"""Human-reviewed shared seams retain every sample of an old rejected ASR gap."""
import copy
from reviewed_gap_sources import _failed_report,REVIEWED_GAP_SOURCE_POLICY
from reviewed_source_windows import derive_source_window_case
from user_source_seams import USER_PRESERVED_SEAM_POLICY

REVIEWED_USER_GAP_POLICY={
    'version':'registered-user-seam-original-gap-complete-sample-ownership-v1',
    'originalGapPolicy':REVIEWED_GAP_SOURCE_POLICY,
    'humanPolicy':USER_PRESERVED_SEAM_POLICY,
    'scope':'all-original-verse-model-proofs-pass; exact-user-accepted-adjacent-shared-seam',
    'gap':'entire-original-ASR-clock-retained-by-two-contiguous-real-verse-ranges; text-and-clock-unchanged',
    'stationaryNeighbor':'fixed-human-context-proof-required-on-both-sides-even-if-one-cut-is-unchanged',
    'modelClockExceptions':False,
}


def derive_user_gap_source_case(base,receipt,materials):
    from alignment_contract import GAP_REVIEW_RECIPE,BOUNDARY_REVIEW_RECIPE,BOUNDARY_CONTEXT_RECIPE,PADDING_REVIEW_RECIPE,BOUNDARY_RECOGNIZER,site_fingerprint
    model=base.get('boundaryContextReview',{}).get('recipe',BOUNDARY_REVIEW_RECIPE)
    if (receipt['schemaVersion']!=16 or receipt['weakVerses'] or receipt['failureReasons']
            or base['qualityRecipe']!=GAP_REVIEW_RECIPE or model not in {BOUNDARY_REVIEW_RECIPE,BOUNDARY_CONTEXT_RECIPE,PADDING_REVIEW_RECIPE}
            or base['fingerprint']!=site_fingerprint(base['sourceAudioSha256'],base['textSha256'],base['key'].split(':')[-1],GAP_REVIEW_RECIPE,BOUNDARY_RECOGNIZER)
            or base['gapReview']!=dict(recipe=GAP_REVIEW_RECIPE,sourceFingerprint=site_fingerprint(base['sourceAudioSha256'],base['textSha256'],base['key'].split(':')[-1],model,BOUNDARY_RECOGNIZER))):
        raise ValueError('Need a complete unchanged rejected gap report with original verified verse boundaries')
    _failed_report(base)
    witness=copy.deepcopy(base)
    for field in ['acousticGapReview','gapReview']:witness.pop(field)
    witness.update(qualityRecipe=model,fingerprint=base['gapReview']['sourceFingerprint'])
    result=derive_source_window_case(witness,receipt,materials)
    result.update(acousticGapReview=copy.deepcopy(base['acousticGapReview']),gapReview=copy.deepcopy(base['gapReview']),qualityRecipe=base['qualityRecipe'],fingerprint=base['fingerprint'])
    return result
