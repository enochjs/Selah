"""Preserve canonical text while proving a source explanation read after its verse.

The exact source literal identifies the explanation; ASR cannot supply or remove
words. The reordered reference still requires the full acoustic verse proof.
"""
import copy

READING_ORDER_POLICY={'version':'source-explanation-after-own-verse-v1','canonicalText':'preserved',
 'scope':{'numbers:20:zh':{'verse':13,'literal':'（米利巴就是争闹的意思）','placement':'after-complete-own-verse'}},
 'wordCoverage':'complete-body-and-complete-explanation-in-one-real-verse',
 'provenance':'canonical-source-explanation-reordered-for-recorded-narration-only'}


def reading_references(key,verses):
    plan=READING_ORDER_POLICY['scope'].get(key)
    if plan is None:raise ValueError('No source-bound reading order for this chapter')
    result=copy.deepcopy(verses);matches=[v for v in result if v['number']==plan['verse']]
    if len(matches)!=1:raise ValueError('Missing or duplicate source verse')
    v=matches[0];literal=plan['literal']
    if v['text'].count(literal)!=1:raise ValueError('Source explanation differs')
    before,after=v['text'].split(literal)
    if not before.strip() or not after.strip():raise ValueError('Expected an interior source explanation')
    v['text']=before+after+literal[1:-1]
    return result


def reading_order_witness(a):
    from partial_audio import source_text_sha
    from alignment_contract import CASE_REVIEW_RECIPE,SOURCE_EDGE_RECIPE,BOUNDARY_RECOGNIZER,site_fingerprint
    r=a['readingOrderReview'];canonical=a['boundarySourceVerses'];locale=a['key'].split(':')[-1]
    if (r['policy']!=READING_ORDER_POLICY or a.get('missingVerses') or a.get('confirmedCoverage') is not None
        or source_text_sha(canonical)!=a['textSha256'] or r['canonicalTextSha256']!=a['textSha256']):raise ValueError('Canonical source identity differs')
    refs=reading_references(a['key'],canonical);changed=[v['number'] for v,o in zip(refs,canonical) if v!=o]
    if changed!=r['changedVerses'] or r['baseRecipe'] not in [CASE_REVIEW_RECIPE,SOURCE_EDGE_RECIPE]:raise ValueError('Unproven source reading order')
    sha=source_text_sha(refs);fingerprint=site_fingerprint(a['sourceAudioSha256'],sha,locale,r['baseRecipe'],BOUNDARY_RECOGNIZER)
    if r['baseFingerprint']!=fingerprint:raise ValueError('Complete spoken reference identity differs')
    b=copy.deepcopy({k:v for k,v in a.items() if k!='readingOrderReview'});b.update(qualityRecipe=r['baseRecipe'],fingerprint=fingerprint,textSha256=sha,boundarySourceVerses=refs)
    original={v['number']:v['text'] for v in canonical};full={v['number']:v['text'] for v in refs}
    for items in [b['cues'],b['checks']]:
        for item in items:
            if item['text']!=original[item['verse']]:raise ValueError('Published text differs from canonical source')
            item['text']=full[item['verse']]
    return b


def verified_reading_order_artifact(a):
    try:
        from alignment_contract import READING_ORDER_RECIPE
        from boundary_quality import verified_boundary_artifact
        return a['qualityRecipe']==READING_ORDER_RECIPE and verified_boundary_artifact(reading_order_witness(a))
    except (KeyError,TypeError,ValueError,IndexError,ZeroDivisionError):return False


def verify_reading_order_media(a,path):
    try:
        from alignment_contract import SOURCE_EDGE_RECIPE
        from source_edges import verify_source_edge_media
        from case_evidence import verify_case_media
        if not verified_reading_order_artifact(a):return False
        b=reading_order_witness(a)
        return verify_source_edge_media(b,path) if b['qualityRecipe']==SOURCE_EDGE_RECIPE else verify_case_media(b,path)
    except (KeyError,TypeError,ValueError,IndexError,ZeroDivisionError):return False


def wrap_reading_order(canonical,inner):
    from partial_audio import source_text_sha
    from alignment_contract import READING_ORDER_RECIPE,BOUNDARY_RECOGNIZER,site_fingerprint
    from boundary_quality import verified_boundary_artifact
    if inner['boundarySourceVerses']!=reading_references(inner['key'],canonical) or not verified_boundary_artifact(inner):raise ValueError('Incomplete reordered source acoustic proof')
    a=copy.deepcopy(inner);old={v['number']:v['text'] for v in canonical};sha=source_text_sha(canonical)
    r={'policy':READING_ORDER_POLICY,'canonicalTextSha256':sha,'changedVerses':[v['number'] for v,o in zip(inner['boundarySourceVerses'],canonical) if v!=o],
       'baseRecipe':inner['qualityRecipe'],'baseFingerprint':inner['fingerprint']}
    a.update(readingOrderReview=r,qualityRecipe=READING_ORDER_RECIPE,boundarySourceVerses=copy.deepcopy(canonical),textSha256=sha,
        fingerprint=site_fingerprint(inner['sourceAudioSha256'],sha,inner['key'].split(':')[-1],READING_ORDER_RECIPE,BOUNDARY_RECOGNIZER))
    for items in [a['cues'],a['checks']]:
        for item in items:item['text']=old[item['verse']]
    if not verified_reading_order_artifact(a):raise ValueError('Canonical source/reordered narration did not verify')
    return a
