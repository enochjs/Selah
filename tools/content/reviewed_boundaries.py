"""Exact source-reviewed corrections, authorized by immutable case receipts.

The registry is source-controlled approval, not a digest supplied by a worker.
ASR/CTC evidence remains unchanged and the original proof is verified recursively.
"""
import copy,hashlib,json
from pathlib import Path
from boundary_quality import finite
from quiet_gaps import digest,rms
from timed_text import normalized

REVIEWED_BOUNDARY_POLICY={'version':'registered-original-source-acoustic-review-v1','sampleRate':16000,
 'frameSamples':160,'maximumWindowSamples':640,'maximumRms':.1,'relativeRms':.5,
 'approval':'source-controlled-case-id-to-exact-receipt-sha256',
 'scope':'exact-registered-cue-deltas-on-unchanged-complete-source-proof',
 'evidence':'embedded-original-review-material-must-match-approved-file-sha256',
 'outputs':'all-verse-output-ranges-and-sha256-pinned-by-approved-source-materialization-witness'}
HUMAN_SEAM_POLICY={**REVIEWED_BOUNDARY_POLICY,'version':'registered-user-accepted-natural-seam-v1',
 'scope':'one-fixed-adjacent-shared-seam-with-explicit-human-tolerance',
 'protection':'reliable-core-only; unresolved-source-tail-and-head-uncertainty-preserved',
 'approval':'source-controlled-receipt-sha256-with-user-decision; no-claim-of-unambiguous-full-voice-separation'}
CASES_DIR=Path(__file__).resolve().parent/'reviewed_boundary_cases'
APPROVALS=json.loads((CASES_DIR/'registry.json').read_text())
_OUTPUT_FIELDS={'verseFiles','vttFile','vttSha256','individualSequentialReview'}


def approved_receipt(case_id):
    item=APPROVALS.get(case_id)
    if not item or Path(item['file']).name!=item['file']:raise ValueError('Source review is not registered')
    raw=(CASES_DIR/item['file']).read_bytes()
    if hashlib.sha256(raw).hexdigest()!=item['sha256']:raise ValueError('Approved receipt changed')
    receipt=json.loads(raw)
    if receipt['schemaVersion'] not in {1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43} or receipt['caseId']!=case_id:raise ValueError('Wrong approved source case')
    return receipt,item['sha256']


def _payload(a):
    omitted=_OUTPUT_FIELDS|{'cues','qualityRecipe','fingerprint','reviewedSourceReview'}
    return {k:v for k,v in a.items() if k not in omitted}


def _case(a):
    from alignment_contract import REVIEWED_BOUNDARY_RECIPE,HUMAN_SEAM_RECIPE,BOUNDARY_RECOGNIZER,site_fingerprint,BOUNDARY_REVIEW_RECIPE,CASE_REVIEW_RECIPE,SOURCE_EDGE_RECIPE,GAP_EDGE_RECIPE
    from boundary_quality import verified_boundary_artifact
    r=a['reviewedSourceReview'];receipt,sha=approved_receipt(r['caseId']);base=r['baseEvidence']
    human=receipt['schemaVersion']==3;recipe=HUMAN_SEAM_RECIPE if human else REVIEWED_BOUNDARY_RECIPE
    if (receipt['schemaVersion'] not in {1,3} or a['qualityRecipe']!=recipe or r['policy']!=(HUMAN_SEAM_POLICY if human else REVIEWED_BOUNDARY_POLICY)
        or r['receiptSha256']!=sha or digest(base)!=receipt['baseEvidenceSha256']
        or base['qualityRecipe'] not in {BOUNDARY_REVIEW_RECIPE,CASE_REVIEW_RECIPE,SOURCE_EDGE_RECIPE,GAP_EDGE_RECIPE}
        or 'reviewedSourceReview' in base or not base.get('accepted') or base.get('issues')
        or not verified_boundary_artifact(base) or _payload(a)!=_payload(base)
        or any(a[k]!=receipt[k] for k in ['key','sourceAudioSha256','textSha256','duration'])
        or a['fingerprint']!=site_fingerprint(a['sourceAudioSha256'],a['textSha256'],a['key'].split(':')[-1],recipe,BOUNDARY_RECOGNIZER)):
        raise ValueError('Complete original source proof differs from its approved receipt')
    if len(r['evidenceFiles'])!=len(receipt['evidence']) or not receipt['evidence']:raise ValueError('Missing source acoustic material')
    for saved,expected in zip(r['evidenceFiles'],receipt['evidence']):
        if (saved['file']!=expected['file'] or hashlib.sha256(saved['utf8'].encode()).hexdigest()!=expected['sha256']):
            raise ValueError('Source acoustic review material differs')
    cues=copy.deepcopy(base['cues']);checks={c['verse']:c for c in base['checks']};seen=set();count=round(a['duration']*16000)
    if not receipt['cuts']:raise ValueError('No approved correction')
    if human:
        cuts=receipt['cuts'];uncertainty=receipt['remainingSeamUncertainty']
        if (receipt['sourceAcousticApproval'] is not False or receipt['approvedBy']!='user-natural-seam-tolerance' or not isinstance(receipt['humanDecision'],str) or not receipt['humanDecision'].strip()
            or len(cuts)!=2 or len(uncertainty)!=2 or not all(finite(v) for v in uncertainty)
            or not 0<uncertainty[1]-uncertainty[0]<=.040000001
            or [c['verse'] for c in cues].index(cuts[1]['verse'])!=[c['verse'] for c in cues].index(cuts[0]['verse'])+1
            or cuts[0]['after'][0]!=cuts[0]['before'][0] or cuts[1]['after'][1]!=cuts[1]['before'][1]
            or cuts[0]['after'][1]!=cuts[1]['after'][0]
            or any(c['window']!=[round(v*16000) for v in uncertainty] or 'ownVoice' in c for c in cuts)):
            raise ValueError('Need a fixed user-accepted adjacent natural seam and preserved uncertainty')
    for cut in receipt['cuts']:
        verse=cut['verse'];cue=next(c for c in cues if c['verse']==verse)
        if verse in seen or [cue['start'],cue['end']]!=cut['before']:raise ValueError('Original cue or duplicate correction differs')
        seen.add(verse);start,end=cut['after'];voice_start,voice_end=cut['protectedCore' if human else 'ownVoice'];lo,hi=cut['window'];refs=cut['referenceRanges']
        if (len([i for i in [0,1] if cut['before'][i]!=cut['after'][i]])!=1
            or not all(finite(v) for v in [start,end,voice_start,voice_end,cut['previousVoiceEnd'],cut['nextVoiceStart']])
            or not 0<=cut['previousVoiceEnd']<=start<=voice_start<voice_end<=end<=cut['nextVoiceStart']<=a['duration']
            or type(lo) is not int or type(hi) is not int or not 0<=lo<hi<=count
            or (hi-lo)%160 or not 160<=hi-lo<=640 or len(refs)!=2
            or any(type(x) is not int or type(y) is not int or not 0<=x<y<=count for x,y in refs)):
            raise ValueError('Approved source protection geometry is invalid')
        edge=0 if cut['before'][0]!=start else 1;value=cut['after'][edge]
        if not lo<=value*16000<=hi:raise ValueError('Cut is outside its approved acoustic window')
        if edge==0 and not cut['previousVoiceEnd']*16000<=lo<hi<=voice_start*16000:raise ValueError('Head window crosses protected source voice')
        if edge==1 and not voice_end*16000<=lo<hi<=cut['nextVoiceStart']*16000:raise ValueError('Tail window crosses protected source voice')
        words=checks[verse]['alignedWords']
        if not words or any(not start<=w['start']<w['end']<=end for w in words if normalized(w.get('word',''))):raise ValueError('Correction loses an existing aligned word body')
        cue.update(start=start,end=end)
    if cues!=a['cues'] or any(x['end']>y['start'] for x,y in zip(cues,cues[1:])):raise ValueError('Additional cue change or overlapping verses')
    from numeric_alignment import verified_numeric_files
    from timed_text import webvtt
    vtt=hashlib.sha256(webvtt(receipt['usfm'],receipt['chapter'],cues).encode()).hexdigest()
    if (not verified_numeric_files({**a,'verseFiles':receipt['outputInventory']})
        or receipt['outputVttSha256']!=vtt):raise ValueError('Approved complete output inventory differs from source ranges')
    return receipt,base


def _measure(cut,pcm):
    lo,hi=cut['window'];refs=[rms(pcm,*bounds) for bounds in cut['referenceRanges']]
    values=[rms(pcm,i,min(i+160,hi)) for i in range(lo,hi,160)]
    if any(not finite(v) or not 0<v<=1 for v in refs):raise ValueError('Invalid original volume reference')
    limit=min(.1,min(refs)*.5)
    if any(not finite(v) or not 0<=v<=limit for v in values):raise ValueError('Original cut window differs from its approved acoustic measurement')
    return {'verse':cut['verse'],'window':cut['window'],'referenceRms':refs,'frameRms':values}


def verified_reviewed_artifact(a):
    try:
        receipt,_=_case(a);r=a['reviewedSourceReview']
        if r['id']!=digest({k:v for k,v in r.items() if k!='id'}) or len(r['measurements'])!=len(receipt['cuts']):return False
        for saved,cut in zip(r['measurements'],receipt['cuts']):
            if saved['verse']!=cut['verse'] or saved['window']!=cut['window']:return False
            refs=saved['referenceRms'];values=saved['frameRms']
            if len(refs)!=2 or any(not finite(v) or not 0<v<=1 for v in refs):return False
            if len(values)!=(cut['window'][1]-cut['window'][0])//160 or any(not finite(v) or not 0<=v<=min(.1,min(refs)*.5) for v in values):return False
        return True
    except (OSError,KeyError,TypeError,ValueError,IndexError,StopIteration):return False


def reviewed_measurements_match(a,pcm):
    try:
        if not verified_reviewed_artifact(a) or len(pcm)!=round(a['duration']*16000):return False
        receipt,_=_case(a)
        for cut,saved in zip(receipt['cuts'],a['reviewedSourceReview']['measurements']):
            measured=_measure(cut,pcm)
            if any(abs(x-y)>1/32768 for key in ['referenceRms','frameRms'] for x,y in zip(measured[key],saved[key])):return False
        return True
    except (KeyError,TypeError,ValueError,IndexError):return False


def verify_reviewed_source_media(a,path):
    try:
        from alignment_contract import BOUNDARY_REVIEW_RECIPE,CASE_REVIEW_RECIPE,SOURCE_EDGE_RECIPE,GAP_EDGE_RECIPE
        from case_evidence import verify_case_media
        from source_edges import verify_source_edge_media
        from gap_edges import verify_gap_edge_media
        from gap_review import decode_pcm
        from media_assets import file_matches
        receipt,base=_case(a)
        if not file_matches(path,receipt['sourceAudioSha256']):return False
        verifiers={CASE_REVIEW_RECIPE:verify_case_media,SOURCE_EDGE_RECIPE:verify_source_edge_media,GAP_EDGE_RECIPE:verify_gap_edge_media}
        if base['qualityRecipe'] not in {BOUNDARY_REVIEW_RECIPE,*verifiers}:return False
        if base['qualityRecipe'] in verifiers and not verifiers[base['qualityRecipe']](base,path):return False
        return reviewed_measurements_match(a,decode_pcm(path))
    except (OSError,KeyError,TypeError,ValueError,IndexError,StopIteration):return False


def verified_reviewed_output_inventory(a):
    try:
        from numeric_alignment import verified_numeric_files
        from timed_text import webvtt
        if not verified_reviewed_artifact(a) or not verified_numeric_files(a):return False
        receipt,_=_case(a);vtt=hashlib.sha256(webvtt(receipt['usfm'],receipt['chapter'],a['cues']).encode()).hexdigest()
        return (a['verseFiles']==receipt['outputInventory'] and a.get('vttSha256')==vtt
                and a.get('vttFile')==vtt+'.vtt')
    except (OSError,KeyError,TypeError,ValueError,IndexError,StopIteration):return False


def verify_reviewed_output_media(a,path):
    from media_assets import file_matches
    if not verify_reviewed_source_media(a,path) or not verified_reviewed_output_inventory(a):return False
    return all(file_matches(Path(path).parent/(item['sha256']+'.mp3'),item['sha256']) for item in a['verseFiles'])


def apply_reviewed_boundaries(base,case_id,pcm,evidence_root):
    from alignment_contract import REVIEWED_BOUNDARY_RECIPE,HUMAN_SEAM_RECIPE,BOUNDARY_RECOGNIZER,site_fingerprint
    receipt,sha=approved_receipt(case_id);a=copy.deepcopy(base);root=Path(evidence_root).resolve();evidence=[]
    human=receipt['schemaVersion']==3;recipe=HUMAN_SEAM_RECIPE if human else REVIEWED_BOUNDARY_RECIPE
    for item in receipt['evidence']:
        path=(root/item['file']).resolve()
        if not path.is_relative_to(root):raise ValueError('Review evidence leaves its source snapshot')
        evidence.append({'file':item['file'],'utf8':path.read_text()})
    r={'policy':HUMAN_SEAM_POLICY if human else REVIEWED_BOUNDARY_POLICY,'caseId':case_id,'receiptSha256':sha,'baseEvidence':copy.deepcopy(base),
       'evidenceFiles':evidence,'measurements':[_measure(c,pcm) for c in receipt['cuts']]}
    r['id']=digest(r);a.update(reviewedSourceReview=r,qualityRecipe=recipe,
       fingerprint=site_fingerprint(a['sourceAudioSha256'],a['textSha256'],a['key'].split(':')[-1],recipe,BOUNDARY_RECOGNIZER))
    for cut in receipt['cuts']:next(c for c in a['cues'] if c['verse']==cut['verse']).update(start=cut['after'][0],end=cut['after'][1])
    if not reviewed_measurements_match(a,pcm):raise ValueError('Source-reviewed correction did not verify')
    return a
