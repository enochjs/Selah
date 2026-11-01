"""Fixed source recovery when only interior average CTC confidence failed."""
import copy
from boundary_quality import finite
from timed_text import normalized

REVIEWED_ANCHOR_SOURCE_POLICY={
    'version':'registered-independent-complete-source-edges-v1',
    'original':'all-original-failed-scores-model-clocks-and-recognition-retained',
    'meanOnly':'complete-timed-body-and-both-model-edge-scores-at-least-0.5',
    'independentEdges':'exact-original-first-and-last-word-anchors-probability-at-least-0.9-and-positive-model-overlap',
    'source':'complete-model-and-independent-edges-inside-both-final-cuts-and-protected-source-core',
    'otherFailures':'unchanged-source-window-recovery-rules',
    'outputs':'registered-full-original-source-MP3-and-VTT-inventory',
}

REVIEWED_ANCHOR_USER_POLICY={**REVIEWED_ANCHOR_SOURCE_POLICY,
    'version':'registered-user-seams-and-independent-complete-source-edges-v1',
    'human':'each-nonquiet-adjacent-seam-explicitly-accepted-and-pinned-with-uncertainty',
    'modelClockExceptionsAllowed':False,
}

REVIEWED_HUMAN_SOURCE_POLICY={
    'version':'registered-user-complete-original-source-verse-v1',
    'human':'one-exact-user-verified-complete-verse-free-of-neighbor-speech',
    'scoreWaiver':'only-weak-edge-word-or-weak-verse-location-with-complete-timed-body-and-valid-order',
    'source':'complete-original-base-bound-to-registered-evidence; source-PCM-cuts-remeasured',
    'otherVerses':'all-model-and-joint-proofs-reverified-by-unchanged-source-window-rules',
    'originalFacts':'failed-scores-ASR-and-all-model-word-clocks-retained',
    'modelClockExceptionsAllowed':False,
}


def preserved_seam_rules(base,receipt,checks,final):
    from user_source_seams import user_seam_rules
    seams=receipt['naturalSeams'];seen=set();used=set()
    if not seams or receipt['modelClockExceptions']:
        raise ValueError('Need exact accepted seams without model clock exceptions')
    for seam in seams:
        left,right=seam['leftVerse'],seam['rightVerse']
        if left in used or right in used:
            raise ValueError('Duplicate or overlapping accepted seam')
        used.update([left,right])
        pair={(left,'tail'),(right,'head')};seen.update(pair)
        inner=copy.deepcopy(receipt);inner.update(schemaVersion=8,naturalSeam=seam,
            cuts=[c for c in receipt['cuts'] if (c['verse'],c['side']) in pair])
        user_seam_rules(base,inner,checks,final)
    if {(c['verse'],c['side']) for c in receipt['cuts'] if c.get('measurementKind')=='user-natural-seam'}!=seen:
        raise ValueError('An additional nonquiet cut has no exact human acceptance')
    return lambda v,w,lo,hi,core=False:lo<=w['start']<w['end']<=hi


def verify_anchored_mean_boundary(base,check,final,cuts,reasons,timed_fraction,core_field='ownVoice'):
    words=[w for w in check['alignedWords'] if normalized(w.get('word',''))]
    anchors=check.get('asrEdgeAnchors',[])
    recognized=[w for seg in base['recognition'] for w in seg.get('words',[])]
    own=[c for c in cuts if c['verse']==check['verse']]
    if (reasons!=['weak-verse-location'] or timed_fraction!=1. or not words
        or check.get('boundaryVerified') or check.get('jointProofId') or check.get('jointClipRange') is not None
        or len(anchors)!=2 or len(own)!=2 or {c['side'] for c in own}!={'head','tail'}
        or any(not final['start']<=w['start']<w['end']<=final['end'] for w in words)):
        raise ValueError('Need an original mean-only failure with complete fixed source boundaries')
    for word,anchor in zip([words[0],words[-1]],anchors):
        if (not finite(word.get('score')) or word['score']<.5 or anchor not in recognized
            or normalized(word['word'])!=normalized(anchor.get('word',''))
            or not all(finite(anchor.get(k)) for k in ['start','end','probability'])
            or not .9<=anchor['probability']<=1
            or not 0<=anchor['start']<anchor['end']<=base['duration']
            or max(word['start'],anchor['start'])>=min(word['end'],anchor['end'])
            or not final['start']<=anchor['start']<anchor['end']<=final['end']
            or any(not c[core_field][0]<=anchor['start']<anchor['end']<=c[core_field][1] for c in own)):
            raise ValueError('Independent original edge is weak, unrelated, or truncated')
