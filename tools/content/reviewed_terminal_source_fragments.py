"""The Haggai year clause is read in chapter two, not chapter one's tail."""
import copy,hashlib
from boundary_quality import finite
from quiet_gaps import GAP_POLICY,digest,same_source_measurements
from reviewed_partial_sources import _material
from reviewed_absent_fragments import absent_tail_valid,measure_absent_tail
from timed_text import normalized

REVIEWED_TERMINAL_SOURCE_FRAGMENT_POLICY={
    'version':'registered-haggai-next-chapter-source-clause-v1',
    'scope':'haggai:1:en; exact-verse15-terminal-year-clause',
    'canonical':'complete-imported-text-retained-with-not-narrated-in-this-source-fragment',
    'source':'full-narrated-prefix-CTC-and-original-VAD-clear-bounded-source-tail',
    'companion':'exact-year-clause-in-unchanged-haggai2-original-recognition-before-verse1',
    'otherVerses':'all-original-model-and-joint-proofs-reverified',
    'outputs':'registered-complete-source-MP3-and-VTT-inventory',
}


def terminal_fragment_inputs(base,receipt,materials):
    prefix='on the twenty-fourth day of the sixth month.';suffix=' In the second year of King Darius,'
    return fixed_terminal_fragment_inputs(base,receipt,materials,31,'haggai:1:en','haggai:2:en',15,prefix,suffix)


def fixed_terminal_fragment_inputs(base,receipt,materials,schema,key,companion_key,verse,prefix,suffix):
    if (receipt['schemaVersion']!=schema or base['key']!=key or base.get('accepted') is not False
        or base['issues']!=['unreliable-verse-boundary:'+str(verse)] or digest(base)!=receipt['baseEvidenceSha256']
        or _material(receipt,materials,receipt['baseReportFile'])!=base
        or receipt['fragment']!=dict(verse=verse,narratedText=prefix,missingText=suffix)
        or [v['number'] for v in base['boundarySourceVerses']]!=list(range(1,verse+1))
        or base['boundarySourceVerses'][-1]['text']!=prefix+suffix):
        raise ValueError('Need the exact original Haggai terminal year clause')
    raw=next(m['utf8'] for m in materials if m['file']==receipt['baseReportFile']);sha=hashlib.sha256(raw.encode()).hexdigest()
    t=_material(receipt,materials,receipt['targetModelFile']);a=_material(receipt,materials,receipt['sourceAuditFile']);c=t['check']
    if (t['key']!=base['key'] or t['sourceAudioSha256']!=base['sourceAudioSha256'] or t['sourceReportSha256']!=sha
        or t['canonicalText']!=prefix+suffix or t['narratedReference']!=prefix or t['missingFragment']!=suffix
        or c['verse']!=verse or c['text']!=prefix or c['spokenText']!=prefix or c['boundaryVerified'] is not True
        or a['key']!=base['key'] or a['sourceAudioSha256']!=base['sourceAudioSha256'] or a['sourceReportSha256']!=sha
        or a['sampleCount']!=round(base['duration']*16000) or a['vadModelSha256']!=GAP_POLICY['vadModelSha256']):
        raise ValueError('The narrated prefix or original source VAD changed')
    previous=0
    for x,y in a['speechSegments']:
        if type(x) is not int or type(y) is not int or not previous<=x<y<=a['sampleCount']:
            raise ValueError('Invalid original terminal source VAD')
        previous=y
    other=_material(receipt,materials,receipt['companionReportFile'])
    if other['key']!=companion_key or other.get('accepted') is not True:
        raise ValueError('The companion chapter is not the unchanged verified source')
    words=[w for seg in other['recognition'] for w in seg.get('words',[])];tokens=[normalized(w) for w in suffix.split()];matches=[]
    for i in range(len(words)-len(tokens)+1):
        part=words[i:i+len(tokens)]
        if [normalized(w.get('word','')) for w in part]!=tokens:continue
        end=0
        for w in part:
            if (not all(finite(w.get(k)) for k in ['start','end','probability']) or not .85<=w['probability']<=1
                or not end<=w['start']<w['end']<=other['cues'][0]['start']):break
            end=w['end']
        else:matches.append(part)
    if len(matches)!=1:raise ValueError('The exact year clause is not independently located before next chapter verse one')
    refs=copy.deepcopy(base['boundarySourceVerses']);refs[-1]['text']=prefix
    return refs,[dict(verse=verse,text=suffix,reason='not-narrated-in-source')],c,a


def derive_terminal_source_fragment_case(base,receipt,materials):
    return derive_terminal_fragment_with_inputs(base,receipt,materials,terminal_fragment_inputs,15)


def derive_terminal_fragment_with_inputs(base,receipt,materials,input_reader,verse,tail_validator=absent_tail_valid):
    from alignment_contract import BOUNDARY_RECOGNIZER,site_fingerprint
    from partial_audio import source_text_sha
    from reviewed_source_windows import derive_source_window_case
    refs,missing,target,audit=input_reader(base,receipt,materials)
    if receipt['weakVerses']!=[verse] or receipt['failureReasons']!=[dict(verse=verse,reasons=base['checks'][-1]['boundaryEvidence']['reasons'])]:
        raise ValueError('An unrelated source failure cannot be waived')
    model=_material(receipt,materials,receipt['targetModelFile']);w=copy.deepcopy(base);sha=source_text_sha(refs)
    w.update(boundarySourceVerses=refs,textSha256=sha,fingerprint=site_fingerprint(base['sourceAudioSha256'],sha,'en',base['qualityRecipe'],BOUNDARY_RECOGNIZER),issues=[])
    w['checks'][-1]=copy.deepcopy(target);w['cues'].append(copy.deepcopy(model['cue']))
    inner=copy.deepcopy(receipt);inner.update(schemaVersion=10,weakVerses=[],failureReasons=[])
    for c in inner['finalCues']:
        if c['text']!=base['boundarySourceVerses'][c['verse']-1]['text']:raise ValueError('Canonical source text changed')
        c['text']=refs[c['verse']-1]['text']
    result=derive_source_window_case(w,inner,materials);last=receipt['finalCues'][-1];tail=_material(receipt,materials,receipt['tailEvidenceFile'])
    if (tail['range']!=[round(last['end']*16000),audit['sampleCount']] or tail['referenceRange']!=[round(last['start']*16000),round(last['end']*16000)]
        or not tail_validator(tail) or any(max(tail['range'][0],x)<min(tail['range'][1],y) for x,y in audit['speechSegments'])):
        raise ValueError('Actual source speech remains in the supposedly unspoken terminal clause')
    result.update(boundarySourceVerses=copy.deepcopy(base['boundarySourceVerses']),textSha256=base['textSha256'],fingerprint=base['fingerprint'],missingFragments=missing,cues=copy.deepcopy(receipt['finalCues']))
    result['checks'][-1]['text']=base['boundarySourceVerses'][-1]['text']
    return result


def terminal_source_measurements_match(base,receipt,materials,pcm,input_reader=terminal_fragment_inputs,tail_validator=absent_tail_valid):
    try:
        _,_,_,audit=input_reader(base,receipt,materials);saved=_material(receipt,materials,receipt['tailEvidenceFile'])
        if len(pcm)!=audit['sampleCount']:return False
        actual=measure_absent_tail(pcm,saved['range'],saved['referenceRange'],audit['speechSegments'])
        return tail_validator(actual) and same_source_measurements(saved,actual)
    except (KeyError,TypeError,ValueError,IndexError,StopIteration):return False
