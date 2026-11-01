"""A fixed user-confirmed unspoken clause, with canonical text left intact."""
import copy,hashlib
from quiet_gaps import digest
from reviewed_partial_sources import _material

REVIEWED_MISSING_SOURCE_FRAGMENT_POLICY={
    'version':'registered-user-confirmed-zechariah9-missing-source-clause-v1',
    'scope':'zechariah:9:zh; exact-verse1-terminal-parenthesized-clause',
    'canonical':'complete-original-text-with-explicit-not-narrated-in-source-fragment',
    'authority':'fixed-user-confirmed-omission-and-natural-source-seam',
    'model':'separate-narrated-prefix-CTC-bound-to-the-unchanged-original-source',
    'otherVerses':'all-original-model-words-and-joint-proofs-reverified',
    'source':'registered-source-PCM-cuts-and-complete-output-inventory',
    'modelClockExceptionsAllowed':False,
}


def confirmed_fragment_inputs(base,receipt,materials):
    part=receipt['fragment'];prefix='耶和华的默示应验在哈得拉地，大马色';suffix='（世人和以色列各支派的眼目都仰望耶和华）。'
    if (receipt['schemaVersion']!=30 or base['key']!='zechariah:9:zh' or base.get('accepted') is not False
        or base['issues']!=['unreliable-verse-boundary:1'] or digest(base)!=receipt['baseEvidenceSha256']
        or _material(receipt,materials,receipt['baseReportFile'])!=base
        or part!=dict(verse=1,narratedText=prefix,missingText=suffix)
        or base['boundarySourceVerses'][0]!=dict(number=1,text=prefix+suffix)
        or receipt['approvedBy']!='user-confirmed-unspoken-fragment' or receipt['sourceAcousticApproval'] is not False
        or not isinstance(receipt['humanDecision'],str) or not receipt['humanDecision'].strip()):
        raise ValueError('Need the exact original clause and explicit source omission decision')
    raw=next(m['utf8'] for m in materials if m['file']==receipt['baseReportFile'])
    target=_material(receipt,materials,receipt['targetModelFile']);c=target['check']
    if (target['key']!=base['key'] or target['sourceAudioSha256']!=base['sourceAudioSha256']
        or target['sourceReportSha256']!=hashlib.sha256(raw.encode()).hexdigest()
        or target['canonicalText']!=prefix+suffix or target['narratedReference']!=prefix or target['missingFragment']!=suffix
        or c['verse']!=1 or c['text']!=prefix or c['spokenText']!=prefix
        or c['asrEdgeAnchors']!=base['checks'][0]['asrEdgeAnchors']):
        raise ValueError('The narrated prefix model is not tied to the original complete source')
    refs=copy.deepcopy(base['boundarySourceVerses']);refs[0]['text']=prefix
    return refs,[dict(verse=1,text=suffix,reason='not-narrated-in-source')],c


def derive_missing_source_fragment_case(base,receipt,materials):
    from alignment_contract import BOUNDARY_RECOGNIZER,site_fingerprint
    from partial_audio import source_text_sha
    from reviewed_source_windows import derive_source_window_case
    refs,missing,target=confirmed_fragment_inputs(base,receipt,materials)
    if receipt['weakVerses']!=[1] or receipt['failureReasons']!=[dict(verse=1,reasons=base['checks'][0]['boundaryEvidence']['reasons'])]:
        raise ValueError('An unrelated source failure cannot be hidden as a missing clause')
    witness=copy.deepcopy(base);sha=source_text_sha(refs)
    witness.update(boundarySourceVerses=refs,textSha256=sha,
        fingerprint=site_fingerprint(base['sourceAudioSha256'],sha,'zh',base['qualityRecipe'],BOUNDARY_RECOGNIZER))
    witness['checks'][0]=copy.deepcopy(target)
    inner=copy.deepcopy(receipt);inner.update(schemaVersion=8,approvedBy='user-natural-seam-tolerance',
        failureReasons=[dict(verse=1,reasons=target['boundaryEvidence']['reasons'])])
    for c in inner['finalCues']:
        canonical=base['boundarySourceVerses'][c['verse']-1]['text']
        if c['text']!=canonical:raise ValueError('Canonical source text changed')
        c['text']=refs[c['verse']-1]['text']
    result=derive_source_window_case(witness,inner,materials)
    result.update(boundarySourceVerses=copy.deepcopy(base['boundarySourceVerses']),textSha256=base['textSha256'],
        fingerprint=base['fingerprint'],missingFragments=missing,cues=copy.deepcopy(receipt['finalCues']))
    result['checks'][0]['text']=base['boundarySourceVerses'][0]['text']
    return result
