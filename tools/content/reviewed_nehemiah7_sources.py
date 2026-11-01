"""Recover numeric bodies and the NIV's repeated table continuations in Nehemiah7."""
import copy,hashlib
from boundary_quality import boundary_gap_issues,verse_boundary
from quiet_gaps import digest
from reviewed_partial_sources import _material
from reviewed_chronicles21_sources import same_serialized_boundary_evidence
from source_omissions import validate_niv_evidence
from verse_completion import _Fragments
from timed_text import normalized

COMPLETED_VERSES=[39,43,44,45,46,57,59,62,63]
FAILED_VERSES=[25,27,28,29,30,34,35,36,37]
REVIEWED_NEHEMIAH7_SOURCE_POLICY={
 'version':'registered-nehemiah7-cardinals-and-same-niv-table-continuations-v1',
 'scope':'nine-original-failed-numeric-models-and-nine-truncated-canonical-table-headings',
 'authority':'complete-original-same-edition-NIV-HTML; repeated-same-verse-id-and-exact-imported-first-fragment',
 'reading':'original-imported-text-kept; complete-narrated-table-reference-retained-separately',
 'model':'all-number-children-independently-verified; original-ASR-clocks-and-failed-models-preserved-verbatim',
 'source':'every-positive-old-ASR-span-fully-owned-by-its-verified-same-verse-body; no-silence-reclassification',
 'context':'original-joint-proofs-reverified-before-replaced-complete-groups-are-removed',
 'cuts':'all-final-cuts-disjoint-and-quiet; complete-model-bodies-retained-in-original-chapter-audio',
}


def nehemiah_completed_refs(base,receipt,materials):
    if (base['key']!='nehemiah:7:en' or digest(base)!=receipt['baseEvidenceSha256']
        or _material(receipt,materials,receipt['baseReportFile'])!=base):raise ValueError('Need the exact original Nehemiah7 source')
    ref=_material(receipt,materials,receipt['referenceFile']);original=base['boundarySourceVerses']
    if not validate_niv_evidence(ref,base['key'],original):raise ValueError('Incomplete original same-edition NIV chapter')
    p=_Fragments('Neh',7);p.feed(ref['rawHtml']);p.result(list(range(1,74)));result=copy.deepcopy(original)
    for v in COMPLETED_VERSES:
        parts=p.fragments.get(v,[])
        if len(parts)<2 or normalized(parts[0])!=normalized(original[v-1]['text']):raise ValueError('The same-ID continuation does not start with the imported canonical fragment')
        result[v-1]['text']=' '.join(parts)
    return result


def nehemiah_model(base,receipt,materials,name,refs):
    from numeric_alignment import numeric_words_verified
    from spoken_text import boundary_text
    t=_material(receipt,materials,name);c=t['check'];v=c['verse'];raw=next(m['utf8'] for m in materials if m['file']==receipt['baseReportFile']);old=base['checks'][v-1]
    if (t['key']!=base['key'] or t['sourceAudioSha256']!=base['sourceAudioSha256'] or t['sourceReportSha256']!=hashlib.sha256(raw.encode()).hexdigest()
        or c['text']!=refs[v-1]['text'] or c.get('jointProofId') or c.get('jointClipRange') is not None
        or not numeric_words_verified(c['alignedWords'],boundary_text(c['text'],'en'))):raise ValueError('The complete source model or numeric children changed')
    if c.get('asrEdgeAnchors')!=old.get('asrEdgeAnchors'):
        if c.get('asrEdgeAnchors')!=[] or t.get('originalAsrEdgeAnchors')!=old.get('asrEdgeAnchors'):raise ValueError('Original independent recognition clocks were discarded')
    edges,e=verse_boundary(c['alignedWords'],c['searchRange'],base['duration'],'en',reference=boundary_text(c['text'],'en'),signal=c['boundarySignal'],anchors=c.get('asrEdgeAnchors'))
    if (edges is None or not c['boundaryVerified'] or not same_serialized_boundary_evidence(c['boundaryEvidence'],e)
        or t['cue']!=dict(verse=v,text=c['text'],start=edges[0],end=edges[1])):raise ValueError('The complete independent source model did not pass')
    if v in COMPLETED_VERSES:
        ref=_material(receipt,materials,receipt['referenceFile'])
        if t['referenceSha256']!=ref['sha256'] or t['canonicalText']!=old['text'] or t['narratedReference']!=refs[v-1]['text']:raise ValueError('The narrated table model is not tied to its exact original same-edition reference')
    return t


def derive_nehemiah7_source_case(base,receipt,materials):
    from alignment_contract import NUMERIC_REVIEW_RECIPE,BOUNDARY_RECOGNIZER,site_fingerprint
    from numeric_alignment import NUMERIC_POLICY,numeric_words_verified
    from partial_audio import source_text_sha
    from spoken_text import boundary_text
    from joint_boundaries import verified_joint_proofs
    from reviewed_source_windows import derive_source_window_case
    if receipt['schemaVersion']==41:
        from reviewed_final_listening import validate_final_listening
        validate_final_listening(base,receipt)
    refs=nehemiah_completed_refs(base,receipt,materials)
    if (receipt['schemaVersion'] not in {40,41} or base.get('accepted') is not False or base['qualityRecipe']!=NUMERIC_REVIEW_RECIPE
        or base['numericAlignmentPolicy']!=NUMERIC_POLICY or receipt['weakVerses'] or receipt['failureReasons']
        or [c['verse'] for c in base['checks'] if c.get('boundaryVerified') is False]!=FAILED_VERSES
        or base['issues']!=['unreliable-verse-boundary:'+str(v) for v in FAILED_VERSES]+boundary_gap_issues(base['unclaimedSpeech'],base['cues'])):
        raise ValueError('Need the complete original failed numeric/table chapter')
    if any(not numeric_words_verified(c['alignedWords'],boundary_text(c['text'],'en')) for c in base['checks']):raise ValueError('An original numeric expansion changed')
    context=nehemiah_original_context(base)
    if context.get('jointAlignments') and not verified_joint_proofs(context):raise ValueError('Original complete joint context changed')
    targets={}
    for name in receipt['verseModelFiles']:
        t=nehemiah_model(base,receipt,materials,name,refs);v=t['check']['verse']
        if v in targets:raise ValueError('Duplicate source model')
        targets[v]=t
    if sorted(targets)!=sorted(FAILED_VERSES+COMPLETED_VERSES):raise ValueError('Every exact failed or truncated source row needs its complete model')
    w=copy.deepcopy(base);w.pop('numericAlignmentPolicy');model=w.pop('numericBaseRecipe');w.update(qualityRecipe=model,boundarySourceVerses=refs,textSha256=source_text_sha(refs));w['fingerprint']=site_fingerprint(w['sourceAudioSha256'],w['textSha256'],'en',model,BOUNDARY_RECOGNIZER)
    removed=set()
    for g in w.get('jointAlignments',[]):
        if set(g['verses'])&targets.keys():
            if not set(g['verses'])<=targets.keys():raise ValueError('A partial original joint group cannot be removed')
            removed.add(g['id'])
    w['jointAlignments']=[g for g in w.get('jointAlignments',[]) if g['id'] not in removed]
    for v,t in targets.items():w['checks'][v-1]=copy.deepcopy(t['check'])
    w['cues']=sorted([*[c for c in w['cues'] if c['verse'] not in targets],*[copy.deepcopy(t['cue']) for t in targets.values()]],key=lambda c:c['verse']);w['issues']=boundary_gap_issues(w['unclaimedSpeech'],w['cues'])
    inner=copy.deepcopy(receipt);inner['schemaVersion']=receipt['schemaVersion']
    for c in inner['finalCues']:c['text']=refs[c['verse']-1]['text']
    owners={a['index']:a['ownerVerse'] for a in inner['gapAssignments']}
    if any(v not in COMPLETED_VERSES for v in owners.values()):raise ValueError('Only verified same-verse table continuations may own formerly unmatched source text')
    result=derive_source_window_case(w,inner,materials,original_joint_context=context)
    result.update(boundarySourceVerses=copy.deepcopy(base['boundarySourceVerses']),textSha256=base['textSha256'],qualityRecipe=base['qualityRecipe'],fingerprint=base['fingerprint'],numericAlignmentPolicy=copy.deepcopy(base['numericAlignmentPolicy']),numericBaseRecipe=base['numericBaseRecipe'],cues=copy.deepcopy(receipt['finalCues']),narratedSourceVerses=refs,sourceTableContinuationReview=dict(verses=COMPLETED_VERSES,referenceFile=receipt['referenceFile']))
    return result

REVIEWED_NEHEMIAH7_USER_POLICY={**REVIEWED_NEHEMIAH7_SOURCE_POLICY,
    "version":"registered-user-nehemiah7-table-source-natural-seam-v1",
    "cuts":"one-exact-user-accepted-shared-seam-with-original-first-word-clock-exception; all-other-cuts-quiet",
}


def nehemiah_original_context(base):
    from alignment_contract import BOUNDARY_RECOGNIZER,site_fingerprint
    w=copy.deepcopy(base);w['qualityRecipe']=w.pop('numericBaseRecipe');w.pop('numericAlignmentPolicy')
    w['fingerprint']=site_fingerprint(w['sourceAudioSha256'],w['textSha256'],'en',w['qualityRecipe'],BOUNDARY_RECOGNIZER)
    return w
