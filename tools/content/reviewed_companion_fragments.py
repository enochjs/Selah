"""Both actual chapter sources establish Hosea's displaced terminal clause."""
import copy,hashlib
from boundary_quality import finite,verse_boundary
from quiet_gaps import GAP_POLICY,digest
from reviewed_partial_sources import _material
from reviewed_terminal_source_fragments import derive_terminal_fragment_with_inputs,terminal_source_measurements_match
from reviewed_source_placeholders import ending_tail_valid
from timed_text import normalized

REVIEWED_COMPANION_FRAGMENT_POLICY={
    'version':'registered-hosea-both-source-models-terminal-clause-v1',
    'scope':'hosea:6:en; exact-verse11-terminal-clause-read-before-hosea7-verse1',
    'canonical':'full-imported-text-preserved-with-explicit-not-narrated-in-this-source-fragment',
    'primary':'complete-narrated-prefix-model-and-no-original-source-VAD-in-bounded-remaining-tail',
    'companion':'complete-independent-ASR-clause-and-full-source-CTC-before-next-chapter-verse1',
    'scores':'companion-ASR-spelling-confidence-is-diagnostic; complete-CTC-edge-proof-required',
    'original':'both-source-hashes-reports-models-and-original-canonical-text-retained',
    'ending':'exact-user-confirmed-scripture-end; no-original-VAD-after-cut; bounded-remeasured-background',
    'maximumEndingRms':.1,'relativeEndingRms':.75,
}


def companion_fragment_inputs(base,receipt,materials):
    prefix='“Also for you, Judah, a harvest is appointed.';suffix=' “Whenever I would restore the fortunes of my people,'
    if (receipt['schemaVersion']!=34 or base['key']!='hosea:6:en' or base.get('accepted') is not False
        or base['issues']!=['unreliable-verse-boundary:11'] or digest(base)!=receipt['baseEvidenceSha256']
        or _material(receipt,materials,receipt['baseReportFile'])!=base
        or receipt['fragment']!=dict(verse=11,narratedText=prefix,missingText=suffix)
        or [v['number'] for v in base['boundarySourceVerses']]!=list(range(1,12))
        or base['boundarySourceVerses'][-1]['text']!=prefix+suffix):
        raise ValueError('Need the exact original Hosea terminal clause')
    if (receipt['approvedBy']!='user-confirmed-companion-source-clause' or receipt['sourceAcousticApproval'] is not False
        or not isinstance(receipt['humanDecision'],str) or not receipt['humanDecision'].strip()):
        raise ValueError('Need the exact source ending and explicit human background-only decision')
    raw=next(m['utf8'] for m in materials if m['file']==receipt['baseReportFile']);sha=hashlib.sha256(raw.encode()).hexdigest()
    t=_material(receipt,materials,receipt['targetModelFile']);a=_material(receipt,materials,receipt['sourceAuditFile']);c=t['check']
    if (t['key']!=base['key'] or t['sourceAudioSha256']!=base['sourceAudioSha256'] or t['sourceReportSha256']!=sha
        or t['canonicalText']!=prefix+suffix or t['narratedReference']!=prefix or t['missingFragment']!=suffix
        or c['verse']!=11 or c['text']!=prefix or c['spokenText']!=prefix or c['boundaryVerified'] is not True
        or c['asrEdgeAnchors']!=base['checks'][-1]['asrEdgeAnchors']
        or a['key']!=base['key'] or a['sourceAudioSha256']!=base['sourceAudioSha256'] or a['sourceReportSha256']!=sha
        or a['sampleCount']!=round(base['duration']*16000) or a['vadModelSha256']!=GAP_POLICY['vadModelSha256']):
        raise ValueError('The complete primary prefix model or original source VAD changed')
    previous=0
    for x,y in a['speechSegments']:
        if type(x) is not int or type(y) is not int or not previous<=x<y<=a['sampleCount']:raise ValueError('Invalid original source VAD')
        previous=y
    other=_material(receipt,materials,receipt['companionReportFile']);model=_material(receipt,materials,receipt['companionModelFile'])
    other_raw=next(m['utf8'] for m in materials if m['file']==receipt['companionReportFile']);mc=model['check'];limit=other['cues'][0]['start']
    if (other['key']!='hosea:7:en' or other.get('accepted') is not True or model['key']!=other['key']
        or model['sourceAudioSha256']!=other['sourceAudioSha256'] or model['sourceReportSha256']!=hashlib.sha256(other_raw.encode()).hexdigest()
        or mc['verse']!=0 or normalized(mc['text'])!=normalized(suffix) or mc['spokenText']!=mc['text'] or mc['asrEdgeAnchors']!=[]):
        raise ValueError('Need the exact untouched companion source and separate complete clause model')
    edges,e=verse_boundary(mc['alignedWords'],mc['searchRange'],other['duration'],'en',reference=mc['text'],signal=mc['boundarySignal'])
    words=[w for w in mc['alignedWords'] if normalized(w.get('word',''))]
    if (edges is None or not mc['boundaryVerified'] or mc['boundaryEvidence']!=e or e['timedFraction']!=1
        or any(not 0<=w['start']<w['end']<=limit for w in words)):
        raise ValueError('The full companion clause model is weak, truncated, or inside verse one')
    tokens=[normalized(w) for w in suffix.split()];recognized=[w for seg in other['recognition'] for w in seg.get('words',[])];matches=[]
    for i in range(len(recognized)-len(tokens)+1):
        part=recognized[i:i+len(tokens)]
        if [normalized(w.get('word','')) for w in part]!=tokens:continue
        end=0
        for w in part:
            if (not all(finite(w.get(k)) for k in ['start','end','probability']) or not 0<=w['probability']<=1
                or not end<=w['start']<w['end']<=limit):break
            end=w['end']
        else:matches.append(part)
    if len(matches)!=1:raise ValueError('The full displaced clause is not independently recognized before the next chapter verse one')
    refs=copy.deepcopy(base['boundarySourceVerses']);refs[-1]['text']=prefix
    return refs,[dict(verse=11,text=suffix,reason='not-narrated-in-source')],c,a


def derive_companion_fragment_case(base,receipt,materials):
    return derive_terminal_fragment_with_inputs(base,receipt,materials,companion_fragment_inputs,11,ending_tail_valid)


def companion_fragment_measurements_match(base,receipt,materials,pcm):
    return terminal_source_measurements_match(base,receipt,materials,pcm,companion_fragment_inputs,ending_tail_valid)
