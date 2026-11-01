"""Account for coarse ASR gaps by actual source voice and verified verse clips."""
import copy
import math
from boundary_quality import finite
from quiet_gaps import digest,rms,GAP_POLICY
from source_edges import SOURCE_EDGE_POLICY

GAP_EDGE_POLICY={'version':'original-gap-voice-partition-v1','sampleRate':16000,'frameSamples':320,
 'maximumBackgroundRms':.1,'relativeBackgroundRms':.5,'vadPolicy':GAP_POLICY,'edgePolicy':SOURCE_EDGE_POLICY,
 'coverage':'every-source-voice-sample-in-original-asr-gap-is-owned-by-a-verified-verse',
 'headingScope':'original-allowed-leading-or-trailing-gap-wholly-outside-verse-clips',
 'zeroClockScope':'must-fall-inside-a-verified-verse-sample',
 'canonicalText':'unchanged','originalAsrGaps':'preserved'}


def _inner(a):
    from alignment_contract import CASE_REVIEW_RECIPE,SOURCE_EDGE_RECIPE,BOUNDARY_RECOGNIZER,site_fingerprint
    r=a['sourceGapReview'];base=r['baseRecipe']
    if base not in [CASE_REVIEW_RECIPE,SOURCE_EDGE_RECIPE] or a.get('missingVerses') or a.get('confirmedCoverage') is not None:raise ValueError('Unsupported source gap coverage')
    fingerprint=site_fingerprint(a['sourceAudioSha256'],a['textSha256'],a['key'].split(':')[-1],base,BOUNDARY_RECOGNIZER)
    if r['baseFingerprint']!=fingerprint:raise ValueError('Wrong source boundary identity')
    b=copy.deepcopy({k:v for k,v in a.items() if k!='sourceGapReview'})
    b.update(qualityRecipe=base,fingerprint=fingerprint,unclaimedSpeech=[])
    return b


def _geometry(a):
    r=a['sourceGapReview'];p=GAP_EDGE_POLICY;sr=p['sampleRate'];count=r['sampleCount'];speech=r['speechSegments'];cues=a['cues'];checks={c['verse']:c for c in a['checks']};parts=[]
    for index,gap in enumerate(a['unclaimedSpeech']):
        start,end=gap.get('start'),gap.get('end')
        if not all(finite(x) for x in [start,end]) or not 0<=start<=end<=a['duration']:raise ValueError('Invalid original gap clock')
        if gap.get('allowedHeadingOrClosing') and (
            gap.get('kind')=='leading' and end<=cues[0]['start']
            or gap.get('kind')=='trailing' and start>=cues[-1]['end']):continue
        low,high=math.floor(start*sr),math.ceil(end*sr)
        if start==end:
            low=round(start*sr);high=low+1
            if not any(round(c['start']*sr)<=low<high<=round(c['end']*sr) for c in cues):
                raise ValueError('Zero-length clock has no verified verse ownership')
        bounds={low,high}
        for cue in cues:
            for v in [cue['start'],cue['end']]:
                sample=round(v*sr)
                if low<sample<high:bounds.add(sample)
        ordered=sorted(bounds)
        for x,y in zip(ordered,ordered[1:]):
            if not 0<=x<y<=count:raise ValueError('Gap clock leaves original source')
            owner=next((c['verse'] for c in cues if round(c['start']*sr)<=x<y<=round(c['end']*sr)),None)
            part={'gapIndex':index,'range':[x,y],'ownerVerse':owner}
            if owner is None:
                if any(max(x,s)<min(y,e) for s,e in speech):raise ValueError('Residual source speech remains outside verified verse clips')
                left=max([c for c in cues if round(c['end']*sr)<=x],key=lambda c:c['end'],default=cues[0])
                right=min([c for c in cues if round(c['start']*sr)>=y],key=lambda c:c['start'],default=cues[-1])
                part['referenceRanges']=[[round(v*sr) for v in checks[c['verse']]['searchRange']] for c in [left,right]]
                if any(not 0<=s<e<=count for s,e in part['referenceRanges']):raise ValueError('Invalid original volume reference')
            parts.append(part)
    return parts


def _measure(a,pcm):
    result=_geometry(a);frame=GAP_EDGE_POLICY['frameSamples']
    for part in result:
        if part['ownerVerse'] is not None:continue
        part['referenceRms']=[rms(pcm,*r) for r in part['referenceRanges']];x,y=part['range']
        part['frameRms']=[rms(pcm,start,min(y,start+frame)) for start in range(x,y,frame)]
    return result


def verified_gap_edge_artifact(a):
    try:
        from alignment_contract import GAP_EDGE_RECIPE
        from boundary_quality import verified_boundary_artifact
        r=a['sourceGapReview'];p=GAP_EDGE_POLICY
        if (a['qualityRecipe']!=GAP_EDGE_RECIPE or r['policy']!=p or r['sourceAudioSha256']!=a['sourceAudioSha256']
            or r['sampleCount']!=round(a['duration']*16000) or not a['unclaimedSpeech']
            or r['originalGapsSha256']!=digest(a['unclaimedSpeech'])
            or r['id']!=digest({k:v for k,v in r.items() if k!='id'})
            or not r['originalIssues'] or any(not issue.startswith('boundary-unassigned-speech:') for issue in r['originalIssues'])):return False
        previous=0
        for x,y in r['speechSegments']:
            if type(x) is not int or type(y) is not int or not previous<=x<y<=r['sampleCount']:return False
            previous=y
        inner=_inner(a)
        if inner.get('sourceEdgeReview') is not None and inner['sourceEdgeReview']['speechSegments']!=r['speechSegments']:return False
        if not verified_boundary_artifact(inner):return False
        geometry=_geometry(a)
        if len(geometry)!=len(r['parts']):return False
        for expected,saved in zip(geometry,r['parts']):
            if any(saved.get(k)!=v for k,v in expected.items()):return False
            if expected['ownerVerse'] is not None:
                if saved!=expected:return False
                continue
            refs=saved['referenceRms'];values=saved['frameRms'];x,y=expected['range']
            if len(refs)!=2 or any(not finite(v) or not 0<v<=1 for v in refs):return False
            limit=min(p['maximumBackgroundRms'],min(refs)*p['relativeBackgroundRms'])
            if len(values)!=math.ceil((y-x)/p['frameSamples']) or any(not finite(v) or not 0<=v<=limit for v in values):return False
        return True
    except (KeyError,TypeError,ValueError,IndexError,ZeroDivisionError):return False


def gap_edge_measurements_match(a,pcm):
    if not verified_gap_edge_artifact(a) or len(pcm)!=a['sourceGapReview']['sampleCount']:return False
    try:
        measured=_measure(a,pcm)
        for actual,saved in zip(measured,a['sourceGapReview']['parts']):
            for k in ['referenceRms','frameRms']:
                if k in actual and any(abs(x-y)>1/32768 for x,y in zip(actual[k],saved[k])):return False
        return True
    except (KeyError,TypeError,ValueError,IndexError,ZeroDivisionError):return False


def verify_gap_edge_media(a,path):
    from alignment_contract import SOURCE_EDGE_RECIPE
    from source_edges import verify_source_edge_media
    from case_evidence import verify_case_media
    from gap_review import decode_pcm
    from media_assets import file_matches
    if not verified_gap_edge_artifact(a) or not file_matches(path,a['sourceAudioSha256']):return False
    b=_inner(a)
    valid=verify_source_edge_media(b,path) if b['qualityRecipe']==SOURCE_EDGE_RECIPE else verify_case_media(b,path)
    return valid and gap_edge_measurements_match(a,decode_pcm(path))


def repair_gap_edges(original,pcm,speech):
    from alignment_contract import GAP_EDGE_RECIPE,site_fingerprint,BOUNDARY_RECOGNIZER
    from boundary_quality import verified_boundary_artifact
    from source_edges import repair_source_edges
    if (not original['issues'] or any(not issue.startswith('boundary-unassigned-speech:') for issue in original['issues'])
        or len(pcm)!=round(original['duration']*16000)):return copy.deepcopy(original)
    b=copy.deepcopy(original);b.update(unclaimedSpeech=[],issues=[],accepted=True)
    if not verified_boundary_artifact(b):return copy.deepcopy(original)
    b=repair_source_edges(b,pcm,speech)
    r={'policy':GAP_EDGE_POLICY,'sourceAudioSha256':b['sourceAudioSha256'],'sampleCount':len(pcm),'speechSegments':speech,
       'baseRecipe':b['qualityRecipe'],'baseFingerprint':b['fingerprint'],'originalGapsSha256':digest(original['unclaimedSpeech']),
       'originalIssues':original['issues']}
    b.update(sourceGapReview=r,qualityRecipe=GAP_EDGE_RECIPE,unclaimedSpeech=copy.deepcopy(original['unclaimedSpeech']))
    try:r['parts']=_measure(b,pcm)
    except (KeyError,TypeError,ValueError,IndexError,ZeroDivisionError):return copy.deepcopy(original)
    r['id']=digest(r)
    if not verified_gap_edge_artifact(b) or not gap_edge_measurements_match(b,pcm):return copy.deepcopy(original)
    b['fingerprint']=site_fingerprint(b['sourceAudioSha256'],b['textSha256'],b['key'].split(':')[-1],GAP_EDGE_RECIPE,b.get('recognizer',BOUNDARY_RECOGNIZER))
    return b
