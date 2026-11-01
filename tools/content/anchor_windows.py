"""Reconcile overlapping coarse ASR heads using source-bound acoustic pause evidence."""
import copy
import math
from boundary_quality import POLICY,finite
from timed_text import normalized

ANCHOR_WINDOW_POLICY={'version':'quiet-pause-coarse-head-v1','sampleRate':16000,'frameSamples':320,'frames':4,
                      'maximumRms':.01,'relativeRms':.15,'minimumEdgeScore':.65,
                      'maximumWordEndDifference':.2,'maximumCoarseHeadExtension':1.0,
                      'leftPadding':.10,'rightPadding':.06}


def _constraints(left,right,original,policy=ANCHOR_WINDOW_POLICY):
    p=policy;lw=left['alignedWords'][-1];rw=right['alignedWords'][0]
    reference=min(left['boundarySignal']['verseRms'],right['boundarySignal']['verseRms'])
    if (not left.get('boundaryVerified') or not right.get('boundaryVerified')
            or not all(finite(x) for x in [lw['end'],lw['score'],rw['start'],rw['end'],rw['score'],reference,
                                            original['start'],original['end'],original['probability']])
            or not 0<reference or min(lw['score'],rw['score'])<p['minimumEdgeScore']
            or not POLICY['minimumAnchorProbability']<=original['probability']<=1
            or normalized(original['word'])!=normalized(rw['word'])
            or not 0<=original['start']<lw['end']<rw['start']<original['end']
            or rw['start']-original['start']>p['maximumCoarseHeadExtension']
            or abs(original['end']-rw['end'])>p['maximumWordEndDifference']):raise ValueError('No supported coarse-head conflict')
    return lw['end']+p['leftPadding'],rw['start']-p['rightPadding'],min(p['maximumRms'],reference*p['relativeRms'])


def _rms(pcm,start,count):
    return math.sqrt(sum((v/32768)**2 for v in pcm[start:start+count])/count)


def measure_head_refinement(left,right,pcm,audio_sha,policy=ANCHOR_WINDOW_POLICY):
    try:
        p=policy;original=right['asrEdgeAnchors'][0]
        low,high,limit=_constraints(left,right,original,policy);frame=p['frameSamples'];count=p['frames']
        first=math.ceil(low*p['sampleRate']/frame)*frame
        last=math.floor(high*p['sampleRate']/frame)*frame-frame*count
        candidates=[]
        for start in range(first,last+1,frame):
            if not 0<=start<start+frame*count<=len(pcm):continue
            values=[_rms(pcm,start+i*frame,frame) for i in range(count)]
            if max(values)<=limit:candidates.append((max(values),start,values))
        if not candidates:return None
        _,start,values=min(candidates)
        effective={**copy.deepcopy(original),'start':(start+frame*count/2)/p['sampleRate']}
        return {'policy':p,'sourceAudioSha256':audio_sha,'previousVerse':left['verse'],
                'originalAnchor':copy.deepcopy(original),'effectiveAnchor':effective,'startSample':start,'rms':values}
    except (KeyError,TypeError,ValueError,IndexError):return None


def verified_head_refinement(left,right,audio_sha,policy=ANCHOR_WINDOW_POLICY):
    try:
        p=policy;proof=right['pauseHeadProof'];raw=right['rawAsrEdgeAnchors']
        if (proof['policy']!=p or proof['sourceAudioSha256']!=audio_sha or proof['previousVerse']!=left['verse']
                or len(raw)!=2 or proof['originalAnchor']!=raw[0]
                or raw[1]!=right['asrEdgeAnchors'][1]):return False
        low,high,limit=_constraints(left,right,raw[0],policy);start=proof['startSample'];frame=p['frameSamples'];count=p['frames']
        if (type(start) is not int or start%frame or start<0 or start/p['sampleRate']<low
                or (start+frame*count)/p['sampleRate']>high
                or len(proof['rms'])!=count or any(not finite(x) or not 0<=x<=limit for x in proof['rms'])):return False
        expected={**raw[0],'start':(start+frame*count/2)/p['sampleRate']}
        return proof['effectiveAnchor']==expected and right['asrEdgeAnchors'][0]==expected
    except (KeyError,TypeError,ValueError,IndexError):return False


def anchor_witness(artifact):
    """Keep raw recognition intact; add only independently validated acoustic anchors to a verifier witness."""
    from alignment_contract import PADDING_REVIEW_RECIPE
    if artifact.get('anchorWindowPolicy')!=ANCHOR_WINDOW_POLICY:raise ValueError('Wrong pause policy')
    if any(any(c.isdigit() for c in v['text']) for v in artifact['boundarySourceVerses']):
        raise ValueError('Numeric source requires its separate verified reading recipe')
    recognized=[w for segment in artifact.get('recognition',[]) for w in segment.get('words',[])]
    checks=artifact['checks'];anchors=[]
    for index,check in enumerate(checks):
        if 'pauseHeadProof' not in check:
            if 'rawAsrEdgeAnchors' in check:raise ValueError('Unproven anchor override')
            continue
        if (index==0 or not verified_head_refinement(checks[index-1],check,artifact['sourceAudioSha256'])
                or not check.get('jointProofId') or check.get('jointProofId')!=checks[index-1].get('jointProofId')
                or any(a not in recognized for a in check['rawAsrEdgeAnchors'])):raise ValueError('Unproven pause anchor')
        anchors.append(check['asrEdgeAnchors'][0])
    if not anchors:raise ValueError('No measured pause anchor')
    trial={k:v for k,v in artifact.items() if k!='anchorWindowPolicy'}
    trial.update(qualityRecipe=PADDING_REVIEW_RECIPE,
                 recognition=[*artifact['recognition'],{'origin':'validated-acoustic-pause','words':anchors}])
    return trial


def verified_anchor_artifact(artifact):
    try:
        from boundary_quality import verified_boundary_artifact
        return verified_boundary_artifact(anchor_witness(artifact))
    except (KeyError,TypeError,ValueError,IndexError):return False


def verify_anchor_media(artifact,path):
    from media_assets import file_matches
    from gap_review import decode_pcm
    if not verified_anchor_artifact(artifact) or not file_matches(path,artifact['sourceAudioSha256']):return False
    return pause_measurements_match(artifact,decode_pcm(path))


def pause_measurements_match(artifact,pcm,policy=ANCHOR_WINDOW_POLICY):
    p=policy;frame=p['frameSamples']
    for check in artifact['checks']:
        proof=check.get('pauseHeadProof')
        if not proof:continue
        start=proof['startSample']
        if start+frame*p['frames']>len(pcm):return False
        measured=[_rms(pcm,start+i*frame,frame) for i in range(p['frames'])]
        raw=check.get('rawAsrEdgeAnchors',check.get('caseOriginalAnchors'))
        previous=next(c for c in artifact['checks'] if c['verse']==proof['previousVerse'])
        _,_,limit=_constraints(previous,check,raw[0],policy)
        references=[]
        for neighbor in [previous,check]:
            a,b=[round(value*p['sampleRate']) for value in neighbor['searchRange']]
            if not 0<=a<b<=len(pcm):return False
            reference=_rms(pcm,a,b-a)
            if abs(reference-neighbor['boundarySignal']['verseRms'])>1/32768:return False
            references.append(reference)
        actual_limit=min(p['maximumRms'],min(references)*p['relativeRms'])
        if any(value>min(limit,actual_limit) or abs(value-saved)>1/32768
               for value,saved in zip(measured,proof['rms'])):return False
    return True
