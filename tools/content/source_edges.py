"""Preserve actual source speech beyond already verified model word padding."""
import copy
import math
from boundary_quality import finite
from timed_text import normalized
from quiet_gaps import GAP_POLICY,digest,rms

SOURCE_EDGE_POLICY={'version':'verified-case-original-voice-padding-v1','sampleRate':16000,
 'maximumVadExtension':.6,'frameSamples':320,'frames':4,'gapMarginSeconds':.02,
 'maximumRms':.03,'relativeRms':.25,'backgroundMaximumRms':.1,'backgroundRelativeRms':.5,
 'vadPolicy':GAP_POLICY,'scope':'outward-only-complete-case-with-adjacent-real-verse-speech',
 'selection':'last-head-first-tail-confirmed-source-gap-v1',
 'localMinimumEdgeScore':.6,'localMinimumMeanScore':.75,'localMinimumProbability':.7,
 'localMaximumClockDifference':.3,'localMarginSeconds':.15,'localMaximumRms':.05,'localRelativeRms':.5,
 'localContextWords':3,'localMaximumContextDelay':4.0,'localHeadScope':'low-probability-head-with-stable-following-phrase-and-short-padding-v1','localContextScore':.65,'localVolumeReference':'complete-adjacent-source-search-windows-v1'}


def _words(c):return [w for w in c['alignedWords'] if normalized(w.get('word',''))]


def _base(a):
    from alignment_contract import CASE_REVIEW_RECIPE,BOUNDARY_RECOGNIZER,site_fingerprint
    r=a['sourceEdgeReview']
    if r['baseRecipe']!=CASE_REVIEW_RECIPE or a.get('missingVerses') or a.get('confirmedCoverage') is not None:raise ValueError('Need complete case coverage')
    expected=site_fingerprint(a['sourceAudioSha256'],a['textSha256'],a['key'].split(':')[-1],CASE_REVIEW_RECIPE,BOUNDARY_RECOGNIZER)
    if r['baseFingerprint']!=expected:raise ValueError('Wrong base identity')
    b={k:v for k,v in a.items() if k!='sourceEdgeReview'}
    b.update(qualityRecipe=CASE_REVIEW_RECIPE,fingerprint=expected,cues=copy.deepcopy(r['originalCues']))
    return b


def _expected(base,speech,verse,side):
    p=SOURCE_EDGE_POLICY;sr=p['sampleRate'];checks=base['checks'];i=next(i for i,c in enumerate(checks) if c['verse']==verse)
    step=-1 if side=='head' else 1
    terminal=side=='tail' and i==len(checks)-1
    if side not in ['head','tail'] or (not terminal and not 0<=i+step<len(checks)):raise ValueError('Need a real neighboring verse')
    c,n=checks[i],checks[i] if terminal else checks[i+step];words,nw=_words(c),_words(n)
    if not words or not nw:raise ValueError('No complete model words')
    edge=words[0 if side=='head' else -1];neighbor=edge if terminal else nw[-1 if side=='head' else 0]
    def interval(word):
        center=(word['start']+word['end'])*sr/2
        return next(j for j,(x,y) in enumerate(speech) if x<=center<y)
    current=interval(edge);other=len(speech) if terminal else interval(neighbor)
    if (terminal and current!=len(speech)-1) or (not terminal and other!=current+step):raise ValueError('Speech is continuous or intervening speech has unknown ownership')
    cues={c['verse']:c for c in base['cues']};cue=cues[verse];neighbor_cue=cues[n['verse']]
    onset,offset=[x/sr for x in speech[current]]
    if side=='head':
        if not onset<cue['start'] or not 0<=edge['start']-onset<=p['maximumVadExtension']:raise ValueError('No truncated source head near this model word')
        if abs(speech[other][1]/sr-neighbor['end'])>p['maximumVadExtension']:raise ValueError('Neighbor voice is not its model edge')
        low,high=speech[other][1]/sr+p['gapMarginSeconds'],onset-p['gapMarginSeconds']
        cut_low,cut_high=neighbor_cue['end'],cue['start']
    else:
        if not offset>cue['end'] or not 0<=offset-edge['end']<=p['maximumVadExtension']:raise ValueError('No truncated source tail near this model word')
        if not terminal and abs(speech[other][0]/sr-neighbor['start'])>p['maximumVadExtension']:raise ValueError('Neighbor voice is not its model edge')
        low,high=offset+p['gapMarginSeconds'],(base['duration'] if terminal else speech[other][0]/sr)-p['gapMarginSeconds']
        cut_low,cut_high=cue['end'],base['duration'] if terminal else neighbor_cue['start']
    frame=p['frameSamples'];length=frame*p['frames'];half=length//2
    first=max(math.ceil(low*sr/frame)*frame,math.ceil((cut_low*sr-half)/frame)*frame)
    last=min(math.floor(high*sr/frame)*frame-length,math.floor((cut_high*sr-half)/frame)*frame)
    if first>last:raise ValueError('No source gap preserving both complete spoken edges')
    return {'kind':'source-vad-gap','verse':verse,'side':side,'neighborVerse':None if terminal else n['verse'],'sourceAudioSha256':base['sourceAudioSha256'],
        'speechSha256':digest(speech),'speechIndexes':[current,other],'baseRange':[cue['start'],cue['end']],
        'firstSample':first,'lastSample':last,'referenceRanges':[[round(w['start']*sr),round(w['end']*sr)] for w in [edge,neighbor]]}


def _expected_local(base,speech,verse,side):
    from speech_context import _context_score
    p=SOURCE_EDGE_POLICY;sr=p['sampleRate'];checks=base['checks'];i=next(i for i,c in enumerate(checks) if c['verse']==verse)
    if side not in ['head','tail'] or (side=='head' and i==0) or (side=='tail' and i+1>=len(checks)):raise ValueError('Local pause needs the real neighboring verse')
    c,n=checks[i-1:i+1] if side=='head' else checks[i:i+2];last,first=_words(c)[-1],_words(n)[0]
    raw=[w for seg in base['recognition'] for w in seg.get('words',[])];tail,head=c['asrEdgeAnchors'][-1],n['asrEdgeAnchors'][0]
    context=[];head_strong=finite(head.get('probability')) and p['localMinimumProbability']<=head['probability']<=1
    if not head_strong:
        index=raw.index(head);source_words=_words(n)
        for offset in range(1,len(source_words)-p['localContextWords']+1):
            part=source_words[offset:offset+p['localContextWords']];clocks=raw[index+offset:index+offset+p['localContextWords']]
            if (len(part)!=p['localContextWords'] or len(clocks)!=len(part)
                or not 0<=part[0]['start']-first['start']<=p['localMaximumContextDelay']):continue
            if all(normalized(w['word'])==normalized(t['word']) and _context_score(w)>=p['localContextScore']
                and all(finite(t.get(k)) for k in ['start','end','probability'])
                and p['localMinimumProbability']<=t['probability']<=1 and 0<=t['start']<t['end']<=base['duration']
                and max(abs(w[k]-t[k]) for k in ['start','end'])<=p['localMaximumClockDifference'] for w,t in zip(part,clocks)):
                context=clocks;break
    if (min(_context_score(last),_context_score(first))<p['localMinimumEdgeScore']
        or sum(w['score'] for w in _words(c))/len(_words(c))<p['localMinimumMeanScore']
        or tail not in raw or head not in raw
        or normalized(tail['word'])!=normalized(last['word']) or normalized(head['word'])!=normalized(first['word'])
        or any(not all(finite(w.get(k)) for k in ['start','end','probability']) or not 0<=w['start']<w['end']<=base['duration']
               or not 0<=w['probability']<=1 for w in [tail,head])
        or tail['probability']<p['localMinimumProbability'] or (not head_strong and not context)
        or abs(tail['end']-last['end'])>p['localMaximumClockDifference']
        or abs(head['end']-first['end'])>p['localMaximumClockDifference']):raise ValueError('No independent complete neighboring word clocks')
    cues={c['verse']:c for c in base['cues']};cue=cues[verse]
    if side=='head' and (head_strong or not 0<=first['start']-cue['start']<=.1):raise ValueError('Head is already independently protected')
    low=max(last['end'],tail['end'])+p['localMarginSeconds']
    protected_head=min(first['start'],head['start']) if head_strong else first['start']
    high=min(protected_head-p['localMarginSeconds'],cues[n['verse']]['start'])
    # The new tail never reaches the independently protected following word.
    low=max(low,cues[c['verse']]['end']);high=min(high,last['end']+p['maximumVadExtension'])
    if side=='head':high=min(high,cue['start'])
    frame=p['frameSamples'];length=frame*p['frames'];begin=math.ceil(low*sr/frame)*frame;final=math.floor(high*sr/frame)*frame-length
    if begin>final:raise ValueError('No bounded local pause between complete neighboring words')
    return {'kind':'independent-word-local-pause','verse':verse,'side':side,'neighborVerse':c['verse'] if side=='head' else n['verse'],
        'sourceAudioSha256':base['sourceAudioSha256'],'speechSha256':digest(speech),'baseRange':[cue['start'],cue['end']],
        'firstSample':begin,'lastSample':final,'tailClock':tail,'nextHeadClock':head,'nextContextClocks':context,
        'referenceRanges':[[round(x['searchRange'][0]*sr),round(x['searchRange'][1]*sr)] for x in [c,n]]}


def measure_source_edge(base,speech,verse,side,pcm,allow_local=True):
    p=SOURCE_EDGE_POLICY;frame=p['frameSamples'];length=frame*p['frames']
    for expectation in ([_expected,_expected_local] if allow_local else [_expected]):
        try:e=expectation(base,speech,verse,side)
        except (KeyError,TypeError,ValueError,IndexError,StopIteration):continue
        refs=[rms(pcm,*x) for x in e['referenceRanges']]
        if any(not finite(v) or not 0<v<=1 for v in refs):continue
        quiet=min(p['maximumRms'],min(refs)*p['relativeRms']);background=min(p['backgroundMaximumRms'],min(refs)*p['backgroundRelativeRms'])
        local=e['kind']=='independent-word-local-pause';local_limit=min(p['localMaximumRms'],min(refs)*p['localRelativeRms'])
        starts=range(e['firstSample'],e['lastSample']+1,frame)
        if side=='head':starts=reversed(starts)
        for start in starts:
            values=[rms(pcm,start+j*frame,start+(j+1)*frame) for j in range(p['frames'])]
            if local:
                if max(values)>local_limit:continue
                basis='independent-word-local-background'
            else:
                if any(max(start,x)<min(start+length,y) for x,y in speech):continue
                basis='quiet' if max(values)<=quiet else 'voice-free-background'
                if max(values)>(quiet if basis=='quiet' else background):continue
            proof={**e,'startSample':start,'cut':(start+length//2)/p['sampleRate'],'referenceRms':refs,'quietRms':values,'acousticBasis':basis}
            proof['id']=digest(proof);return proof
    raise ValueError('No confirmed original PCM gap')


def _valid_proof(base,speech,proof):
    expectation=_expected_local if proof.get('kind')=='independent-word-local-pause' else _expected
    e=expectation(base,speech,proof['verse'],proof['side']);p=SOURCE_EDGE_POLICY
    if any(proof.get(k)!=v for k,v in e.items()):return False
    start=proof['startSample'];refs=proof['referenceRms'];values=proof['quietRms'];length=p['frameSamples']*p['frames']
    if (type(start) is not int or not e['firstSample']<=start<=e['lastSample'] or start%p['frameSamples']
        or proof['cut']!=(start+length//2)/p['sampleRate'] or len(refs)!=2
        or any(not finite(v) or not 0<v<=1 for v in refs)
        or (proof['kind']=='source-vad-gap' and any(max(start,x)<min(start+length,y) for x,y in speech))):return False
    if proof['kind']=='independent-word-local-pause':
        if proof['acousticBasis']!='independent-word-local-background':return False
        limit=min(p['localMaximumRms'],min(refs)*p['localRelativeRms'])
    elif proof['acousticBasis']=='quiet':limit=min(p['maximumRms'],min(refs)*p['relativeRms'])
    elif proof['acousticBasis']=='voice-free-background':limit=min(p['backgroundMaximumRms'],min(refs)*p['backgroundRelativeRms'])
    else:return False
    return len(values)==p['frames'] and all(finite(v) and 0<=v<=limit for v in values) and proof['id']==digest({k:v for k,v in proof.items() if k!='id'})


def verified_source_edge_artifact(a):
    try:
        from alignment_contract import SOURCE_EDGE_RECIPE
        from case_evidence import verified_case_artifact
        r=a['sourceEdgeReview'];base=_base(a);count=round(a['duration']*16000)
        if (a['qualityRecipe']!=SOURCE_EDGE_RECIPE or r['policy']!=SOURCE_EDGE_POLICY or r['sourceAudioSha256']!=a['sourceAudioSha256']
            or r['sampleCount']!=count or r['id']!=digest({k:v for k,v in r.items() if k!='id'})
            or not r['proofs'] or not verified_case_artifact(base)):return False
        previous=0
        for x,y in r['speechSegments']:
            if type(x) is not int or type(y) is not int or not previous<=x<y<=count:return False
            previous=y
        cues=copy.deepcopy(base['cues']);by_number={c['verse']:c for c in cues};seen=set()
        for proof in r['proofs']:
            signature=(proof['verse'],proof['side'])
            if signature in seen or not _valid_proof(base,r['speechSegments'],proof):return False
            seen.add(signature);by_number[proof['verse']]['start' if proof['side']=='head' else 'end']=proof['cut']
        return cues==a['cues'] and all(x['end']<=y['start'] for x,y in zip(cues,cues[1:]))
    except (KeyError,TypeError,ValueError,IndexError,StopIteration,ZeroDivisionError):return False


def source_edge_measurements_match(a,pcm):
    if not verified_source_edge_artifact(a) or len(pcm)!=a['sourceEdgeReview']['sampleCount']:return False
    r=a['sourceEdgeReview'];base=_base(a)
    def close(a,b,k=None):
        if isinstance(a,dict) and isinstance(b,dict):return a.keys()==b.keys() and all(close(a[x],b[x],x) for x in a if x!='id')
        if isinstance(a,list) and isinstance(b,list):return len(a)==len(b) and all(close(x,y,k) for x,y in zip(a,b))
        if k in ['referenceRms','quietRms'] and finite(a) and finite(b):return abs(a-b)<=1/32768
        return a==b
    try:return all(close(p,measure_source_edge(base,r['speechSegments'],p['verse'],p['side'],pcm)) for p in r['proofs'])
    except (KeyError,TypeError,ValueError,IndexError,StopIteration,ZeroDivisionError):return False


def verify_source_edge_media(a,path):
    from media_assets import file_matches
    from gap_review import decode_pcm
    from case_evidence import verify_case_media
    return verified_source_edge_artifact(a) and file_matches(path,a['sourceAudioSha256']) and verify_case_media(_base(a),path) and source_edge_measurements_match(a,decode_pcm(path))


def repair_source_edges(original,pcm,speech,*,local_head_verses=()):
    from alignment_contract import CASE_REVIEW_RECIPE,SOURCE_EDGE_RECIPE,site_fingerprint,BOUNDARY_RECOGNIZER
    from case_evidence import verified_case_artifact
    if (original.get('qualityRecipe')!=CASE_REVIEW_RECIPE or not verified_case_artifact(original)
        or len(pcm)!=round(original['duration']*16000)):return copy.deepcopy(original)
    a=copy.deepcopy(original);proofs=[];cues={c['verse']:c for c in a['cues']}
    for c in original['checks']:
        for side in ['head','tail']:
            try:p=measure_source_edge(original,speech,c['verse'],side,pcm,allow_local=side=='tail' or c['verse'] in local_head_verses)
            except (KeyError,TypeError,ValueError,IndexError,StopIteration,ZeroDivisionError):continue
            proofs.append(p);cues[c['verse']]['start' if side=='head' else 'end']=p['cut']
    if not proofs:return copy.deepcopy(original)
    r={'policy':SOURCE_EDGE_POLICY,'baseRecipe':CASE_REVIEW_RECIPE,'baseFingerprint':original['fingerprint'],
       'sourceAudioSha256':a['sourceAudioSha256'],'sampleCount':len(pcm),'speechSegments':speech,'proofs':proofs,'originalCues':original['cues']};r['id']=digest(r)
    a.update(sourceEdgeReview=r,qualityRecipe=SOURCE_EDGE_RECIPE)
    if not verified_source_edge_artifact(a) or not source_edge_measurements_match(a,pcm):return copy.deepcopy(original)
    a['fingerprint']=site_fingerprint(a['sourceAudioSha256'],a['textSha256'],a['key'].split(':')[-1],SOURCE_EDGE_RECIPE,a.get('recognizer',BOUNDARY_RECOGNIZER))
    return a
