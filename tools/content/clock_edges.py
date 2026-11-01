"""Weak acoustic heads supported by two recognizers and original voice-free cuts.

Background sound is retained. RMS is remeasured for provenance, never used as
proof that a loud interval contains no speech; both source VAD and independently
located neighboring words must leave the complete cut window unoccupied.
"""
import copy,math,re
from boundary_quality import finite,verse_boundary
from quiet_gaps import digest,rms,GAP_POLICY
from timed_text import normalized
from source_edges import SOURCE_EDGE_POLICY,measure_source_edge,_valid_proof

CLOCK_EDGE_POLICY={'version':'dual-recognizer-short-head-source-gaps-v1','sampleRate':16000,
 'minimumMeanScore':.8,'minimumContextScore':.65,'minimumProbability':.9,'contextWords':4,
 'maximumClockDifference':.2,'maximumRecognizerClockDifference':.3,'maximumModelHeadSeconds':.35,'maximumCoarseHeadSeconds':.6,
 'maximumVadExtension':.6,'frameSamples':320,'frames':2,'marginSeconds':.02,
 'headClock':'first-word-end-and-following-phrase; coarse-start-may-include-background',
 'headCut':'last-voice-free-window-before-original-word-start-and-source-onset',
 'previousTail':'share-the-same-verified-head-cut-to-preserve-previous-source-voice',
 'jointProofs':'preserve-validated-groups-without-target-or-padding-overrides',
 'background':'full-original-vad-clear-cut-and-two-recognizers; pcm-remeasurement-required',
 'vadPolicy':GAP_POLICY,'paddingPolicy':SOURCE_EDGE_POLICY}

PHRASE_EDGE_POLICY={**CLOCK_EDGE_POLICY,'version':'independent-head-and-dual-interior-phrase-source-gaps-v1',
 'headClock':'high-confidence-independent-first-word-and-both-original-and-independent-interior-phrases',
 'contextWords':3,'maximumContextOffset':6,'maximumContextDelay':4.,'minimumOriginalContextProbability':.7,
 'headCut':'last-voice-free-window-before-independent-word-start-and-source-onset'}


def _words(c):return [w for w in c['alignedWords'] if normalized(w.get('word',''))]


def _base(a):
    from alignment_contract import BOUNDARY_REVIEW_RECIPE,BOUNDARY_CONTEXT_RECIPE,PADDING_REVIEW_RECIPE
    r=a['clockEdgeReview'];b=copy.deepcopy({k:v for k,v in a.items() if k!='clockEdgeReview'})
    if r['baseRecipe'] not in {BOUNDARY_REVIEW_RECIPE,BOUNDARY_CONTEXT_RECIPE,PADDING_REVIEW_RECIPE}:raise ValueError('Unsupported original boundary proof')
    if (not a['key'].endswith(':en') or any(re.search(r'\d',v['text']) for v in a['boundarySourceVerses'])
        or any(k in a for k in ['caseReviewPolicy','spokenProjection','confirmedCoverage','sourceEdgeReview'])):raise ValueError('Need complete independent original verse evidence')
    b.update(qualityRecipe=r['baseRecipe'],fingerprint=r['baseFingerprint'],cues=copy.deepcopy(r['originalCues']))
    if b.get('jointAlignments') or any(c.get('jointProofId') for c in b['checks']):
        from joint_boundaries import verified_joint_proofs
        if not verified_joint_proofs(b):raise ValueError('Original joint proof did not verify')
    original={c['verse']:c for c in b['cues']}
    if len(original)!=len(b['cues']):raise ValueError('Duplicate original verse cue')
    for c in b['checks']:
        edges,_=verse_boundary(c['alignedWords'],c['searchRange'],b['duration'],'en',reference=c['text'],signal=c['boundarySignal'],anchors=c['asrEdgeAnchors'])
        cue=original.pop(c['verse'],None)
        if edges is None:
            if cue is not None:raise ValueError('Unsupported original weak-head cue')
            continue
        if c.get('jointClipRange') is not None:edges=c['jointClipRange']
        if cue!={'verse':c['verse'],'text':c['text'],'start':edges[0],'end':edges[1]}:raise ValueError('Original cue differs from original model proof')
    if original:raise ValueError('Unrecognized original verse cue')
    return b


def _diagnostic(a):
    from alignment_contract import FULL_MODEL,FULL_REVISION,FULL_MODEL_SHA256
    d=a['clockEdgeReview']['independentRecognition']
    if (d['model']!=FULL_MODEL or d['revision']!=FULL_REVISION or d['modelSha256']!=FULL_MODEL_SHA256
        or d['sourceAudioSha256']!=a['sourceAudioSha256']):raise ValueError('Wrong independent source/model identity')
    raw=[]
    for window in d['windows']:
        lo,hi=window['range']
        if not all(finite(v) for v in [lo,hi]) or not 0<=lo<hi<=a['duration']:raise ValueError('Invalid independent hearing window')
        for seg in window['segments']:
            for w in seg['words']:
                if not lo<=w['start']<=w['end']<=hi:raise ValueError('Independent clock outside actual source window')
                raw.append(w)
    return raw


def _phrase(raw,words,head,policy=CLOCK_EDGE_POLICY):
    p=policy;count=p['contextWords'] if head else 3;part=words[:count] if head else words[-count:]
    if len(part)!=count:raise ValueError('No complete reference phrase')
    for index in range(len(raw)-count+1):
        group=raw[index:index+count];valid=True
        for j,(w,c) in enumerate(zip(part,group)):
            if (normalized(w['word'])!=normalized(c['word']) or not all(finite(c.get(k)) for k in ['start','end','probability'])
                or not 0<=c['start']<c['end'] or not p['minimumProbability']<=c['probability']<=1
                or c['end']-c['start']>(p['maximumCoarseHeadSeconds'] if head and j==0 else 2)
                or abs(w['end']-c['end'])>p['maximumRecognizerClockDifference']
                or (not (head and j==0) and abs(w['start']-c['start'])>p['maximumRecognizerClockDifference'])):valid=False;break
        if valid:return group
    raise ValueError('Independent complete phrase clocks disagree')


def _interior(raw,words,probability,policy):
    count=policy['contextWords']
    for offset in range(1,policy['maximumContextOffset']+1):
        part=words[offset:offset+count]
        if len(part)!=count or part[0]['start']-words[0]['start']>policy['maximumContextDelay']:continue
        if min(w['score'] for w in part)<policy['minimumContextScore']:continue
        for index in range(len(raw)-count+1):
            group=raw[index:index+count]
            if all(normalized(w['word'])==normalized(c['word']) and all(finite(c.get(k)) for k in ['start','end','probability'])
                and 0<=c['start']<c['end'] and probability<=c['probability']<=1
                and max(abs(w[k]-c[k]) for k in ['start','end'])<=policy['maximumRecognizerClockDifference']
                for w,c in zip(part,group)):
                return {'offset':offset,'words':group}
    raise ValueError('No independently located interior source phrase')


def _independent_head(raw,word,policy):
    matches=[c for c in raw if normalized(c.get('word',''))==normalized(word['word'])
        and all(finite(c.get(k)) for k in ['start','end','probability'])
        and 0<=c['start']<c['end'] and c['end']-c['start']<=policy['maximumCoarseHeadSeconds']
        and policy['minimumProbability']<=c['probability']<=1
        and abs(c['end']-word['end'])<=policy['maximumRecognizerClockDifference']]
    if len(matches)!=1:raise ValueError('No unique independently heard first word')
    return matches


def _expected(a,verse):
    b=_base(a);p=a['clockEdgeReview']['policy'];sr=p['sampleRate'];checks=b['checks'];i=next(i for i,c in enumerate(checks) if c['verse']==verse)
    if not 0<i<len(checks)-1:raise ValueError('Need both real neighbors')
    left,c,right=checks[i-1:i+2];words=_words(c);lw,rw=_words(left),_words(right)
    _,e=verse_boundary(c['alignedWords'],c['searchRange'],b['duration'],'en',reference=c['text'],signal=c['boundarySignal'],anchors=c['asrEdgeAnchors'])
    if (c.get('jointProofId') or left.get('jointProofId') or e['reasons']!=['weak-edge-word'] or e['meanAlignmentScore']<p['minimumMeanScore']
        or words[0]['score']>=.5 or words[0]['end']-words[0]['start']>p['maximumModelHeadSeconds']
        or min([w['score'] for w in words[1:p['contextWords']]]+[words[-1]['score'],lw[-1]['score'],rw[0]['score']])<p['minimumContextScore']
        or not left['boundaryVerified'] or not right['boundaryVerified']):raise ValueError('Not an isolated short weak first word')
    raw=[w for seg in b['recognition'] for w in seg['words'] if normalized(w.get('word',''))];independent=_diagnostic(a)
    if p==PHRASE_EDGE_POLICY:
        clocks={'original':{'headContext':_interior(raw,words,p['minimumOriginalContextProbability'],p),'tail':_phrase(raw,words,False,p)},
            'independent':{'head':_independent_head(independent,words[0],p),'headContext':_interior(independent,words,p['minimumProbability'],p),'tail':_phrase(independent,words,False,p)}}
        protected_head=clocks['independent']['head'][0]['start']
    else:
        clocks={name:{'head':_phrase(r,words,True),'tail':_phrase(r,words,False)} for name,r in [('original',raw),('independent',independent)]}
        protected_head=clocks['original']['head'][0]['start']
    speech=a['clockEdgeReview']['speechSegments'];center=lambda w:round((w['start']+w['end'])*sr/2)
    locate=lambda w:next(j for j,(x,y) in enumerate(speech) if x<=center(w)<y)
    first,final,prev,nxt=locate(words[0]),locate(words[-1]),locate(lw[-1]),locate(rw[0])
    if not prev==first-1<=first<=final==nxt-1:raise ValueError('Intervening source speech has unknown ownership')
    before,onset=speech[prev][1]/sr,speech[first][0]/sr;offset,after=speech[final][1]/sr,speech[nxt][0]/sr
    if (abs(before-lw[-1]['end'])>p['maximumVadExtension'] or abs(onset-words[0]['start'])>p['maximumClockDifference']
        or not 0<=offset-words[-1]['end']<=p['maximumVadExtension'] or abs(after-rw[0]['start'])>p['maximumClockDifference']):raise ValueError('Wrong source speech interval')
    cues={c['verse']:c for c in b['cues']};margin=p['marginSeconds'];length=p['frameSamples']*p['frames'];windows=[];cuts=[]
    # The coarse first-word START may include pause/music; its END and four-word
    # phrase are independently corroborated. Preserve the original recognizer's
    # start as an additional conservative limit when selecting the cut.
    limits=[(max(before+margin,cues[left['verse']]['end']),min(onset-margin,protected_head-margin,words[0]['start']-margin)),
            (max(offset+margin,words[-1]['end']+margin,*[v['tail'][-1]['end']+margin for v in clocks.values()]),
             min(after-margin,cues[right['verse']]['start']))]
    for side,(lo,hi) in enumerate(limits):
        start=(math.floor((hi*sr-length)/p['frameSamples']) if side==0 else math.ceil(lo*sr/p['frameSamples']))*p['frameSamples'];end=start+length
        if start<math.ceil(lo*sr) or end>math.floor(hi*sr) or any(max(start,x)<min(end,y) for x,y in speech):raise ValueError('No original voice-free cut preserving both neighbors')
        windows.append([start,end]);cuts.append((start+end)/2/sr)
    if not cues[left['verse']]['end']<=cuts[0]<words[0]['start']<words[-1]['end']<cuts[1]<=cues[right['verse']]['start']:raise ValueError('Boundary overlaps neighboring verse')
    return {'verse':verse,'range':cuts,'previousVerse':left['verse'],'previousRange':[cues[left['verse']]['start'],cuts[0]],
        'clocks':clocks,'speechIndexes':[prev,first,final,nxt],'windows':windows}


def _measure(a,verse,pcm):
    e=_expected(a,verse);frame=a['clockEdgeReview']['policy']['frameSamples'];e['frameRms']=[[rms(pcm,k,k+frame) for k in range(x,y,frame)] for x,y in e['windows']];e['id']=digest(e);return e


def _ranges(a):
    r=a['clockEdgeReview'];b=_base(a);ranges={};cues={c['verse']:c for c in b['cues']};seen=set()
    for proof in r['proofs']:
        if proof['verse'] in seen:raise ValueError('Duplicate weak-head proof')
        seen.add(proof['verse']);expected=_expected(a,proof['verse'])
        if (any(proof.get(k)!=v for k,v in expected.items()) or proof['id']!=digest({k:v for k,v in proof.items() if k!='id'})
            or len(proof['frameRms'])!=2 or any(len(x)!=2 or any(not finite(v) or not 0<=v<=1 for v in x) for x in proof['frameRms'])):raise ValueError('Invalid source clock proof')
        ranges[proof['verse']]=proof['range'];c=next(c for c in b['checks'] if c['verse']==proof['verse']);cues[c['verse']]={'verse':c['verse'],'text':c['text'],'start':proof['range'][0],'end':proof['range'][1]}
        ranges[proof['previousVerse']]=proof['previousRange'];cues[proof['previousVerse']]['end']=proof['range'][0]
    if not seen:raise ValueError('No independently supported weak head')
    b['cues']=[cues[n] for n in sorted(cues)];padding_base=copy.deepcopy(b);signatures=set()
    for proof in r['padding']:
        signature=(proof['verse'],proof['side'])
        if signature in signatures or proof['verse'] in seen or proof['verse'] in {p['previousVerse'] for p in r['proofs']} or next(c for c in b['checks'] if c['verse']==proof['verse']).get('jointProofId') or not _valid_proof(padding_base,r['speechSegments'],proof):raise ValueError('Invalid outward original voice padding')
        signatures.add(signature);cue=cues[proof['verse']];cue['start' if proof['side']=='head' else 'end']=proof['cut'];ranges[cue['verse']]=[cue['start'],cue['end']]
    return ranges


def verified_clock_edge_artifact(a):
    try:
        from alignment_contract import CLOCK_EDGE_RECIPE,PHRASE_EDGE_RECIPE,site_fingerprint,BOUNDARY_RECOGNIZER
        from boundary_quality import verified_boundary_artifact
        r=a['clockEdgeReview'];sr=16000;count=round(a['duration']*sr)
        policies={CLOCK_EDGE_RECIPE:CLOCK_EDGE_POLICY,PHRASE_EDGE_RECIPE:PHRASE_EDGE_POLICY}
        if (a['qualityRecipe'] not in policies or r['policy']!=policies[a['qualityRecipe']] or r['sourceAudioSha256']!=a['sourceAudioSha256']
            or r['sampleCount']!=count or r['id']!=digest({k:v for k,v in r.items() if k!='id'})
            or r['baseFingerprint']!=site_fingerprint(a['sourceAudioSha256'],a['textSha256'],'en',r['baseRecipe'],BOUNDARY_RECOGNIZER)):return False
        previous=0
        for x,y in r['speechSegments']:
            if type(x) is not int or type(y) is not int or not previous<=x<y<=count:return False
            previous=y
        b={k:v for k,v in a.items() if k!='clockEdgeReview'};b['qualityRecipe']=r['baseRecipe']
        return verified_boundary_artifact(b,boundary_ranges=_ranges(a))
    except (KeyError,TypeError,ValueError,IndexError,StopIteration,ZeroDivisionError):return False


def clock_edge_measurements_match(a,pcm):
    if not verified_clock_edge_artifact(a) or len(pcm)!=a['clockEdgeReview']['sampleCount']:return False
    try:
        r=a['clockEdgeReview'];b=_base(a);cues={c['verse']:c for c in b['cues']}
        for proof in r['proofs']:
            measured=_measure(a,proof['verse'],pcm)
            if any(abs(x-y)>1/32768 for actual,saved in zip(measured['frameRms'],proof['frameRms']) for x,y in zip(actual,saved)):return False
            c=next(c for c in b['checks'] if c['verse']==proof['verse']);cues[c['verse']]={'verse':c['verse'],'text':c['text'],'start':proof['range'][0],'end':proof['range'][1]}
            cues[proof['previousVerse']]['end']=proof['range'][0]
        b['cues']=[cues[n] for n in sorted(cues)]
        for proof in r['padding']:
            m=measure_source_edge(b,r['speechSegments'],proof['verse'],proof['side'],pcm)
            if {k:v for k,v in m.items() if k not in ['id','referenceRms','quietRms']}!={k:v for k,v in proof.items() if k not in ['id','referenceRms','quietRms']}:return False
            if any(abs(x-y)>1/32768 for key in ['referenceRms','quietRms'] for x,y in zip(m[key],proof[key])):return False
        return True
    except (KeyError,TypeError,ValueError,IndexError,StopIteration,ZeroDivisionError):return False


def verify_clock_edge_media(a,path):
    from media_assets import file_matches
    from gap_review import decode_pcm
    return file_matches(path,a['sourceAudioSha256']) and clock_edge_measurements_match(a,decode_pcm(path))


def repair_clock_edges(original,pcm,speech,independent,*,policy=CLOCK_EDGE_POLICY):
    from alignment_contract import CLOCK_EDGE_RECIPE,PHRASE_EDGE_RECIPE,site_fingerprint,BOUNDARY_RECOGNIZER
    recipe=PHRASE_EDGE_RECIPE if policy==PHRASE_EDGE_POLICY else CLOCK_EDGE_RECIPE
    a=copy.deepcopy(original);r={'policy':policy,'sourceAudioSha256':a['sourceAudioSha256'],'sampleCount':len(pcm),
     'baseRecipe':a['qualityRecipe'],'baseFingerprint':a['fingerprint'],'originalCues':copy.deepcopy(a['cues']),
     'speechSegments':copy.deepcopy(speech),'independentRecognition':copy.deepcopy(independent),'proofs':[],'padding':[]};a['clockEdgeReview']=r
    try:
        _base(a);_diagnostic(a)
        for c in a['checks']:
            if not c.get('boundaryVerified'):r['proofs'].append(_measure(a,c['verse'],pcm))
        if not r['proofs']:return copy.deepcopy(original)
        cues={c['verse']:c for c in a['cues']};targets={p['verse'] for p in r['proofs']};previous={p['previousVerse'] for p in r['proofs']}
        for proof in r['proofs']:
            c=next(c for c in a['checks'] if c['verse']==proof['verse']);c['boundaryVerified']=True;cues[c['verse']]={'verse':c['verse'],'text':c['text'],'start':proof['range'][0],'end':proof['range'][1]}
            cues[proof['previousVerse']]['end']=proof['range'][0]
        a['cues']=[cues[n] for n in sorted(cues)];padding_base=copy.deepcopy(a)
        for c in a['checks']:
            if c['verse'] in targets or c['verse'] in previous or c.get('jointProofId'):continue
            for side in ['head','tail']:
                try:proof=measure_source_edge(padding_base,speech,c['verse'],side,pcm,allow_local=side=='tail')
                except (KeyError,TypeError,ValueError,IndexError,StopIteration):continue
                r['padding'].append(proof);cues[c['verse']]['start' if side=='head' else 'end']=proof['cut']
        r['id']=digest(r);a.update(qualityRecipe=recipe,accepted=True,issues=[])
        a['fingerprint']=site_fingerprint(a['sourceAudioSha256'],a['textSha256'],'en',recipe,BOUNDARY_RECOGNIZER)
        if not clock_edge_measurements_match(a,pcm):return copy.deepcopy(original)
        return a
    except (KeyError,TypeError,ValueError,IndexError,StopIteration,ZeroDivisionError):return copy.deepcopy(original)


def repair_phrase_clock_edges(original,pcm,speech,independent):
    return repair_clock_edges(original,pcm,speech,independent,policy=PHRASE_EDGE_POLICY)
