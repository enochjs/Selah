"""Complete verse intervals supported by interior phrase clocks and original speech gaps."""
import copy
import math
import re
from boundary_quality import POLICY,finite,verse_boundary,boundary_gap_issues
from quiet_gaps import GAP_POLICY,digest,rms,measure_gaps,verified_quiet_gaps,measurements_match
from timed_text import normalized
from spoken_text import boundary_text

CONTEXT_GAP_POLICY={**GAP_POLICY,'maximumRms':.03,'relativeRms':.25,
 'proofSchema':'source-cues-gaps-joint-pcm-context-background-v1'}
CONTEXT_POLICY={'version':'context-complete-speech-intervals-v1','sampleRate':16000,'minimumMeanScore':.75,
 'minimumContextScore':.65,'minimumContextProbability':.7,'contextWords':3,'maximumContextOffset':3,
 'maximumClockDifference':.2,'maximumVadExtension':.6,'frameSamples':320,'frames':2,
 'gapMarginSeconds':.02,'maximumRms':.03,'relativeRms':.25,'vadPolicy':GAP_POLICY,
 'gapPolicy':CONTEXT_GAP_POLICY,'numericScores':'actual-spoken-endpoints-and-all-interior-number-words-v1'}


def _words(c):return [w for w in c['alignedWords'] if normalized(w.get('word',''))]


def _edge_score(word,first):
    score=word['score'];expanded=word.get('numericExpansion',{}).get('words')
    return min(score,expanded[0 if first else -1]['score']) if expanded else score


def _context_score(word):
    return min([word['score']]+[w['score'] for w in word.get('numericExpansion',{}).get('words',[])])


def _base(a):
    from alignment_contract import BOUNDARY_REVIEW_RECIPE,BOUNDARY_CONTEXT_RECIPE,PADDING_REVIEW_RECIPE,GAP_REVIEW_RECIPE,NUMERIC_REVIEW_RECIPE
    allowed={BOUNDARY_REVIEW_RECIPE,BOUNDARY_CONTEXT_RECIPE,PADDING_REVIEW_RECIPE,GAP_REVIEW_RECIPE}
    b=a['qualityRecipe'];trial=copy.deepcopy(a)
    if b==NUMERIC_REVIEW_RECIPE:
        from numeric_alignment import NUMERIC_POLICY,numeric_words_verified
        if a.get('numericAlignmentPolicy')!=NUMERIC_POLICY or not a['key'].endswith(':en'):raise ValueError('Unproven numeric policy')
        for c in a['checks']:
            if not numeric_words_verified(c['alignedWords'],boundary_text(c['text'],'en')):raise ValueError('Unproven spoken numeral')
        b=a['numericBaseRecipe'];trial.pop('numericAlignmentPolicy');trial.pop('numericBaseRecipe')
    elif any(re.search(r'\d',v['text']) for v in a['boundarySourceVerses']):raise ValueError('Numeric source requires verified number reading')
    if b not in allowed or any(k in a for k in ['spokenProjection','confirmedCoverage','caseReviewPolicy','speechSpanReview']):raise ValueError('Unsupported source coverage or recipe')
    trial['qualityRecipe']=b
    return trial


def _phrase(a,words,head):
    p=CONTEXT_POLICY;n=p['contextWords'];raw=[w for s in a['recognition'] for w in s.get('words',[]) if normalized(w.get('word',''))]
    for offset in range(p['maximumContextOffset']+1):
        start=offset if head else len(words)-n-offset
        if start<0:continue
        part=words[start:start+n]
        if len(part)!=n or any(_context_score(w)<p['minimumContextScore'] for w in part):continue
        for i in range(len(raw)-n+1):
            group=raw[i:i+n]
            if all(normalized(w['word'])==normalized(r['word']) and all(finite(r.get(k)) for k in ['start','end','probability'])
                and 0<=r['start']<r['end']<=a['duration'] and p['minimumContextProbability']<=r['probability']<=1
                and max(abs(w[k]-r[k]) for k in ['start','end'])<=p['maximumClockDifference'] for w,r in zip(part,group)):
                return {'offset':start,'words':group}
    raise ValueError('No stable independent interior phrase')


def _review_valid(a):
    r=a['speechContextReview'];count=round(a['duration']*16000)
    if r['policy']!=CONTEXT_POLICY or r['sourceAudioSha256']!=a['sourceAudioSha256'] or r['sampleCount']!=count or r['id']!=digest({k:v for k,v in r.items() if k!='id'}):return False
    previous=0
    for x,y in r['speechSegments']:
        if type(x) is not int or type(y) is not int or not previous<=x<y<=count:return False
        previous=y
    return True


def _cut(low,high,protected,head):
    p=CONTEXT_POLICY;half=p['frameSamples']*p['frames']//2;sr=16000
    lower=low+p['gapMarginSeconds']+half/sr;upper=high-p['gapMarginSeconds']-half/sr
    if head:upper=min(upper,protected-p['gapMarginSeconds'])
    else:lower=max(lower,protected+p['gapMarginSeconds'])
    first=math.ceil(lower*1000-1e-9);last=math.floor(upper*1000+1e-9)
    if first>last:raise ValueError('No protected speech-free boundary interval')
    target=round((low+high)*500);cut=min(last,max(first,target))/1000
    start=round(cut*sr)-half
    return cut,[start,start+p['frameSamples']*p['frames']]


def _expected(a,index):
    p=CONTEXT_POLICY;checks=a['checks'];c=checks[index];words=_words(c);locale=a['key'].split(':')[-1]
    if locale!='en' or not 0<index<len(checks)-1 or c.get('jointProofId'):raise ValueError('Need independent verse and both real neighbors')
    left,right=checks[index-1],checks[index+1]
    if not left.get('boundaryVerified') or not right.get('boundaryVerified') or min(_edge_score(_words(left)[-1],False),_edge_score(_words(right)[0],True))<p['minimumContextScore']:raise ValueError('Neighbor edge is not reliable')
    source=next(v for v in a['boundarySourceVerses'] if v['number']==c['verse'])
    _,e=verse_boundary(c['alignedWords'],c['searchRange'],a['duration'],locale,reference=boundary_text(source['text'],locale),signal=c.get('boundarySignal'),anchors=c.get('asrEdgeAnchors'))
    if e['reasons']!=['weak-edge-word'] or e['meanAlignmentScore']<p['minimumMeanScore']:raise ValueError('Other verse location failures remain')
    phrases={'head':_phrase(a,words,True),'tail':_phrase(a,words,False)}
    speech=a['speechContextReview']['speechSegments'];centers=[(words[i]['start']+words[i]['end'])*8000 for i in [0,-1]]
    first=next(i for i,(x,y) in enumerate(speech) if x<=centers[0]<y);final=next(i for i,(x,y) in enumerate(speech) if x<=centers[1]<y)
    if not 0<first<=final<len(speech)-1:raise ValueError('No neighboring speech')
    prev,start=speech[first-1][1]/16000,speech[first][0]/16000;end,next_start=speech[final][1]/16000,speech[final+1][0]/16000
    if (abs(start-words[0]['start'])>p['maximumVadExtension'] or not 0<=end-words[-1]['end']<=p['maximumVadExtension']
        or abs(prev-_words(left)[-1]['end'])>p['maximumVadExtension'] or abs(next_start-_words(right)[0]['start'])>p['maximumClockDifference']):raise ValueError('Speech crosses a verse boundary')
    for phrase in phrases.values():
        if not start-p['maximumClockDifference']<=phrase['words'][0]['start']<phrase['words'][-1]['end']<=end+p['maximumClockDifference']:raise ValueError('Phrase is outside complete speech interval')
    anchors=c.get('asrEdgeAnchors',[])
    protected_start=min([words[0]['start']]+[w['start'] for w in anchors[:1] if w.get('probability',0)>=.7])
    protected_end=max([words[-1]['end']]+[w['end'] for w in anchors[1:] if w.get('probability',0)>=.7])
    h,hw=_cut(prev,start,protected_start,True);t,tw=_cut(end,next_start,protected_end,False);cues={c['verse']:c for c in a['cues']}
    if not cues[left['verse']]['end']<=h<protected_start<protected_end<t<=cues[right['verse']]['start']:raise ValueError('Clip overlaps neighbor or truncates protected word')
    return {'verse':c['verse'],'sourceAudioSha256':a['sourceAudioSha256'],'reviewId':a['speechContextReview']['id'],'neighbors':[left['verse'],right['verse']],
       'phrases':phrases,'speechIndexes':[first,final],'range':[h,t],'quietWindows':[hw,tw],
       'referenceRanges':[[round(x['searchRange'][0]*16000),round(x['searchRange'][1]*16000)] for x in [left,c,right]]}


def _proof_valid(a,i):
    proof=a['checks'][i]['speechContextProof'];e=_expected(a,i);p=CONTEXT_POLICY
    if any(proof.get(k)!=v for k,v in e.items()) or proof['id']!=digest({k:v for k,v in proof.items() if k!='id'}):return False
    refs=proof['referenceRms'];values=proof['quietRms']
    if len(refs)!=3 or any(not finite(v) or not 0<v<=1 for v in refs):return False
    limit=min(p['maximumRms'],min(refs)*p['relativeRms'])
    return len(values)==2 and all(len(v)==p['frames'] and all(finite(x) and 0<=x<=limit for x in v) for v in values)


def _trial(a):
    original={k:v for k,v in a.items() if k not in ['speechContextReview','speechContextBaseRecipe','speechContextGapReview']};original['qualityRecipe']=a['speechContextBaseRecipe']
    trial=_base(original);ranges={}
    for i,c in enumerate(a['checks']):
        if 'speechContextProof' not in c:continue
        if not _proof_valid(a,i):raise ValueError('Invalid complete interval proof')
        ranges[c['verse']]=c['speechContextProof']['range']
    gaps=boundary_gap_issues(a['unclaimedSpeech'],a['cues']);proof=a.get('speechContextGapReview')
    if gaps:
        if (proof is None or proof['speechSegments']!=a['speechContextReview']['speechSegments']
                or not verified_quiet_gaps({**a,'acousticGapReview':proof},CONTEXT_GAP_POLICY)):
            raise ValueError('Gap contains unassigned speech or has a different source VAD clock')
        trial['unclaimedSpeech']=[]
    elif proof is not None:raise ValueError('Unnecessary gap override')
    if not ranges and proof is None:raise ValueError('No additional interval evidence')
    trial.pop('acousticGapReview',None)
    from alignment_contract import GAP_REVIEW_RECIPE,PADDING_REVIEW_RECIPE
    if trial['qualityRecipe']==GAP_REVIEW_RECIPE:trial['qualityRecipe']=PADDING_REVIEW_RECIPE
    return trial,ranges


def verified_context_artifact(a):
    try:
        from alignment_contract import SPEECH_CONTEXT_RECIPE
        from boundary_quality import verified_boundary_artifact
        if a['qualityRecipe']!=SPEECH_CONTEXT_RECIPE or not _review_valid(a):return False
        trial,ranges=_trial(a)
        return verified_boundary_artifact(trial,boundary_ranges=ranges)
    except (KeyError,TypeError,ValueError,IndexError,StopIteration,ZeroDivisionError):return False


def context_measurements_match(a,pcm):
    try:
        if not verified_context_artifact(a) or len(pcm)!=a['speechContextReview']['sampleCount']:return False
        p=CONTEXT_POLICY
        for c in a['checks']:
            proof=c.get('speechContextProof')
            if not proof:continue
            refs=[rms(pcm,*r) for r in proof['referenceRanges']];limit=min(p['maximumRms'],min(refs)*p['relativeRms'])
            if any(abs(x-y)>1/32768 for x,y in zip(refs,proof['referenceRms'])):return False
            for (x,y),saved in zip(proof['quietWindows'],proof['quietRms']):
                values=[rms(pcm,k,k+p['frameSamples']) for k in range(x,y,p['frameSamples'])]
                if any(v>limit or abs(v-s)>1/32768 for v,s in zip(values,saved)):return False
        gap=a.get('speechContextGapReview')
        return gap is None or measurements_match({**a,'acousticGapReview':gap},pcm,CONTEXT_GAP_POLICY)
    except (KeyError,TypeError,ValueError,IndexError,ZeroDivisionError):return False


def verify_context_media(a,path):
    from gap_review import decode_pcm
    from media_assets import file_matches
    return verified_context_artifact(a) and file_matches(path,a['sourceAudioSha256']) and context_measurements_match(a,decode_pcm(path))


def repair_context(original,pcm,speech):
    from alignment_contract import SPEECH_CONTEXT_RECIPE,site_fingerprint,BOUNDARY_RECOGNIZER
    result=copy.deepcopy(original)
    try:_base(result)
    except (KeyError,ValueError,TypeError):return result
    r={'policy':CONTEXT_POLICY,'sourceAudioSha256':result['sourceAudioSha256'],'sampleCount':len(pcm),'speechSegments':speech};r['id']=digest(r)
    result.update(speechContextReview=r,speechContextBaseRecipe=original['qualityRecipe'])
    if not _review_valid(result):return copy.deepcopy(original)
    cues={c['verse']:c for c in result['cues']}
    for i,c in enumerate(result['checks']):
        if c.get('boundaryVerified'):continue
        try:
            proof=_expected(result,i);p=CONTEXT_POLICY;proof['referenceRms']=[rms(pcm,*r) for r in proof['referenceRanges']]
            proof['quietRms']=[[rms(pcm,k,k+p['frameSamples']) for k in range(x,y,p['frameSamples'])] for x,y in proof['quietWindows']];proof['id']=digest(proof);c['speechContextProof']=proof
            if not _proof_valid(result,i):c.pop('speechContextProof');continue
            c['boundaryVerified']=True;cues[c['verse']]={'verse':c['verse'],'text':c['text'],'start':proof['range'][0],'end':proof['range'][1]}
        except (KeyError,TypeError,ValueError,IndexError,StopIteration):continue
    result['cues']=[cues[n] for n in sorted(cues)]
    result['issues']=[f'unreliable-verse-boundary:{c["verse"]}' for c in result['checks'] if not c.get('boundaryVerified')]
    gaps=boundary_gap_issues(result['unclaimedSpeech'],result['cues'])
    if gaps:
        result['speechContextGapReview']=measure_gaps(result,pcm,speech,CONTEXT_GAP_POLICY)
        if not verified_quiet_gaps({**result,'acousticGapReview':result['speechContextGapReview']},CONTEXT_GAP_POLICY):result['issues'].extend(gaps)
    result.update(qualityRecipe=SPEECH_CONTEXT_RECIPE,accepted=not result['issues'])
    if not verified_context_artifact(result) or not context_measurements_match(result,pcm):return copy.deepcopy(original)
    result['fingerprint']=site_fingerprint(result['sourceAudioSha256'],result['textSha256'],result['key'].split(':')[-1],SPEECH_CONTEXT_RECIPE,result.get('recognizer',BOUNDARY_RECOGNIZER))
    return result
