"""Keep Habakkuk's narrated musical postscript separate from verse nineteen."""
import copy,hashlib
from boundary_quality import finite,verse_boundary,boundary_gap_issues
from quiet_gaps import GAP_POLICY,digest
from reviewed_partial_sources import _material
from reviewed_gap_sources import _failed_report
from timed_text import normalized

REVIEWED_CLOSING_CAPTION_POLICY={
    'version':'registered-habakkuk-musical-source-closing-v1',
    'scope':'habakkuk:3:en; exact-musical-postscript-after-verse19',
    'source':'separate-complete-caption-CTC-and-all-trailing-original-VAD-inside-fixed-caption-range',
    'scripture':'complete-final-word-and-entire-final-scripture-voice-before-the-registered-cut',
    'originalFacts':'original-ASR-clock-and-rejected-gap-proof-retained-verbatim',
    'otherIntervals':'every-other-original-gap-strictly-owned-by-complete-verified-real-verse',
    'playback':'whole-original-chapter-keeps-the-caption; verse-loops-contain-scripture-only',
    'sharedSeam':'one-fixed-user-accepted-nonquiet-adjacent-boundary-with-all-original-model-clocks-retained',
    'silenceClaim':False,
}


def closing_caption_role(base,receipt,materials):
    caption='For the director of music. On my stringed instruments.'
    role=receipt['closingCaption'];i=role['index'];g=base['unclaimedSpeech'][i];last=receipt['finalCues'][-1];cut=last['end'];lo,hi=role['sourceRange']
    if (receipt['schemaVersion']!=33 or base['key']!='habakkuk:3:en' or digest(base)!=receipt['baseEvidenceSha256']
        or _material(receipt,materials,receipt['baseReportFile'])!=base
        or role['afterVerse']!=19 or last['verse']!=19 or last['start']!=base['cues'][-1]['start']
        or role['gapSha256']!=digest(g) or g['kind']!='trailing' or g.get('allowedHeadingOrClosing') is not False
        or normalized(g['text'])!=normalized(caption) or not all(finite(t) for t in [lo,hi,cut])
        or not base['cues'][-1]['end']<=cut<lo<hi<=base['duration']):
        raise ValueError('Need the exact original Habakkuk musical postscript and complete final scripture cut')
    raw=next(m['utf8'] for m in materials if m['file']==receipt['baseReportFile']);sha=hashlib.sha256(raw.encode()).hexdigest()
    target=_material(receipt,materials,receipt['captionModelFile']);audit=_material(receipt,materials,receipt['sourceAuditFile']);c=target['check']
    if (target['key']!=base['key'] or target['sourceAudioSha256']!=base['sourceAudioSha256'] or target['sourceReportSha256']!=sha
        or c['verse']!=0 or c['text']!=caption or c['spokenText']!=caption or c.get('asrEdgeAnchors')!=[]
        or audit['key']!=base['key'] or audit['sourceAudioSha256']!=base['sourceAudioSha256'] or audit['sourceReportSha256']!=sha
        or audit['sampleCount']!=round(base['duration']*16000) or audit['vadModelSha256']!=GAP_POLICY['vadModelSha256']):
        raise ValueError('The complete caption model or original source VAD changed')
    edges,e=verse_boundary(c['alignedWords'],c['searchRange'],base['duration'],'en',reference=caption,signal=c['boundarySignal'])
    words=[w for w in c['alignedWords'] if normalized(w.get('word',''))]
    if (edges is None or not c['boundaryVerified'] or c['boundaryEvidence']!=e or e['timedFraction']!=1
        or any(not lo<=w['start']<w['end']<=hi for w in words)):
        raise ValueError('The entire real closing caption has not been independently aligned')
    previous=0;trailing=[];body=[]
    for x,y in audit['speechSegments']:
        if type(x) is not int or type(y) is not int or not previous<=x<y<=audit['sampleCount']:
            raise ValueError('Invalid complete original source VAD')
        previous=y
        if x<cut*16000<y:raise ValueError('The final scripture cut truncates real source voice')
        (trailing if x>=cut*16000 else body).append((x,y))
    final_words=[w for w in base['checks'][-1]['alignedWords'] if normalized(w.get('word',''))]
    if (not trailing or any(not lo*16000<=x<y<=hi*16000 for x,y in trailing)
        or not final_words or any(w['end']>cut for w in final_words)
        or not any(x<=final_words[-1]['start']*16000<final_words[-1]['end']*16000<=y for x,y in body)
        or any(not any(max(w['start']*16000,x)<min(w['end']*16000,y) for x,y in trailing) for w in [words[0],words[-1]])):
        raise ValueError('Scripture was omitted or additional trailing narration remains unclassified')
    return i


def derive_closing_caption_case(base,receipt,materials):
    from alignment_contract import GAP_REVIEW_RECIPE,BOUNDARY_REVIEW_RECIPE,BOUNDARY_RECOGNIZER,site_fingerprint
    from reviewed_source_windows import derive_source_window_case
    if (base['qualityRecipe']!=GAP_REVIEW_RECIPE or base.get('accepted') is not False or receipt['weakVerses'] or receipt['failureReasons']
        or base['issues']!=boundary_gap_issues(base['unclaimedSpeech'],base['cues'])):
        raise ValueError('Need the original complete failed-gap source with no failed real-verse model')
    _failed_report(base);i=closing_caption_role(base,receipt,materials);model=base.get('boundaryContextReview',{}).get('recipe',BOUNDARY_REVIEW_RECIPE)
    expected=dict(recipe=GAP_REVIEW_RECIPE,sourceFingerprint=site_fingerprint(base['sourceAudioSha256'],base['textSha256'],'en',model,BOUNDARY_RECOGNIZER))
    if (base['gapReview']!=expected or base['fingerprint']!=site_fingerprint(base['sourceAudioSha256'],base['textSha256'],'en',GAP_REVIEW_RECIPE,BOUNDARY_RECOGNIZER)):
        raise ValueError('The original gap model identity changed')
    w=copy.deepcopy(base)
    for name in ['acousticGapReview','gapReview']:w.pop(name)
    w.update(qualityRecipe=model,fingerprint=base['gapReview']['sourceFingerprint'],unclaimedSpeech=[g for j,g in enumerate(base['unclaimedSpeech']) if j!=i]);w['issues']=boundary_gap_issues(w['unclaimedSpeech'],w['cues'])
    inner=copy.deepcopy(receipt);inner.update(schemaVersion=16,gapAssignments=[])
    for a in receipt['gapAssignments']:
        if a['index']==i:raise ValueError('The known musical caption cannot masquerade as a canonical verse word')
        inner['gapAssignments'].append({**a,'index':a['index']-(a['index']>i)})
    result=derive_source_window_case(w,inner,materials)
    result.update(qualityRecipe=base['qualityRecipe'],fingerprint=base['fingerprint'],acousticGapReview=copy.deepcopy(base['acousticGapReview']),gapReview=copy.deepcopy(base['gapReview']),unclaimedSpeech=copy.deepcopy(base['unclaimedSpeech']),sourceClosingCaptionReview=copy.deepcopy(receipt['closingCaption']))
    return result
