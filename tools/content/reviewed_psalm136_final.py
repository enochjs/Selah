"""User-heard Psalm136 seam and ending with two independently recovered bodies."""
import copy,hashlib
from boundary_quality import verse_boundary,boundary_gap_issues
from quiet_gaps import GAP_POLICY,digest,same_source_measurements
from reviewed_final_listening import validate_final_listening
from reviewed_partial_sources import _material
from reviewed_chronicles21_sources import same_serialized_boundary_evidence
from reviewed_source_placeholders import ending_tail_valid
from reviewed_absent_fragments import measure_absent_tail

REVIEWED_PSALM136_FINAL_POLICY={
 'version':'registered-user-psalm136-complete-source-seam-and-background-ending-v1',
 'scope':'original-failed-verse11-and12-models; exact-user-seam55.93-and-source-ending131.20',
 'model':'both-complete-canonical-bodies-pass-independent-source-CTC; all-raw-old-models-and-ASR-kept',
 'source':'all-original-joint-proofs-rerun-in-their-original-context; every-other-changed-cut-quiet',
 'ending':'exact-user-background-decision; complete-original-final-voice-and-bounded-nonvoice-tail',
 'seam':'complete-model-bodies-retained; no-model-clock-exceptions; no-silence-claim',
}


def psalm136_inputs(base,receipt,materials):
    validate_final_listening(base,receipt)
    if digest(base)!=receipt['baseEvidenceSha256'] or _material(receipt,materials,receipt['baseReportFile'])!=base:raise ValueError('The complete original Psalm136 report changed')
    raw=next(m['utf8'] for m in materials if m['file']==receipt['baseReportFile']);a=_material(receipt,materials,receipt['sourceAuditFile']);tail=_material(receipt,materials,receipt['tailEvidenceFile'])
    if (a['key']!=base['key'] or a['sourceAudioSha256']!=base['sourceAudioSha256'] or a['sourceReportSha256']!=hashlib.sha256(raw.encode()).hexdigest()
        or a['sampleCount']!=round(base['duration']*16000) or a['vadModelSha256']!=GAP_POLICY['vadModelSha256']):raise ValueError('The original complete source VAD changed')
    previous=0
    for x,y in a['speechSegments']:
        if type(x) is not int or type(y) is not int or not previous<=x<y<=a['sampleCount']:raise ValueError('Invalid original VAD')
        previous=y
    last=receipt['finalCues'][-1];g=base['unclaimedSpeech'][1]
    if (last['verse']!=26 or last['end']!=131.2 or last['start']!=base['cues'][-1]['start']
        or g['kind']!='trailing' or g['text']!='you' or g['allowedHeadingOrClosing'] is not False
        or receipt['backgroundGapSha256']!=digest(g) or not max(y for x,y in a['speechSegments'])/16000<131.2<g['start']
        or tail['range']!=[round(131.2*16000),a['sampleCount']] or tail['referenceRange']!=[round(last['start']*16000),round(131.2*16000)]
        or not ending_tail_valid(tail) or any(y>round(131.2*16000) for x,y in a['speechSegments'])):
        raise ValueError('The accepted ending omits real voice or hides additional narration')
    return a,tail


def derive_psalm136_final_case(base,receipt,materials):
    from alignment_contract import PADDING_REVIEW_RECIPE
    from joint_boundaries import verified_joint_proofs
    from reviewed_source_windows import derive_source_window_case
    psalm136_inputs(base,receipt,materials)
    if (base.get('accepted') is not False or base['qualityRecipe']!=PADDING_REVIEW_RECIPE
        or [c['verse'] for c in base['checks'] if c.get('boundaryVerified') is False]!=[11,12]
        or base['issues']!=['unreliable-verse-boundary:11','unreliable-verse-boundary:12']+boundary_gap_issues(base['unclaimedSpeech'],base['cues'])
        or receipt['weakVerses'] or receipt['failureReasons'] or receipt['modelClockExceptions']):raise ValueError('Need the exact two original failed Psalm136 model checks')
    if base.get('jointAlignments') and not verified_joint_proofs(base):raise ValueError('The original complete joint proof changed')
    w=copy.deepcopy(base);targets={}
    for name in receipt['verseModelFiles']:
        t=_material(receipt,materials,name);c=t['check'];v=c['verse'];raw=next(m['utf8'] for m in materials if m['file']==receipt['baseReportFile'])
        if (v not in {11,12} or v in targets or c['text']!=base['checks'][v-1]['text'] or c.get('asrEdgeAnchors')!=base['checks'][v-1].get('asrEdgeAnchors')
            or t['key']!=base['key'] or t['sourceAudioSha256']!=base['sourceAudioSha256'] or t['sourceReportSha256']!=hashlib.sha256(raw.encode()).hexdigest()
            or c.get('jointProofId') or c.get('jointClipRange') is not None):raise ValueError('The complete recovered model reference changed')
        edges,e=verse_boundary(c['alignedWords'],c['searchRange'],base['duration'],'en',reference=c['text'],signal=c['boundarySignal'],anchors=c.get('asrEdgeAnchors'))
        if edges is None or not c['boundaryVerified'] or not same_serialized_boundary_evidence(c['boundaryEvidence'],e) or t['cue']!=dict(verse=v,text=c['text'],start=edges[0],end=edges[1]):raise ValueError('The independent complete source body did not pass')
        targets[v]=t
    if sorted(targets)!=[11,12]:raise ValueError('Both complete recovered bodies are required')
    for v,t in targets.items():w['checks'][v-1]=copy.deepcopy(t['check'])
    w['cues']=sorted([*w['cues'],*[copy.deepcopy(t['cue']) for t in targets.values()]],key=lambda c:c['verse']);w['unclaimedSpeech']=w['unclaimedSpeech'][:1];w['issues']=boundary_gap_issues(w['unclaimedSpeech'],w['cues'])
    result=derive_source_window_case(w,receipt,materials,original_joint_context=base if base.get('jointAlignments') else None)
    result['unclaimedSpeech']=copy.deepcopy(base['unclaimedSpeech']);result['sourceBackgroundClosing']=dict(originalGap=copy.deepcopy(base['unclaimedSpeech'][1]),verse=26,sourceScriptureEnd=131.2,backgroundSourceRange=[131.2,base['duration']],humanDecision=receipt['humanDecision']);return result


def psalm136_measurements_match(base,receipt,materials,pcm):
    try:
        a,tail=psalm136_inputs(base,receipt,materials)
        if len(pcm)!=a['sampleCount']:return False
        measured=measure_absent_tail(pcm,tail['range'],tail['referenceRange'],a['speechSegments'])
        return ending_tail_valid(measured) and same_source_measurements(tail,measured)
    except (KeyError,TypeError,ValueError,IndexError,StopIteration):return False
