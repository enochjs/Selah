"""Skip an imported editorial placeholder only after proving all NIV text is kept."""
import copy
import hashlib
import math

from boundary_quality import finite
from quiet_gaps import GAP_POLICY,digest
from reviewed_absent_fragments import measure_absent_tail
from reviewed_partial_sources import _material
from reviewed_source_windows import derive_source_window_case
from source_omissions import validate_niv_evidence
from timed_text import normalized
from verse_completion import _Fragments

REVIEWED_PLACEHOLDER_POLICY={
    'version':'registered-niv-merged-body-imported-editorial-placeholder-v1',
    'scope':'3-john:1:en; exact-imported-verse15-English-editorial-placeholder',
    'scripture':'official-NIV-verses14-and15-must-both-be-complete-in-imported-row14',
    'missingRole':'unspoken-imported-editorial-row; never-official-NIV-verse-absence',
    'canonicalText':'unchanged; all-real-imported-verse-model-checks-retained',
    'source':'exact-original-full-source-VAD-and-no-independent-words-in-the-ending',
    'ending':'bounded-book-ending-music-is-not-claimed-silent',
    'maximumEndingRms':.1,'relativeEndingRms':.75,'frameSamples':320,
    'outputs':'all-fourteen-real-imported-rows; no-fabricated-placeholder-cue-or-audio',
}
PLACEHOLDER='Note: no this verse in english bible version.'


def placeholder_reference(key,canonical,evidence):
    if (key!='3-john:1:en' or [v['number'] for v in canonical]!=list(range(1,16))
            or canonical[-1]['text']!=PLACEHOLDER or not validate_niv_evidence(evidence,key,canonical)):
        raise ValueError('Need the exact imported 3John editorial placeholder and original NIV reference')
    parser=_Fragments('3John',1);parser.feed(evidence['rawHtml']);parser.result(list(range(1,16)))
    first=' '.join(parser.fragments.get(14,[]));second=' '.join(parser.fragments.get(15,[]))
    if not first or not second or normalized(first+second)!=normalized(canonical[13]['text']):
        raise ValueError('Actual NIV verse15 is not completely retained in imported row14')
    missing=[dict(verse=15,reason='not-narrated-in-source')]
    mapping=dict(officialBook='3-john',officialChapter=1,officialVerses=[14,15],narratedImportedVerse=14,
        placeholderImportedVerse=15,placeholderText=PLACEHOLDER,kind='site-editorial-placeholder')
    return copy.deepcopy(canonical[:-1]),missing,mapping


def ending_tail_valid(p):
    lo,hi=p['range'];ref=p['referenceRms'];frames=p['frameRms']
    return (finite(ref) and 0<ref<=1 and len(frames)==math.ceil((hi-lo)/320)
        and all(finite(v) and 0<=v<=min(.1,ref*.75) for v in frames))


def _inputs(base,receipt,materials):
    if (receipt['schemaVersion']!=18 or base['key']!='3-john:1:en' or base.get('accepted') is not False
            or base['issues']!=['unreliable-verse-boundary:15'] or digest(base)!=receipt['baseEvidenceSha256']
            or _material(receipt,materials,receipt['baseReportFile'])!=base):
        raise ValueError('Need the complete original rejected placeholder chapter')
    refs,missing,mapping=placeholder_reference(base['key'],base['boundarySourceVerses'],_material(receipt,materials,receipt['nivReferenceFile']))
    raw=next(m['utf8'] for m in materials if m['file']==receipt['baseReportFile']);audit=_material(receipt,materials,receipt['sourceAuditFile'])
    if (audit['key']!=base['key'] or audit['sourceAudioSha256']!=base['sourceAudioSha256']
            or audit['sourceReportSha256']!=hashlib.sha256(raw.encode()).hexdigest()
            or audit['sampleCount']!=round(base['duration']*16000) or audit['vadModelSha256']!=GAP_POLICY['vadModelSha256']):
        raise ValueError('Placeholder source VAD is not bound to the original rejected report')
    previous=0
    for x,y in audit['speechSegments']:
        if type(x) is not int or type(y) is not int or not previous<=x<y<=audit['sampleCount']:raise ValueError('Invalid original source VAD')
        previous=y
    return refs,missing,mapping,audit


def derive_placeholder_case(base,receipt,materials):
    from alignment_contract import BOUNDARY_REVIEW_RECIPE,BOUNDARY_CONTEXT_RECIPES,BOUNDARY_RECOGNIZER,site_fingerprint
    from partial_audio import source_text_sha
    refs,missing,mapping,audit=_inputs(base,receipt,materials)
    if (base['qualityRecipe'] not in {BOUNDARY_REVIEW_RECIPE,*BOUNDARY_CONTEXT_RECIPES}
            or base.get('jointAlignments') or any(c.get('jointProofId') for c in base['checks'])
            or any(k in base for k in ['confirmedCoverage','missingVerses','missingFragments','reviewedWeakReview'])
            or base['textSha256']!=source_text_sha(base['boundarySourceVerses'])
            or base['expectedVerseNumbers']!=list(range(1,16)) or [c['verse'] for c in base['checks']]!=list(range(1,16))
            or [c['verse'] for c in base['cues']]!=list(range(1,15))):
        raise ValueError('The original real-verse model inventory changed')
    # This exact ordinal is the book label at the source start, not scripture.
    header=receipt['bookTitleGap'];gaps=base['unclaimedSpeech']
    if (len(gaps)!=1 or header['index']!=0 or header['gapSha256']!=digest(gaps[0])
            or gaps[0]['kind']!='leading' or normalized(gaps[0]['text'])!='3'
            or not 0<=gaps[0]['start']<gaps[0]['end']<=base['cues'][0]['start']):
        raise ValueError('Only the original numbered-book title may stay before verse1')
    if (len(receipt['cuts'])!=1 or receipt['cuts'][0]['verse']!=14 or receipt['cuts'][0]['side']!='tail'
            or receipt['weakVerses'] or receipt['failureReasons'] or receipt['gapAssignments']):
        raise ValueError('Only complete real final-verse source padding may change')
    witness=copy.deepcopy(base);witness.pop('boundaryContextReview',None)
    witness.update(boundarySourceVerses=refs,textSha256=source_text_sha(refs),expectedVerseNumbers=list(range(1,15)),
        checks=copy.deepcopy(base['checks'][:-1]),unclaimedSpeech=[],qualityRecipe=BOUNDARY_REVIEW_RECIPE,issues=[])
    witness['fingerprint']=site_fingerprint(base['sourceAudioSha256'],witness['textSha256'],'en',BOUNDARY_REVIEW_RECIPE,BOUNDARY_RECOGNIZER)
    recovered=derive_source_window_case(witness,{**receipt,'schemaVersion':10},materials)
    tail=_material(receipt,materials,receipt['tailEvidenceFile']);last=receipt['finalCues'][-1]
    bounds=[round(last['end']*16000),audit['sampleCount']];ref=[round(last['start']*16000),bounds[0]]
    if (tail['range']!=bounds or tail['referenceRange']!=ref or not ending_tail_valid(tail)
            or any(max(bounds[0],x)<min(bounds[1],y) for x,y in audit['speechSegments'])
            or any(normalized(w.get('word','')) and w.get('start',0)>=last['end'] for seg in base['recognition'] for w in seg.get('words',[]))):
        raise ValueError('The source ending still contains unassigned spoken content')
    roles=dict(key=base['key'],sourceTextSha256=base['textSha256'],missingVerses=missing,aliases=[])
    coverage=dict(policy=REVIEWED_PLACEHOLDER_POLICY,roles=roles,officialVerseMapping=mapping,
        sourceAudioSha256=base['sourceAudioSha256'],sourceAuditSha256=next(e['sha256'] for e in receipt['evidence'] if e['file']==receipt['sourceAuditFile']))
    result=copy.deepcopy(base);result.update(accepted=True,issues=[],cues=copy.deepcopy(recovered['cues']),checks=copy.deepcopy(base['checks'][:-1]),
        missingVerses=missing,confirmedCoverage=coverage,sourceEditorialPlaceholders=[mapping])
    return result


def placeholder_measurements_match(base,receipt,materials,pcm):
    try:
        _,_,_,audit=_inputs(base,receipt,materials);saved=_material(receipt,materials,receipt['tailEvidenceFile'])
        if len(pcm)!=audit['sampleCount']:return False
        actual=measure_absent_tail(pcm,saved['range'],saved['referenceRange'],audit['speechSegments'])
        return (ending_tail_valid(actual) and abs(actual['referenceRms']-saved['referenceRms'])<=1/32768
            and len(actual['frameRms'])==len(saved['frameRms']) and all(abs(x-y)<=1/32768 for x,y in zip(actual['frameRms'],saved['frameRms'])))
    except (KeyError,TypeError,ValueError,IndexError):return False
