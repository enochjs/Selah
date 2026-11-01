"""One recorded complete-verse decision plus strict numeric/source missing coverage."""
import copy,hashlib,re
from audio_coverage import COVERAGE_POLICY,candidate_roles,narrated_verses,verified_coverage,coverage_media_matches
from boundary_quality import POLICY,finite,verse_boundary,boundary_gap_issues
from numeric_alignment import NUMERIC_POLICY,numeric_words_verified
from quiet_gaps import GAP_POLICY,digest
from reviewed_partial_sources import _material
from reviewed_source_windows import derive_source_window_case
from spoken_text import boundary_text
from timed_text import normalized

REVIEWED_HUMAN_PARTIAL_POLICY={
    'version':'registered-user-complete-verse-numeric-missing-source-v1',
    'numericPolicy':NUMERIC_POLICY,'coveragePolicy':COVERAGE_POLICY,
    'human':'one-exact-source-verse-complete-and-free-of-neighbor-speech; scores-remain-diagnostic',
    'scoreWaiver':'only-registered-weak-edge-word-or-weak-verse-location; full-timed-body-and-valid-order-required',
    'otherVerses':'all-original-model-and-joint-proofs-reverified-with-unchanged-numeric-children',
    'missing':'same-edition-NIV-absence-and-full-original-source-VAD-and-strict-remeasured-coverage',
    'originalFacts':'entire-original-rejected-numeric-report-and-failed-scores-preserved',
    'clockExceptions':False,'outputs':'all-real-narrated-verses; no-fabricated-missing-audio',
}


def user_verified_body(base,receipt):
    item=receipt['userVerse'];v=item['verse'];c=next(x for x in base['checks'] if x['verse']==v);cue=next(x for x in receipt['finalCues'] if x['verse']==v);start,end=item['sourceRange']
    edges,e=verse_boundary(c['alignedWords'],c['searchRange'],base['duration'],base['key'].split(':')[-1],reference=boundary_text(c['text'],'en'),signal=c.get('boundarySignal'),anchors=c.get('asrEdgeAnchors'))
    if (receipt['approvedBy']!='user-complete-source-verse' or receipt['sourceAcousticApproval'] is not False
        or not isinstance(receipt['humanDecision'],str) or not receipt['humanDecision'].strip()
        or edges is not None or c['boundaryVerified'] or not e['reasons'] or not set(e['reasons'])<={'weak-edge-word','weak-verse-location'}
        or e['reasons']!=c['boundaryEvidence']['reasons'] or e['timedFraction']!=1
        or not all(finite(t) for t in [start,end]) or not 0<=start<end<=base['duration']
        or [cue['start'],cue['end']]!=[start,end] or cue['text']!=c['text']
        or any(not start<=w['start']<w['end']<=end for w in c['alignedWords'] if normalized(w.get('word','')))):
        raise ValueError('Need exact human acceptance of a complete original timed verse body')
    return v


REVIEWED_HUMAN_PROJECTED_PARTIAL_POLICY={**REVIEWED_HUMAN_PARTIAL_POLICY,'version':'registered-user-complete-verse-projected-missing-source-v1','numericPolicy':None,'originalFacts':'complete-original-rejected-projected-partial-report-and-failed-scores-retained','otherVerses':'all-original-model-and-joint-proofs-with-unchanged-word-clocks','sourceModel':'exact-original-partial-reuse-fingerprint-and-all-actual-narrated-model-checks','otherWeakEdges':'complete-source-window-proofs-with-unchanged-model-clocks','asrWords':'diagnostic; a-mistyped-clock-may-belong-to-one-strong-original-model-word-with-at-least-75-percent-time-overlap'}

def _inputs(base,receipt,materials):
    from alignment_contract import NUMERIC_REVIEW_RECIPE,PARTIAL_REVIEW_RECIPE,BOUNDARY_RECOGNIZER,site_fingerprint
    raw=next(m['utf8'] for m in materials if m['file']==receipt['baseReportFile'])
    recipe=PARTIAL_REVIEW_RECIPE if receipt['schemaVersion']==25 else NUMERIC_REVIEW_RECIPE
    if (receipt['schemaVersion'] not in {24,25} or base.get('accepted') is not False or base['qualityRecipe']!=recipe
        or base['boundaryPolicy']!=POLICY or (receipt['schemaVersion']==24 and base['numericAlignmentPolicy']!=NUMERIC_POLICY) or not base['key'].endswith(':en')
        or base.get('confirmedCoverage') or base.get('missingVerses') or digest(base)!=receipt['baseEvidenceSha256']
        or _material(receipt,materials,receipt['baseReportFile'])!=base
        or base['fingerprint']!=site_fingerprint(base['sourceAudioSha256'],base['textSha256'],'en',recipe,BOUNDARY_RECOGNIZER)):
        raise ValueError('Need the exact original rejected numeric source')
    if receipt['schemaVersion']==25:
        from spoken_projection import projection_matches
        reuse=base['boundaryEvidenceReuse']
        if (not projection_matches(base) or base.get('confirmedCoverage') is not None or base.get('numericAlignmentPolicy')
            or any(re.search(r'\d',v['text']) for v in base['boundarySourceVerses'])
            or base['coverageDiagnostic']!='Coverage must retain full source identity and exactly the narrated cue/check roots'
            or reuse['sourceFingerprint']!=site_fingerprint(base['sourceAudioSha256'],base['textSha256'],'en',reuse['sourceRecipe'],BOUNDARY_RECOGNIZER)):
            raise ValueError('Original projected/partial model provenance changed')
    cov=_material(receipt,materials,receipt['coverageEvidenceFile']);audit=_material(receipt,materials,receipt['sourceAuditFile'])
    if (cov['policy']!=COVERAGE_POLICY or cov['roles']!=candidate_roles(base['key'],base['boundarySourceVerses'],cov['nivEvidence'])
        or not cov['roles']['missingVerses'] or cov['roles']['aliases']
        or audit['key']!=base['key'] or audit['sourceAudioSha256']!=base['sourceAudioSha256']
        or audit['sourceReportSha256']!=hashlib.sha256(raw.encode()).hexdigest()
        or audit['sampleCount']!=round(base['duration']*16000) or audit['vadModelSha256']!=GAP_POLICY['vadModelSha256']
        or audit['speechSegments']!=cov['speechSegments']):raise ValueError('Missing coverage is not tied to the unchanged original source')
    return cov


def derive_human_partial_case(base,receipt,materials):
    from alignment_contract import BOUNDARY_RECOGNIZER,site_fingerprint
    from partial_audio import source_text_sha
    cov=_inputs(base,receipt,materials);v=user_verified_body(base,receipt);missing={m['verse'] for m in cov['roles']['missingVerses']};excluded=missing|{v}
    weak=receipt['weakVerses'];other_weak=[n for n in weak if n!=v];excluded_cues=missing|set(weak)
    if (v in missing or v not in weak or weak!=sorted(set(weak)) or (receipt['schemaVersion']==24 and weak!=[v])
        or receipt['failureReasons']!=[dict(verse=n,reasons=next(c['boundaryEvidence']['reasons'] for c in base['checks'] if c['verse']==n)) for n in weak]
        or base['expectedVerseNumbers']!=[x['number'] for x in base['boundarySourceVerses']]
        or base['textSha256']!=source_text_sha(base['boundarySourceVerses'])
        or [c['verse'] for c in base['checks']]!=[n for n in base['expectedVerseNumbers'] if receipt['schemaVersion']==24 or n not in missing]
        or [c['verse'] for c in base['cues']]!=[n for n in base['expectedVerseNumbers'] if n not in excluded_cues]
        or base['issues']!=['unreliable-verse-boundary:'+str(n) for n in (sorted(excluded) if receipt['schemaVersion']==24 else weak)]+boundary_gap_issues(base['unclaimedSpeech'],base['cues'])+(['coverage-neighbor-or-boundary-unverified'] if receipt['schemaVersion']==25 else [])
        or any(not numeric_words_verified(c['alignedWords'],boundary_text(c['text'],'en')) for c in base['checks'] if c['verse'] not in missing)):
        raise ValueError('An unrelated original verse failure or numeric proof changed')
    model=base['boundaryEvidenceReuse']['sourceRecipe'] if receipt['schemaVersion']==25 else base['numericBaseRecipe'];w=copy.deepcopy(base)
    for name in ['numericAlignmentPolicy','numericBaseRecipe','spokenProjection','coverageDiagnostic','boundaryEvidenceReuse']:w.pop(name,None)
    roots=[x for x in base['boundarySourceVerses'] if x['number'] not in excluded];sha=source_text_sha(roots)
    w.update(qualityRecipe=model,boundarySourceVerses=roots,textSha256=sha,expectedVerseNumbers=[x['number'] for x in roots],checks=[c for c in base['checks'] if c['verse'] not in excluded],issues=['unreliable-verse-boundary:'+str(n) for n in other_weak]+boundary_gap_issues(base['unclaimedSpeech'],base['cues']),fingerprint=site_fingerprint(base['sourceAudioSha256'],sha,'en',model,BOUNDARY_RECOGNIZER))
    inner=copy.deepcopy(receipt);inner.update(schemaVersion=25 if receipt['schemaVersion']==25 else 10,weakVerses=other_weak,failureReasons=[x for x in receipt['failureReasons'] if x['verse']!=v],finalCues=[c for c in receipt['finalCues'] if c['verse']!=v],cuts=[c for c in receipt['cuts'] if c['verse']!=v])
    model_owners=timed_source_gap_owners(base,receipt) if receipt['schemaVersion']==25 else None
    recovered=derive_source_window_case(w,inner,materials,model_gap_owners=model_owners)
    human=[c for c in receipt['cuts'] if c['verse']==v];cue=next(c for c in receipt['finalCues'] if c['verse']==v)
    if len(human)!=2 or {c['side'] for c in human}!={'head','tail'} or any(c.get('measurementKind')!='user-natural-seam' or c['before'] is not None or c['after']!=[cue['start'],cue['end']] for c in human):raise ValueError('Both human accepted source edges need explicit measured cuts')
    for edge in human:
        lo,hi=edge['window'];value=cue['start' if edge['side']=='head' else 'end'];a,b=edge['protectedCore']
        if (type(lo) is not int or type(hi) is not int or not 0<=lo<hi<=round(base['duration']*16000)
            or not 160<=hi-lo<=640 or (hi-lo)%160 or not lo<=round(value*16000)<=hi
            or not cue['start']<=a<b<=cue['end']
            or any(not a<=w['start']<w['end']<=b for c in base['checks'] if c['verse']==v for w in c['alignedWords'] if normalized(w.get('word','')))):
            raise ValueError('Human accepted verse edge has incomplete source measurement or protected body')
    checks=[copy.deepcopy(c) for c in base['checks'] if c['verse'] not in missing];next(c for c in checks if c['verse']==v)['boundaryVerified']=True
    for c in checks:
        if c['verse']!=v:c['boundaryVerified']=next(x['boundaryVerified'] for x in recovered['checks'] if x['verse']==c['verse'])
    result=copy.deepcopy(base);result.update(accepted=True,issues=[],cues=copy.deepcopy(receipt['finalCues']),checks=checks,confirmedCoverage=copy.deepcopy(cov),missingVerses=copy.deepcopy(cov['roles']['missingVerses']))
    if not verified_coverage(result):raise ValueError('Missing source coverage still fails')
    for check,c in zip(checks,result['cues']):
        if c['verse']!=check['verse'] or any(not c['start']<=word['start']<word['end']<=c['end'] for word in check['alignedWords'] if normalized(word.get('word',''))):raise ValueError('A final verse loses a full model word body')
        for word in check['alignedWords']:
            if any(not c['start']<=x['start']<x['end']<=c['end'] for x in word.get('numericExpansion',{}).get('words',[])):raise ValueError('A numeric child was truncated')
    return result


def human_partial_measurements_match(base,receipt,materials,pcm):
    try:return coverage_media_matches(derive_human_partial_case(base,receipt,materials),pcm)
    except (KeyError,TypeError,ValueError,IndexError,StopIteration):return False


def timed_source_gap_owners(base,receipt):
    if receipt['schemaVersion']!=25:raise ValueError('Timed ASR ownership needs its separate registered source recipe')
    owners={};checks={c['verse']:c for c in base['checks']}
    for assignment in receipt['gapAssignments']:
        if 'modelWordIndex' not in assignment:continue
        i=assignment['index'];v=assignment['ownerVerse'];j=assignment['modelWordIndex'];g=base['unclaimedSpeech'][i];c=checks[v];w=c['alignedWords'][j];a,b=g['start'],g['end']
        if (i in owners or not c['boundaryVerified'] or g['kind']!='between-verses' or g.get('allowedHeadingOrClosing') is not False
            or assignment['gapSha256']!=digest(g) or assignment['modelWordSha256']!=digest(w)
            or not 0<b-a<=.5 or not finite(w.get('score')) or w['score']<.8 or not w['start']<w['end']
            or max(0,min(b,w['end'])-max(a,w['start']))/(w['end']-w['start'])<.75):
            raise ValueError('ASR clock is not uniquely anchored to a strong unchanged source model word')
        matches=[(other['verse'],k) for other in base['checks'] if other['boundaryVerified'] for k,word in enumerate(other['alignedWords'])
            if normalized(word.get('word','')) and finite(word.get('score')) and word['score']>=.8 and word.get('start',0)<word.get('end',0)
            and max(0,min(b,word['end'])-max(a,word['start']))/(word['end']-word['start'])>=.75]
        if matches!=[(v,j)]:raise ValueError('Original source model ownership is ambiguous')
        owners[i]=v
    return owners
