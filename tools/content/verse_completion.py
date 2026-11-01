"""Source-bound reading references for table continuations absent from site JSON.

Canonical Scripture remains unchanged. Repeated official NIV verse IDs, rather
than ASR wording, establish which continuation belongs to each truncated heading.
"""
import copy
import hashlib
import re
from datetime import datetime
from urllib.parse import quote
from source_omissions import _NivBodyParser
from timed_text import normalized

COMPLETION_POLICY={'version':'same-niv-table-continuation-reference-v1','edition':'NIV',
 'source':'https://www.biblegateway.com/passage/','scope':'colon-heading-matching-first-fragment-and-repeated-same-verse-id',
 'canonicalText':'preserved','footnotes':'excluded-by-official-niv-body-parser-v1'}
_BOOKS={'ezra':('Ezra','Ezra',10),'nehemiah':('Nehemiah','Neh',13),'1-chronicles':('1 Chronicles','1Chr',29)}


class _Fragments(_NivBodyParser):
    def __init__(self,book,chapter):
        super().__init__(book,chapter);self.fragments={}

    def handle_endtag(self,tag):
        frame=next((f for f in reversed(self.stack) if f['tag']==tag),None)
        refs=frame['references'] if frame else []
        text=re.sub(r'\s+',' ',''.join(frame['text'])).strip() if frame and refs else ''
        if len(refs)>1:raise ValueError('A continuation cannot belong to multiple verses')
        super().handle_endtag(tag)
        if text:self.fragments.setdefault(refs[0],[]).append(text)


def completion_references(key,verses,evidence):
    book,value,locale=key.split(':');chapter=int(value)
    if locale!='en' or book not in _BOOKS or not 1<=chapter<=_BOOKS[book][2]:raise ValueError('Unsupported source completion chapter')
    search,body,_=_BOOKS[book];url='https://www.biblegateway.com/passage/?search='+quote(f'{search} {chapter}')+'&version=NIV'
    raw=evidence['rawHtml'];date=datetime.fromisoformat(evidence['fetchedAt'])
    if (evidence['key']!=key or evidence['edition']!='NIV' or evidence['url']!=url or date.tzinfo is None
        or hashlib.sha256(raw.encode()).hexdigest()!=evidence['sha256']):raise ValueError('Official NIV HTTP snapshot identity differs')
    numbers=[v['number'] for v in verses]
    if numbers!=list(range(1,len(verses)+1)):raise ValueError('Need the complete ordered canonical chapter')
    parser=_Fragments(body,chapter);parser.feed(raw);parser.result(numbers)
    result=copy.deepcopy(verses)
    for v in result:
        parts=parser.fragments.get(v['number'],[])
        if len(parts)>1 and v['text'].rstrip().endswith(':') and normalized(parts[0])==normalized(v['text']):
            v['text']=' '.join(parts)
    return result


def completion_witness(a):
    from alignment_contract import CASE_REVIEW_RECIPE,SOURCE_EDGE_RECIPE,GAP_EDGE_RECIPE,BOUNDARY_RECOGNIZER,site_fingerprint
    from partial_audio import source_text_sha
    r=a['referenceCompletionReview'];canonical=a['boundarySourceVerses']
    if r['policy']!=COMPLETION_POLICY or a.get('missingVerses') or a.get('confirmedCoverage') is not None:raise ValueError('Unsupported completion identity or partial coverage')
    sha=source_text_sha(canonical)
    if sha!=a['textSha256'] or r['canonicalTextSha256']!=sha:raise ValueError('Canonical reading text changed')
    refs=completion_references(a['key'],canonical,r['evidence']);changed=[v['number'] for v,old in zip(refs,canonical) if v!=old]
    if not changed or changed!=r['completedVerses']:raise ValueError('Unproven or missing table continuations')
    if r['baseRecipe'] not in [CASE_REVIEW_RECIPE,SOURCE_EDGE_RECIPE,GAP_EDGE_RECIPE]:raise ValueError('Unsupported complete boundary witness')
    full_sha=source_text_sha(refs);expected=site_fingerprint(a['sourceAudioSha256'],full_sha,'en',r['baseRecipe'],BOUNDARY_RECOGNIZER)
    if r['baseFingerprint']!=expected:raise ValueError('Full reference proof identity differs')
    original={v['number']:v['text'] for v in canonical};full={v['number']:v['text'] for v in refs}
    b=copy.deepcopy({k:v for k,v in a.items() if k!='referenceCompletionReview'})
    b.update(qualityRecipe=r['baseRecipe'],fingerprint=expected,textSha256=full_sha,boundarySourceVerses=refs)
    for items in [b['cues'],b['checks']]:
        for item in items:
            number=item['verse']
            if item['text']!=original[number]:raise ValueError('Published text differs from canonical verse')
            item['text']=full[number]
    return b


def verified_completion_artifact(a):
    try:
        from alignment_contract import COMPLETION_RECIPE
        from boundary_quality import verified_boundary_artifact
        return a['qualityRecipe']==COMPLETION_RECIPE and verified_boundary_artifact(completion_witness(a))
    except (KeyError,TypeError,ValueError,IndexError,ZeroDivisionError,UnicodeError):return False


def verify_completion_media(a,path):
    try:
        from alignment_contract import SOURCE_EDGE_RECIPE,GAP_EDGE_RECIPE
        from case_evidence import verify_case_media
        from source_edges import verify_source_edge_media
        from gap_edges import verify_gap_edge_media
        if not verified_completion_artifact(a):return False
        b=completion_witness(a)
        if b['qualityRecipe']==GAP_EDGE_RECIPE:return verify_gap_edge_media(b,path)
        return verify_source_edge_media(b,path) if b['qualityRecipe']==SOURCE_EDGE_RECIPE else verify_case_media(b,path)
    except (KeyError,TypeError,ValueError,IndexError,ZeroDivisionError,UnicodeError):return False


def wrap_completion(canonical,inner,evidence):
    from alignment_contract import COMPLETION_RECIPE,site_fingerprint,BOUNDARY_RECOGNIZER
    from boundary_quality import verified_boundary_artifact
    from partial_audio import source_text_sha
    expected=completion_references(inner['key'],canonical,evidence)
    if inner['boundarySourceVerses']!=expected or not verified_boundary_artifact(inner):raise ValueError('Full reference boundary proof is incomplete')
    a=copy.deepcopy(inner);old={v['number']:v['text'] for v in canonical};sha=source_text_sha(canonical)
    r={'policy':COMPLETION_POLICY,'canonicalTextSha256':sha,'evidence':copy.deepcopy(evidence),
       'baseRecipe':inner['qualityRecipe'],'baseFingerprint':inner['fingerprint'],
       'completedVerses':[v['number'] for v,source in zip(expected,canonical) if v!=source]}
    a.update(referenceCompletionReview=r,qualityRecipe=COMPLETION_RECIPE,boundarySourceVerses=copy.deepcopy(canonical),textSha256=sha)
    for items in [a['checks'],a['cues']]:
        for item in items:item['text']=old[item['verse']]
    a['fingerprint']=site_fingerprint(a['sourceAudioSha256'],sha,'en',COMPLETION_RECIPE,a.get('recognizer',BOUNDARY_RECOGNIZER))
    if not verified_completion_artifact(a):raise ValueError('Canonical source/reference witness did not verify')
    return a
