"""Bounded remote review of coarse ASR heads conflicting with real neighboring words."""
import argparse
import copy
import hashlib
import json
from pathlib import Path
import sys

from align_site import ROOT
from alignment_contract import ANCHOR_WINDOW_RECIPE,site_fingerprint
from anchor_windows import ANCHOR_WINDOW_POLICY,measure_head_refinement
from boundary_context_review import PaddingBoundaryAligner
from boundary_quality import verified_boundary_artifact
from boundary_review import waveform_signal
from joint_boundaries import context_groups,expand_context_group,joint_window,split_joint_words,joint_proof_id
from joint_padding import allocate_padding,protected_core,PADDING_POLICY
from media_assets import file_matches
from publish_site import recording_entry
from site_resources import write_json
from spoken_text import boundary_text


class AnchorWindowReviewer(PaddingBoundaryAligner):
    def align_refined_group(self,audio,pcm,group,bounds,old_checks,audio_sha):
        text=' '.join(boundary_text(v['text'],self.locale) for v in group)
        words=self.align_words(audio,text,bounds)
        try:parts=split_joint_words(words,group,self.locale)
        except ValueError:return None
        signal=waveform_signal(audio,*bounds);checks=[];cues=[]
        for verse in group:
            n=verse['number'];old=old_checks.get(n,{})
            window={'verse':n,'text':verse['text'],'asrEdgeAnchors':old.get('asrEdgeAnchors',[])}
            cue,check=self.assess_words(audio,window,parts[n],*bounds,signal=signal)
            if cue is None:return None
            checks.append(check);cues.append(cue)
        refined=False
        for index in range(1,len(checks)):
            left,right=checks[index-1:index+1]
            if protected_core(left,len(audio)/16000)[1]<=protected_core(right,len(audio)/16000)[0]:continue
            proof=measure_head_refinement(left,right,pcm,audio_sha)
            if proof is None:return None
            raw=copy.deepcopy(right['asrEdgeAnchors']);effective=copy.deepcopy(raw);effective[0]=proof['effectiveAnchor']
            window={'verse':right['verse'],'text':right['text'],'asrEdgeAnchors':effective}
            cue,check=self.assess_words(audio,window,right['alignedWords'],*bounds,signal=signal)
            if cue is None:return None
            check.update(rawAsrEdgeAnchors=raw,pauseHeadProof=proof)
            checks[index]=check;cues[index]=cue;refined=True
        if not refined:return None
        cues=allocate_padding(checks,cues,len(audio)/16000)
        if cues is None:return None
        proof={'verses':[v['number'] for v in group],'range':bounds,'words':words,'signal':signal,
               'anchors':{str(c['verse']):c['asrEdgeAnchors'] for c in checks},'paddingAllocation':PADDING_POLICY,
               'clipRanges':{str(c['verse']):[c['start'],c['end']] for c in cues}}
        proof['id']=joint_proof_id(audio_sha,proof)
        for check in checks:
            check.update(jointProofId=proof['id'],jointClipRange=proof['clipRanges'][str(check['verse'])])
        return cues,checks,proof

    def review(self,receipt,verses):
        from whisperx.audio import load_audio
        from gap_review import decode_pcm
        path=self.snapshot/'alignment'/(receipt['key'].replace(':','__')+'.json')
        original=json.loads(path.read_text());sha=hashlib.sha256(json.dumps(verses,ensure_ascii=False,sort_keys=True).encode()).hexdigest()
        if (any(any(c.isdigit() for c in v['text']) for v in verses)
                or original.get('acousticGapReview') is not None or original.get('spokenProjection') is not None
                or recording_entry(receipt,original,sha)['alignmentStatus']!='review-required'):
            raise ValueError('Pause review requires a matching plain-source rejected boundary report')
        audio_path=ROOT/'storage/resources/media'/(receipt['sha256']+'.mp3')
        if not file_matches(audio_path,receipt['sha256']):raise ValueError('Original audio SHA differs')
        audio=load_audio(str(audio_path));pcm=decode_pcm(audio_path)
        old_checks={c['verse']:c for c in original['checks']};old_cues={c['verse']:c for c in original['cues']}
        proofs=original.get('jointAlignments',[]);attempts=[]
        for index,verse in enumerate(verses):
            if 'edge-at-search-limit' not in old_checks.get(verse['number'],{}).get('boundaryEvidence',{}).get('reasons',[]):continue
            for first,last in context_groups(index,len(verses)):
                expanded=expand_context_group(first,last,verses,old_checks,proofs)
                if expanded is None:continue
                first,last=expanded;group=verses[first:last+1]
                bounds=joint_window(group,old_checks,list(old_cues.values()),original['duration'])
                if bounds is None:continue
                aligned=self.align_refined_group(audio,pcm,group,bounds,old_checks,receipt['sha256'])
                attempts.append({'verses':[v['number'] for v in group],'measuredPause':aligned is not None})
                if aligned is None:continue
                cues,checks,proof=aligned;numbers={v['number'] for v in group}
                merged_checks={**old_checks,**{c['verse']:c for c in checks}}
                merged_cues={n:c for n,c in old_cues.items() if n not in numbers};merged_cues.update({c['verse']:c for c in cues})
                used={c['jointProofId'] for c in merged_checks.values() if c.get('jointProofId')}
                result=copy.deepcopy(original)
                result.update(qualityRecipe=ANCHOR_WINDOW_RECIPE,anchorWindowPolicy=ANCHOR_WINDOW_POLICY,accepted=True,issues=[],
                    fingerprint=site_fingerprint(receipt['sha256'],sha,self.locale,ANCHOR_WINDOW_RECIPE,self.recognizer_name),
                    cues=[merged_cues[n] for n in sorted(merged_cues)],checks=[merged_checks[n] for n in sorted(merged_checks)],
                    jointAlignments=[*[p for p in proofs if p['id'] in used],proof],
                    anchorWindowReview={'sourceRecipe':original['qualityRecipe'],'sourceFingerprint':original['fingerprint'],
                                        'sourceReportSha256':hashlib.sha256(path.read_bytes()).hexdigest(),'attempts':attempts})
                if verified_boundary_artifact(result):return result
        return None


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--snapshot',type=Path,required=True)
    parser.add_argument('--key',required=True)
    parser.add_argument('--proof-output',type=Path,required=True)
    args=parser.parse_args()
    if sys.platform!='linux':parser.error('Acoustic review must run on the remote Linux machine')
    snapshot=args.snapshot.resolve();receipt=json.loads((snapshot/'recordings.json').read_text())[args.key]
    books={b['id']:b for b in json.loads((snapshot/'bible.json').read_text())};book,chapter,locale=args.key.split(':')
    verses=[{'number':v['number'],'text':v[locale]} for v in books[book]['chapters'][int(chapter)-1] if v[locale].strip()]
    engine=AnchorWindowReviewer(locale,snapshot);result=engine.review(receipt,verses)
    if result is None:raise SystemExit('No source-verified quiet-pause correction; canonical data unchanged')
    write_json(args.proof_output,result)
    print(json.dumps({'key':args.key,'accepted':True,'proofOutput':str(args.proof_output),
                      'refinedVerses':[c['verse'] for c in result['checks'] if c.get('pauseHeadProof')]}),flush=True)
