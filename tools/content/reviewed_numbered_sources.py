"""Preserve numbered heading/zero clocks under exact registered source decisions."""
import copy,hashlib
from boundary_quality import finite,boundary_gap_issues,verse_boundary
from quiet_gaps import GAP_POLICY,digest
from reviewed_partial_sources import _material
from reviewed_numeric_sources import REVIEWED_NUMERIC_USER_POLICY,derive_numeric_source_case
from timed_text import normalized

REVIEWED_NUMBERED_SOURCE_POLICY={**REVIEWED_NUMERIC_USER_POLICY,
    'version':'registered-numeric-user-seam-numbered-source-roles-v1',
    'heading':'exact-original-chapter-ordinal; complete-original-leading-VAD-before-real-verse1',
    'zeroClock':'exact-user-accepted-shared-seam-point; no-positive-source-interval-dismissed',
    'firstVerse':'only-one-new-complete-source-CTC-window; original-failed-check-kept',
    'originalFacts':'all-original-ASR-clocks-flags-and-numeric-model-clocks-retained-in-base',
}


def numbered_source_roles(base,receipt,materials):
    raw=next(m['utf8'] for m in materials if m['file']==receipt['baseReportFile'])
    if receipt['schemaVersion']!=22 or digest(base)!=receipt['baseEvidenceSha256'] or _material(receipt,materials,receipt['baseReportFile'])!=base:
        raise ValueError('Need the exact original numbered-source report')
    audit=_material(receipt,materials,receipt['sourceAuditFile']);h=receipt['sourceHeading'];z=receipt['zeroClock'];gaps=base['unclaimedSpeech'];header=gaps[h['index']];zero=gaps[z['index']];lo,hi=h['sourceRange'];first=receipt['finalCues'][0];seam=receipt['naturalSeam'];cut=seam['cut']
    if (audit['key']!=base['key'] or audit['sourceAudioSha256']!=base['sourceAudioSha256']
        or audit['sourceReportSha256']!=hashlib.sha256(raw.encode()).hexdigest() or audit['sampleCount']!=round(base['duration']*16000)
        or audit['vadModelSha256']!=GAP_POLICY['vadModelSha256'] or h['index']==z['index']
        or h['gapSha256']!=digest(header) or header['kind']!='leading' or header.get('allowedHeadingOrClosing') is not True
        or normalized(header['text']) not in {base['key'].split(':')[1],'chapter'+base['key'].split(':')[1]}
        or not all(finite(v) for v in [lo,hi]) or not 0<=lo<hi<first['start'] or first['verse']!=1
        or z['gapSha256']!=digest(zero) or zero['kind']!='between-verses' or zero.get('allowedHeadingOrClosing') is not False
        or not normalized(zero['text']).isdigit() or zero['start']!=zero['end'] or zero['start']!=cut):
        raise ValueError('Only the exact original chapter ordinal and accepted zero-duration clock may receive these roles')
    previous=0;leading=[]
    for x,y in audit['speechSegments']:
        if type(x) is not int or type(y) is not int or not previous<=x<y<=audit['sampleCount']:raise ValueError('Invalid complete original VAD')
        previous=y
        if x<first['start']*16000:leading.append((x,y))
    if not leading or any(not lo*16000<=x<y<=hi*16000 for x,y in leading):raise ValueError('Leading source speech was omitted or crosses the real first verse')
    cues={c['verse']:c for c in receipt['finalCues']}
    if cues[seam['leftVerse']]['end']!=cut or cues[seam['rightVerse']]['start']!=cut:
        raise ValueError('The accepted zero point must stay on the complete shared source seam')
    return {h['index'],z['index']}


def derive_numbered_source_case(base,receipt,materials):
    from alignment_contract import NUMERIC_REVIEW_RECIPE
    excluded=numbered_source_roles(base,receipt,materials);target=_material(receipt,materials,receipt['firstVerseEvidenceFile']);raw=next(m['utf8'] for m in materials if m['file']==receipt['baseReportFile'])
    if (base['qualityRecipe']!=NUMERIC_REVIEW_RECIPE or base.get('accepted') is not False
        or base['issues']!=['unreliable-verse-boundary:1']+boundary_gap_issues(base['unclaimedSpeech'],base['cues'])
        or base['checks'][0]['verse']!=1 or base['checks'][0]['boundaryEvidence']['reasons']!=['edge-at-search-limit']
        or base['checks'][0]['boundaryVerified'] or any(c['verse']==1 for c in base['cues'])
        or target['key']!=base['key'] or target['sourceAudioSha256']!=base['sourceAudioSha256']
        or target['sourceReportSha256']!=hashlib.sha256(raw.encode()).hexdigest()):raise ValueError('Need the one exact original truncated first-verse model')
    c=target['check'];cue=target['cue'];verse=base['boundarySourceVerses'][0]
    if c['verse']!=1 or c['text']!=verse['text'] or not c['boundaryVerified'] or c['asrEdgeAnchors']!=base['checks'][0]['asrEdgeAnchors']:
        raise ValueError('The new first-verse reference or original independent anchors changed')
    witness=copy.deepcopy(base);witness['checks'][0]=copy.deepcopy(c);witness['cues']=[copy.deepcopy(cue),*witness['cues']]
    witness['unclaimedSpeech']=[g for i,g in enumerate(base['unclaimedSpeech']) if i not in excluded]
    witness['issues']=boundary_gap_issues(witness['unclaimedSpeech'],witness['cues'])
    inner=copy.deepcopy(receipt);inner['gapAssignments']=[]
    for a in receipt['gapAssignments']:
        if a['index'] in excluded:raise ValueError('Heading or accepted zero cannot masquerade as another verse word')
        inner['gapAssignments'].append({**a,'index':a['index']-sum(i<a['index'] for i in excluded)})
    result=derive_numeric_source_case(witness,inner,materials)
    result['unclaimedSpeech']=copy.deepcopy(base['unclaimedSpeech'])
    result['sourceHeadingClockReview']=copy.deepcopy(receipt['sourceHeading']);result['sourceZeroClockReview']=copy.deepcopy(receipt['zeroClock'])
    return result
