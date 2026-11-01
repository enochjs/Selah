"""Registered original-source review of isolated, rejected weak verse edges.

The raw failed checks remain in baseEvidence. Only explicitly registered cues
and derived boundaryVerified flags change; every other original proof reruns.
"""
import copy,hashlib
from pathlib import Path
from boundary_quality import finite,verse_boundary
from quiet_gaps import digest
from timed_text import normalized
from spoken_text import boundary_text
from reviewed_boundaries import approved_receipt,_measure
from reviewed_source_windows import REVIEWED_WINDOW_POLICY,derive_source_window_case
from user_source_seams import USER_SOURCE_SEAM_POLICY,USER_PRESERVED_SEAM_POLICY,measure_user_source_cut
from official_source_prefixes import OFFICIAL_PREFIX_POLICY
from source_quantization import QUANTIZATION_POLICY,quantization_floor_matches
from reviewed_numeric_sources import REVIEWED_NUMERIC_SOURCE_POLICY,REVIEWED_NUMERIC_USER_POLICY,derive_numeric_source_case
from reviewed_gap_sources import REVIEWED_GAP_SOURCE_POLICY,derive_gap_source_case,original_gap_measurements_match
from reviewed_partial_sources import REVIEWED_PARTIAL_SOURCE_POLICY,REVIEWED_PARTIAL_HUMAN_POLICY,derive_partial_source_case
from reviewed_heading_sources import REVIEWED_HEADING_POLICY,derive_heading_source_case
from reviewed_source_context import REVIEWED_CONTEXT_POLICY,derive_context_source_case
from reviewed_absent_fragments import REVIEWED_ABSENT_FRAGMENT_POLICY,derive_absent_fragment_case,absent_fragment_measurements_match
from reviewed_user_gap_sources import REVIEWED_USER_GAP_POLICY,derive_user_gap_source_case
from reviewed_source_placeholders import REVIEWED_PLACEHOLDER_POLICY,derive_placeholder_case,placeholder_measurements_match
from reviewed_confirmed_sources import REVIEWED_CONFIRMED_SOURCE_POLICY,REVIEWED_CONFIRMED_GAP_POLICY,derive_confirmed_source_case,confirmed_source_measurements_match
from reviewed_coverage_windows import REVIEWED_COVERAGE_WINDOW_POLICY,derive_coverage_window_case,coverage_window_measurements_match
from reviewed_background_sources import REVIEWED_BACKGROUND_SOURCE_POLICY,background_source_measurements_match
from reviewed_numbered_sources import REVIEWED_NUMBERED_SOURCE_POLICY,derive_numbered_source_case
from reviewed_psalm136_final import REVIEWED_PSALM136_FINAL_POLICY,derive_psalm136_final_case,psalm136_measurements_match
from reviewed_saying_sources import REVIEWED_SAYING_USER_POLICY
from reviewed_nehemiah7_sources import REVIEWED_NEHEMIAH7_USER_POLICY,REVIEWED_NEHEMIAH7_SOURCE_POLICY,derive_nehemiah7_source_case
from reviewed_chronicles21_sources import REVIEWED_CHRONICLES21_SOURCE_POLICY,derive_chronicles21_source_case
from reviewed_caption_models import REVIEWED_CAPTION_MODEL_POLICY,derive_caption_model_case,caption_model_measurements_match
from reviewed_partitioned_zero_sources import REVIEWED_PARTITIONED_ZERO_POLICY,derive_partitioned_zero_case
from reviewed_saying_sources import REVIEWED_SAYING_SOURCE_POLICY,derive_saying_source_case,saying_source_measurements_match
from reviewed_next_chapter_sources import REVIEWED_NEXT_CHAPTER_SOURCE_POLICY,derive_next_chapter_fragment_case,next_chapter_fragment_measurements_match
from reviewed_companion_fragments import REVIEWED_COMPANION_FRAGMENT_POLICY,derive_companion_fragment_case,companion_fragment_measurements_match
from reviewed_closing_captions import REVIEWED_CLOSING_CAPTION_POLICY,derive_closing_caption_case
from reviewed_zero_clocks import REVIEWED_ZERO_CLOCK_POLICY,derive_zero_clock_case
from reviewed_terminal_source_fragments import REVIEWED_TERMINAL_SOURCE_FRAGMENT_POLICY,derive_terminal_source_fragment_case,terminal_source_measurements_match
from reviewed_missing_source_fragments import REVIEWED_MISSING_SOURCE_FRAGMENT_POLICY,derive_missing_source_fragment_case
from reviewed_anchor_sources import REVIEWED_ANCHOR_SOURCE_POLICY,REVIEWED_ANCHOR_USER_POLICY,REVIEWED_HUMAN_SOURCE_POLICY
from reviewed_ending_sources import REVIEWED_ENDING_SOURCE_POLICY,derive_ending_source_case,ending_source_measurements_match
from reviewed_human_partial_sources import REVIEWED_HUMAN_PARTIAL_POLICY,REVIEWED_HUMAN_PROJECTED_PARTIAL_POLICY,derive_human_partial_case,human_partial_measurements_match

REVIEWED_WEAK_POLICY={'version':'registered-source-weak-edges-v1','sampleRate':16000,
 'base':'raw-boundary-or-joint-proof-with-only-exact-registered-weak-edge-failures',
 'changes':'fixed-cues-and-derived-boundaryVerified-only; immutable-original-model-facts',
 'shadow':'original-joint-cues-plus-exact-weak-repair-and-required-non-joint-neighbor-cut',
 'sourceExtensions':'registered-outward-edges-only; joint-group-outer-edges-only',
 'approval':'fixed-raw-receipt-sha256-with-complete-original-source-output-inventory',
 'source':'registered-voice-protection-and-10-to-40ms-source-pcm-windows'}


def _derived(base,receipt,materials=None):
    if receipt['schemaVersion']==43:return derive_psalm136_final_case(base,receipt,materials)
    if receipt['schemaVersion']==42:return derive_saying_source_case(base,receipt,materials)
    if receipt['schemaVersion']==41:return derive_nehemiah7_source_case(base,receipt,materials)
    if receipt['schemaVersion']==40:return derive_nehemiah7_source_case(base,receipt,materials)
    if receipt['schemaVersion']==39:return derive_chronicles21_source_case(base,receipt,materials)
    if receipt['schemaVersion']==38:return derive_caption_model_case(base,receipt,materials)
    if receipt['schemaVersion']==37:return derive_partitioned_zero_case(base,receipt,materials)
    if receipt['schemaVersion']==36:return derive_saying_source_case(base,receipt,materials)
    if receipt['schemaVersion']==35:return derive_next_chapter_fragment_case(base,receipt,materials)
    if receipt['schemaVersion']==34:return derive_companion_fragment_case(base,receipt,materials)
    if receipt['schemaVersion']==33:return derive_closing_caption_case(base,receipt,materials)
    if receipt['schemaVersion']==32:return derive_zero_clock_case(base,receipt,materials)
    if receipt['schemaVersion']==31:return derive_terminal_source_fragment_case(base,receipt,materials)
    if receipt['schemaVersion']==30:return derive_missing_source_fragment_case(base,receipt,materials)
    if receipt['schemaVersion']==26:return derive_ending_source_case(base,receipt,materials)
    if receipt['schemaVersion'] in {24,25}:return derive_human_partial_case(base,receipt,materials)
    if receipt['schemaVersion']==22:return derive_numbered_source_case(base,receipt,materials)
    if receipt['schemaVersion']==20:return derive_coverage_window_case(base,receipt,materials)
    if receipt['schemaVersion'] in {19,23}:return derive_confirmed_source_case(base,receipt,materials)
    if receipt['schemaVersion']==18:return derive_placeholder_case(base,receipt,materials)
    if receipt['schemaVersion']==16:return derive_user_gap_source_case(base,receipt,materials)
    if receipt['schemaVersion']==15:return derive_absent_fragment_case(base,receipt,materials)
    if receipt['schemaVersion']==14:return derive_context_source_case(base,receipt,materials)
    if receipt['schemaVersion']==13:return derive_heading_source_case(base,receipt,materials)
    if receipt['schemaVersion'] in {9,17,21}:return derive_numeric_source_case(base,receipt,materials)
    if receipt['schemaVersion']==10:return derive_gap_source_case(base,receipt,materials)
    if receipt['schemaVersion'] in {11,12}:return derive_partial_source_case(base,receipt,materials)
    if receipt['schemaVersion'] in {4,5,6,7,8,27,28,29}:return derive_source_window_case(base,receipt,materials)
    from alignment_contract import BOUNDARY_REVIEW_RECIPE,BOUNDARY_CONTEXT_RECIPE,PADDING_REVIEW_RECIPE,BOUNDARY_RECOGNIZER,site_fingerprint
    from boundary_quality import verified_boundary_artifact
    weak=receipt['weakVerses'];checks={c['verse']:c for c in base['checks']}
    if (base['qualityRecipe'] not in {BOUNDARY_REVIEW_RECIPE,BOUNDARY_CONTEXT_RECIPE,PADDING_REVIEW_RECIPE}
        or base.get('accepted') is not False or not weak or weak!=sorted(set(weak))
        or base['issues']!=['unreliable-verse-boundary:'+str(v) for v in weak]
        or base['fingerprint']!=site_fingerprint(base['sourceAudioSha256'],base['textSha256'],base['key'].split(':')[-1],base['qualityRecipe'],BOUNDARY_RECOGNIZER)):
        raise ValueError('Need exactly the registered original weak-edge failures')
    original={c['verse']:c for c in base['cues']};final={c['verse']:c for c in receipt['finalCues']};shadow={c['verse']:c for c in receipt['shadowCues']}
    if len(original)!=len(base['cues']) or len(final)!=len(receipt['finalCues']) or len(shadow)!=len(receipt['shadowCues']):raise ValueError('Duplicate source verse')
    if [c['verse'] for c in base['cues']]!=[v for v in base['expectedVerseNumbers'] if v not in weak]:raise ValueError('Original source cue inventory differs')
    previous=0
    for c in base['cues']:
        if not all(finite(t) for t in [c['start'],c['end']]) or not previous<=c['start']<c['end']<=base['duration']:raise ValueError('Invalid original cue order or range')
        previous=c['end']
    for v,c in checks.items():
        locale=base['key'].split(':')[-1]
        edges,evidence=verse_boundary(c['alignedWords'],c['searchRange'],base['duration'],locale,reference=boundary_text(c['text'],locale),signal=c.get('boundarySignal'),anchors=c.get('asrEdgeAnchors'))
        if v in weak:
            if edges is not None or evidence['reasons']!=['weak-edge-word'] or c['boundaryVerified'] or v in original or c.get('jointProofId') or c.get('jointClipRange') is not None:
                raise ValueError('Registered failure is not an isolated original weak edge')
        else:
            if edges is None or not c['boundaryVerified']:raise ValueError('Another original verse did not pass')
            if c.get('jointClipRange') is not None:edges=c['jointClipRange']
            if original.get(v)!={'verse':v,'text':c['text'],'start':edges[0],'end':edges[1]}:raise ValueError('Original successful cue changed')
    if set(checks)-set(original)!=set(weak) or set(final)!=set(checks) or set(shadow)!=set(checks):raise ValueError('Missing original or final verse')
    shadow_ranges={}
    for v,c in shadow.items():
        if c['text']!=checks[v]['text']:raise ValueError('Shadow source text changed')
        old=original.get(v)
        if old is None:
            if c!=final[v]:raise ValueError('Weak shadow and final cue differ')
            shadow_ranges[v]=[c['start'],c['end']]
        else:
            for side,field in [('head','start'),('tail','end')]:
                if old[field]==c[field]:continue
                if (checks[v].get('jointProofId') or checks[v].get('jointClipRange') is not None
                    or (v+(1 if side=='tail' else -1)) not in weak or c[field]!=final[v][field]):raise ValueError('Shadow changes an unrelated original edge')
                shadow_ranges[v]=[c['start'],c['end']]
    needed=set()
    for v,c in final.items():
        if c['text']!=checks[v]['text']:raise ValueError('Reviewed source text changed')
        old=original.get(v)
        for side,field in [('head','start'),('tail','end')]:
            if old is None or old[field]!=c[field]:needed.add((v,side))
    seen=set();ranges={}
    for cut in receipt['cuts']:
        v,side=cut['verse'],cut['side'];signature=(v,side)
        if signature not in needed or signature in seen:raise ValueError('Unregistered or duplicate edge review')
        seen.add(signature);c=final[v];old=original.get(v);start,end=c['start'],c['end'];lo,hi=cut['window'];voice_start,voice_end=cut['ownVoice'];refs=cut['referenceRanges']
        if (cut['before']!=([old['start'],old['end']] if old else None) or cut['after']!=[start,end]
            or not all(finite(t) for t in [start,end,voice_start,voice_end,cut['previousVoiceEnd'],cut['nextVoiceStart']])
            or not 0<=cut['previousVoiceEnd']<=start<=voice_start<voice_end<=end<=cut['nextVoiceStart']<=base['duration']
            or type(lo) is not int or type(hi) is not int or not 0<=lo<hi<=round(base['duration']*16000)
            or (hi-lo)%160 or not 160<=hi-lo<=640 or len(refs)!=2
            or any(type(x) is not int or type(y) is not int or not 0<=x<y<=round(base['duration']*16000) for x,y in refs)):
            raise ValueError('Invalid registered original voice protection')
        edge=start if side=='head' else end
        if not lo<=edge*16000<=hi:raise ValueError('Cut outside registered acoustic window')
        if side=='head' and not cut['previousVoiceEnd']*16000<=lo<hi<=voice_start*16000:raise ValueError('Head overlaps source voice')
        if side=='tail' and not voice_end*16000<=lo<hi<=cut['nextVoiceStart']*16000:raise ValueError('Tail overlaps source voice')
        field='start' if side=='head' else 'end';prior=shadow[v][field]
        if c[field]!=prior:
            if v in weak or (side=='head' and start>prior) or (side=='tail' and end<prior):raise ValueError('Additional source correction must extend outward')
            if checks[v].get('jointProofId'):
                group=next(p for p in base['jointAlignments'] if p['id']==checks[v]['jointProofId'])['verses']
                if v!=(min(group) if side=='head' else max(group)):raise ValueError('Cannot move an original joint internal boundary')
        words=[w for w in checks[v]['alignedWords'] if normalized(w.get('word',''))]
        if not words or any(not voice_start<=w['start']<w['end']<=voice_end for w in words):raise ValueError('Reviewed protection loses an original aligned word')
        ranges[v]=[start,end]
    if seen!=needed or not set(weak)<=set(ranges):raise ValueError('Every inserted or changed edge needs its own source review')
    result=copy.deepcopy(base);result.update(cues=copy.deepcopy(receipt['shadowCues']),accepted=True,issues=[])
    for c in result['checks']:
        if c['verse'] in weak:c['boundaryVerified']=True
    if not verified_boundary_artifact(result,boundary_ranges=shadow_ranges):raise ValueError('Remaining complete original chapter proof did not verify')
    from boundary_quality import boundary_gap_issues
    if [c['verse'] for c in receipt['finalCues']]!=base['expectedVerseNumbers']:raise ValueError('Final verse order differs')
    previous=0
    for c in receipt['finalCues']:
        if not all(finite(t) for t in [c['start'],c['end']]) or not previous<=c['start']<c['end']<=base['duration']:raise ValueError('Final source ranges overlap')
        words=[w for w in checks[c['verse']]['alignedWords'] if normalized(w.get('word',''))]
        if any(not c['start']<=w['start']<w['end']<=c['end'] for w in words):raise ValueError('Final range loses original word body')
        previous=c['end']
    if boundary_gap_issues(base['unclaimedSpeech'],receipt['finalCues']):raise ValueError('Final source ranges leave unexplained voice')
    result['cues']=copy.deepcopy(receipt['finalCues'])
    return result


def _payload(a):
    omitted={'verseFiles','vttFile','vttSha256','individualSequentialReview','qualityRecipe','fingerprint','reviewedWeakReview'}
    return {k:v for k,v in a.items() if k not in omitted}


def _identity(receipt):
    from alignment_contract import REVIEWED_WEAK_RECIPE,REVIEWED_WINDOW_RECIPE,USER_SOURCE_SEAM_RECIPE,OFFICIAL_PREFIX_RECIPE,QUANTIZATION_RECIPE,USER_PRESERVED_SEAM_RECIPE,REVIEWED_NUMERIC_SOURCE_RECIPE,REVIEWED_GAP_SOURCE_RECIPE,REVIEWED_PARTIAL_SOURCE_RECIPE,REVIEWED_PARTIAL_HUMAN_RECIPE
    values={2:(REVIEWED_WEAK_RECIPE,REVIEWED_WEAK_POLICY),4:(REVIEWED_WINDOW_RECIPE,REVIEWED_WINDOW_POLICY),5:(USER_SOURCE_SEAM_RECIPE,USER_SOURCE_SEAM_POLICY),6:(OFFICIAL_PREFIX_RECIPE,OFFICIAL_PREFIX_POLICY),7:(QUANTIZATION_RECIPE,QUANTIZATION_POLICY),8:(USER_PRESERVED_SEAM_RECIPE,USER_PRESERVED_SEAM_POLICY),9:(REVIEWED_NUMERIC_SOURCE_RECIPE,REVIEWED_NUMERIC_SOURCE_POLICY),10:(REVIEWED_GAP_SOURCE_RECIPE,REVIEWED_GAP_SOURCE_POLICY),11:(REVIEWED_PARTIAL_SOURCE_RECIPE,REVIEWED_PARTIAL_SOURCE_POLICY),12:(REVIEWED_PARTIAL_HUMAN_RECIPE,REVIEWED_PARTIAL_HUMAN_POLICY)}
    from alignment_contract import REVIEWED_HEADING_RECIPE
    values[13]=(REVIEWED_HEADING_RECIPE,REVIEWED_HEADING_POLICY)
    from alignment_contract import REVIEWED_CONTEXT_RECIPE
    values[14]=(REVIEWED_CONTEXT_RECIPE,REVIEWED_CONTEXT_POLICY)
    from alignment_contract import REVIEWED_ABSENT_FRAGMENT_RECIPE
    values[15]=(REVIEWED_ABSENT_FRAGMENT_RECIPE,REVIEWED_ABSENT_FRAGMENT_POLICY)
    from alignment_contract import REVIEWED_USER_GAP_RECIPE
    values[16]=(REVIEWED_USER_GAP_RECIPE,REVIEWED_USER_GAP_POLICY)
    from alignment_contract import REVIEWED_NUMERIC_USER_RECIPE
    values[17]=(REVIEWED_NUMERIC_USER_RECIPE,REVIEWED_NUMERIC_USER_POLICY)
    from alignment_contract import REVIEWED_PLACEHOLDER_RECIPE
    values[18]=(REVIEWED_PLACEHOLDER_RECIPE,REVIEWED_PLACEHOLDER_POLICY)
    from alignment_contract import REVIEWED_CONFIRMED_SOURCE_RECIPE
    values[19]=(REVIEWED_CONFIRMED_SOURCE_RECIPE,REVIEWED_CONFIRMED_SOURCE_POLICY)
    from alignment_contract import REVIEWED_COVERAGE_WINDOW_RECIPE
    values[20]=(REVIEWED_COVERAGE_WINDOW_RECIPE,REVIEWED_COVERAGE_WINDOW_POLICY)
    from alignment_contract import REVIEWED_BACKGROUND_SOURCE_RECIPE
    values[21]=(REVIEWED_BACKGROUND_SOURCE_RECIPE,REVIEWED_BACKGROUND_SOURCE_POLICY)
    from alignment_contract import REVIEWED_NUMBERED_SOURCE_RECIPE
    values[22]=(REVIEWED_NUMBERED_SOURCE_RECIPE,REVIEWED_NUMBERED_SOURCE_POLICY)
    from alignment_contract import REVIEWED_CONFIRMED_GAP_RECIPE
    values[23]=(REVIEWED_CONFIRMED_GAP_RECIPE,REVIEWED_CONFIRMED_GAP_POLICY)
    from alignment_contract import REVIEWED_HUMAN_PARTIAL_RECIPE
    values[24]=(REVIEWED_HUMAN_PARTIAL_RECIPE,REVIEWED_HUMAN_PARTIAL_POLICY)
    from alignment_contract import REVIEWED_HUMAN_PROJECTED_PARTIAL_RECIPE
    values[25]=(REVIEWED_HUMAN_PROJECTED_PARTIAL_RECIPE,REVIEWED_HUMAN_PROJECTED_PARTIAL_POLICY)
    from alignment_contract import REVIEWED_ENDING_SOURCE_RECIPE
    values[26]=(REVIEWED_ENDING_SOURCE_RECIPE,REVIEWED_ENDING_SOURCE_POLICY)
    from alignment_contract import REVIEWED_ANCHOR_SOURCE_RECIPE,REVIEWED_ANCHOR_USER_RECIPE,REVIEWED_HUMAN_SOURCE_RECIPE
    values[27]=(REVIEWED_ANCHOR_SOURCE_RECIPE,REVIEWED_ANCHOR_SOURCE_POLICY)
    values[28]=(REVIEWED_ANCHOR_USER_RECIPE,REVIEWED_ANCHOR_USER_POLICY)
    values[29]=(REVIEWED_HUMAN_SOURCE_RECIPE,REVIEWED_HUMAN_SOURCE_POLICY)
    from alignment_contract import REVIEWED_MISSING_SOURCE_FRAGMENT_RECIPE
    values[30]=(REVIEWED_MISSING_SOURCE_FRAGMENT_RECIPE,REVIEWED_MISSING_SOURCE_FRAGMENT_POLICY)
    from alignment_contract import REVIEWED_TERMINAL_SOURCE_FRAGMENT_RECIPE
    values[31]=(REVIEWED_TERMINAL_SOURCE_FRAGMENT_RECIPE,REVIEWED_TERMINAL_SOURCE_FRAGMENT_POLICY)
    from alignment_contract import REVIEWED_ZERO_CLOCK_RECIPE
    values[32]=(REVIEWED_ZERO_CLOCK_RECIPE,REVIEWED_ZERO_CLOCK_POLICY)
    from alignment_contract import REVIEWED_CLOSING_CAPTION_RECIPE
    values[33]=(REVIEWED_CLOSING_CAPTION_RECIPE,REVIEWED_CLOSING_CAPTION_POLICY)
    from alignment_contract import REVIEWED_COMPANION_FRAGMENT_RECIPE
    values[34]=(REVIEWED_COMPANION_FRAGMENT_RECIPE,REVIEWED_COMPANION_FRAGMENT_POLICY)
    from alignment_contract import REVIEWED_NEXT_CHAPTER_SOURCE_RECIPE
    values[35]=(REVIEWED_NEXT_CHAPTER_SOURCE_RECIPE,REVIEWED_NEXT_CHAPTER_SOURCE_POLICY)
    from alignment_contract import REVIEWED_SAYING_SOURCE_RECIPE
    values[36]=(REVIEWED_SAYING_SOURCE_RECIPE,REVIEWED_SAYING_SOURCE_POLICY)
    from alignment_contract import REVIEWED_PARTITIONED_ZERO_RECIPE
    values[37]=(REVIEWED_PARTITIONED_ZERO_RECIPE,REVIEWED_PARTITIONED_ZERO_POLICY)
    from alignment_contract import REVIEWED_CAPTION_MODEL_RECIPE
    values[38]=(REVIEWED_CAPTION_MODEL_RECIPE,REVIEWED_CAPTION_MODEL_POLICY)
    from alignment_contract import REVIEWED_CHRONICLES21_SOURCE_RECIPE
    values[39]=(REVIEWED_CHRONICLES21_SOURCE_RECIPE,REVIEWED_CHRONICLES21_SOURCE_POLICY)
    from alignment_contract import REVIEWED_NEHEMIAH7_SOURCE_RECIPE
    values[40]=(REVIEWED_NEHEMIAH7_SOURCE_RECIPE,REVIEWED_NEHEMIAH7_SOURCE_POLICY)
    from alignment_contract import REVIEWED_NEHEMIAH7_USER_RECIPE,REVIEWED_SAYING_USER_RECIPE,REVIEWED_PSALM136_FINAL_RECIPE
    values.update({41:(REVIEWED_NEHEMIAH7_USER_RECIPE,REVIEWED_NEHEMIAH7_USER_POLICY),42:(REVIEWED_SAYING_USER_RECIPE,REVIEWED_SAYING_USER_POLICY),43:(REVIEWED_PSALM136_FINAL_RECIPE,REVIEWED_PSALM136_FINAL_POLICY)})
    if receipt['schemaVersion'] not in values:raise ValueError('Unsupported registered weak/source review identity')
    return values[receipt['schemaVersion']]


def _case(a):
    from alignment_contract import REVIEWED_WEAK_RECIPE,REVIEWED_WINDOW_RECIPE,USER_SOURCE_SEAM_RECIPE,BOUNDARY_RECOGNIZER,site_fingerprint
    from numeric_alignment import verified_numeric_files
    from timed_text import webvtt
    r=a['reviewedWeakReview'];receipt,sha=approved_receipt(r['caseId']);base=r['baseEvidence']
    recipe,policy=_identity(receipt)
    if (a['qualityRecipe']!=recipe or r['policy']!=policy
        or r['receiptSha256']!=sha or digest(base)!=receipt['baseEvidenceSha256']
        or any(a[k]!=receipt[k] for k in ['key','sourceAudioSha256','textSha256','duration'])
        or a['fingerprint']!=site_fingerprint(a['sourceAudioSha256'],a['textSha256'],a['key'].split(':')[-1],recipe,BOUNDARY_RECOGNIZER)):
        raise ValueError('Registered weak-edge source evidence differs')
    if not receipt['evidence'] or len(r['evidenceFiles'])!=len(receipt['evidence']):raise ValueError('Missing original acoustic review')
    for actual,expected in zip(r['evidenceFiles'],receipt['evidence']):
        if actual['file']!=expected['file'] or hashlib.sha256(actual['utf8'].encode()).hexdigest()!=expected['sha256']:raise ValueError('Acoustic evidence changed')
    if _payload(a)!=_payload(_derived(base,receipt,r['evidenceFiles'])):raise ValueError('Registered complete source derivation differs')
    inventory={**a,'verseFiles':receipt['outputInventory']}
    if receipt['schemaVersion'] in {11,12,18,19,20,23,24,25}:
        from audio_coverage import narrated_verses
        inventory['boundarySourceVerses']=narrated_verses(a)
    if not verified_numeric_files(inventory) or hashlib.sha256(webvtt(receipt['usfm'],receipt['chapter'],a['cues']).encode()).hexdigest()!=receipt['outputVttSha256']:raise ValueError('Complete registered output inventory differs')
    return receipt,base


def verified_reviewed_weak_artifact(a):
    try:
        receipt,_=_case(a);r=a['reviewedWeakReview']
        if r['id']!=digest({k:v for k,v in r.items() if k!='id'}) or len(r['measurements'])!=len(receipt['cuts']):return False
        for actual,cut in zip(r['measurements'],receipt['cuts']):
            refs,values=actual['referenceRms'],actual['frameRms']
            if actual['verse']!=cut['verse'] or actual['window']!=cut['window'] or len(refs)!=2 or any(not finite(v) or not 0<v<=1 for v in refs):return False
            limit=1 if receipt['schemaVersion'] in {5,8,12,13,16,17,22,24,25,26,28,29,30,33,41,43} and cut.get('measurementKind')=='user-natural-seam' else min(.1,min(refs)*.5)
            if len(values)!=(cut['window'][1]-cut['window'][0])//160 or any(not finite(v) or not 0<=v<=limit for v in values):return False
        return True
    except (OSError,KeyError,TypeError,ValueError,IndexError,StopIteration,ZeroDivisionError):return False


def reviewed_weak_measurements_match(a,pcm):
    try:
        if not verified_reviewed_weak_artifact(a) or len(pcm)!=round(a['duration']*16000):return False
        receipt,_=_case(a)
        for cut,saved in zip(receipt['cuts'],a['reviewedWeakReview']['measurements']):
            actual=measure_user_source_cut(cut,pcm) if receipt['schemaVersion'] in {5,8,12,13,16,17,22,24,25,26,28,29,30,33,41,43} else _measure(cut,pcm)
            if any(abs(x-y)>1/32768 for k in ['referenceRms','frameRms'] for x,y in zip(actual[k],saved[k])):return False
        if receipt['schemaVersion'] in {11,12}:
            from audio_coverage import coverage_media_matches
            if not coverage_media_matches(a,pcm):return False
        if receipt['schemaVersion'] in {10,13,16,32,33,36,37,42} and not original_gap_measurements_match(a['reviewedWeakReview']['baseEvidence'],pcm):return False
        if receipt['schemaVersion']==15 and not absent_fragment_measurements_match(a['reviewedWeakReview']['baseEvidence'],receipt,a['reviewedWeakReview']['evidenceFiles'],pcm):return False
        if receipt['schemaVersion']==43 and not psalm136_measurements_match(a['reviewedWeakReview']['baseEvidence'],receipt,a['reviewedWeakReview']['evidenceFiles'],pcm):return False
        if receipt['schemaVersion']==38 and not caption_model_measurements_match(a['reviewedWeakReview']['baseEvidence'],receipt,a['reviewedWeakReview']['evidenceFiles'],pcm):return False
        if receipt['schemaVersion'] in {36,42} and not saying_source_measurements_match(a['reviewedWeakReview']['baseEvidence'],receipt,a['reviewedWeakReview']['evidenceFiles'],pcm):return False
        if receipt['schemaVersion']==35 and not next_chapter_fragment_measurements_match(a['reviewedWeakReview']['baseEvidence'],receipt,a['reviewedWeakReview']['evidenceFiles'],pcm):return False
        if receipt['schemaVersion']==34 and not companion_fragment_measurements_match(a['reviewedWeakReview']['baseEvidence'],receipt,a['reviewedWeakReview']['evidenceFiles'],pcm):return False
        if receipt['schemaVersion']==31 and not terminal_source_measurements_match(a['reviewedWeakReview']['baseEvidence'],receipt,a['reviewedWeakReview']['evidenceFiles'],pcm):return False
        if receipt['schemaVersion']==26 and not ending_source_measurements_match(a['reviewedWeakReview']['baseEvidence'],receipt,a['reviewedWeakReview']['evidenceFiles'],pcm):return False
        if receipt['schemaVersion'] in {24,25} and not human_partial_measurements_match(a['reviewedWeakReview']['baseEvidence'],receipt,a['reviewedWeakReview']['evidenceFiles'],pcm):return False
        if receipt['schemaVersion']==21 and not background_source_measurements_match(a['reviewedWeakReview']['baseEvidence'],receipt,a['reviewedWeakReview']['evidenceFiles'],pcm):return False
        if receipt['schemaVersion']==20 and not coverage_window_measurements_match(a['reviewedWeakReview']['baseEvidence'],receipt,a['reviewedWeakReview']['evidenceFiles'],pcm):return False
        if receipt['schemaVersion'] in {19,23} and not confirmed_source_measurements_match(a['reviewedWeakReview']['baseEvidence'],receipt,a['reviewedWeakReview']['evidenceFiles'],pcm):return False
        if receipt['schemaVersion']==18 and not placeholder_measurements_match(a['reviewedWeakReview']['baseEvidence'],receipt,a['reviewedWeakReview']['evidenceFiles'],pcm):return False
        if receipt['schemaVersion']==7 and not quantization_floor_matches(a['reviewedWeakReview']['baseEvidence'],receipt,pcm,a['reviewedWeakReview']['evidenceFiles']):return False
        return True
    except (KeyError,TypeError,ValueError,IndexError,StopIteration):return False


def verified_reviewed_weak_output_inventory(a):
    try:
        if not verified_reviewed_weak_artifact(a):return False
        receipt,_=_case(a)
        if receipt['schemaVersion'] in {11,12,18,19,20,23,24,25}:
            from partial_audio import verified_partial_files
            if not verified_partial_files(a):return False
        return a['verseFiles']==receipt['outputInventory'] and a['vttSha256']==receipt['outputVttSha256'] and a['vttFile']==receipt['outputVttSha256']+'.vtt'
    except (KeyError,TypeError,ValueError):return False


def verify_reviewed_weak_source_media(a,path):
    from media_assets import file_matches
    from gap_review import decode_pcm
    return file_matches(path,a['sourceAudioSha256']) and reviewed_weak_measurements_match(a,decode_pcm(path))


def verify_reviewed_weak_output_media(a,path):
    from media_assets import file_matches
    return (verify_reviewed_weak_source_media(a,path) and verified_reviewed_weak_output_inventory(a)
            and all(file_matches(Path(path).parent/(v['sha256']+'.mp3'),v['sha256']) for v in a['verseFiles']))


def apply_reviewed_weak_boundaries(base,case_id,pcm,evidence_root):
    from alignment_contract import REVIEWED_WEAK_RECIPE,REVIEWED_WINDOW_RECIPE,USER_SOURCE_SEAM_RECIPE,BOUNDARY_RECOGNIZER,site_fingerprint
    receipt,sha=approved_receipt(case_id);root=Path(evidence_root).resolve();evidence=[]
    human=receipt['schemaVersion'] in {5,8,12,13,16,17,22,24,25,26,28,29,30,33,41,43};recipe,policy=_identity(receipt)
    for item in receipt['evidence']:
        p=(root/item['file']).resolve()
        if not p.is_relative_to(root):raise ValueError('Review evidence leaves snapshot')
        evidence.append({'file':item['file'],'utf8':p.read_text()})
    a=_derived(base,receipt,evidence)
    r={'caseId':case_id,'policy':policy,'receiptSha256':sha,'baseEvidence':copy.deepcopy(base),'evidenceFiles':evidence,'measurements':[measure_user_source_cut(c,pcm) if human else _measure(c,pcm) for c in receipt['cuts']]};r['id']=digest(r)
    a.update(reviewedWeakReview=r,qualityRecipe=recipe,fingerprint=site_fingerprint(a['sourceAudioSha256'],a['textSha256'],a['key'].split(':')[-1],recipe,BOUNDARY_RECOGNIZER))
    if not reviewed_weak_measurements_match(a,pcm):raise ValueError('Registered original-source weak-edge review failed')
    return a
