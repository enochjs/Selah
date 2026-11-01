"""Complete per-chapter boundary proofs with explicit ownership of shared ASR clocks."""
import copy
import re
from anchor_windows import ANCHOR_WINDOW_POLICY,verified_head_refinement
from boundary_quality import finite,POLICY
from timed_text import normalized

CASE_PAUSE_POLICY={**ANCHOR_WINDOW_POLICY,'version':'quiet-pause-coarse-head-v2','maximumCoarseHeadExtension':2.0}
CASE_POLICY={'version':'per-chapter-source-bound-review-v1','maximumJointVerses':6,'maximumJointSeconds':60,
             'ownership':'shared-anchor-exact-next-head-only-v1','minimumOwnershipEdgeScore':.65,
             'maximumOwnershipClockDifference':.2,'pause':CASE_PAUSE_POLICY}


def _edge(text,first):
    words=re.findall(r"[A-Za-z0-9]+(?:['’][A-Za-z]+)*|[\u3400-\u9fff]",text)
    if not words:raise ValueError('No source edge')
    return normalized(words[0] if first else words[-1])


def exclusive_head_owner(left,right):
    try:
        raw_left=left.get('caseOriginalAnchors',left['asrEdgeAnchors'])
        raw_right=right.get('caseOriginalAnchors',right['asrEdgeAnchors'])
        if len(raw_left)!=2 or len(raw_right)!=2 or raw_left[-1]!=raw_right[0]:return None
        shared=raw_right[0];lw=left['alignedWords'][-1];rw=right['alignedWords'][0]
        if (not all(finite(v) for v in [shared['start'],shared['end'],shared['probability'],lw['end'],lw['score'],rw['start'],rw['end'],rw['score']])
                or not 0<=shared['start']<shared['end'] or not POLICY['minimumAnchorProbability']<=shared['probability']<=1
                or min(lw['score'],rw['score'])<CASE_POLICY['minimumOwnershipEdgeScore']
                or not 0<=lw['end']<rw['start']<rw['end']
                or normalized(shared['word'])!=_edge(right['text'],True)
                or normalized(shared['word'])==_edge(left['text'],False)
                or abs(shared['start']-rw['start'])>CASE_POLICY['maximumOwnershipClockDifference']
                or abs(shared['end']-rw['end'])>CASE_POLICY['maximumOwnershipClockDifference']):return None
        return {'policy':CASE_POLICY['ownership'],'ownerVerse':right['verse'],'originalAnchor':copy.deepcopy(shared),
                'effectiveAnchor':{**copy.deepcopy(shared),'probability':0.0}}
    except (KeyError,TypeError,ValueError,IndexError):return None


def verified_owner(left,right):
    try:
        raw=left.get('caseOriginalAnchors',left.get('rawAsrEdgeAnchors'))
        if raw is None:return False
        if 'caseOriginalAnchors' in left and 'rawAsrEdgeAnchors' in left and left['rawAsrEdgeAnchors']!=raw:return False
        original={**left,'asrEdgeAnchors':raw,'caseOriginalAnchors':raw}
        expected=exclusive_head_owner(original,right)
        return expected is not None and left['anchorOwnerProof']==expected and left['asrEdgeAnchors'][-1]==expected['effectiveAnchor']
    except (KeyError,TypeError,ValueError,IndexError):return False


def case_witness(artifact):
    from alignment_contract import PADDING_REVIEW_RECIPE,GAP_REVIEW_RECIPE,PARTIAL_REVIEW_RECIPE
    from numeric_alignment import numeric_words_verified,NUMERIC_POLICY
    from spoken_projection import project_text
    if artifact.get('caseReviewPolicy')!=CASE_POLICY:raise ValueError('Wrong case review policy')
    base=artifact['caseBaseRecipe']
    if base not in {PADDING_REVIEW_RECIPE,GAP_REVIEW_RECIPE,PARTIAL_REVIEW_RECIPE}:raise ValueError('Unsupported source proof')
    recognized=[w for segment in artifact.get('recognition',[]) for w in segment.get('words',[])]
    checks=artifact['checks'];derived=[];numeric=False
    source={v['number']:v for v in artifact['boundarySourceVerses']}
    for index,check in enumerate(checks):
        reference=project_text(artifact['key'],check['verse'],source[check['verse']]['text'])
        if 'spokenText' in check and check['spokenText']!=reference:raise ValueError('Reading projection differs from original source')
        if re.search(r'\d',reference):
            numeric=True
            if not numeric_words_verified(check['alignedWords'],reference):raise ValueError('Unproven number reading')
        changed='anchorOwnerProof' in check or 'pauseHeadProof' in check
        if not changed:
            if 'caseOriginalAnchors' in check:raise ValueError('Unproven ASR override')
            continue
        raw=check['caseOriginalAnchors']
        if 'rawAsrEdgeAnchors' in check and check['rawAsrEdgeAnchors']!=raw:raise ValueError('Conflicting original ASR clocks')
        if len(raw)!=2 or any(a not in recognized for a in raw):raise ValueError('Wrong original ASR clock')
        expected=copy.deepcopy(raw)
        if 'anchorOwnerProof' in check:
            if (index+1>=len(checks) or not verified_owner(check,checks[index+1])
                    or not check.get('jointProofId') or check['jointProofId']!=checks[index+1].get('jointProofId')):
                raise ValueError('Unproven word ownership')
            expected[-1]=check['anchorOwnerProof']['effectiveAnchor'];derived.append(expected[-1])
        if 'pauseHeadProof' in check:
            intermediate=copy.deepcopy(expected)
            expected[0]=check['pauseHeadProof']['effectiveAnchor']
            witness={**check,'rawAsrEdgeAnchors':intermediate,'asrEdgeAnchors':expected}
            if (index==0 or not verified_head_refinement(checks[index-1],witness,artifact['sourceAudioSha256'],CASE_PAUSE_POLICY)
                    or not check.get('jointProofId') or check['jointProofId']!=checks[index-1].get('jointProofId')):
                raise ValueError('Unproven measured pause')
            derived.append(expected[0])
        if check['asrEdgeAnchors']!=expected:raise ValueError('Additional ASR override')
    if numeric and artifact.get('caseNumericPolicy')!=NUMERIC_POLICY:raise ValueError('Wrong number reading policy')
    trial={k:v for k,v in artifact.items() if k not in {'caseReviewPolicy','caseBaseRecipe','caseNumericPolicy',
               'numericAlignmentPolicy','numericBaseRecipe','anchorWindowPolicy'}}
    trial.update(qualityRecipe=base,recognition=[*artifact.get('recognition',[]),{'origin':'validated-exclusive-anchor','words':derived}])
    return trial


def verified_case_artifact(artifact):
    try:
        from boundary_quality import verified_boundary_artifact
        from alignment_contract import PARTIAL_REVIEW_RECIPE
        trial=case_witness(artifact)
        return verified_boundary_artifact(trial,maximum_joint_verses=3 if trial['qualityRecipe']==PARTIAL_REVIEW_RECIPE else CASE_POLICY['maximumJointVerses'])
    except (KeyError,TypeError,ValueError,IndexError,ZeroDivisionError):return False


def verify_case_media(artifact,path):
    from media_assets import file_matches
    from anchor_windows import pause_measurements_match
    from gap_review import decode_pcm,verify_gap_media
    from partial_audio import verify_partial_media
    from alignment_contract import PARTIAL_REVIEW_RECIPE
    if not verified_case_artifact(artifact) or not file_matches(path,artifact['sourceAudioSha256']):return False
    trial=case_witness(artifact)
    if any('pauseHeadProof' in c for c in artifact['checks']):
        if not pause_measurements_match(artifact,decode_pcm(path),CASE_PAUSE_POLICY):return False
    if trial['qualityRecipe']==PARTIAL_REVIEW_RECIPE:return verify_partial_media(trial,path)
    if trial.get('acousticGapReview') is not None:return verify_gap_media(trial,path)
    return True


def verified_case_files(artifact):
    try:
        from alignment_contract import PARTIAL_REVIEW_RECIPE
        from partial_audio import verified_partial_files
        from numeric_alignment import verified_numeric_files
        trial=case_witness(artifact)
        return verified_partial_files(trial) if trial['qualityRecipe']==PARTIAL_REVIEW_RECIPE else verified_numeric_files(trial)
    except (KeyError,TypeError,ValueError,IndexError):return False
