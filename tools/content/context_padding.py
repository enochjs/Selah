"""Outward head padding supported by complete source voice and independent context."""
import copy,math
from boundary_quality import finite
from quiet_gaps import GAP_POLICY,digest,rms
from timed_text import normalized
from clock_edges import PHRASE_EDGE_POLICY,_diagnostic,_independent_head,_interior

CONTEXT_PADDING_POLICY={'version':'verified-head-full-source-context-padding-v1','sampleRate':16000,
 'frameSamples':320,'frames':2,'marginSeconds':.02,'maximumExtension':.6,'maximumRms':.1,'relativeRms':.5,
 'minimumEdgeScore':.65,'minimumMeanScore':.75,'vadPolicy':GAP_POLICY,
 'contextPolicy':{**PHRASE_EDGE_POLICY,'maximumRecognizerClockDifference':.35},
 'scope':'outward-head-only; unchanged-existing-verse-proof; no-joint-target',
 'coarseHeadStart':'word-end-and-later-phrase-corroboration; full-source-VAD-onset-protected',
 'volumeReference':'complete-adjacent-source-search-windows'}

COMPLETE_HEAD_PADDING_POLICY={**CONTEXT_PADDING_POLICY,
 'version':'verified-head-complete-independent-word-source-padding-v2','maximumExtension':.8,
 'contextPolicy':{**CONTEXT_PADDING_POLICY['contextPolicy'],'maximumCoarseHeadSeconds':.8,
                  'maximumContextOffset':12,'maximumContextDelay':6.},
 'sourceHead':'retain-every-source-voice-interval-overlapping-the-independent-head-through-the-model-head',
 'cutSelection':'last-voice-free-window-before-the-earliest-supported-source-interval'}


def _policy(a):
    policy=a['contextPaddingReview']['policy']
    if policy not in [CONTEXT_PADDING_POLICY,COMPLETE_HEAD_PADDING_POLICY]:raise ValueError('Unknown source head policy')
    return policy


def _base(a):
    from alignment_contract import BOUNDARY_REVIEW_RECIPE,CASE_REVIEW_RECIPE,SOURCE_EDGE_RECIPE,GAP_EDGE_RECIPE,BOUNDARY_RECOGNIZER,site_fingerprint
    r=a['contextPaddingReview'];recipe=r['baseRecipe']
    if recipe not in {BOUNDARY_REVIEW_RECIPE,CASE_REVIEW_RECIPE,SOURCE_EDGE_RECIPE,GAP_EDGE_RECIPE}:raise ValueError('Unsupported complete original verse proof')
    fp=site_fingerprint(a['sourceAudioSha256'],a['textSha256'],'en',recipe,BOUNDARY_RECOGNIZER)
    if r['baseFingerprint']!=fp:raise ValueError('Original source identity differs')
    b=copy.deepcopy({k:v for k,v in a.items() if k!='contextPaddingReview'});b.update(qualityRecipe=recipe,fingerprint=fp,cues=copy.deepcopy(r['originalCues']))
    return b


def _expected(a,verse):
    b=_base(a);r=a['contextPaddingReview'];p=_policy(a);sr=16000;checks=b['checks'];i=next(i for i,c in enumerate(checks) if c['verse']==verse)
    if not b['key'].endswith(':en') or i==0:raise ValueError('Need a real previous verse')
    c,previous=checks[i],checks[i-1];words=[w for w in c['alignedWords'] if normalized(w['word'])];pw=[w for w in previous['alignedWords'] if normalized(w['word'])];head=words[0];tail=pw[-1]
    if (c.get('jointProofId') or not c['boundaryVerified'] or not previous['boundaryVerified']
        or min(head['score'],tail['score'])<p['minimumEdgeScore'] or sum(w['score'] for w in words)/len(words)<p['minimumMeanScore']):raise ValueError('Head or neighboring complete verse is not reliable')
    independent=_diagnostic({**b,'clockEdgeReview':{'independentRecognition':r['independentRecognition']}})
    original=[w for seg in b['recognition'] for w in seg.get('words',[])];ctx=p['contextPolicy']
    support={'independentHead':_independent_head(independent,head,ctx),
       'originalContext':_interior(original,words,ctx['minimumOriginalContextProbability'],ctx),
       'independentContext':_interior(independent,words,ctx['minimumProbability'],ctx)}
    speech=r['speechSegments'];center=lambda w:(w['start']+w['end'])*sr/2
    first=next(j for j,(x,y) in enumerate(speech) if x<=center(head)<y);prior=next(j for j,(x,y) in enumerate(speech) if x<=center(tail)<y)
    if support['independentHead'][0]['end']<speech[first][0]/sr:raise ValueError('Independent first word ends before the actual source voice')
    if p==COMPLETE_HEAD_PADDING_POLICY:
        independent_start=support['independentHead'][0]['start']*sr
        first=next(j for j,(x,y) in enumerate(speech) if max(x,independent_start)<min(y,center(head)))
    if first!=prior+1:raise ValueError('Intervening source speech is not assigned to a real neighboring word')
    onset=speech[first][0]/sr;offset=speech[prior][1]/sr;cues={c['verse']:c for c in b['cues']};cue=cues[verse]
    if support['independentHead'][0]['end']<onset:raise ValueError('Independent first word ends before the actual source voice')
    if (not onset<cue['start'] or not 0<=head['start']-onset<=p['maximumExtension']
        or abs(offset-tail['end'])>p['maximumExtension'] or not 0<cue['start']-onset<=p['maximumExtension']):raise ValueError('No truncated original head near its actual word')
    low=max(offset+p['marginSeconds'],cues[previous['verse']]['end']);high=min(onset-p['marginSeconds'],cue['start'],head['start']-p['marginSeconds']);frame=p['frameSamples'];length=frame*p['frames'];first_sample=math.ceil(low*sr/frame)*frame;last_sample=math.floor((high*sr-length)/frame)*frame
    if first_sample>last_sample:raise ValueError('No protected source gap before the complete head')
    return {'verse':verse,'neighborVerse':previous['verse'],'baseRange':[cue['start'],cue['end']],'speechIndexes':[prior,first],
       'context':support,'firstSample':first_sample,'lastSample':last_sample,'referenceRanges':[[round(v*sr) for v in x['searchRange']] for x in [previous,c]]}


def _measure(a,verse,pcm):
    e=_expected(a,verse);p=_policy(a);frame=p['frameSamples'];length=frame*p['frames'];speech=a['contextPaddingReview']['speechSegments'];refs=[rms(pcm,*x) for x in e['referenceRanges']]
    if any(not finite(v) or not 0<v<=1 for v in refs):raise ValueError('Invalid original volume reference')
    limit=min(p['maximumRms'],min(refs)*p['relativeRms'])
    starts=range(e['firstSample'],e['lastSample']+1,frame)
    if p==COMPLETE_HEAD_PADDING_POLICY:starts=reversed(starts)
    for start in starts:
        if any(max(start,x)<min(start+length,y) for x,y in speech):continue
        values=[rms(pcm,start+j*frame,start+(j+1)*frame) for j in range(p['frames'])]
        if max(values)>limit:continue
        proof={**e,'window':[start,start+length],'cut':(start+length//2)/16000,'referenceRms':refs,'frameRms':values};proof['id']=digest(proof);return proof
    raise ValueError('No measured voice-free original background window')


def verified_context_padding_artifact(a):
    try:
        from alignment_contract import CONTEXT_PADDING_RECIPE,COMPLETE_HEAD_PADDING_RECIPE
        from boundary_quality import verified_boundary_artifact
        r=a['contextPaddingReview'];b=_base(a);p=_policy(a);count=round(a['duration']*16000)
        recipe=COMPLETE_HEAD_PADDING_RECIPE if p==COMPLETE_HEAD_PADDING_POLICY else CONTEXT_PADDING_RECIPE
        if (a['qualityRecipe']!=recipe or r['policy']!=p or r['sourceAudioSha256']!=a['sourceAudioSha256']
            or r['sampleCount']!=count or r['id']!=digest({k:v for k,v in r.items() if k!='id'}) or not verified_boundary_artifact(b)):return False
        previous=0
        for x,y in r['speechSegments']:
            if type(x) is not int or type(y) is not int or not previous<=x<y<=count:return False
            previous=y
        if b.get('sourceGapReview') is not None and b['sourceGapReview']['speechSegments']!=r['speechSegments']:return False
        if b.get('sourceEdgeReview') is not None and b['sourceEdgeReview']['speechSegments']!=r['speechSegments']:return False
        cues=copy.deepcopy(b['cues']);seen=set()
        if not r['proofs']:return False
        for proof in r['proofs']:
            if proof['verse'] in seen:return False
            seen.add(proof['verse']);e=_expected(a,proof['verse']);start,end=proof['window'];refs=proof['referenceRms'];values=proof['frameRms']
            if (any(proof.get(k)!=v for k,v in e.items()) or type(start) is not int or end!=start+p['frameSamples']*p['frames']
                or not e['firstSample']<=start<=e['lastSample'] or start%p['frameSamples']
                or proof['cut']!=(start+end)/32000 or len(refs)!=2 or any(not finite(v) or not 0<v<=1 for v in refs)
                or len(values)!=p['frames'] or any(not finite(v) or not 0<=v<=min(p['maximumRms'],min(refs)*p['relativeRms']) for v in values)
                or any(max(start,x)<min(end,y) for x,y in r['speechSegments'])
                or proof['id']!=digest({k:v for k,v in proof.items() if k!='id'})):return False
            next(c for c in cues if c['verse']==proof['verse'])['start']=proof['cut']
        return cues==a['cues'] and all(x['end']<=y['start'] for x,y in zip(cues,cues[1:]))
    except (KeyError,TypeError,ValueError,IndexError,StopIteration,ZeroDivisionError):return False


def context_padding_measurements_match(a,pcm):
    if not verified_context_padding_artifact(a) or len(pcm)!=a['contextPaddingReview']['sampleCount']:return False
    try:
        for proof in a['contextPaddingReview']['proofs']:
            measured=_measure(a,proof['verse'],pcm)
            if {k:v for k,v in proof.items() if k not in ['id','referenceRms','frameRms']}!={k:v for k,v in measured.items() if k not in ['id','referenceRms','frameRms']}:return False
            if any(abs(x-y)>1/32768 for key in ['referenceRms','frameRms'] for x,y in zip(proof[key],measured[key])):return False
        return True
    except (KeyError,TypeError,ValueError,IndexError,StopIteration,ZeroDivisionError):return False


def verify_context_padding_media(a,path):
    from alignment_contract import CASE_REVIEW_RECIPE,SOURCE_EDGE_RECIPE,GAP_EDGE_RECIPE
    from case_evidence import verify_case_media
    from source_edges import verify_source_edge_media
    from gap_edges import verify_gap_edge_media
    from gap_review import decode_pcm
    from media_assets import file_matches
    if not verified_context_padding_artifact(a) or not file_matches(path,a['sourceAudioSha256']):return False
    b=_base(a);verifiers={CASE_REVIEW_RECIPE:verify_case_media,SOURCE_EDGE_RECIPE:verify_source_edge_media,GAP_EDGE_RECIPE:verify_gap_edge_media}
    return (b['qualityRecipe'] not in verifiers or verifiers[b['qualityRecipe']](b,path)) and context_padding_measurements_match(a,decode_pcm(path))


def repair_context_padding(original,pcm,speech,independent,verses,*,policy=CONTEXT_PADDING_POLICY):
    from alignment_contract import CONTEXT_PADDING_RECIPE,COMPLETE_HEAD_PADDING_RECIPE,BOUNDARY_RECOGNIZER,site_fingerprint
    if policy not in [CONTEXT_PADDING_POLICY,COMPLETE_HEAD_PADDING_POLICY]:return copy.deepcopy(original)
    recipe=COMPLETE_HEAD_PADDING_RECIPE if policy==COMPLETE_HEAD_PADDING_POLICY else CONTEXT_PADDING_RECIPE
    a=copy.deepcopy(original);r={'policy':copy.deepcopy(policy),'sourceAudioSha256':a['sourceAudioSha256'],'sampleCount':len(pcm),
      'baseRecipe':a['qualityRecipe'],'baseFingerprint':a['fingerprint'],'originalCues':copy.deepcopy(a['cues']),
      'speechSegments':copy.deepcopy(speech),'independentRecognition':copy.deepcopy(independent),'proofs':[]};a['contextPaddingReview']=r
    try:
        from boundary_quality import verified_boundary_artifact
        if not verified_boundary_artifact(original):return copy.deepcopy(original)
        r['proofs']=[_measure(a,v,pcm) for v in verses]
        for p in r['proofs']:next(c for c in a['cues'] if c['verse']==p['verse'])['start']=p['cut']
        r['id']=digest(r);a.update(qualityRecipe=recipe,fingerprint=site_fingerprint(a['sourceAudioSha256'],a['textSha256'],'en',recipe,BOUNDARY_RECOGNIZER))
        return a if context_padding_measurements_match(a,pcm) else copy.deepcopy(original)
    except (KeyError,TypeError,ValueError,IndexError,StopIteration,ZeroDivisionError):return copy.deepcopy(original)


def repair_complete_head_padding(original,pcm,speech,independent,verses):
    return repair_context_padding(original,pcm,speech,independent,verses,policy=COMPLETE_HEAD_PADDING_POLICY)
