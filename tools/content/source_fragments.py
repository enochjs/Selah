"""Source-ID evidence and original PCM for a missing terminal imported fragment."""
import copy,hashlib,math
from datetime import datetime
from timed_text import normalized
from quiet_gaps import GAP_POLICY,digest,rms
from verse_completion import _Fragments

FRAGMENT_POLICY={'version':'official-niv-terminal-fragment-absence-v1','scope':'john:7:en',
 'sourceVerse':52,'followingSourceVerse':53,'sampleRate':16000,'frameSamples':320,
 'maximumRms':.03,'relativeRms':.25,'vadPolicy':GAP_POLICY,'canonicalText':'preserved',
 'status':'partial','coverage':'all-narrated-verse-body-plus-no-voice-in-remaining-source-tail'}


def fragment_references(key,canonical,evidence):
    if key!=FRAGMENT_POLICY['scope'] or [v['number'] for v in canonical]!=list(range(1,53)):raise ValueError('Unsupported terminal fragment source')
    raw=evidence['rawHtml'];date=datetime.fromisoformat(evidence['fetchedAt'])
    if (evidence['key']!=key or evidence['edition']!='NIV' or evidence['url']!='https://www.biblegateway.com/passage/?search=John%207&version=NIV'
        or date.tzinfo is None or hashlib.sha256(raw.encode()).hexdigest()!=evidence['sha256']):raise ValueError('Official HTTP source identity differs')
    parser=_Fragments('John',7);parser.feed(raw);parser.result(list(range(1,54)))
    body=' '.join(parser.fragments.get(52,[]));full=canonical[-1]['text']
    if not body or not full.startswith(body) or not full[len(body):].strip():raise ValueError('No proven merged terminal source fragment')
    suffix=full[len(body):].strip();parts=parser.fragments.get(53,[])
    if len([p for p in parts if normalized(p)==normalized(suffix)])!=1:raise ValueError('Terminal text does not belong to the following official source verse')
    refs=copy.deepcopy(canonical);refs[-1]['text']=body
    return refs,[{'verse':52,'text':suffix,'reason':'not-narrated-in-source'}]


def fragment_witness(a):
    from alignment_contract import CASE_REVIEW_RECIPE,SOURCE_EDGE_RECIPE,BOUNDARY_RECOGNIZER,site_fingerprint
    from partial_audio import source_text_sha
    r=a['sourceFragmentReview'];canonical=a['boundarySourceVerses'];refs,missing=fragment_references(a['key'],canonical,r['evidence'])
    if (r['policy']!=FRAGMENT_POLICY or a.get('missingVerses') or a.get('confirmedCoverage') is not None
        or a['missingFragments']!=missing or source_text_sha(canonical)!=a['textSha256'] or r['canonicalTextSha256']!=a['textSha256']
        or r['baseRecipe'] not in [CASE_REVIEW_RECIPE,SOURCE_EDGE_RECIPE]):raise ValueError('Unproven source fragment or canonical identity')
    sha=source_text_sha(refs);fp=site_fingerprint(a['sourceAudioSha256'],sha,'en',r['baseRecipe'],BOUNDARY_RECOGNIZER)
    if r['baseFingerprint']!=fp:raise ValueError('Narrated source reference identity differs')
    b=copy.deepcopy({k:v for k,v in a.items() if k not in ['sourceFragmentReview','missingFragments']});b.update(qualityRecipe=r['baseRecipe'],fingerprint=fp,textSha256=sha,boundarySourceVerses=refs)
    for items in [b['cues'],b['checks']]:
        for c in items:
            if c['text']!=canonical[c['verse']-1]['text']:raise ValueError('Published text differs from canonical source')
            c['text']=refs[c['verse']-1]['text']
    return b


def _tail_geometry(a):
    r=a['sourceFragmentReview'];count=r['sampleCount'];sr=16000;previous=0
    if count!=round(a['duration']*sr):raise ValueError('Wrong source sample count')
    for x,y in r['speechSegments']:
        if type(x) is not int or type(y) is not int or not previous<=x<y<=count:raise ValueError('Invalid full-source speech clock')
        previous=y
    cue=a['cues'][-1];start=round(cue['end']*sr);end=count
    if cue['verse']!=52 or not 0<start<end:raise ValueError('Need the complete real final verse and source tail')
    words=[w for w in a['checks'][-1]['alignedWords'] if normalized(w['word'])]
    if not any(x<=(words[-1]['start']+words[-1]['end'])*sr/2<y<=start for x,y in r['speechSegments']):raise ValueError('Final narrated word has no complete original voice interval')
    if any(max(start,x)<min(end,y) for x,y in r['speechSegments']):raise ValueError('Actual tail speech remains; cannot claim missing narration')
    return [start,end],[round(cue['start']*sr),start]


def _tail_measure(a,pcm):
    bounds,reference=_tail_geometry(a);lo,hi=bounds;frame=FRAGMENT_POLICY['frameSamples']
    return {'range':bounds,'referenceRange':reference,'referenceRms':rms(pcm,*reference),
      'frameRms':[rms(pcm,x,min(hi,x+frame)) for x in range(lo,hi,frame)]}


def verified_fragment_artifact(a):
    try:
        from alignment_contract import FRAGMENT_RECIPE
        from boundary_quality import verified_boundary_artifact,finite
        r=a['sourceFragmentReview']
        if (a['qualityRecipe']!=FRAGMENT_RECIPE or r['sourceAudioSha256']!=a['sourceAudioSha256']
            or r['id']!=digest({k:v for k,v in r.items() if k!='id'}) or not verified_boundary_artifact(fragment_witness(a))):return False
        bounds,reference=_tail_geometry(a);p=r['tail'];ref=p['referenceRms'];frames=p['frameRms'];limit=min(FRAGMENT_POLICY['maximumRms'],ref*FRAGMENT_POLICY['relativeRms'])
        return (p['range']==bounds and p['referenceRange']==reference and finite(ref) and 0<ref<=1
            and len(frames)==math.ceil((bounds[1]-bounds[0])/FRAGMENT_POLICY['frameSamples'])
            and all(finite(v) and 0<=v<=limit for v in frames))
    except (KeyError,TypeError,ValueError,IndexError,ZeroDivisionError):return False


def fragment_measurements_match(a,pcm):
    if not verified_fragment_artifact(a) or len(pcm)!=a['sourceFragmentReview']['sampleCount']:return False
    try:
        measured=_tail_measure(a,pcm);saved=a['sourceFragmentReview']['tail'];limit=min(FRAGMENT_POLICY['maximumRms'],measured['referenceRms']*FRAGMENT_POLICY['relativeRms'])
        return (abs(measured['referenceRms']-saved['referenceRms'])<=1/32768 and all(v<=limit and abs(v-w)<=1/32768 for v,w in zip(measured['frameRms'],saved['frameRms'])))
    except (KeyError,TypeError,ValueError,IndexError,ZeroDivisionError):return False


def verify_fragment_media(a,path):
    from media_assets import file_matches
    from gap_review import decode_pcm
    from alignment_contract import SOURCE_EDGE_RECIPE
    from source_edges import verify_source_edge_media
    from case_evidence import verify_case_media
    if not verified_fragment_artifact(a) or not file_matches(path,a['sourceAudioSha256']):return False
    b=fragment_witness(a);valid=verify_source_edge_media(b,path) if b['qualityRecipe']==SOURCE_EDGE_RECIPE else verify_case_media(b,path)
    return valid and fragment_measurements_match(a,decode_pcm(path))


def wrap_source_fragments(canonical,inner,evidence,pcm,speech):
    from partial_audio import source_text_sha
    from alignment_contract import FRAGMENT_RECIPE,BOUNDARY_RECOGNIZER,site_fingerprint
    from boundary_quality import verified_boundary_artifact
    refs,missing=fragment_references(inner['key'],canonical,evidence)
    if refs!=inner['boundarySourceVerses'] or not verified_boundary_artifact(inner):raise ValueError('Incomplete narrated source boundary proof')
    a=copy.deepcopy(inner);sha=source_text_sha(canonical);r={'policy':FRAGMENT_POLICY,'canonicalTextSha256':sha,'evidence':copy.deepcopy(evidence),
        'baseRecipe':inner['qualityRecipe'],'baseFingerprint':inner['fingerprint'],'sourceAudioSha256':inner['sourceAudioSha256'],'sampleCount':len(pcm),'speechSegments':copy.deepcopy(speech)}
    a.update(sourceFragmentReview=r,missingFragments=missing,qualityRecipe=FRAGMENT_RECIPE,boundarySourceVerses=copy.deepcopy(canonical),textSha256=sha,
       fingerprint=site_fingerprint(inner['sourceAudioSha256'],sha,'en',FRAGMENT_RECIPE,BOUNDARY_RECOGNIZER))
    for items in [a['cues'],a['checks']]:
        for c in items:c['text']=canonical[c['verse']-1]['text']
    r['tail']=_tail_measure(a,pcm);r['id']=digest(r)
    if not verified_fragment_artifact(a) or not fragment_measurements_match(a,pcm):raise ValueError('Original source missing-fragment evidence did not verify')
    return a
