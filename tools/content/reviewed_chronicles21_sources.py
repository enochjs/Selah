"""Recover a complete numeric-free body and preserve its early neighboring ASR clock."""
import copy,hashlib
from boundary_quality import boundary_gap_issues,verse_boundary
from quiet_gaps import digest
from reviewed_partial_sources import _material
from reviewed_saying_sources import _target
from timed_text import normalized

REVIEWED_CHRONICLES21_SOURCE_POLICY={
 'version':'registered-chronicles21-body-and-quiet-source-clock-partition-v1',
 'scope':'1chronicles21; complete-failed-verse25-model-and-original-O-clock-only',
 'model':'new-complete-canonical-CTC-body-with-original-independent-anchors; raw-failed-model-preserved',
 'sourceClock':'original-O-text-and-entire-time-range-retained-in-two-contiguous-real-verse-outputs',
 'boundary':'every-changed-head-and-tail-strictly-quiet-and-all-complete-model-bodies-retained',
 'originalContext':'every-original-joint-proof-reverified-before-new-source-model-is-inserted',
 'silenceClaim':False,'wordReplacement':False,
}


def chronicles_source_partition(base,receipt):
    p=receipt['sourceClockPartition'];i=p['index'];final={c['verse']:c for c in receipt['finalCues']}
    if type(i) is not int or not 0<=i<len(base['unclaimedSpeech']):raise ValueError('Unknown original source clock')
    g=base['unclaimedSpeech'][i];cut=p['splitAt']
    if (base['key']!='1-chronicles:21:en' or p['ownerVerses']!=[22,23] or p['gapSha256']!=digest(g)
        or g['kind']!='between-verses' or g.get('allowedHeadingOrClosing') is not False or normalized(g['text'])!='o'
        or not final[22]['start']<=g['start']<cut<g['end']<=final[23]['end']
        or final[22]['end']!=cut or final[23]['start']!=cut
        or {(22,'tail'),(23,'head')}-{(x['verse'],x['side']) for x in receipt['cuts']}
        or any(x.get('measurementKind') for x in receipt['cuts'] if x['verse'] in {22,23})):
        raise ValueError('The complete original coarse clock must remain in both real source outputs across a strictly quiet seam')
    return i


def derive_chronicles21_source_case(base,receipt,materials):
    from alignment_contract import PADDING_REVIEW_RECIPE
    from joint_boundaries import verified_joint_proofs
    from reviewed_source_windows import derive_source_window_case
    if (receipt['schemaVersion']!=39 or base['key']!='1-chronicles:21:en' or base.get('accepted') is not False
        or base['qualityRecipe']!=PADDING_REVIEW_RECIPE or digest(base)!=receipt['baseEvidenceSha256']
        or _material(receipt,materials,receipt['baseReportFile'])!=base or receipt['weakVerses'] or receipt['failureReasons']
        or [c['verse'] for c in base['checks'] if c.get('boundaryVerified') is False]!=[25]
        or base['issues']!=['unreliable-verse-boundary:25']+boundary_gap_issues(base['unclaimedSpeech'],base['cues'])):
        raise ValueError('Need the unchanged complete original Chronicles21 source')
    old=base['checks'][24];edges,e=verse_boundary(old['alignedWords'],old['searchRange'],base['duration'],'en',reference=old['text'],signal=old['boundarySignal'],anchors=old.get('asrEdgeAnchors'))
    if edges is not None or e!=old['boundaryEvidence']:raise ValueError('Original failed model facts changed')
    if base.get('jointAlignments') and not verified_joint_proofs(base):raise ValueError('Original joint provenance changed')
    i=chronicles_source_partition(base,receipt);t=chronicles_target_model(base,receipt,materials);c=t['check']
    if (c['verse']!=25 or c['text']!=old['text'] or c.get('asrEdgeAnchors')!=old.get('asrEdgeAnchors') or c.get('jointProofId') or c.get('jointClipRange') is not None):raise ValueError('The independent recovered body or original anchors changed')
    w=copy.deepcopy(base);w['checks'][24]=copy.deepcopy(c);w['cues']=sorted([*w['cues'],copy.deepcopy(t['cue'])],key=lambda c:c['verse']);w['unclaimedSpeech']=[g for j,g in enumerate(base['unclaimedSpeech']) if j!=i];w['issues']=boundary_gap_issues(w['unclaimedSpeech'],w['cues'])
    inner=copy.deepcopy(receipt);inner.update(schemaVersion=39,gapAssignments=[])
    for a in receipt['gapAssignments']:
        if a['index']==i:raise ValueError('The partitioned source clock cannot receive another owner')
        inner['gapAssignments'].append({**a,'index':a['index']-(a['index']>i)})
    result=derive_source_window_case(w,inner,materials);result['unclaimedSpeech']=copy.deepcopy(base['unclaimedSpeech']);result['sourcePartitionedClockReview']=copy.deepcopy(receipt['sourceClockPartition']);return result


def same_serialized_boundary_evidence(saved,actual):
    from boundary_quality import finite
    return (saved.keys()==actual.keys() and all(saved[k]==actual[k] for k in saved if k!='meanAlignmentScore')
        and finite(saved.get('meanAlignmentScore')) and finite(actual.get('meanAlignmentScore'))
        and abs(saved['meanAlignmentScore']-actual['meanAlignmentScore'])<=.000100000001)


def chronicles_target_model(base,receipt,materials):
    t=_material(receipt,materials,receipt['verseModelFile']);raw=next(m['utf8'] for m in materials if m['file']==receipt['baseReportFile']);c=t['check']
    if (t['key']!=base['key'] or t['sourceAudioSha256']!=base['sourceAudioSha256'] or t['sourceReportSha256']!=hashlib.sha256(raw.encode()).hexdigest()):raise ValueError('The replacement model belongs to another source')
    edges,e=verse_boundary(c['alignedWords'],c['searchRange'],base['duration'],'en',reference=c['text'],signal=c['boundarySignal'],anchors=c.get('asrEdgeAnchors'))
    if (edges is None or not c['boundaryVerified'] or not same_serialized_boundary_evidence(c['boundaryEvidence'],e)
        or t['cue']!=dict(verse=c['verse'],text=c['text'],start=edges[0],end=edges[1])):raise ValueError('The complete replacement model did not reverify')
    return t
