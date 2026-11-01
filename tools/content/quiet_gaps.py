"""Source-bound, sample-accurate evidence for silent ASR gap false positives."""
import hashlib
import json
import math
from boundary_quality import boundary_gap_issues, finite

GAP_POLICY={'sampleRate':16000,'frameSamples':160,'hopSamples':80,'contextSamples':320,
            'maximumRms':.01,'relativeRms':.15,'vadThreshold':.25,'vadNegativeThreshold':.1,'vadMinimumSpeechMs':50,
            'vadMinimumSilenceMs':100,'vadPaddingMs':0,
            'vadModelSha256':'4cbf549b8326f60f80f2536d9eefeb450a9abe83365a098031c89719f1be17d2',
            'measurement':'s16le-mono-16khz-full-source-v1','proofSchema':'source-cues-gaps-joint-pcm-v1'}


def digest(value):
    return hashlib.sha256(json.dumps(value,ensure_ascii=False,sort_keys=True).encode()).hexdigest()


def uncovered_samples(gap,cues,count):
    start,end=gap['start'],gap['end']
    if not all(finite(x) for x in [start,end]) or not 0<=start<=end:
        raise ValueError('Invalid original ASR gap')
    remaining=[[min(count,math.floor(start*16000)),min(count,math.ceil(end*16000))]]
    for cue in sorted(cues,key=lambda c:c['start']):
        a,b=round(cue['start']*16000),round(cue['end']*16000);out=[]
        for left,right in remaining:
            if a<=left<=right<=b:continue
            if b<=left or a>=right:out.append([left,right]);continue
            if left<a:out.append([left,a])
            if b<right:out.append([b,right])
        remaining=out
    return remaining


def context_range(bounds,count):
    left,right=bounds
    if right-left<GAP_POLICY['contextSamples']:
        left=max(0,(left+right-GAP_POLICY['contextSamples'])//2)
        right=min(count,left+GAP_POLICY['contextSamples'])
        left=max(0,right-GAP_POLICY['contextSamples'])
    return [left,right]


def reference_ranges(gap,cues):
    center=(gap['start']+gap['end'])/2
    nearby=sorted(cues,key=lambda c:(min(abs(c['start']-center),abs(c['end']-center)),c['verse']))[:2]
    return [{'verse':c['verse'],'samples':[round(c['start']*16000),round(c['end']*16000)]} for c in nearby]


def rms(pcm,left,right):
    if right<=left:raise ValueError('Empty acoustic measurement')
    return math.sqrt(sum(int(x)*int(x) for x in pcm[left:right])/(right-left))/32768


def measure_gaps(artifact,pcm,speech,policy=GAP_POLICY):
    count=len(pcm)
    if count!=round(artifact['duration']*16000) or count<GAP_POLICY['contextSamples']:
        raise ValueError('Decoded original source length differs from report')
    proofs=[]
    for index,gap in enumerate(artifact['unclaimedSpeech']):
        if not boundary_gap_issues([gap],artifact['cues']):continue
        refs=reference_ranges(gap,artifact['cues'])
        for ref in refs:ref['rms']=rms(pcm,*ref['samples'])
        parts=[]
        for bounds in uncovered_samples(gap,artifact['cues'],count):
            a,b=context_range(bounds,count)
            frames=[rms(pcm,i,min(i+GAP_POLICY['frameSamples'],b)) for i in range(a,b,GAP_POLICY['hopSamples'])]
            parts.append({'samples':bounds,'context':[a,b],'frames':frames})
        proofs.append({'gapIndex':index,'references':refs,'parts':parts})
    review={'policy':dict(policy),'sourceAudioSha256':artifact['sourceAudioSha256'],
            'cueSha256':digest(artifact['cues']),'gapSha256':digest(artifact['unclaimedSpeech']),
            'jointProofIds':[p['id'] for p in artifact.get('jointAlignments',[])],
            'sampleCount':count,'speechSegments':speech,'proofs':proofs}
    review['id']=digest(review)
    return review


def verified_quiet_gaps(artifact,policy=GAP_POLICY):
    try:
        review=artifact['acousticGapReview'];count=round(artifact['duration']*16000)
        if (review['policy']!=policy or review['sampleCount']!=count or count<320
                or review['sourceAudioSha256']!=artifact['sourceAudioSha256']
                or review['cueSha256']!=digest(artifact['cues'])
                or review['gapSha256']!=digest(artifact['unclaimedSpeech'])
                or review['jointProofIds']!=[p['id'] for p in artifact.get('jointAlignments',[])]
                or review['id']!=digest({k:v for k,v in review.items() if k!='id'})):
            return False
        previous=0
        for a,b in review['speechSegments']:
            if any(type(n) is not int for n in [a,b]) or not previous<=a<b<=count:return False
            previous=b
        expected=[i for i,g in enumerate(artifact['unclaimedSpeech']) if boundary_gap_issues([g],artifact['cues'])]
        if not expected or [p['gapIndex'] for p in review['proofs']]!=expected:return False
        for proof in review['proofs']:
            gap=artifact['unclaimedSpeech'][proof['gapIndex']]
            refs=reference_ranges(gap,artifact['cues'])
            if len(refs)!=len(proof['references']) or not refs:return False
            for ref,saved in zip(refs,proof['references']):
                if (ref!={k:v for k,v in saved.items() if k!='rms'}
                        or not finite(saved['rms']) or not 0<saved['rms']<=1):return False
            limit=min(policy['maximumRms'],min(x['rms'] for x in proof['references'])*policy['relativeRms'])
            intervals=uncovered_samples(gap,artifact['cues'],count)
            if not intervals or len(intervals)!=len(proof['parts']):return False
            for bounds,part in zip(intervals,proof['parts']):
                a,b=context_range(bounds,count)
                frames=part['frames']
                if (part['samples']!=bounds or part['context']!=[a,b] or b-a<320
                        or len(frames)!=len(range(a,b,GAP_POLICY['hopSamples']))
                        or not frames or any(not finite(x) or not 0<=x<=limit for x in frames)
                        or any(max(a,x)<min(b,y) for x,y in review['speechSegments'])):return False
        return True
    except (KeyError,TypeError,ValueError,IndexError,OverflowError):
        return False


def measurements_match(artifact,pcm,policy=GAP_POLICY):
    try:
        saved=artifact['acousticGapReview']
        measured=measure_gaps(artifact,pcm,saved['speechSegments'],policy)
        # MP3 decoders on different platforms can differ by one s16 PCM unit.
        # Both the stored and freshly measured frames must independently pass
        # the exact quiet policy; tolerance never changes the quiet threshold.
        if not (verified_quiet_gaps(artifact,policy)
                and verified_quiet_gaps({**artifact,'acousticGapReview':measured},policy)):
            return False
        def close(left,right,key=None):
            if isinstance(left,dict) and isinstance(right,dict):
                return left.keys()==right.keys() and all(close(left[k],right[k],k) for k in left if k!='id')
            if isinstance(left,list) and isinstance(right,list):
                return len(left)==len(right) and all(close(a,b,key) for a,b in zip(left,right))
            if key in {'rms','frames'} and finite(left) and finite(right):
                return abs(left-right)<=1/32768
            return left==right
        return close(saved,measured)
    except (ValueError,KeyError,TypeError):return False


def same_source_measurements(saved,measured,key=None):
    """Compare redecoded PCM measurements; all source geometry stays exact."""
    if isinstance(saved,dict) and isinstance(measured,dict):
        return saved.keys()==measured.keys() and all(same_source_measurements(saved[k],measured[k],k) for k in saved if k!='id')
    if isinstance(saved,list) and isinstance(measured,list):
        return len(saved)==len(measured) and all(same_source_measurements(a,b,key) for a,b in zip(saved,measured))
    if key in {'rms','frames','referenceRms','frameRms'} and finite(saved) and finite(measured):
        return abs(saved-measured)<=1/32768
    return saved==measured
