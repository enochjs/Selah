"""Confirm complete speech intervals around a weak short head word, without changing its score."""
import copy
import math
import re
from boundary_quality import POLICY,finite,verse_boundary,boundary_gap_issues
from quiet_gaps import GAP_POLICY,digest,rms
from timed_text import normalized
from spoken_text import boundary_text

SPAN_POLICY={'version':'short-head-complete-speech-span-v1','sampleRate':16000,'minimumMeanScore':.75,
 'minimumContextScore':.65,'minimumAsrProbability':.2,'minimumContextProbability':.7,'contextWords':4,
 'maximumClockDifference':.2,'maximumShortWordSeconds':.35,'maximumVadExtension':.6,
 'frameSamples':320,'frames':4,'gapMarginSeconds':.02,'maximumRms':.03,'relativeRms':.25,
 'vadPolicy':GAP_POLICY,'shortHeads':['a','an','the','he','she','it','i','we','to','in','on','of','and','but','or','so','is','as','at','if','by']}


def _bases():
    from alignment_contract import BOUNDARY_REVIEW_RECIPE,BOUNDARY_CONTEXT_RECIPE,PADDING_REVIEW_RECIPE
    return {BOUNDARY_REVIEW_RECIPE,BOUNDARY_CONTEXT_RECIPE,PADDING_REVIEW_RECIPE}


def _words(check):return [w for w in check['alignedWords'] if normalized(w.get('word',''))]


def _expected(artifact,index):
    checks=artifact['checks'];check=checks[index];p=SPAN_POLICY;words=_words(check)
    if not artifact['key'].endswith(':en') or not 0<index<len(checks)-1:raise ValueError('Need both real neighbors')
    left,right=checks[index-1],checks[index+1]
    if (check.get('jointProofId') or not left.get('boundaryVerified') or not right.get('boundaryVerified')
            or min(_words(left)[-1]['score'],_words(right)[0]['score'])<p['minimumContextScore']
            or len(words)<p['contextWords']+1 or normalized(words[0]['word']) not in p['shortHeads']
            or not 0<=words[0]['score']<POLICY['minimumEdgeScore']
            or words[0]['end']-words[0]['start']>p['maximumShortWordSeconds']
            or words[-1]['score']<p['minimumContextScore']
            or any(w['score']<p['minimumContextScore'] for w in words[1:p['contextWords']])):
        raise ValueError('Not an isolated weak short head')
    source=next(v for v in artifact['boundarySourceVerses'] if v['number']==check['verse'])
    _,e=verse_boundary(check['alignedWords'],check['searchRange'],artifact['duration'],'en',
        reference=boundary_text(source['text'],'en'),signal=check.get('boundarySignal'),anchors=check.get('asrEdgeAnchors'))
    if e['reasons']!=['weak-edge-word'] or e['meanAlignmentScore']<p['minimumMeanScore']:raise ValueError('Other acoustic failures remain')
    recognized=[w for s in artifact['recognition'] for w in s.get('words',[]) if normalized(w.get('word',''))]
    support=None
    for offset in range(len(recognized)-p['contextWords']+1):
        group=recognized[offset:offset+p['contextWords']]
        if all(normalized(a['word'])==normalized(b['word'])
            and all(finite(b.get(k)) for k in ['start','end','probability'])
            and 0<=b['start']<b['end']<=artifact['duration']
            and (p['minimumAsrProbability'] if i==0 else p['minimumContextProbability'])<=b['probability']<=1
            and max(abs(a[k]-b[k]) for k in ['start','end'])<=p['maximumClockDifference']
            for i,(a,b) in enumerate(zip(words,group))):support=group;break
    if support is None:raise ValueError('No independent phrase clocks')
    review=artifact['speechSpanReview'];speech=review['speechSegments'];count=review['sampleCount'];last=0
    for a,b in speech:
        if type(a) is not int or type(b) is not int or not last<=a<b<=count:raise ValueError('Invalid VAD clock')
        last=b
    centers=[(words[0]['start']+words[0]['end'])*8000,(words[-1]['start']+words[-1]['end'])*8000]
    first=next(i for i,(a,b) in enumerate(speech) if a<=centers[0]<b)
    final=next(i for i,(a,b) in enumerate(speech) if a<=centers[1]<b)
    if not 0<first<=final<len(speech)-1:raise ValueError('No neighboring speech intervals')
    prev,start=speech[first-1][1]/16000,speech[first][0]/16000
    end,following=speech[final][1]/16000,speech[final+1][0]/16000
    if (abs(start-words[0]['start'])>p['maximumClockDifference']
            or not 0<=end-words[-1]['end']<=p['maximumVadExtension']
            or abs(prev-_words(left)[-1]['end'])>p['maximumVadExtension']
            or abs(following-_words(right)[0]['start'])>p['maximumClockDifference']):raise ValueError('Speech belongs to a different phrase')
    cues={c['verse']:c for c in artifact['cues']};cuts=[round((prev+start)/2,3),round((end+following)/2,3)]
    anchors=check.get('asrEdgeAnchors',[])
    protected_start=min([words[0]['start'],support[0]['start']]+[a['start'] for a in anchors[:1] if a.get('probability',0)>=.7])
    protected_end=max([words[-1]['end']]+[a['end'] for a in anchors[1:] if a.get('probability',0)>=.7])
    if not cues[left['verse']]['end']<=cuts[0]<protected_start<protected_end<cuts[1]<=cues[right['verse']]['start']:
        raise ValueError('Span cuts a spoken edge or includes its neighbor')
    windows=[]
    for cut,(low,high) in zip(cuts,[(prev,start),(end,following)]):
        a=round(cut*16000)-p['frameSamples']*p['frames']//2;b=a+p['frameSamples']*p['frames']
        if not low+p['gapMarginSeconds']<=a/16000<b/16000<=high-p['gapMarginSeconds']:raise ValueError('No clear boundary gap')
        windows.append([a,b])
    return {'verse':check['verse'],'sourceAudioSha256':artifact['sourceAudioSha256'],'speechReviewId':review['id'],
       'neighbors':[left['verse'],right['verse']],'phraseClocks':support,'speechIndexes':[first,final],
       'range':cuts,'quietWindows':windows,'referenceRanges':[[round(c['searchRange'][0]*16000),round(c['searchRange'][1]*16000)] for c in [left,check,right]]}


def _valid_review(artifact):
    r=artifact['speechSpanReview']
    return (r['policy']==SPAN_POLICY and r['sourceAudioSha256']==artifact['sourceAudioSha256']
        and r['sampleCount']==round(artifact['duration']*16000)
        and r['id']==digest({k:v for k,v in r.items() if k!='id'}))


def _valid_proof(artifact,index):
    saved=artifact['checks'][index]['speechSpanProof'];expected=_expected(artifact,index)
    if any(saved.get(k)!=v for k,v in expected.items()):return False
    refs=saved['referenceRms'];frames=saved['quietRms'];p=SPAN_POLICY
    if len(refs)!=3 or any(not finite(v) or not 0<v<=1 for v in refs):return False
    limit=min(p['maximumRms'],min(refs)*p['relativeRms'])
    return (len(frames)==2 and all(len(part)==p['frames'] and all(finite(v) and 0<=v<=limit for v in part) for part in frames)
        and saved['id']==digest({k:v for k,v in saved.items() if k!='id'}))


def verified_span_artifact(artifact):
    try:
        from alignment_contract import SPEECH_SPAN_RECIPE
        from boundary_quality import verified_boundary_artifact
        if (artifact['qualityRecipe']!=SPEECH_SPAN_RECIPE or artifact['speechSpanBaseRecipe'] not in _bases()
                or not _valid_review(artifact) or any(re.search(r'\d',v['text']) for v in artifact['boundarySourceVerses'])
                or any(k in artifact for k in ['spokenProjection','confirmedCoverage','caseReviewPolicy','numericAlignmentPolicy'])):return False
        ranges={}
        for i,c in enumerate(artifact['checks']):
            if 'speechSpanProof' not in c:continue
            if not _valid_proof(artifact,i):return False
            ranges[c['verse']]=c['speechSpanProof']['range']
        if not ranges:return False
        trial={k:v for k,v in artifact.items() if k not in {'speechSpanReview','speechSpanBaseRecipe'}}
        trial['qualityRecipe']=artifact['speechSpanBaseRecipe']
        return verified_boundary_artifact(trial,boundary_ranges=ranges)
    except (KeyError,TypeError,ValueError,IndexError,StopIteration,ZeroDivisionError):return False


def span_measurements_match(artifact,pcm):
    try:
        if not verified_span_artifact(artifact) or len(pcm)!=artifact['speechSpanReview']['sampleCount']:return False
        p=SPAN_POLICY
        for c in artifact['checks']:
            proof=c.get('speechSpanProof')
            if not proof:continue
            refs=[rms(pcm,*r) for r in proof['referenceRanges']]
            if any(abs(a-b)>1/32768 for a,b in zip(refs,proof['referenceRms'])):return False
            limit=min(p['maximumRms'],min(refs)*p['relativeRms'])
            for (a,b),saved in zip(proof['quietWindows'],proof['quietRms']):
                values=[rms(pcm,k,k+p['frameSamples']) for k in range(a,b,p['frameSamples'])]
                if any(v>limit or abs(v-old)>1/32768 for v,old in zip(values,saved)):return False
        return True
    except (KeyError,TypeError,ValueError,IndexError,ZeroDivisionError):return False


def verify_span_media(artifact,path):
    from gap_review import decode_pcm
    from media_assets import file_matches
    return verified_span_artifact(artifact) and file_matches(path,artifact['sourceAudioSha256']) and span_measurements_match(artifact,decode_pcm(path))


def repair_speech_spans(original,pcm,speech):
    from alignment_contract import SPEECH_SPAN_RECIPE,site_fingerprint,BOUNDARY_RECOGNIZER
    result=copy.deepcopy(original)
    if original.get('qualityRecipe') not in _bases():return result
    review={'policy':SPAN_POLICY,'sourceAudioSha256':original['sourceAudioSha256'],'sampleCount':len(pcm),'speechSegments':speech}
    review['id']=digest(review);result.update(speechSpanReview=review,speechSpanBaseRecipe=original['qualityRecipe'])
    if not _valid_review(result):return copy.deepcopy(original)
    cues={c['verse']:c for c in result['cues']};repaired=[]
    for index,c in enumerate(result['checks']):
        if c.get('boundaryVerified'):continue
        try:
            proof=_expected(result,index);p=SPAN_POLICY
            proof['referenceRms']=[rms(pcm,*r) for r in proof['referenceRanges']]
            proof['quietRms']=[[rms(pcm,k,k+p['frameSamples']) for k in range(a,b,p['frameSamples'])] for a,b in proof['quietWindows']]
            proof['id']=digest(proof);c['speechSpanProof']=proof
            if not _valid_proof(result,index):c.pop('speechSpanProof');continue
            c['boundaryVerified']=True;cues[c['verse']]={'verse':c['verse'],'text':c['text'],'start':proof['range'][0],'end':proof['range'][1]};repaired.append(c['verse'])
        except (KeyError,TypeError,ValueError,IndexError,StopIteration):continue
    result['cues']=[cues[n] for n in sorted(cues)]
    result['issues']=[f'unreliable-verse-boundary:{c["verse"]}' for c in result['checks'] if not c.get('boundaryVerified')]
    result['issues'].extend(boundary_gap_issues(result['unclaimedSpeech'],result['cues']))
    result.update(qualityRecipe=SPEECH_SPAN_RECIPE,accepted=bool(repaired) and not result['issues'])
    if not verified_span_artifact(result) or not span_measurements_match(result,pcm):return copy.deepcopy(original)
    result['fingerprint']=site_fingerprint(result['sourceAudioSha256'],result['textSha256'],'en',SPEECH_SPAN_RECIPE,result.get('recognizer',BOUNDARY_RECOGNIZER))
    return result
