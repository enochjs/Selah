"""Human-confirmed scripture ending; original trailing ASR clocks remain intact."""
import copy,hashlib
from boundary_quality import finite,boundary_gap_issues
from quiet_gaps import GAP_POLICY,digest,same_source_measurements
from reviewed_partial_sources import _material
from reviewed_absent_fragments import measure_absent_tail
from reviewed_source_placeholders import ending_tail_valid
from reviewed_source_windows import derive_source_window_case
from timed_text import normalized

REVIEWED_ENDING_SOURCE_POLICY={
    'version':'registered-user-scripture-end-background-source-v1',
    'authority':'exact-user-confirmed-source-ending-and-bounded-nonvoice-tail',
    'original':'complete-original-rejected-report-with-unchanged-ASR-text-clocks-and-flags',
    'model':'all-original-canonical-model-and-joint-proofs-reverified-before-source-cuts',
    'voice':'last-real-verse-retains-the-complete-original-source-VAD-and-all-model-words',
    'background':'full-original-ending-remeasured; no-source-VAD-after-the-accepted-cut',
    'maximumEndingRms':.1,'relativeEndingRms':.75,'frameSamples':320,
    'outputs':'all-real-verses; original-whole-chapter-audio-including-background-kept',
    'quietClaim':False,'clockExceptions':False,
}


def _inputs(base,receipt,materials):
    raw=next(m['utf8'] for m in materials if m['file']==receipt['baseReportFile'])
    if (receipt['schemaVersion']!=26 or base.get('accepted') is not False or digest(base)!=receipt['baseEvidenceSha256']
        or _material(receipt,materials,receipt['baseReportFile'])!=base
        or receipt['approvedBy']!='user-scripture-ending-background' or receipt['sourceAcousticApproval'] is not False
        or not isinstance(receipt['humanDecision'],str) or not receipt['humanDecision'].strip()):
        raise ValueError('Need the original source and exact human scripture-ending decision')
    audit=_material(receipt,materials,receipt['sourceAuditFile']);tail=_material(receipt,materials,receipt['tailEvidenceFile']);count=round(base['duration']*16000)
    if (audit['key']!=base['key'] or audit['sourceAudioSha256']!=base['sourceAudioSha256']
        or audit['sourceReportSha256']!=hashlib.sha256(raw.encode()).hexdigest() or audit['sampleCount']!=count
        or audit['vadModelSha256']!=GAP_POLICY['vadModelSha256']):raise ValueError('Ending VAD is not bound to the unchanged original source')
    previous=0
    for x,y in audit['speechSegments']:
        if type(x) is not int or type(y) is not int or not previous<=x<y<=count:raise ValueError('Invalid original source VAD')
        previous=y
    return audit,tail


def ending_source_role(base,receipt,materials):
    audit,tail=_inputs(base,receipt,materials);e=receipt['ending'];i=e['gapIndex'];g=base['unclaimedSpeech'][i];old=base['cues'][-1];last=receipt['finalCues'][-1];cut=e['cut'];voice_end=max(y for _,y in audit['speechSegments'])/16000
    trailing=[j for j,gap in enumerate(base['unclaimedSpeech']) if gap['kind']=='trailing' and gap.get('allowedHeadingOrClosing') is False]
    if (trailing!=[i] or e['gapSha256']!=digest(g) or not normalized(g['text'])
        or last['verse']!=old['verse'] or e['verse']!=last['verse'] or last['verse']!=base['expectedVerseNumbers'][-1]
        or last['start']!=old['start'] or last['end']!=cut or not finite(cut)
        or not last['start']<=g['start']<voice_end<cut<g['end']<=base['duration'] or cut<old['end']
        or any(not last['start']*16000<=x<y<=cut*16000 for x,y in audit['speechSegments'] if y>g['start']*16000)
        or tail['range']!=[round(cut*16000),audit['sampleCount']]
        or tail['referenceRange']!=[round(last['start']*16000),round(cut*16000)] or not ending_tail_valid(tail)
        or any(max(tail['range'][0],x)<min(tail['range'][1],y) for x,y in audit['speechSegments'])):
        raise ValueError('A human ending cannot omit last-verse voice or hide additional source narration')
    words=[w for w in base['checks'][-1]['alignedWords'] if normalized(w.get('word',''))]
    if (not words or not g['start']<words[-1]['end']<=voice_end
        or any(not last['start']<=w['start']<w['end']<=cut for w in words)):
        raise ValueError('The final original model word body does not belong to the preserved scripture ending')
    return i


def derive_ending_source_case(base,receipt,materials):
    i=ending_source_role(base,receipt,materials);v=receipt['ending']['verse'];old=base['cues'][-1];final=receipt['finalCues'][-1]
    if base['issues']!=['unreliable-verse-boundary:'+str(n) for n in receipt['weakVerses']]+boundary_gap_issues(base['unclaimedSpeech'],base['cues']):
        raise ValueError('An unrelated original source failure cannot be waived')
    w=copy.deepcopy(base);w['unclaimedSpeech']=[g for j,g in enumerate(base['unclaimedSpeech']) if j!=i]
    w['issues']=['unreliable-verse-boundary:'+str(n) for n in receipt['weakVerses']]+boundary_gap_issues(w['unclaimedSpeech'],w['cues'])
    inner=copy.deepcopy(receipt);inner['schemaVersion']=4;inner['finalCues'][-1]=copy.deepcopy(old);inner['cuts']=[c for c in receipt['cuts'] if c['verse']!=v]
    for a in inner['gapAssignments']:
        if a['index']==i:raise ValueError('The nonverbal source ending cannot masquerade as a verse word')
        if a['index']>i:a['index']-=1
    result=derive_source_window_case(w,inner,materials);manual=[c for c in receipt['cuts'] if c['verse']==v]
    if len(manual)!=1:raise ValueError('Only the fixed user ending may change the final source tail')
    c=manual[0];lo,hi=c['window'];a,b=c['protectedCore'];audit,_=_inputs(base,receipt,materials)
    if (c['side']!='tail' or c.get('measurementKind')!='user-natural-seam' or c['before']!=[old['start'],old['end']]
        or c['after']!=[final['start'],final['end']] or not all(finite(t) for t in [a,b])
        or not final['start']<=a<b<=final['end'] or b<max(y for _,y in audit['speechSegments'])/16000
        or type(lo) is not int or type(hi) is not int or not 160<=hi-lo<=640 or (hi-lo)%160
        or not 0<=lo<=round(final['end']*16000)<=hi<=audit['sampleCount']
        or any(not a<=w['start']<w['end']<=b for w in base['checks'][-1]['alignedWords'] if normalized(w.get('word','')))):
        raise ValueError('The accepted ending loses a complete original word or source measurement')
    result['cues'][-1]=copy.deepcopy(final)
    if result['cues']!=receipt['finalCues']:raise ValueError('Unregistered source cue change')
    result['unclaimedSpeech']=copy.deepcopy(base['unclaimedSpeech'])
    result['sourceBackgroundClosing']=dict(originalGapIndex=i,originalGap=copy.deepcopy(base['unclaimedSpeech'][i]),verse=v,
        sourceScriptureEnd=final['end'],backgroundSourceRange=[final['end'],base['duration']],humanDecision=receipt['humanDecision'])
    return result


def ending_source_measurements_match(base,receipt,materials,pcm):
    try:
        ending_source_role(base,receipt,materials);audit,saved=_inputs(base,receipt,materials)
        if len(pcm)!=audit['sampleCount']:return False
        actual=measure_absent_tail(pcm,saved['range'],saved['referenceRange'],audit['speechSegments'])
        return ending_tail_valid(actual) and same_source_measurements(saved,actual)
    except (KeyError,TypeError,ValueError,IndexError,StopIteration):return False
