"""Registered source proof for the unspoken imported Matthew 6:13 doxology."""
import copy
import hashlib
import math

from boundary_quality import finite
from quiet_gaps import GAP_POLICY,digest,rms
from reviewed_partial_sources import _material
from reviewed_source_windows import derive_source_window_case
from source_omissions import validate_niv_evidence
from spoken_text import boundary_text
from timed_text import normalized
from verse_completion import _Fragments

REVIEWED_ABSENT_FRAGMENT_POLICY={
    'version':'registered-niv-absent-doxology-source-fragment-v1',
    'scope':'matthew:6:en; exact-imported-verse13-terminal-doxology-only',
    'canonicalText':'complete-imported-text-retained-with-explicit-missingFragments',
    'reference':'complete-official-NIV-body-proves-the-narrated-prefix',
    'model':'one-targeted-original-source-CTC-realignment; all-other-original-checks-retained',
    'source':'registered-complete-voice-cuts; no-VAD-speech-and-bounded-background-music-in-remaining-verse-slot',
    'sampleRate':16000,'frameSamples':320,'maximumRms':.03,'relativeRms':.5,
    'approval':'exact-source-controlled-receipt-and-complete-original-output-inventory',
}


def fragment_reference(key,canonical,evidence,part):
    if (key!='matthew:6:en' or part['verse']!=13 or not validate_niv_evidence(evidence,key,canonical)
            or [v['number'] for v in canonical]!=list(range(1,35))):
        raise ValueError('Need the complete original Matthew6 NIV source reference')
    prefix,suffix=part['narratedText'],part['missingText']
    expected='For Yours is the kingdom and the power and the glory forever. Amen.’'
    parser=_Fragments('Matt',6);parser.feed(evidence['rawHtml']);parser.result(list(range(1,35)))
    body=' '.join(parser.fragments.get(13,[]))
    if (not prefix or canonical[12]['text']!=prefix+suffix or normalized(suffix)!=normalized(expected)
            or normalized(body)!=normalized(prefix)):
        raise ValueError('The omitted fragment is not the exact registered imported doxology')
    refs=copy.deepcopy(canonical);refs[12]['text']=prefix
    return refs,[dict(verse=13,text=suffix,reason='not-narrated-in-source')]


def measure_absent_tail(pcm,bounds,reference,speech):
    lo,hi=bounds;x,y=reference
    if (any(type(t) is not int for t in [lo,hi,x,y]) or not 0<=x<y<=lo<hi<=len(pcm)
            or any(max(lo,a)<min(hi,b) for a,b in speech)):
        raise ValueError('Actual source voice remains in the claimed absent tail')
    return dict(range=bounds,referenceRange=reference,referenceRms=rms(pcm,x,y),
        frameRms=[rms(pcm,i,min(i+320,hi)) for i in range(lo,hi,320)])


def absent_tail_valid(proof):
    lo,hi=proof['range'];ref=proof['referenceRms'];frames=proof['frameRms']
    return (finite(ref) and 0<ref<=1 and len(frames)==math.ceil((hi-lo)/320)
        and all(finite(v) and 0<=v<=min(.03,ref*.5) for v in frames))


def _inputs(base,receipt,materials):
    if (receipt['schemaVersion']!=15 or base['key']!='matthew:6:en' or base.get('accepted') is not False
            or base['issues']!=['unreliable-verse-boundary:13'] or digest(base)!=receipt['baseEvidenceSha256']
            or _material(receipt,materials,receipt['baseReportFile'])!=base):
        raise ValueError('Need the exact original rejected doxology chapter')
    refs,missing=fragment_reference(base['key'],base['boundarySourceVerses'],
        _material(receipt,materials,receipt['nivReferenceFile']),receipt['fragment'])
    model=_material(receipt,materials,receipt['targetModelFile']);audit=_material(receipt,materials,receipt['sourceAuditFile'])
    base_raw=next(m['utf8'] for m in materials if m['file']==receipt['baseReportFile'])
    sha=hashlib.sha256(base_raw.encode()).hexdigest()
    if (model['key']!=base['key'] or model['sourceAudioSha256']!=base['sourceAudioSha256'] or model['sourceReportSha256']!=sha
            or model['canonicalText']!=base['boundarySourceVerses'][12]['text'] or model['narratedReference']!=refs[12]['text']
            or audit['key']!=base['key'] or audit['sourceAudioSha256']!=base['sourceAudioSha256']
            or audit['sourceReportSha256']!=sha or audit['sampleCount']!=round(base['duration']*16000)
            or audit['vadModelSha256']!=GAP_POLICY['vadModelSha256']):
        raise ValueError('Targeted model or source VAD differs from the complete original source')
    previous=0
    for x,y in audit['speechSegments']:
        if type(x) is not int or type(y) is not int or not previous<=x<y<=audit['sampleCount']:raise ValueError('Invalid original VAD order')
        previous=y
    c=model['check'];original=next(c for c in base['checks'] if c['verse']==13)
    if (c['verse']!=13 or c['text']!=refs[12]['text'] or c['spokenText']!=boundary_text(refs[12]['text'],'en')
            or c['asrEdgeAnchors']!=original['asrEdgeAnchors']):raise ValueError('Unproven targeted narrated reference')
    return refs,missing,c,audit


def derive_absent_fragment_case(base,receipt,materials):
    from alignment_contract import BOUNDARY_REVIEW_RECIPE,BOUNDARY_CONTEXT_RECIPES,BOUNDARY_RECOGNIZER,site_fingerprint
    from partial_audio import source_text_sha
    refs,missing,target,audit=_inputs(base,receipt,materials)
    if (base['qualityRecipe'] not in {BOUNDARY_REVIEW_RECIPE,*BOUNDARY_CONTEXT_RECIPES}
            or any(k in base for k in ['reviewedWeakReview','confirmedCoverage','missingVerses','missingFragments','numericAlignmentPolicy'])):
        raise ValueError('Unsupported original fragment model proof')
    final=receipt['finalCues'];original={c['verse']:c for c in base['cues']};checks={c['verse']:c for c in base['checks']};checks[13]=target
    if [c['verse'] for c in final]!=list(range(1,35)) or set(original)!=set(range(1,35))-{13}:
        raise ValueError('The complete chapter verse inventory changed')
    needed={(c['verse'],side) for c in final for side,f in [('head','start'),('tail','end')]
        if c['verse'] not in original or c[f]!=original[c['verse']][f]};seen=set()
    for cut in receipt['cuts']:
        v,side=cut['verse'],cut['side'];c=next(c for c in final if c['verse']==v);old=original.get(v);lo,hi=cut['window'];start,end=c['start'],c['end'];a,b=cut['ownVoice']
        if ((v,side) not in needed or (v,side) in seen or v not in {12,13} or (v==12 and side!='tail')
                or cut['before']!=([old['start'],old['end']] if old else None) or cut['after']!=[start,end]
                or not all(finite(t) for t in [start,end,a,b,cut['previousVoiceEnd'],cut['nextVoiceStart']])
                or not 0<=cut['previousVoiceEnd']<=start<=a<b<=end<=cut['nextVoiceStart']<=base['duration']
                or type(lo) is not int or type(hi) is not int or not 160<=hi-lo<=640 or (hi-lo)%160
                or not 0<=lo<hi<=audit['sampleCount'] or len(cut['referenceRanges'])!=2
                or any(type(x) is not int or type(y) is not int or not 0<=x<y<=audit['sampleCount'] for x,y in cut['referenceRanges'])
                or cut.get('measurementKind') is not None):raise ValueError('Invalid complete fragment voice protection')
        point=start if side=='head' else end
        if not lo<=point*16000<=hi:raise ValueError('Fragment cut leaves its quiet source window')
        if side=='head' and not cut['previousVoiceEnd']*16000<=lo<hi<=a*16000:raise ValueError('Fragment head crosses protected voice')
        if side=='tail' and not b*16000<=lo<hi<=cut['nextVoiceStart']*16000:raise ValueError('Fragment tail crosses protected voice')
        words=[w for w in checks[v]['alignedWords'] if normalized(w.get('word',''))]
        if not words or any(not a<=w['start']<w['end']<=b for w in words):raise ValueError('A complete narrated model word was lost')
        if any(x<start*16000<y or x<end*16000<y for x,y in audit['speechSegments']):raise ValueError('A fragment boundary cuts actual source speech')
        seen.add((v,side))
    if seen!=needed or not {(13,'head'),(13,'tail')}<=seen:raise ValueError('Every changed fragment edge needs its own source approval')
    # Source-window recovery rechecks adopted joint groups in their ORIGINAL
    # cue context before inserting the separately verified narrated prefix.
    witness=copy.deepcopy(base);witness.update(boundarySourceVerses=refs,textSha256=source_text_sha(refs))
    witness['fingerprint']=site_fingerprint(base['sourceAudioSha256'],witness['textSha256'],'en',base['qualityRecipe'],BOUNDARY_RECOGNIZER)
    witness['checks']=[copy.deepcopy(target) if c['verse']==13 else c for c in witness['checks']]
    inner=copy.deepcopy(receipt);inner.update(schemaVersion=4,weakVerses=[13],failureReasons=[dict(verse=13,reasons=target['boundaryEvidence']['reasons'])])
    for c in inner['finalCues']:
        if c['text']!=base['boundarySourceVerses'][c['verse']-1]['text']:raise ValueError('Canonical fragment text changed')
        c['text']=refs[c['verse']-1]['text']
    recovered=derive_source_window_case(witness,inner,materials)
    previous=0
    for c in final:
        if c['text']!=base['boundarySourceVerses'][c['verse']-1]['text'] or not previous<=c['start']<c['end']<=base['duration']:
            raise ValueError('Final fragment cues overlap or change canonical text')
        previous=c['end']
    tail=_material(receipt,materials,receipt['tailEvidenceFile']);c=next(c for c in final if c['verse']==13);n=next(c for c in final if c['verse']==14)
    bounds=[round(c['end']*16000),round(n['start']*16000)];reference=[round(c['start']*16000),bounds[0]]
    if (tail['range']!=bounds or tail['referenceRange']!=reference or not absent_tail_valid(tail)
            or any(max(bounds[0],x)<min(bounds[1],y) for x,y in audit['speechSegments'])):
        raise ValueError('The remaining verse slot still has unconfirmed voice')
    result=copy.deepcopy(base);result.update(accepted=True,issues=[],cues=copy.deepcopy(final),missingFragments=missing)
    result['checks']=copy.deepcopy(recovered['checks'])
    result['checks'][12].update(text=base['boundarySourceVerses'][12]['text'])
    return result


def absent_fragment_measurements_match(base,receipt,materials,pcm):
    try:
        _,_,_,audit=_inputs(base,receipt,materials);saved=_material(receipt,materials,receipt['tailEvidenceFile'])
        if len(pcm)!=audit['sampleCount']:return False
        actual=measure_absent_tail(pcm,saved['range'],saved['referenceRange'],audit['speechSegments'])
        return (absent_tail_valid(actual) and abs(actual['referenceRms']-saved['referenceRms'])<=1/32768
            and len(actual['frameRms'])==len(saved['frameRms']) and all(abs(x-y)<=1/32768 for x,y in zip(actual['frameRms'],saved['frameRms'])))
    except (KeyError,ValueError,TypeError,IndexError):return False
