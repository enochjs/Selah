"""Separate real numbered NIV headings from scripture while retaining raw clocks."""
import copy,hashlib
from boundary_quality import finite,verse_boundary,boundary_gap_issues
from quiet_gaps import GAP_POLICY,digest
from reviewed_partial_sources import _material
from reviewed_gap_sources import _failed_report
from saying_headings import extract_saying_headings
from timed_text import normalized
from numeric_alignment import cardinal

REVIEWED_SAYING_SOURCE_POLICY={
 'version':'registered-proverbs-numbered-source-headings-v1',
 'scope':'proverbs22-24; complete-visible-same-edition-numbered-heading-inventory',
 'headings':'each-complete-title-independently-CTC-aligned-and-full-original-VAD-outside-verse-outputs',
 'source':'all-original-raw-clocks-flags-models-and-failed-gap-proof-kept-verbatim-in-base',
 'replacement':'only-title-contaminated-joint-groups-realigned; original-joint-proofs-rerun-before-replacement',
 'clockPartition':'positive-coarse-word-clock-retained-by-adjacent-source-outputs-at-quiet-verified-cut',
 'output':'complete-original-chapter-with-headings; loops-contain-scripture-only',
 'silenceClaim':False,
}


def _target(base,receipt,materials,name):
    t=_material(receipt,materials,name);raw=next(m['utf8'] for m in materials if m['file']==receipt['baseReportFile'])
    if (t['key']!=base['key'] or t['sourceAudioSha256']!=base['sourceAudioSha256']
        or t['sourceReportSha256']!=hashlib.sha256(raw.encode()).hexdigest()):raise ValueError('A source model belongs to another original recording')
    c=t['check'];edges,e=verse_boundary(c['alignedWords'],c['searchRange'],base['duration'],'en',reference=c['text'],signal=c['boundarySignal'],anchors=c.get('asrEdgeAnchors'))
    if (edges is None or not c['boundaryVerified'] or c['boundaryEvidence']!=e
        or t['cue']!=dict(verse=c['verse'],text=c['text'],start=edges[0],end=edges[1])):
        raise ValueError('The entire source model has not independently passed')
    return t


def saying_source_roles(base,receipt,materials):
    if (receipt['schemaVersion'] not in {36,42} or digest(base)!=receipt['baseEvidenceSha256']
        or _material(receipt,materials,receipt['baseReportFile'])!=base):raise ValueError('Need the exact rejected original Saying source')
    mapping=extract_saying_headings(_material(receipt,materials,receipt['headingReferenceFile']),base['key'],base['boundarySourceVerses'])
    if [(h['number'],h['beforeVerse']) for h in receipt['headings']]!=list(mapping.items()):raise ValueError('Every actual same-edition Saying heading must be located')
    audit=_material(receipt,materials,receipt['sourceAuditFile']);raw=next(m['utf8'] for m in materials if m['file']==receipt['baseReportFile'])
    if (audit['key']!=base['key'] or audit['sourceAudioSha256']!=base['sourceAudioSha256']
        or audit['sourceReportSha256']!=hashlib.sha256(raw.encode()).hexdigest()
        or audit['sampleCount']!=round(base['duration']*16000) or audit['vadModelSha256']!=GAP_POLICY['vadModelSha256']):raise ValueError('The original full-source VAD identity changed')
    previous=0
    for x,y in audit['speechSegments']:
        if type(x) is not int or type(y) is not int or not previous<=x<y<=audit['sampleCount']:raise ValueError('Invalid complete source VAD')
        previous=y
    final={c['verse']:c for c in receipt['finalCues']};excluded=set();last_end=0
    for h in receipt['headings']:
        n,v=h['number'],h['beforeVerse'];t=saying_target(base,receipt,materials,h['modelFile'],h['number']);c=t['check'];lo,hi=h['sourceRange'];text='Saying '+cardinal(n,'plain')
        if (t['number']!=n or t['beforeVerse']!=v or c['verse']!=0 or c['text']!=text or c['spokenText']!=text or c.get('asrEdgeAnchors')!=[]
            or not all(finite(x) for x in [lo,hi]) or not last_end<=lo<hi<=base['duration']
            or not (final[v-1]['end'] if v>1 else 0)<=lo<hi<=final[v]['start']
            or any(max(lo,q['start'])<min(hi,q['end']) for q in receipt['finalCues'])
            or any(not lo<=w['start']<w['end']<=hi for w in c['alignedWords'] if normalized(w.get('word','')))):
            raise ValueError('A full narrated title overlaps scripture or differs from NIV metadata')
        voice=[(x,y) for x,y in audit['speechSegments'] if max(x,lo*16000)<min(y,hi*16000)]
        crossing=[(x,y) for x,y in voice if not lo*16000<=x<y<=hi*16000]
        for x,y in crossing:
            # VAD can merge a title and adjacent scripture across a short quiet pause.
            # Such a boundary needs its own original-PCM cut proof and an actual neighbor word.
            neighbors=[w for c in base.get('checks',[]) if c['verse'] in {v-1,v} for w in c['alignedWords'] if normalized(w.get('word',''))]
            if not any(max(w['start']*16000,x)<min(w['end']*16000,y) and (w['end']<=lo or w['start']>=hi) for w in neighbors):
                raise ValueError('Unclassified voice crosses the title source range')
        if (not voice or any(not any(max(w['start']*16000,x)<min(w['end']*16000,y) for x,y in voice) for w in [c['alignedWords'][0],c['alignedWords'][-1]])):
            raise ValueError('Real title voice remains outside its source range')
        accepted={normalized(text),str(n),'saying'+str(n)}
        if (base['key'],n)==('proverbs:22:en',2):accepted.add('4sayingto')
        if (base['key'],n)==('proverbs:22:en',3):accepted.add('5sayingthree')
        for i in h['gapIndices']:
            if type(i) is not int or not 0<=i<len(base['unclaimedSpeech']) or i in excluded:raise ValueError('Unknown or duplicate heading ASR diagnostic')
            g=base['unclaimedSpeech'][i]
            # Coarse ASR bounds remain raw diagnostics, never corrected to fabricated silence.
            if (g.get('allowedHeadingOrClosing') is not False or normalized(g['text']) not in accepted
                or not (base['checks'][v-2]['alignedWords'][-1]['start'] if v>1 else 0)<=g['start']<=g['end']<=base['checks'][v-1]['alignedWords'][0]['end']):
                raise ValueError('An unrelated word cannot be waived as a numbered heading')
            excluded.add(i)
        last_end=hi
    return excluded


def _partitioned_clocks(base,receipt,checks):
    excluded=set();final={c['verse']:c for c in receipt['finalCues']}
    for p in receipt.get('clockPartitions',[]):
        i=p['index'];left,right=p['ownerVerses'];cut=p['splitAt']
        if type(i) is not int or not 0<=i<len(base['unclaimedSpeech']) or i in excluded:raise ValueError('Unknown positive source clock')
        g=base['unclaimedSpeech'][i];c=checks[right]
        if (right!=left+1 or p['gapSha256']!=digest(g) or final[left]['end']!=cut or final[right]['start']!=cut
            or not final[left]['start']<=g['start']<cut<g['end']<=final[right]['end']
            or not normalized(g['text']) or normalized(g['text']) not in normalized(c['text'])
            or not any(normalized(w.get('word',''))==normalized(g['text']) and w.get('score',0)>=.8 and cut<=w['start']<w['end']<=final[right]['end'] for w in c['alignedWords'])
            or {(left,'tail'),(right,'head')}- {(x['verse'],x['side']) for x in receipt['cuts']}
            or any(x.get('measurementKind') for x in receipt['cuts'] if x['verse'] in {left,right})):
            raise ValueError('A coarse word clock is not fully preserved at a strictly verified quiet source cut')
        excluded.add(i)
    return excluded


def derive_saying_source_case(base,receipt,materials):
    from alignment_contract import GAP_REVIEW_RECIPE,BOUNDARY_REVIEW_RECIPE,BOUNDARY_RECOGNIZER,site_fingerprint
    from joint_boundaries import verified_joint_proofs
    from reviewed_source_windows import derive_source_window_case
    if (base['qualityRecipe']!=GAP_REVIEW_RECIPE or base.get('accepted') is not False or receipt['weakVerses'] or receipt['failureReasons']
        or base['issues']!=boundary_gap_issues(base['unclaimedSpeech'],base['cues'])):raise ValueError('Need the complete original failed gap report')
    if receipt['schemaVersion']==42:
        from reviewed_final_listening import validate_final_listening
        validate_final_listening(base,receipt)
        final={c['verse']:c for c in receipt['finalCues']}
        if final[5]['end']!=31.55 or final[6]['start']!=33.70:raise ValueError('The heard scripture cuts changed')
    _failed_report(base);excluded=saying_source_roles(base,receipt,materials)
    if base.get('jointAlignments') and not verified_joint_proofs(base):raise ValueError('The original joint model proof failed')
    w=copy.deepcopy(base);model=base.get('boundaryContextReview',{}).get('recipe',BOUNDARY_REVIEW_RECIPE)
    if (base['gapReview']!=dict(recipe=GAP_REVIEW_RECIPE,sourceFingerprint=site_fingerprint(base['sourceAudioSha256'],base['textSha256'],'en',model,BOUNDARY_RECOGNIZER))
        or base['fingerprint']!=site_fingerprint(base['sourceAudioSha256'],base['textSha256'],'en',GAP_REVIEW_RECIPE,BOUNDARY_RECOGNIZER)):
        raise ValueError('Original source identity changed')
    replacements={}
    for name in receipt.get('verseModelFiles',[]):
        t=saying_target(base,receipt,materials,name);c=t['check'];v=c['verse']
        if v in replacements or c['text']!=base['boundarySourceVerses'][v-1]['text'] or c.get('jointProofId') or c.get('jointClipRange') is not None or c.get('asrEdgeAnchors')!=base['checks'][v-1].get('asrEdgeAnchors'):raise ValueError('The replacement scripture reference or original anchors changed')
        replacements[v]=t
    removed=set()
    for g in base.get('jointAlignments',[]):
        if set(g['verses'])&replacements.keys():
            if not set(g['verses'])<=replacements.keys():raise ValueError('Only a complete contaminated joint group may be replaced')
            removed.add(g['id'])
    if any(not any(v==h['beforeVerse'] or v==h['beforeVerse']-1 for h in receipt['headings']) for v in replacements):raise ValueError('Unrelated source model replacement')
    w['jointAlignments']=[g for g in base.get('jointAlignments',[]) if g['id'] not in removed]
    for v,t in replacements.items():w['checks'][v-1]=copy.deepcopy(t['check']);w['cues'][v-1]=copy.deepcopy(t['cue'])
    partitions=_partitioned_clocks(base,receipt,{c['verse']:c for c in w['checks']})
    if excluded&partitions:raise ValueError('A heading is not a scripture word')
    excluded|=partitions
    for field in ['acousticGapReview','gapReview']:w.pop(field)
    w.update(qualityRecipe=model,fingerprint=base['gapReview']['sourceFingerprint'],unclaimedSpeech=[g for i,g in enumerate(base['unclaimedSpeech']) if i not in excluded]);w['issues']=boundary_gap_issues(w['unclaimedSpeech'],w['cues'])
    inner=copy.deepcopy(receipt);inner.update(schemaVersion=10,gapAssignments=[])
    for a in receipt['gapAssignments']:
        if a['index'] in excluded:raise ValueError('A source heading/partition cannot acquire another owner')
        inner['gapAssignments'].append({**a,'index':a['index']-sum(i<a['index'] for i in excluded)})
    result=derive_source_window_case(w,inner,materials)
    result.update(qualityRecipe=base['qualityRecipe'],fingerprint=base['fingerprint'],acousticGapReview=copy.deepcopy(base['acousticGapReview']),gapReview=copy.deepcopy(base['gapReview']),unclaimedSpeech=copy.deepcopy(base['unclaimedSpeech']),sourceSayingHeadingReview=copy.deepcopy(receipt['headings']),sourcePartitionedClockReview=copy.deepcopy(receipt.get('clockPartitions',[])))
    return result


def saying_source_measurements_match(base,receipt,materials,pcm):
    from reviewed_boundaries import _measure
    try:
        saying_source_roles(base,receipt,materials)
        if len(pcm)!=round(base['duration']*16000):return False
        for h in receipt['headings']:
            t=saying_target(base,receipt,materials,h['modelFile'],h['number']);c=t['check'];words=[w for w in c['alignedWords'] if normalized(w.get('word',''))];core=[words[0]['start'],words[-1]['end']];lo,hi=h['sourceRange'];v=h['beforeVerse']
            prev=base['checks'][v-2]['alignedWords'][-1]['start'] if v>1 else 0
            nxt=base['checks'][v-1]['alignedWords'][0]['end']
            for side,value in [('head',lo),('tail',hi)]:
                _measure(dict(verse=0,side=side,window=[round((value-.01)*16000),round((value+.01)*16000)],referenceRanges=[[round(x*16000) for x in c['searchRange']],[round(x*16000) for x in core]]),pcm)
        return True
    except (KeyError,TypeError,ValueError,IndexError,StopIteration):return False


REVIEWED_SAYING_USER_POLICY={**REVIEWED_SAYING_SOURCE_POLICY,
 'version':'registered-user-complete-saying-nine-source-title-v1',
 'headings':'all-independent-title-models-pass-except-exact-user-heard-Saying-nine; complete-original-caption-VAD-and-quiet-source-edges-still-required',
}


def saying_target(base,receipt,materials,name,number=None):
    if receipt['schemaVersion']!=42:return _target(base,receipt,materials,name)
    from reviewed_final_listening import validate_final_listening
    from reviewed_chronicles21_sources import same_serialized_boundary_evidence
    validate_final_listening(base,receipt);t=_material_source_target(base,receipt,materials,name);c=t['check']
    edges,e=verse_boundary(c['alignedWords'],c['searchRange'],base['duration'],'en',reference=c['text'],signal=c['boundarySignal'],anchors=c.get('asrEdgeAnchors'))
    if (edges is not None and c['boundaryVerified'] and same_serialized_boundary_evidence(c['boundaryEvidence'],e)
        and t['cue']==dict(verse=c['verse'],text=c['text'],start=edges[0],end=edges[1])):return t
    if (number!=9 or t.get('number')!=9 or t.get('beforeVerse')!=6 or c['verse']!=0 or c['text']!='Saying nine'
        or c['boundaryVerified'] is not False or t['cue'] is not None or e['reasons']!=['weak-edge-word']
        or e['timedFraction']!=1 or not same_serialized_boundary_evidence(c['boundaryEvidence'],e)):
        raise ValueError('An unrelated source-model failure was not heard by the user')
    return t


def _material_source_target(base,receipt,materials,name):
    from reviewed_partial_sources import _material
    t=_material(receipt,materials,name);raw=next(m['utf8'] for m in materials if m['file']==receipt['baseReportFile'])
    if (t['key']!=base['key'] or t['sourceAudioSha256']!=base['sourceAudioSha256'] or t['sourceReportSha256']!=hashlib.sha256(raw.encode()).hexdigest()):raise ValueError('The heard title model belongs to another original source')
    return t
