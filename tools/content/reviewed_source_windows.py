"""Exact registered source recovery for a clipped original search window.

Original joint/model windows are verified in their original context. Their
search extents are not asserted to be final source cuts. All changed cuts and
ownership of every old unclaimed interval require fixed source review.
"""
import copy
from boundary_quality import finite,verse_boundary,boundary_gap_issues,POLICY
from spoken_text import boundary_text
from timed_text import normalized
from quiet_gaps import digest

REVIEWED_WINDOW_POLICY={'version':'registered-truncated-source-window-recovery-v1',
 'sampleRate':16000,'failures':['weak-edge-word','edge-at-search-limit','independent-edge-outside-range'],
 'originalProof':'complete-raw-model-and-joint-provenance-with-unchanged-search-windows',
 'sourceProof':'every-inserted-or-changed-edge-is-pinned-to-original-pcm-and-complete-protected-voice',
 'gaps':'unchanged-original-text-and-clock; exact-registered-owner-and-final-full-range-coverage',
 'outputs':'fixed-complete-original-source-clip-inventory-and-vtt',
 'approval':'source-controlled-raw-receipt-sha256; never-runtime-self-approval'}


def original_model_order_valid(cues,duration,schema):
    previous=0
    for c in cues:
        if not all(finite(t) for t in [c['start'],c['end']]) or not previous<=c['start']<c['end']<=duration:return False
        # Fresh independent CTC padding can overlap; final cuts below remain strictly disjoint.
        previous=c['start'] if schema in {38,39,40,41,43} else c['end']
    return True


def derive_source_window_case(base,receipt,materials=None,background_owners=None,model_gap_owners=None,original_joint_context=None):
    from alignment_contract import BOUNDARY_REVIEW_RECIPE,BOUNDARY_CONTEXT_RECIPE,PADDING_REVIEW_RECIPE,BOUNDARY_RECOGNIZER,site_fingerprint
    from joint_boundaries import verified_joint_proofs
    from partial_audio import source_text_sha
    unsupported={'numericAlignmentPolicy','numericBaseRecipe','caseReviewPolicy','spokenProjection','confirmedCoverage','missingVerses','missingFragments','sourceGapReview','sourceEdgeReview','clockEdgeReview','speechSpanReview','speechContextReview','reviewedSourceReview','reviewedWeakReview','individualBoundaryReview','wordPauseReview','anchorWindowPolicy','referenceCompletionReview','sourceFragmentReview','readingOrderReview','contextPaddingReview','acousticGapReview'}
    if background_owners is not None and receipt['schemaVersion']!=21:raise ValueError('Background ownership requires its separate registered source proof')
    background_owners=background_owners or {}
    if model_gap_owners is not None and receipt['schemaVersion']!=25:raise ValueError('Timed word ownership needs its separate source policy')
    model_gap_owners=model_gap_owners or {}
    human=receipt['schemaVersion'] in {5,8,16,22,28,29,41,43}
    prefix_mode=receipt['schemaVersion']==6
    if (receipt['schemaVersion'] not in {4,5,6,7,8,10,16,21,22,25,27,28,29,38,39,40,41,43} or base['qualityRecipe'] not in {BOUNDARY_REVIEW_RECIPE,BOUNDARY_CONTEXT_RECIPE,PADDING_REVIEW_RECIPE}
        or unsupported&base.keys() or base.get('accepted') is not False or base['verificationScope']!='verse-boundaries' or base['boundaryPolicy']!=POLICY
        or source_text_sha(base['boundarySourceVerses'])!=base['textSha256']
        or base['fingerprint']!=site_fingerprint(base['sourceAudioSha256'],base['textSha256'],base['key'].split(':')[-1],base['qualityRecipe'],BOUNDARY_RECOGNIZER)):
        raise ValueError('Need an unchanged complete original source-window proof')
    expected=base['expectedVerseNumbers'];checks={c['verse']:c for c in base['checks']};original={c['verse']:c for c in base['cues']};final={c['verse']:c for c in receipt['finalCues']};failures=receipt['failureReasons'];weak=receipt['weakVerses']
    if (not expected or expected!=sorted(set(expected)) or [v['number'] for v in base['boundarySourceVerses']]!=expected
        or [c['verse'] for c in base['checks']]!=expected or [c['verse'] for c in receipt['finalCues']]!=expected
        or len(original)!=len(base['cues']) or (not weak and receipt['schemaVersion'] not in {10,16,22,25,38,39,40,41,43}) or weak!=sorted(set(weak)) or [c['verse'] for c in failures]!=weak
        or [c['verse'] for c in base['cues']]!=[v for v in expected if v not in weak]):
        raise ValueError('Wrong original, failed, or final verse inventory')
    user_complete_verse=None
    if receipt['schemaVersion']==29:
        from reviewed_human_partial_sources import user_verified_body
        from reviewed_partial_sources import _material
        if _material(receipt,materials,receipt['baseReportFile'])!=base:
            raise ValueError('The complete human source base differs from its original evidence')
        user_complete_verse=user_verified_body(base,receipt)
        if user_complete_verse not in weak:raise ValueError('The accepted verse was not an original failed source')
        if {c['side'] for c in receipt['cuts'] if c['verse']==user_complete_verse and c.get('measurementKind')=='user-natural-seam'}!={'head','tail'}:
            raise ValueError('Both explicitly accepted complete-verse edges must be measured')
        if any(c.get('measurementKind') is not None and c['verse']!=user_complete_verse for c in receipt['cuts']):
            raise ValueError('An unrelated nonquiet source cut was not accepted')
        word_fits=lambda v,w,lo,hi,core=False:lo<=w['start']<w['end']<=hi
    elif human:
        from user_source_seams import user_seam_rules
        if receipt['schemaVersion']==28:
            from reviewed_anchor_sources import preserved_seam_rules
            word_fits=preserved_seam_rules(base,receipt,checks,final)
        else:word_fits=user_seam_rules(base,receipt,checks,final)
    else:
        if any(c.get('measurementKind') is not None for c in receipt['cuts']):raise ValueError('Source-only review cannot authorize a nonquiet human seam')
        word_fits=lambda v,w,lo,hi,core=False:lo<=w['start']<w['end']<=hi
    prefix_rules={};resolved_gaps=copy.deepcopy(base['unclaimedSpeech'])
    if prefix_mode:
        from official_source_prefixes import source_prefix_rules
        prefix_rules=source_prefix_rules(base,receipt,materials,original,final)
        for i,rule in prefix_rules.items():resolved_gaps[i].update(start=rule['range'][0],end=rule['range'][1])
    floor_rules={}
    if receipt['schemaVersion']==7:
        from source_quantization import quantization_rules
        floor_rules=quantization_rules(base,receipt,materials)
    if not original_model_order_valid(base['cues'],base['duration'],receipt['schemaVersion']):raise ValueError('Invalid original cue order or range')
    if original_joint_context is not None:
        if (receipt['schemaVersion'] not in {40,41,43} or original_joint_context['key']!=base['key']
            or original_joint_context['sourceAudioSha256']!=base['sourceAudioSha256']
            or not verified_joint_proofs(original_joint_context)):
            raise ValueError('Need the complete unchanged original joint context for numeric source recovery')
        for group in base.get('jointAlignments',[]):
            if group not in original_joint_context.get('jointAlignments',[]) or any(base['checks'][v-1]!=original_joint_context['checks'][v-1] for v in group['verses']):
                raise ValueError('A retained original joint model was changed')
    elif base.get('jointAlignments') or any(c.get('jointProofId') or c.get('jointClipRange') is not None for c in base['checks']):
        if not verified_joint_proofs(base):raise ValueError('Original joint provenance did not verify')
    failures_by_verse={c['verse']:c['reasons'] for c in failures};locale=base['key'].split(':')[-1]
    for verse,c in zip(base['boundarySourceVerses'],base['checks']):
        v=c['verse'];edges,e=verse_boundary(c['alignedWords'],c['searchRange'],base['duration'],locale,reference=boundary_text(verse['text'],locale),signal=c.get('boundarySignal'),anchors=c.get('asrEdgeAnchors'))
        if c['text']!=verse['text'] or final[v]['text']!=verse['text']:raise ValueError('Canonical original text changed')
        anchors=c.get('asrEdgeAnchors',[]);recognized=[w for seg in base['recognition'] for w in seg.get('words',[])]
        if anchors and (len(anchors)!=2 or any(w not in recognized for w in anchors)):raise ValueError('Original anchor is not from original recognition')
        if v in weak:
            mean_only=receipt['schemaVersion'] in {27,28} and e['reasons']==['weak-verse-location']
            if mean_only:
                from reviewed_anchor_sources import verify_anchored_mean_boundary
                verify_anchored_mean_boundary(base,c,final[v],receipt['cuts'],e['reasons'],e['timedFraction'],'protectedCore' if human else 'ownVoice')
            if (edges is not None or c['boundaryVerified'] or c.get('jointProofId') or c.get('jointClipRange') is not None
                or e['reasons']!=failures_by_verse[v] or (not mean_only and v!=user_complete_verse and ('weak-edge-word' not in e['reasons']
                or not set(e['reasons'])<=set(REVIEWED_WINDOW_POLICY['failures']))) or e['timedFraction']!=1):
                raise ValueError('Unregistered original source-window failure')
        else:
            if edges is None or not c['boundaryVerified']:raise ValueError('An unrelated original check failed')
            if c.get('jointClipRange') is not None:edges=c['jointClipRange']
            if original.get(v)!={'verse':v,'text':c['text'],'start':edges[0],'end':edges[1]}:raise ValueError('An unchanged original model cue differs')
    gap_issues=boundary_gap_issues(base['unclaimedSpeech'],base['cues'])
    if base['issues']!=['unreliable-verse-boundary:'+str(v) for v in weak]+gap_issues:raise ValueError('Another original failure was waived')
    required=set();non_heading=set();first,last=base['cues'][0]['start'],base['cues'][-1]['end']
    for i,g in enumerate(base['unclaimedSpeech']):
        lo,hi=g['start'],g['end']
        if not all(finite(t) for t in [lo,hi]) or not 0<=lo<=hi<=base['duration']:raise ValueError('Invalid original unclaimed interval')
        if i in floor_rules:continue
        allowed=(g.get('allowedHeadingOrClosing') is True and ((g.get('kind')=='leading' and hi<=first) or (g.get('kind')=='trailing' and lo>=last)))
        if allowed:continue
        if lo==hi:
            # A zero clock is not silence. It may already be owned by one real
            # sample inside an original, fully verified verse whose complete
            # clip is retained. A point outside those clips still needs source
            # review and cannot be waived by an empty interval.
            sample=round(lo*16000)
            owners=[c for c in base['cues'] if round(c['start']*16000)<=sample<sample+1<=round(c['end']*16000)
                and normalized(g['text']) and normalized(g['text']) in normalized(checks[c['verse']]['text'])
                and final[c['verse']]['start']<=c['start'] and c['end']<=final[c['verse']]['end']]
            if len(owners)!=1:raise ValueError('A zero-duration source speech clock needs separate source review')
            continue
        non_heading.add(i)
        if not any(c['start']<=lo<hi<=c['end'] for c in base['cues']):required.add(i)
    seen=set();split_gaps={}
    for ownership in receipt['gapAssignments']:
        i=ownership['index']
        if receipt['schemaVersion']==16 and 'ownerVerses' in ownership:
            seam=receipt['naturalSeam'];left,right=seam['leftVerse'],seam['rightVerse'];cut=seam['cut']
            if i not in required or i in seen:raise ValueError('Unknown or duplicate split source-gap owner')
            g=base['unclaimedSpeech'][i]
            if (ownership['ownerVerses']!=[left,right] or ownership['splitAt']!=cut or ownership['gapSha256']!=digest(g)
                    or not normalized(g['text']) or not final[left]['start']<=g['start']<cut<g['end']<=final[right]['end']
                    or final[left]['end']!=cut or final[right]['start']!=cut):
                raise ValueError('The complete original gap is not retained by the exact accepted shared seam')
            split_gaps[i]=[{**g,'end':cut},{**g,'start':cut}];seen.add(i);continue
        v=ownership['ownerVerse']
        if i not in required or i in seen or v not in final:raise ValueError('Unknown or duplicate source-gap owner')
        seen.add(i);g=base['unclaimedSpeech'][i];effective=resolved_gaps[i];cue=final[v];prefix=prefix_rules.get(i)
        correct_text=(prefix['verse']==v and normalized(g['text'])==normalized(prefix['text'])) if prefix else (normalized(g['text']) in normalized(checks[v]['text']) or background_owners.get(i)==v or model_gap_owners.get(i)==v)
        if (ownership['gapSha256']!=digest(g) or not normalized(g['text']) or not correct_text
            or not cue['start']<=effective['start']<effective['end']<=cue['end']):raise ValueError('Original source gap is not fully owned by its registered verse')
    if seen!=required:raise ValueError('Every original unclaimed interval needs its registered source owner')
    if any(i not in split_gaps and not any(c['start']<=resolved_gaps[i]['start']<resolved_gaps[i]['end']<=c['end'] for c in receipt['finalCues']) for i in non_heading):raise ValueError('Final source cuts omit non-heading speech at the chapter edges')
    needed={(v,side) for v,c in final.items() for side,field in [('head','start'),('tail','end')] if v not in original or original[v][field]!=c[field]};seen=set()
    if receipt['schemaVersion'] in {16,28}:needed.update((c['verse'],c['side']) for c in receipt['cuts'] if c.get('measurementKind')=='user-natural-seam')
    for cut in receipt['cuts']:
        v,side=cut['verse'],cut['side'];signature=(v,side)
        if signature not in needed or signature in seen:raise ValueError('Unregistered or duplicate source correction')
        seen.add(signature);old=original.get(v);c=final[v];start,end=c['start'],c['end']
        core_field='protectedCore' if human and (receipt['schemaVersion']!=29 or cut.get('measurementKind')=='user-natural-seam') else 'ownVoice'
        voice_start,voice_end=cut[core_field];lo,hi=cut['window'];refs=cut['referenceRanges']
        if (cut['before']!=([old['start'],old['end']] if old else None) or cut['after']!=[start,end]
            or not all(finite(t) for t in [start,end,voice_start,voice_end,cut['previousVoiceEnd'],cut['nextVoiceStart']])
            or not 0<=cut['previousVoiceEnd']<=start<=voice_start<voice_end<=end<=cut['nextVoiceStart']<=base['duration']
            or type(lo) is not int or type(hi) is not int or not 0<=lo<hi<=round(base['duration']*16000)
            or (hi-lo)%160 or not 160<=hi-lo<=640 or len(refs)!=2
            or any(type(x) is not int or type(y) is not int or not 0<=x<y<=round(base['duration']*16000) for x,y in refs)):
            raise ValueError('Invalid registered original-source protection')
        value=start if side=='head' else end
        if not lo<=value*16000<=hi:raise ValueError('Source cut leaves its registered measurement window')
        if side=='head' and not cut['previousVoiceEnd']*16000<=lo<hi<=voice_start*16000:raise ValueError('Head crosses protected source voice')
        if side=='tail' and not voice_end*16000<=lo<hi<=cut['nextVoiceStart']*16000:raise ValueError('Tail crosses protected source voice')
        words=[w for w in checks[v]['alignedWords'] if normalized(w.get('word',''))]
        if not words or any(not word_fits(v,w,voice_start,voice_end,True) for w in words):raise ValueError('Original complete aligned word body was lost without an explicit registered human clock exception')
    if seen!=needed:raise ValueError('Every changed source edge needs fixed acoustic approval')
    previous=0
    for c in receipt['finalCues']:
        if not all(finite(t) for t in [c['start'],c['end']]) or not previous<=c['start']<c['end']<=base['duration']:raise ValueError('Final verse ranges overlap')
        if any(not word_fits(c['verse'],w,c['start'],c['end']) for w in checks[c['verse']]['alignedWords'] if normalized(w.get('word',''))):raise ValueError('Final source range loses a model word body without an explicit registered human clock exception')
        previous=c['end']
    final_gaps=[part for i,g in enumerate(resolved_gaps) if i not in floor_rules for part in split_gaps.get(i,[g])]
    if boundary_gap_issues(final_gaps,receipt['finalCues']):raise ValueError('An original source interval remains unowned')
    result=copy.deepcopy(base);result.update(accepted=True,issues=[],cues=copy.deepcopy(receipt['finalCues']))
    for c in result['checks']:
        if c['verse'] in weak:c['boundaryVerified']=True
    return result
