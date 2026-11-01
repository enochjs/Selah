"""Per-case boundary recovery with preserved ASR ownership and measured original pauses."""
import copy
import math
import re
from boundary_quality import finite,verse_boundary,boundary_gap_issues
from timed_text import normalized
from quiet_gaps import digest,rms,measure_gaps,verified_quiet_gaps,measurements_match
from speech_context import _base,_edge_score,_context_score,CONTEXT_GAP_POLICY
from joint_padding import protected_core
from word_pause import WORD_PAUSE_POLICY,measure_word_pause,_proof_valid as local_proof_valid
from case_evidence import CASE_POLICY,CASE_PAUSE_POLICY,case_witness
from numeric_alignment import NUMERIC_POLICY
from spoken_text import boundary_text
from quiet_gaps import GAP_POLICY

LOCAL_POLICY={**WORD_PAUSE_POLICY,'version':'independent-tail-local-pause-v2','allowSeparateClocks':True,
              'keepFollowingPadding':True,'scope':'nonnumeric-local-pair-with-full-source-number-proofs'}
INDIVIDUAL_POLICY={'version':'individual-source-bound-ownership-and-pause-v1','minimumEdgeScore':.65,
 'minimumAsrProbability':.7,'maximumEdgeClockDifference':.3,'maximumWordSeconds':1.5,
 'frameSamples':320,'frames':4,'headMargin':.06,'tailMargin':.1,'maximumRms':.03,'relativeRms':.25,
 'headSelection':'last-confirmed-quiet-run-before-complete-word','tailSelection':'first-confirmed-quiet-run-after-complete-word',
 'localPolicy':LOCAL_POLICY,'gapPolicy':CONTEXT_GAP_POLICY,'casePolicy':CASE_POLICY,'numericPolicy':NUMERIC_POLICY,
 'vadPolicy':GAP_POLICY,'backgroundMaximumRms':.1,'backgroundRelativeRms':.5,
 'backgroundBasis':'complete-owned-word-and-neighbor-clocks-plus-full-source-vad-clear-window-v1'}


def _words(c):return [w for w in c['alignedWords'] if normalized(w.get('word',''))]


def _clean(a):
    b={k:v for k,v in a.items() if k not in ['individualBoundaryReview','individualGapReview']}
    if 'individualBoundaryReview' in a:b['qualityRecipe']=a['individualBoundaryReview']['baseRecipe']
    from alignment_contract import CASE_REVIEW_RECIPE,PARTIAL_REVIEW_RECIPE
    if b['qualityRecipe']==CASE_REVIEW_RECIPE:
        b=case_witness(b)
        if b['qualityRecipe']==PARTIAL_REVIEW_RECIPE:raise ValueError('Source missing or merged coverage still requires its full proof')
        return b
    return _base(b)


def _local_view(a,verse):
    b=_clean(a);checks=b['checks'];i=next(i for i,c in enumerate(checks) if c['verse']==verse)
    if i+1>=len(checks):raise ValueError('No following verse')
    numbers={verse,checks[i+1]['verse']};b['boundarySourceVerses']=[v for v in b['boundarySourceVerses'] if v['number'] in numbers]
    return b


def _owner_constraints(a,gap_index,verse,side):
    p=INDIVIDUAL_POLICY;checks=a['checks'];i=next(i for i,c in enumerate(checks) if c['verse']==verse);c=checks[i];words=_words(c)
    if side not in ['head','tail'] or not a['key'].endswith(':en') or c.get('jointProofId'):raise ValueError('Unsupported owner or joint boundary')
    edge=words[0 if side=='head' else -1];g=a['unclaimedSpeech'][gap_index]
    source=next(v for v in a['boundarySourceVerses'] if v['number']==verse)
    edges,e=verse_boundary(c['alignedWords'],c['searchRange'],a['duration'],'en',reference=boundary_text(source['text'],'en'),signal=c['boundarySignal'],anchors=c['asrEdgeAnchors'])
    if edges is None or not c.get('boundaryVerified') or _context_score(edge)<p['minimumEdgeScore']:raise ValueError('Owner edge is not reliable')
    if (normalized(g.get('text',''))!=normalized(edge['word']) or not all(finite(g.get(k)) for k in ['start','end'])
        or not 0<=g['start']<g['end']<=a['duration'] or g['end']-g['start']>p['maximumWordSeconds']
        or max(g['start'],edge['start'])>=min(g['end'],edge['end'])):raise ValueError('Gap is not this source edge word')
    raw=[w for s in a['recognition'] for w in s.get('words',[])]
    clock=next((w for w in raw if normalized(w.get('word',''))==normalized(g['text']) and w.get('start')==g['start'] and w.get('end')==g['end'] and finite(w.get('probability')) and p['minimumAsrProbability']<=w['probability']<=1),None)
    clock_side='end' if side=='head' else 'start'
    if clock is None or abs(clock[clock_side]-edge[clock_side])>p['maximumEdgeClockDifference']:raise ValueError('No agreeing original word clock')
    neighbor_index=i-1 if side=='head' else i+1
    if not 0<=neighbor_index<len(checks):raise ValueError('Missing real neighboring verse')
    n=checks[neighbor_index];nw=_words(n);ne=nw[-1 if side=='head' else 0]
    if not n.get('boundaryVerified') or _edge_score(ne,side!='head')<p['minimumEdgeScore']:raise ValueError('Neighbor edge not reliable')
    cues={c['verse']:c for c in a['cues']};own=cues.get(verse)
    if own is None:raise ValueError('No complete owner cue')
    if not boundary_gap_issues([g],a['cues']):raise ValueError('Gap already covered')
    if side=='head':
        low=max(protected_core(n,a['duration'])[1],cues[n['verse']]['end'])+p['tailMargin']
        high=min(g['start'],edge['start'])-p['headMargin']
    else:
        low=max(g['end'],edge['end'])+p['tailMargin']
        high=min(protected_core(n,a['duration'])[0],cues[n['verse']]['start'])-p['headMargin']
    sr=16000;frame=p['frameSamples'];length=frame*p['frames'];first=math.ceil(low*sr/frame)*frame;last=math.floor(high*sr/frame)*frame-length
    if first>last:raise ValueError('No safe pause between complete neighboring words')
    return {'gapIndex':gap_index,'verse':verse,'side':side,'neighborVerse':n['verse'],'wordClock':clock,
       'modelEdge':edge,'neighborEdge':ne,'sourceAudioSha256':a['sourceAudioSha256'],
       'firstSample':first,'lastSample':last,'baseRange':edges,
       'referenceRanges':[[round(edge['start']*sr),round(edge['end']*sr)],[round(ne['start']*sr),round(ne['end']*sr)]]}


def _owner_candidates(a,gap_index):
    result=[]
    for c in a['checks']:
        for side in ['head','tail']:
            try:result.append(_owner_constraints(a,gap_index,c['verse'],side))
            except (KeyError,TypeError,ValueError,IndexError,StopIteration):pass
    return result


def measure_owner(a,gap_index,pcm,speech=None):
    matches=_owner_candidates(a,gap_index)
    if len(matches)!=1:raise ValueError('No unique reliable source-word owner')
    e=matches[0];p=INDIVIDUAL_POLICY;refs=[rms(pcm,*r) for r in e['referenceRanges']];limit=min(p['maximumRms'],min(refs)*p['relativeRms'])
    speech=a.get('individualBoundaryReview',{}).get('speechSegments',[]) if speech is None else speech
    background_limit=min(p['backgroundMaximumRms'],min(refs)*p['backgroundRelativeRms'])
    starts=range(e['firstSample'],e['lastSample']+1,p['frameSamples'])
    if e['side']=='head':starts=reversed(starts)
    for start in starts:
        values=[rms(pcm,start+j*p['frameSamples'],start+(j+1)*p['frameSamples']) for j in range(p['frames'])]
        basis='quiet'
        if max(values)>limit:
            end=start+p['frameSamples']*p['frames']
            if not speech or max(values)>background_limit or any(max(start,x)<min(end,y) for x,y in speech):continue
            basis='voice-free-background'
        cut=(start+p['frameSamples']*p['frames']//2)/16000;bounds=list(e['baseRange']);bounds[0 if e['side']=='head' else 1]=cut
        proof={**e,'startSample':start,'referenceRms':refs,'quietRms':values,'ranges':{str(e['verse']):bounds},
               'acousticBasis':basis,'speechSha256':digest(speech)}
        proof['id']=digest(proof);return proof
    raise ValueError('No original PCM pause at the complete owned word')


def _owner_valid(a,proof):
    matches=_owner_candidates(a,proof['gapIndex'])
    if len(matches)!=1:return False
    e=matches[0];p=INDIVIDUAL_POLICY
    if any(proof.get(k)!=v for k,v in e.items()):return False
    start=proof['startSample'];refs=proof['referenceRms'];values=proof['quietRms']
    if type(start) is not int or not e['firstSample']<=start<=e['lastSample'] or (start-e['firstSample'])%p['frameSamples']:return False
    cut=(start+p['frameSamples']*p['frames']//2)/16000;bounds=list(e['baseRange']);bounds[0 if e['side']=='head' else 1]=cut
    if proof['ranges']!={str(e['verse']):bounds} or len(refs)!=2 or any(not finite(x) or not 0<x<=1 for x in refs):return False
    speech=a['individualBoundaryReview']['speechSegments']
    if proof.get('speechSha256')!=digest(speech):return False
    limit=min(p['maximumRms'],min(refs)*p['relativeRms'])
    if proof.get('acousticBasis')=='voice-free-background':
        end=start+p['frameSamples']*p['frames']
        if not speech or any(max(start,x)<min(end,y) for x,y in speech):return False
        limit=min(p['backgroundMaximumRms'],min(refs)*p['backgroundRelativeRms'])
    elif proof.get('acousticBasis')!='quiet':return False
    return len(values)==p['frames'] and all(finite(v) and 0<=v<=limit for v in values) and proof['id']==digest({k:v for k,v in proof.items() if k!='id'})


def _review_valid(a):
    r=a['individualBoundaryReview'];count=round(a['duration']*16000)
    if (r['policy']!=INDIVIDUAL_POLICY or r['sourceAudioSha256']!=a['sourceAudioSha256'] or r['sampleCount']!=count
        or r['id']!=digest({k:v for k,v in r.items() if k!='id'})):return False
    last=0
    for x,y in r['speechSegments']:
        if type(x) is not int or type(y) is not int or not last<=x<y<=count:return False
        last=y
    return True


def _original_cues(a):
    b=copy.deepcopy(a);cues={c['verse']:c for c in b['cues']}
    for wrapped in b['individualBoundaryReview']['proofs']:
        p=wrapped['proof']
        if wrapped['kind']=='edge-owner':
            c=next(c for c in b['checks'] if c['verse']==p['verse']);x,y=p['baseRange'];cues[c['verse']]={'verse':c['verse'],'text':c['text'],'start':x,'end':y}
    b['cues']=[cues[n] for n in sorted(cues)];return b


def _validated_ranges(a):
    r=a['individualBoundaryReview'];original=_original_cues(a);ranges={}
    for wrapped in r['proofs']:
        p=wrapped['proof']
        if wrapped['kind']=='edge-owner':valid=_owner_valid(original,p)
        elif wrapped['kind']=='local-word-pause':valid=local_proof_valid(_local_view(original,p['verse']),p,LOCAL_POLICY)
        else:raise ValueError('Unknown boundary strategy')
        if not valid:raise ValueError('Boundary proof did not verify')
        for k,v in p['ranges'].items():
            n=int(k)
            if n in ranges and ranges[n]!=v:raise ValueError('Conflicting boundary proposals')
            ranges[n]=v
    return ranges


def verified_individual_artifact(a):
    try:
        from alignment_contract import INDIVIDUAL_REVIEW_RECIPE,GAP_REVIEW_RECIPE,PADDING_REVIEW_RECIPE
        from boundary_quality import verified_boundary_artifact
        if a['qualityRecipe']!=INDIVIDUAL_REVIEW_RECIPE or not _review_valid(a):return False
        trial=_clean(a);ranges=_validated_ranges(a);gap=a.get('individualGapReview')
        if boundary_gap_issues(a['unclaimedSpeech'],a['cues']):
            if gap is None or gap['speechSegments']!=a['individualBoundaryReview']['speechSegments'] or not verified_quiet_gaps({**a,'acousticGapReview':gap},CONTEXT_GAP_POLICY):return False
            trial['unclaimedSpeech']=[]
        elif gap is not None:return False
        if not ranges and gap is None:return False
        trial.pop('acousticGapReview',None)
        if trial['qualityRecipe']==GAP_REVIEW_RECIPE:trial['qualityRecipe']=PADDING_REVIEW_RECIPE
        from alignment_contract import CASE_REVIEW_RECIPE
        maximum=CASE_POLICY['maximumJointVerses'] if a['individualBoundaryReview']['baseRecipe']==CASE_REVIEW_RECIPE else 3
        return verified_boundary_artifact(trial,maximum_joint_verses=maximum,boundary_ranges=ranges)
    except (KeyError,TypeError,ValueError,IndexError,StopIteration,ZeroDivisionError):return False


def individual_measurements_match(a,pcm):
    try:
        if not verified_individual_artifact(a) or len(pcm)!=a['individualBoundaryReview']['sampleCount']:return False
        if any('pauseHeadProof' in c for c in a['checks']):
            from anchor_windows import pause_measurements_match
            if not pause_measurements_match(a,pcm,CASE_PAUSE_POLICY):return False
        original=_original_cues(a)
        def close(x,y,key=None):
            if isinstance(x,dict) and isinstance(y,dict):return x.keys()==y.keys() and all(close(x[k],y[k],k) for k in x if k!='id')
            if isinstance(x,list) and isinstance(y,list):return len(x)==len(y) and all(close(v,w,key) for v,w in zip(x,y))
            if key in ['referenceRms','quietRms'] and finite(x) and finite(y):return abs(x-y)<=1/32768
            return x==y
        for wrapped in a['individualBoundaryReview']['proofs']:
            p=wrapped['proof']
            measured=measure_owner(original,p['gapIndex'],pcm) if wrapped['kind']=='edge-owner' else measure_word_pause(_local_view(original,p['verse']),p['verse'],pcm,LOCAL_POLICY)
            if not close(p,measured):return False
        gap=a.get('individualGapReview')
        return gap is None or measurements_match({**a,'acousticGapReview':gap},pcm,CONTEXT_GAP_POLICY)
    except (KeyError,TypeError,ValueError,IndexError,StopIteration,ZeroDivisionError):return False


def verify_individual_media(a,path):
    from gap_review import decode_pcm
    from media_assets import file_matches
    return verified_individual_artifact(a) and file_matches(path,a['sourceAudioSha256']) and individual_measurements_match(a,decode_pcm(path))


def repair_individual(original,pcm,speech):
    from alignment_contract import INDIVIDUAL_REVIEW_RECIPE,site_fingerprint,BOUNDARY_RECOGNIZER
    attempts=[];a=copy.deepcopy(original)
    try:_clean(a)
    except (KeyError,TypeError,ValueError) as e:return a,[{'strategy':'source-identity','reason':str(e)}]
    if len(pcm)!=round(a['duration']*16000):return a,[{'strategy':'source-identity','reason':'Source duration changed'}]
    proofs=[];ranges={}
    def adopt(kind,p):
        if any(int(n) in ranges and ranges[int(n)]!=v for n,v in p['ranges'].items()):raise ValueError('Conflicting boundary proposals')
        proofs.append({'kind':kind,'proof':p});ranges.update({int(n):v for n,v in p['ranges'].items()})
    for i,g in enumerate(original['unclaimedSpeech']):
        if not boundary_gap_issues([g],original['cues']):continue
        try:p=measure_owner(original,i,pcm,speech);adopt('edge-owner',p);attempts.append({'strategy':'edge-owner','gapIndex':i,'verse':p['verse'],'side':p['side'],'range':p['ranges'][str(p['verse'])],'reason':'verified-proposal','acousticBasis':p['acousticBasis']})
        except (KeyError,TypeError,ValueError,IndexError,StopIteration) as e:attempts.append({'strategy':'edge-owner','gapIndex':i,'range':[g.get('start'),g.get('end')],'reason':str(e)})
    for c in original['checks']:
        if c.get('boundaryVerified'):continue
        try:p=measure_word_pause(_local_view(original,c['verse']),c['verse'],pcm,LOCAL_POLICY);adopt('local-word-pause',p);attempts.append({'strategy':'local-word-pause','verse':c['verse'],'reason':'verified-proposal','ranges':p['ranges']})
        except (KeyError,TypeError,ValueError,IndexError,StopIteration) as e:attempts.append({'strategy':'local-word-pause','verse':c['verse'],'reason':str(e)})
    for c in a['checks']:
        if c['verse'] in ranges:c['boundaryVerified']=True
    cues={c['verse']:c for c in a['cues']}
    for c in a['checks']:
        if c['verse'] in ranges:
            x,y=ranges[c['verse']];cues[c['verse']]={'verse':c['verse'],'text':c['text'],'start':x,'end':y}
    a['cues']=[cues[n] for n in sorted(cues)]
    r={'policy':INDIVIDUAL_POLICY,'baseRecipe':original['qualityRecipe'],'sourceAudioSha256':a['sourceAudioSha256'],'sampleCount':len(pcm),'speechSegments':speech,'proofs':proofs};r['id']=digest(r);a.update(individualBoundaryReview=r,qualityRecipe=INDIVIDUAL_REVIEW_RECIPE)
    a['issues']=[f'unreliable-verse-boundary:{c["verse"]}' for c in a['checks'] if not c.get('boundaryVerified')]
    gaps=boundary_gap_issues(a['unclaimedSpeech'],a['cues'])
    if gaps:
        a['individualGapReview']=measure_gaps(a,pcm,speech,CONTEXT_GAP_POLICY)
        if not verified_quiet_gaps({**a,'acousticGapReview':a['individualGapReview']},CONTEXT_GAP_POLICY):a['issues'].extend(gaps)
    a['accepted']=not a['issues']
    if not verified_individual_artifact(a) or not individual_measurements_match(a,pcm):
        attempts.append({'strategy':'complete-chapter','reason':'Full original-source boundary verification remains incomplete'})
        return copy.deepcopy(original),attempts
    a['fingerprint']=site_fingerprint(a['sourceAudioSha256'],a['textSha256'],a['key'].split(':')[-1],INDIVIDUAL_REVIEW_RECIPE,a.get('recognizer',BOUNDARY_RECOGNIZER))
    return a,attempts or [{'strategy':'gap-acoustics','reason':'Verified original background gap'}]
