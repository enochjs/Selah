"""Source-preserving, bounded attempts for one chapter, with a diagnostic for each failure."""
import copy
import hashlib
import json
import re
import math
from datetime import datetime,timezone

from align_site import ROOT,SiteAligner
from boundary_context_review import PaddingBoundaryAligner,review_targets
from boundary_quality import verified_boundary_artifact,boundary_gap_issues
from boundary_review import waveform_signal
from joint_boundaries import context_groups,expand_context_group,joint_window,split_joint_words,joint_proof_id,verified_joint_proofs
from joint_padding import allocate_padding,protected_core,PADDING_POLICY
from alignment_contract import CASE_REVIEW_RECIPE,PADDING_REVIEW_RECIPE,GAP_REVIEW_RECIPE,PARTIAL_REVIEW_RECIPE,site_fingerprint
from case_evidence import CASE_POLICY,CASE_PAUSE_POLICY,exclusive_head_owner,case_witness
from anchor_windows import measure_head_refinement
from numeric_review import NumericBoundaryAligner
from numeric_alignment import NUMERIC_POLICY
from spoken_projection import project_text,projection_for
from site_resources import write_json
from media_assets import file_matches
from gap_review import decode_pcm
from quiet_gaps import GAP_POLICY,measure_gaps,verified_quiet_gaps


def issue_details(artifact):
    details=[]
    for check in artifact.get('checks',[]):
        if check.get('boundaryVerified'):continue
        evidence=check.get('boundaryEvidence',{})
        details.append({'verse':check['verse'],'searchRange':check.get('searchRange'),
            'acousticCore':evidence.get('acousticCore'),'reasons':evidence.get('reasons',[]),
            'headScore':evidence.get('headScore'),'tailScore':evidence.get('tailScore')})
    return details


def bounded_case_window(group,checks,cues,duration,gaps):
    bounds=joint_window(group,checks,cues,duration)
    if bounds is None:return None
    heading=max([g['end'] for g in gaps if g.get('kind')=='leading' and g.get('allowedHeadingOrClosing')]+[0])
    closing=min([g['start'] for g in gaps if g.get('kind')=='trailing' and g.get('allowedHeadingOrClosing')]+[duration])
    bounds=[math.ceil(max(bounds[0],heading)*1000)/1000,math.floor(min(bounds[1],closing)*1000)/1000]
    return bounds if bounds[0]<bounds[1] else None


class PerChapterReviewer(PaddingBoundaryAligner):
    def word_candidates(self,audio,text,bounds):
        return NumericBoundaryAligner.word_candidates(self,audio,text,bounds)

    def align_words(self,audio,text,bounds):
        words=(NumericBoundaryAligner.align_words(self,audio,text,bounds) if self.locale=='en'
               else super().align_words(audio,text,bounds))
        # Padding proofs must use the same scalar arithmetic as their saved
        # JSON representation (NumPy and Python round midpoint ties differently).
        return json.loads(json.dumps(words))

    def assess_case(self,audio,verse,words,bounds,anchors,metadata=None):
        reference=project_text(self.key,verse['number'],verse['text'])
        cue,check=self.assess_words(audio,{'verse':verse['number'],'text':reference,'asrEdgeAnchors':anchors},
                                    words,*bounds,signal=waveform_signal(audio,*bounds))
        check.update(text=verse['text'],spokenText=reference)
        if metadata:check.update(metadata)
        if cue:cue['text']=verse['text']
        return cue,check

    def attempt_group(self,audio,pcm,group,bounds,checks,partial):
        views=[{**v,'text':project_text(self.key,v['number'],v['text'])} for v in group]
        words=self.align_words(audio,' '.join(v['text'] for v in views),bounds)
        try:parts=split_joint_words(words,views,self.locale)
        except ValueError:return None,{'reason':'incomplete-source-word-sequence','verses':[v['number'] for v in group]}
        new=[]
        for verse in group:
            anchors=copy.deepcopy(checks.get(verse['number'],{}).get('asrEdgeAnchors',[]))
            _,check=self.assess_case(audio,verse,parts[verse['number']],bounds,anchors)
            new.append(check)
        for index in range(len(new)-1):
            owner=exclusive_head_owner(new[index],new[index+1])
            if owner:
                left=new[index];left['caseOriginalAnchors']=copy.deepcopy(left['asrEdgeAnchors'])
                left['asrEdgeAnchors'][-1]=owner['effectiveAnchor'];left['anchorOwnerProof']=owner
        cues=[]
        for index,(verse,check) in enumerate(zip(group,new)):
            metadata={k:check[k] for k in ['caseOriginalAnchors','anchorOwnerProof'] if k in check}
            cue,check=self.assess_case(audio,verse,check['alignedWords'],bounds,check['asrEdgeAnchors'],metadata)
            new[index]=check
            if cue:cues.append(cue)
        if len(cues)!=len(group):return None,{'reason':'weak-or-truncated-acoustic-edge','checks':issue_details({'checks':new})}
        for index in range(1,len(new)):
            left,right=new[index-1:index+1]
            if protected_core(left,len(audio)/16000)[1]<=protected_core(right,len(audio)/16000)[0]:continue
            proof=measure_head_refinement(left,right,pcm,self.audio_sha,CASE_PAUSE_POLICY)
            if proof is None:return None,{'reason':'conflicting-coarse-clocks-no-confirmed-pause','verses':[left['verse'],right['verse']]}
            metadata={k:right[k] for k in ['caseOriginalAnchors','anchorOwnerProof'] if k in right}
            metadata.setdefault('caseOriginalAnchors',copy.deepcopy(right['asrEdgeAnchors']))
            metadata['pauseHeadProof']=proof
            anchors=copy.deepcopy(right['asrEdgeAnchors']);anchors[0]=proof['effectiveAnchor']
            cue,check=self.assess_case(audio,group[index],right['alignedWords'],bounds,anchors,metadata)
            if cue is None:return None,{'reason':'pause-correction-still-fails-edge','checks':issue_details({'checks':[check]})}
            new[index]=check;cues[index]=cue
        if partial:
            if any(a['end']>b['start'] for a,b in zip(cues,cues[1:])):return None,{'reason':'available-verses-padding-overlap'}
        else:
            cues=allocate_padding(new,cues,len(audio)/16000)
            if cues is None:return None,{'reason':'protected-spoken-intervals-overlap'}
        proof={'verses':[v['number'] for v in group],'range':bounds,'words':words,'signal':new[0]['boundarySignal'],
               'anchors':{str(c['verse']):c['asrEdgeAnchors'] for c in new}}
        if not partial:
            proof.update(paddingAllocation=PADDING_POLICY,clipRanges={str(c['verse']):[c['start'],c['end']] for c in cues})
        proof['id']=joint_proof_id(self.audio_sha,proof)
        for check in new:
            check['jointProofId']=proof['id']
            if not partial:check['jointClipRange']=proof['clipRanges'][str(check['verse'])]
        return (cues,new,proof),{'reason':'candidate-generated','ownership':[c['verse'] for c in new if c.get('anchorOwnerProof')],
                               'pause':[c['verse'] for c in new if c.get('pauseHeadProof')]}

    def prepare(self,original,verses,pcm):
        result=copy.deepcopy(original);roots=verses;self.roles=None;self.niv=None
        for name in ['numericAlignmentPolicy','numericBaseRecipe','anchorWindowPolicy','caseReviewPolicy','caseBaseRecipe','caseNumericPolicy']:
            result.pop(name,None)
        if original.get('spokenProjection') is not None or original.get('confirmedCoverage') is not None:
            from audio_coverage import candidate_roles,narrated_verses
            from source_omissions import fetch_niv_reference
            self.niv=fetch_niv_reference(self.snapshot,self.key,list(range(1,max(v['number'] for v in verses)+1))) if self.locale=='en' else None
            self.roles=candidate_roles(self.key,verses,self.niv)
            roots=narrated_verses({'key':self.key,'boundarySourceVerses':verses,'confirmedCoverage':{'roles':self.roles}})
            result['spokenProjection']=projection_for(self.key,verses)
            result['missingVerses']=self.roles['missingVerses']
            base=PARTIAL_REVIEW_RECIPE
        else:
            result.pop('missingVerses',None);result.pop('confirmedCoverage',None);base=PADDING_REVIEW_RECIPE
        allowed={v['number'] for v in roots};bad_groups=set()
        for proof in result.get('jointAlignments',[]):
            if not set(proof['verses']).issubset(allowed):bad_groups.update(proof['verses'])
        result['checks']=[c for c in result['checks'] if c['verse'] in allowed and c['verse'] not in bad_groups]
        result['cues']=[c for c in result['cues'] if c['verse'] in allowed and c['verse'] not in bad_groups]
        result['jointAlignments']=[p for p in result.get('jointAlignments',[]) if not set(p['verses'])&bad_groups]
        result.update(caseReviewPolicy=CASE_POLICY,caseBaseRecipe=base,qualityRecipe=CASE_REVIEW_RECIPE)
        if any(re.search(r'\d',project_text(self.key,v['number'],v['text'])) for v in roots):result['caseNumericPolicy']=NUMERIC_POLICY
        return result,roots

    def final_evidence(self,result,roots,pcm,speech):
        result['issues']=[f'unreliable-verse-boundary:{v["number"]}' for v in roots
                          if not any(c['verse']==v['number'] and c.get('boundaryVerified') for c in result['checks'])
                          or not any(c['verse']==v['number'] for c in result['cues'])]
        gaps=boundary_gap_issues(result['unclaimedSpeech'],result['cues'])
        result.pop('acousticGapReview',None)
        if self.roles is not None:
            from audio_coverage import measure_coverage,verified_coverage
            try:
                result['confirmedCoverage']=measure_coverage(result,pcm,speech,self.roles,self.niv)
                if not verified_coverage(result):result['issues'].append('unconfirmed-source-coverage')
            except ValueError:result['issues'].append('coverage-neighbor-or-boundary-unverified')
        if gaps:
            proof=measure_gaps(result,pcm,speech)
            if verified_quiet_gaps({**result,'acousticGapReview':proof}):
                result['acousticGapReview']=proof
                if self.roles is None:result['caseBaseRecipe']=GAP_REVIEW_RECIPE
            else:result['issues'].extend(gaps)
        elif self.roles is None:result['caseBaseRecipe']=PADDING_REVIEW_RECIPE
        if result['caseBaseRecipe']==GAP_REVIEW_RECIPE:
            result['gapReview']={'recipe':GAP_REVIEW_RECIPE,'sourceFingerprint':self.original['fingerprint']}
        result['accepted']=not result['issues'] and len(result['cues'])==len(roots)
        if result['accepted'] and not verified_boundary_artifact(result):
            result['accepted']=False;result['issues'].append('complete-source-proof-not-confirmed')
        return result

    def review_chapter(self,receipt,verses):
        import numpy as np
        from faster_whisper import vad
        from whisperx.audio import load_audio
        self.key=receipt['key'];self.audio_sha=receipt['sha256']
        path=self.snapshot/'alignment'/(self.key.replace(':','__')+'.json');self.original=json.loads(path.read_text())
        source=ROOT/'storage/resources/media'/(self.audio_sha+'.mp3')
        from publish_site import recording_entry
        text_sha=hashlib.sha256(json.dumps(verses,ensure_ascii=False,sort_keys=True).encode()).hexdigest()
        if recording_entry(receipt,self.original,text_sha)['alignmentStatus']!='review-required':raise ValueError('Source report is not the selected unresolved chapter')
        if not file_matches(source,self.audio_sha):raise ValueError('Original media hash differs')
        audio=load_audio(str(source));pcm=decode_pcm(source)
        result,roots=self.prepare(self.original,verses,pcm)
        result.update(fingerprint=site_fingerprint(self.audio_sha,text_sha,self.locale,CASE_REVIEW_RECIPE,self.recognizer_name))
        checks={c['verse']:c for c in result['checks']};cues={c['verse']:c for c in result['cues']};proofs=result['jointAlignments']
        attempts=[];seen=set();partial=self.roles is not None;maximum=3 if partial else CASE_POLICY['maximumJointVerses']
        for index,verse in enumerate(roots):
            targets=review_targets(roots,cues,checks,result['unclaimedSpeech'])
            if verse['number'] not in targets:continue
            groups=context_groups(index,len(roots))
            if not partial:
                wider=(max(0,index-2),min(len(roots)-1,index+2))
                if wider[0]<wider[1] and wider not in groups:groups.append(wider)
            for first,last in groups:
                expanded=expand_context_group(first,last,roots,checks,proofs,maximum_verses=maximum)
                if expanded is None:
                    attempts.append({'verse':verse['number'],'reason':'existing-proof-group-exceeds-bounded-context'});continue
                first,last=expanded;group=roots[first:last+1]
                bounds=bounded_case_window(group,checks,list(cues.values()),result['duration'],result['unclaimedSpeech'])
                if bounds is None:
                    attempts.append({'verses':[v['number'] for v in group],'reason':'no-safe-context-window-within-60-seconds'});continue
                signature=(first,last,*bounds)
                if signature in seen:continue
                seen.add(signature)
                candidate,diagnostic=self.attempt_group(audio,pcm,group,bounds,checks,partial)
                attempts.append({'verses':[v['number'] for v in group],'range':bounds,**diagnostic})
                if candidate is None:continue
                new_cues,new_checks,proof=candidate;numbers={v['number'] for v in group}
                proposed={n:c for n,c in cues.items() if n not in numbers};proposed.update({c['verse']:c for c in new_cues})
                ordered=[proposed[n] for n in sorted(proposed)]
                if any(a['end']>b['start'] for a,b in zip(ordered,ordered[1:])):
                    attempts[-1]['reason']='candidate-overlaps-verified-neighbor';continue
                proposed_checks={**checks,**{c['verse']:c for c in new_checks}}
                used={c['jointProofId'] for c in proposed_checks.values() if c.get('jointProofId')}
                proposed_proofs=[p for p in [*proofs,proof] if p['id'] in used]
                mini={**result,'cues':ordered,'checks':[proposed_checks[n] for n in sorted(proposed_checks)
                       if proposed_checks[n].get('jointProofId')],'jointAlignments':proposed_proofs}
                try:trial=case_witness(mini)
                except ValueError:
                    attempts[-1]['reason']='derived-clock-or-number-proof-rejected';continue
                trial['boundarySourceVerses']=roots
                if not verified_joint_proofs(trial,maximum_verses=maximum):
                    attempts[-1]['reason']='joint-source-partition-proof-rejected';continue
                checks=proposed_checks;cues=proposed;proofs=proposed_proofs
                attempts[-1]['reason']='verified-group-adopted'
                if verse['number'] not in review_targets(roots,cues,checks,result['unclaimedSpeech']):break
            if len(seen)>=12:break
        result.update(checks=[checks[n] for n in sorted(checks)],cues=[cues[n] for n in sorted(cues)],jointAlignments=proofs)
        model_path=__import__('pathlib').Path(vad.__file__).parent/'assets/silero_vad_v6.onnx'
        if not file_matches(model_path,GAP_POLICY['vadModelSha256']):raise ValueError('VAD model revision differs')
        settings=vad.VadOptions(threshold=GAP_POLICY['vadThreshold'],neg_threshold=GAP_POLICY['vadNegativeThreshold'],
             min_speech_duration_ms=GAP_POLICY['vadMinimumSpeechMs'],min_silence_duration_ms=GAP_POLICY['vadMinimumSilenceMs'],speech_pad_ms=GAP_POLICY['vadPaddingMs'])
        speech=[[x['start'],x['end']] for x in vad.get_speech_timestamps(np.asarray(pcm,dtype=np.float32)/32768,vad_options=settings)]
        result=self.final_evidence(result,roots,pcm,speech)
        result['caseReview']={'sourceFingerprint':self.original['fingerprint'],'sourceReportSha256':hashlib.sha256(path.read_bytes()).hexdigest(),
                             'attempts':attempts,'finishedAt':datetime.now(timezone.utc).isoformat()}
        outcome={'key':self.key,'reviewRecipe':CASE_REVIEW_RECIPE,'outcome':'fixed' if result['accepted'] else 'manual-review',
                 'sourceAudioSha256':self.audio_sha,'textSha256':text_sha,'attempts':attempts,
                 'remainingIssues':result['issues'],'verseDetails':issue_details(result),
                 'reviewPositions':[{'verse':c['verse'],'searchRange':c.get('searchRange'),
                    'acousticCore':c.get('boundaryEvidence',{}).get('acousticCore'),
                    'reasons':c.get('boundaryEvidence',{}).get('reasons',[])} for c in result['checks']
                    if not c.get('boundaryVerified') or any(i.endswith(':'+str(c['verse'])) for i in self.original['issues'])],
                 'unassignedIntervals':[g for g in result['unclaimedSpeech'] if boundary_gap_issues([g],result['cues'])],
                 'candidateCoverageRoles':self.roles,
                 'candidateCues':result['cues'],'finishedAt':result['caseReview']['finishedAt']}
        if result['accepted']:
            from case_evidence import verify_case_media
            if not verify_case_media(result,source):raise ValueError('Original PCM proof did not verify')
            backup=self.snapshot/'alignment-before-individual-review'/path.name
            if not backup.exists():write_json(backup,self.original)
            SiteAligner.materialize(self,result,receipt,verses,source)
            write_json(path,result)
        else:
            write_json(self.snapshot/'case-review-candidates'/path.name,result)
        return outcome
