"""Recover Psalm bodies independently of real, same-edition narrated captions."""
import copy,hashlib
from boundary_quality import finite,boundary_gap_issues,verse_boundary
from quiet_gaps import GAP_POLICY,digest
from reviewed_heading_sources import _caption
from reviewed_partial_sources import _material
from reviewed_saying_sources import _target
from timed_text import normalized

REVIEWED_CAPTION_MODEL_POLICY={
 'version':'registered-pinned-psalm-caption-and-independent-body-model-v1',
 'scope':'psalms77-and125; complete-original-caption-and-same-canonical-body',
 'authority':'unchanged-pinned-caption-manifest-and-original-NIV-HTML',
 'caption':'complete-independent-caption-model-and-full-caption-VAD-before-real-verse1',
 'body':'only-original-failed-scripture-check-replaced-by-passing-complete-source-model',
 'provenance':'all-original-failed-models-independent-clocks-and-original-joint-context-retained',
 'edges':'every-changed-body-cut-and-both-caption-edges-strictly-remeasured-in-original-PCM',
}


def caption_model_role(base,receipt,materials):
    if (receipt['schemaVersion']!=38 or base['key'] not in {'psalms:77:en','psalms:125:en'}
        or digest(base)!=receipt['baseEvidenceSha256'] or _material(receipt,materials,receipt['baseReportFile'])!=base):raise ValueError('Need the exact rejected Psalm source')
    _caption(base,receipt,materials);h=receipt['heading'];i=h['gapIndex'];g=base['unclaimedSpeech'][i];lo,hi=h['sourceRange'];t=_target(base,receipt,materials,receipt['captionModelFile']);c=t['check']
    if (type(i) is not int or not 0<=i<len(base['unclaimedSpeech']) or h['gapSha256']!=digest(g)
        or g['kind']!='leading' or g.get('allowedHeadingOrClosing') is not False
        or c['verse']!=0 or normalized(c['text'])!=normalized(h['caption']) or c['spokenText']!=c['text'] or c.get('asrEdgeAnchors')!=[]
        or not all(finite(x) for x in [lo,hi]) or not 0<=lo<hi<=receipt['finalCues'][0]['start']
        or any(not lo<=w['start']<w['end']<=hi for w in c['alignedWords'] if normalized(w.get('word','')))):
        raise ValueError('The real complete source caption has not been independently located outside scripture')
    raw=next(m['utf8'] for m in materials if m['file']==receipt['baseReportFile']);a=_material(receipt,materials,receipt['sourceAuditFile'])
    if (a['key']!=base['key'] or a['sourceAudioSha256']!=base['sourceAudioSha256'] or a['sourceReportSha256']!=hashlib.sha256(raw.encode()).hexdigest()
        or a['sampleCount']!=round(base['duration']*16000) or a['vadModelSha256']!=GAP_POLICY['vadModelSha256']):raise ValueError('The original complete caption VAD changed')
    previous=0;voice=[]
    for x,y in a['speechSegments']:
        if type(x) is not int or type(y) is not int or not previous<=x<y<=a['sampleCount']:raise ValueError('Invalid full-source VAD')
        previous=y
        if max(x,lo*16000)<min(y,hi*16000):voice.append((x,y))
    if (not voice or any(not lo*16000<=x<y<=hi*16000 for x,y in voice)
        or any(not any(max(w['start']*16000,x)<min(w['end']*16000,y) for x,y in voice) for w in [c['alignedWords'][0],c['alignedWords'][-1]])):
        raise ValueError('A complete real caption voice interval was lost')
    return i


def derive_caption_model_case(base,receipt,materials):
    from alignment_contract import BOUNDARY_REVIEW_RECIPE,BOUNDARY_CONTEXT_RECIPE,PADDING_REVIEW_RECIPE
    from joint_boundaries import verified_joint_proofs
    from reviewed_source_windows import derive_source_window_case
    i=caption_model_role(base,receipt,materials);failed=[c['verse'] for c in base['checks'] if c.get('boundaryVerified') is False];expected=[1] if base['key']=='psalms:77:en' else [2]
    if (base.get('accepted') is not False or base['qualityRecipe'] not in {BOUNDARY_REVIEW_RECIPE,BOUNDARY_CONTEXT_RECIPE,PADDING_REVIEW_RECIPE}
        or failed!=expected or receipt['weakVerses'] or receipt['failureReasons']
        or base['issues']!=['unreliable-verse-boundary:'+str(v) for v in failed]+boundary_gap_issues(base['unclaimedSpeech'],base['cues'])):
        raise ValueError('Need the original isolated failed Psalm scripture model')
    if base.get('jointAlignments') and not verified_joint_proofs(base):raise ValueError('An original joint model context changed')
    w=copy.deepcopy(base);targets={}
    for name in receipt['verseModelFiles']:
        t=_target(base,receipt,materials,name);c=t['check'];v=c['verse']
        if v not in failed or v in targets or c['text']!=base['boundarySourceVerses'][v-1]['text'] or c.get('asrEdgeAnchors')!=base['checks'][v-1].get('asrEdgeAnchors') or c.get('jointProofId') or c.get('jointClipRange') is not None:raise ValueError('An unrelated canonical model cannot be replaced')
        targets[v]=t
    if sorted(targets)!=failed:raise ValueError('Need a complete independent source model for every original failure')
    for v,t in targets.items():w['checks'][v-1]=copy.deepcopy(t['check'])
    w['cues']=sorted([*w['cues'],*[copy.deepcopy(t['cue']) for t in targets.values()]],key=lambda c:c['verse']);w['unclaimedSpeech']=[g for j,g in enumerate(base['unclaimedSpeech']) if j!=i];w['issues']=boundary_gap_issues(w['unclaimedSpeech'],w['cues'])
    inner=copy.deepcopy(receipt);inner.update(schemaVersion=38,gapAssignments=[])
    for a in receipt['gapAssignments']:
        if a['index']==i:raise ValueError('The original caption cannot become scripture')
        inner['gapAssignments'].append({**a,'index':a['index']-(a['index']>i)})
    result=derive_source_window_case(w,inner,materials);result['unclaimedSpeech']=copy.deepcopy(base['unclaimedSpeech']);result['sourceCaptionModelReview']=copy.deepcopy(receipt['heading']);return result


def caption_model_measurements_match(base,receipt,materials,pcm):
    from reviewed_boundaries import _measure
    try:
        caption_model_role(base,receipt,materials)
        if len(pcm)!=round(base['duration']*16000):return False
        c=_target(base,receipt,materials,receipt['captionModelFile'])['check'];words=c['alignedWords'];refs=[[round(t*16000) for t in c['searchRange']],[round(words[0]['start']*16000),round(words[-1]['end']*16000)]]
        for value in receipt['heading']['sourceRange']:_measure(dict(verse=0,window=[round((value-.01)*16000),round((value+.01)*16000)],referenceRanges=refs),pcm)
        return True
    except (KeyError,TypeError,ValueError,IndexError,StopIteration):return False
