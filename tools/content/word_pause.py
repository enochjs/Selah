"""Resolve one weak tail and a stretched next-word clock at an original PCM pause."""
import copy
import math
import re
from boundary_quality import POLICY,finite,verse_boundary
from quiet_gaps import digest,rms
from timed_text import normalized
from spoken_text import boundary_text

WORD_PAUSE_POLICY={'version':'shared-word-clock-local-pause-v1','sampleRate':16000,'minimumTailScore':.2,
 'minimumTailProbability':.98,'minimumMeanScore':.75,'minimumNextHeadScore':.65,
 'maximumClockDifference':.2,'maximumCoarseHeadExtension':1.0,'maximumCoarseGap':.1,
 'tailMargin':.04,'nextHeadMargin':.06,'frameSamples':320,'frames':4,'maximumRms':.03,'relativeRms':.25,
 'selection':'first-confirmed-quiet-run-after-complete-tail-v1','scope':'single-full-source-nonnumeric-english-boundary',
 'volumeReference':'complete-independent-tail-and-reliable-following-head-v1'}


def _words(c):return [w for w in c['alignedWords'] if normalized(w.get('word',''))]


def _bases():
    from alignment_contract import BOUNDARY_REVIEW_RECIPE,BOUNDARY_CONTEXT_RECIPE,PADDING_REVIEW_RECIPE
    return {BOUNDARY_REVIEW_RECIPE,BOUNDARY_CONTEXT_RECIPE,PADDING_REVIEW_RECIPE}


def _constraints(a,verse,policy=WORD_PAUSE_POLICY):
    p=policy;checks=a['checks'];index=next(i for i,c in enumerate(checks) if c['verse']==verse)
    if not a['key'].endswith(':en') or not index+1<len(checks):raise ValueError('Need following real verse')
    c,n=checks[index:index+2];source={v['number']:v for v in a['boundarySourceVerses']};words=_words(c);nw=_words(n)
    if not words or not nw:raise ValueError('No timed source words for this verse or its neighbor')
    if (any(k in a for k in ['spokenProjection','confirmedCoverage','numericAlignmentPolicy','caseReviewPolicy','speechContextReview','speechSpanReview'])
        or any(re.search(r'\d',v['text']) for v in source.values()) or c.get('jointProofId') or n.get('jointProofId')):raise ValueError('Unsupported coverage or joint evidence')
    raw=[w for seg in a['recognition'] for w in seg.get('words',[])];anchors=c['asrEdgeAnchors'];next_anchors=n['asrEdgeAnchors']
    if len(anchors)!=2 or len(next_anchors)!=2 or any(w not in raw for w in [*anchors,*next_anchors]):raise ValueError('Independent clocks differ from original recognition')
    _,e=verse_boundary(c['alignedWords'],c['searchRange'],a['duration'],'en',reference=boundary_text(source[verse]['text'],'en'),signal=c['boundarySignal'],anchors=anchors)
    next_edges,ne=verse_boundary(n['alignedWords'],n['searchRange'],a['duration'],'en',reference=boundary_text(source[n['verse']]['text'],'en'),signal=n['boundarySignal'],anchors=next_anchors)
    tail,head=anchors[-1],next_anchors[0];last,first=words[-1],nw[0]
    if (e['reasons']!=['weak-edge-word'] or e['meanAlignmentScore']<p['minimumMeanScore']
        or not p['minimumTailScore']<=last['score']<POLICY['minimumEdgeScore'] or words[0]['score']<p['minimumNextHeadScore']
        or next_edges is None or not n.get('boundaryVerified') or first['score']<p['minimumNextHeadScore']
        or normalized(tail['word'])!=normalized(last['word']) or normalized(head['word'])!=normalized(first['word'])
        or any(not finite(x.get(k)) for x in [tail,head] for k in ['start','end','probability'])
        or not p['minimumTailProbability']<=tail['probability']<=1 or not .7<=head['probability']<=1
        or not 0<=tail['start']<tail['end']<=a['duration'] or not 0<=head['start']<head['end']<=a['duration']
        or max(abs(tail[k]-last[k]) for k in ['start','end'])>p['maximumClockDifference']
        or abs(head['end']-first['end'])>p['maximumClockDifference']
        or not 0<=first['start']-head['start']<=p['maximumCoarseHeadExtension']
        or (not p.get('allowSeparateClocks') and abs(head['start']-tail['end'])>p['maximumCoarseGap'])):raise ValueError('No independent complete tail and reliable following head')
    protected=max(last['end'],tail['end']);low=protected+p['tailMargin'];high=first['start']-p['nextHeadMargin']
    sr=p['sampleRate'];frame=p['frameSamples'];length=frame*p['frames']
    begin=math.ceil(low*sr/frame)*frame;final=math.floor(high*sr/frame)*frame-length
    if begin>final:raise ValueError('No room for complete local pause')
    start=words[0]['start'];ha=anchors[0]
    if ha.get('probability',0)>=.7:start=min(start,ha['start'])
    start=round(max(c['searchRange'][0],start-POLICY['headPadding']),3)
    previous=max([x['end'] for x in a['cues'] if x['verse']<verse]+[0])
    if start<previous:raise ValueError('Verse head overlaps its predecessor')
    result={'verse':verse,'nextVerse':n['verse'],'sourceAudioSha256':a['sourceAudioSha256'],
        'tailClock':tail,'nextClock':head,'tailModel':last,'nextHeadModel':first,
        'firstSample':begin,'lastSample':final,'rangeStart':start,'followingRangeEnd':next_edges[1],
        'referenceRanges':[[round(tail['start']*sr),round(tail['end']*sr)],
                           [round(first['start']*sr),round(first['end']*sr)]]}
    if p.get('keepFollowingPadding'):result['followingRangeStart']=next_edges[0]
    return result


def measure_word_pause(a,verse,pcm,policy=WORD_PAUSE_POLICY):
    p=policy;e=_constraints(a,verse,policy)
    if len(pcm)!=round(a['duration']*16000):raise ValueError('Source duration changed')
    refs=[rms(pcm,*r) for r in e['referenceRanges']];limit=min(p['maximumRms'],min(refs)*p['relativeRms'])
    for start in range(e['firstSample'],e['lastSample']+1,p['frameSamples']):
        values=[rms(pcm,start+i*p['frameSamples'],start+(i+1)*p['frameSamples']) for i in range(p['frames'])]
        if max(values)>limit:continue
        cut=(start+p['frameSamples']*p['frames']//2)/16000
        following=max(cut,e['followingRangeStart']) if p.get('keepFollowingPadding') else cut
        proof={**e,'startSample':start,'referenceRms':refs,'quietRms':values,
               'ranges':{str(e['verse']):[e['rangeStart'],cut],str(e['nextVerse']):[following,e['followingRangeEnd']]}}
        proof['id']=digest(proof);return proof
    raise ValueError('No original PCM pause after complete tail')


def _proof_valid(a,proof,policy=WORD_PAUSE_POLICY):
    e=_constraints(a,proof['verse'],policy);p=policy
    if any(proof.get(k)!=v for k,v in e.items()):return False
    start=proof['startSample'];refs=proof['referenceRms'];values=proof['quietRms']
    if type(start) is not int or not e['firstSample']<=start<=e['lastSample'] or (start-e['firstSample'])%p['frameSamples']:return False
    cut=(start+p['frameSamples']*p['frames']//2)/16000
    following=max(cut,e['followingRangeStart']) if p.get('keepFollowingPadding') else cut
    ranges={str(e['verse']):[e['rangeStart'],cut],str(e['nextVerse']):[following,e['followingRangeEnd']]}
    if proof['ranges']!=ranges or len(refs)!=2 or any(not finite(x) or not 0<x<=1 for x in refs):return False
    limit=min(p['maximumRms'],min(refs)*p['relativeRms'])
    return len(values)==p['frames'] and all(finite(v) and 0<=v<=limit for v in values) and proof['id']==digest({k:v for k,v in proof.items() if k!='id'})


def verified_word_pause_artifact(a):
    try:
        from alignment_contract import WORD_PAUSE_RECIPE
        from boundary_quality import verified_boundary_artifact
        r=a['wordPauseReview']
        if (a['qualityRecipe']!=WORD_PAUSE_RECIPE or r['policy']!=WORD_PAUSE_POLICY or r['baseRecipe'] not in _bases()
            or r['sourceAudioSha256']!=a['sourceAudioSha256'] or len(r['proofs'])!=1
            or r['id']!=digest({k:v for k,v in r.items() if k!='id'})):return False
        proof=r['proofs'][0]
        if not _proof_valid(a,proof):return False
        trial={k:v for k,v in a.items() if k!='wordPauseReview'};trial['qualityRecipe']=r['baseRecipe']
        ranges={int(k):v for k,v in proof['ranges'].items()}
        return verified_boundary_artifact(trial,boundary_ranges=ranges)
    except (KeyError,TypeError,ValueError,IndexError,StopIteration,ZeroDivisionError):return False


def word_pause_measurements_match(a,pcm):
    try:
        if not verified_word_pause_artifact(a):return False
        proof=a['wordPauseReview']['proofs'][0];measured=measure_word_pause(a,proof['verse'],pcm)
        def close(x,y,key=None):
            if isinstance(x,dict) and isinstance(y,dict):return x.keys()==y.keys() and all(close(x[k],y[k],k) for k in x if k!='id')
            if isinstance(x,list) and isinstance(y,list):return len(x)==len(y) and all(close(v,w,key) for v,w in zip(x,y))
            if key in {'referenceRms','quietRms'} and finite(x) and finite(y):return abs(x-y)<=1/32768
            return x==y
        return close(proof,measured)
    except (KeyError,TypeError,ValueError,IndexError,StopIteration,ZeroDivisionError):return False


def verify_word_pause_media(a,path):
    from gap_review import decode_pcm
    from media_assets import file_matches
    return verified_word_pause_artifact(a) and file_matches(path,a['sourceAudioSha256']) and word_pause_measurements_match(a,decode_pcm(path))


def repair_word_pause(original,verse,pcm):
    from alignment_contract import WORD_PAUSE_RECIPE,site_fingerprint,BOUNDARY_RECOGNIZER
    a=copy.deepcopy(original)
    if a['qualityRecipe'] not in _bases():return a
    try:proof=measure_word_pause(a,verse,pcm)
    except (KeyError,TypeError,ValueError,IndexError,StopIteration):return a
    r={'policy':WORD_PAUSE_POLICY,'baseRecipe':a['qualityRecipe'],'sourceAudioSha256':a['sourceAudioSha256'],'proofs':[proof]};r['id']=digest(r)
    a.update(wordPauseReview=r,qualityRecipe=WORD_PAUSE_RECIPE)
    cues={c['verse']:c for c in a['cues']}
    for c in a['checks']:
        if str(c['verse']) not in proof['ranges']:continue
        start,end=proof['ranges'][str(c['verse'])];c['boundaryVerified']=True;cues[c['verse']]={'verse':c['verse'],'text':c['text'],'start':start,'end':end}
    a['cues']=[cues[n] for n in sorted(cues)]
    from boundary_quality import boundary_gap_issues
    a['issues']=[f'unreliable-verse-boundary:{c["verse"]}' for c in a['checks'] if not c.get('boundaryVerified')]+boundary_gap_issues(a['unclaimedSpeech'],a['cues'])
    a['accepted']=not a['issues']
    if not verified_word_pause_artifact(a) or not word_pause_measurements_match(a,pcm):return copy.deepcopy(original)
    a['fingerprint']=site_fingerprint(a['sourceAudioSha256'],a['textSha256'],'en',WORD_PAUSE_RECIPE,a.get('recognizer',BOUNDARY_RECOGNIZER))
    return a
