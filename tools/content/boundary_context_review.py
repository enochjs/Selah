"""Repair unreliable verse edges by aligning two or three adjacent verses together."""
import copy
from datetime import datetime, timezone
import hashlib
import json

from align_site import ROOT
from boundary_review import BoundaryAligner, waveform_signal
from boundary_quality import (POLICY, verse_boundary, boundary_gap_issues,
                              verified_boundary_artifact)
from alignment_contract import (BOUNDARY_CONTEXT_RECIPE, BOUNDARY_RECOGNIZER,
                                site_fingerprint)
from joint_boundaries import (context_groups, joint_window, split_joint_words,
                              joint_proof_id, verified_joint_proofs, expand_context_group)
from publish_site import recording_entry
from site_resources import write_json
from spoken_text import boundary_text
from media_assets import file_matches


def valid_cue(verse, cue, check, duration, locale):
    try:
        if (not cue or not check or not check.get('boundaryVerified')
                or cue['verse'] != check['verse'] or cue['verse'] != verse['number']
                or cue['text'] != check['text'] or cue['text'] != verse['text']):
            return False
        edges,_ = verse_boundary(check['alignedWords'],check['searchRange'],duration,locale,
            reference=boundary_text(verse['text'],locale),signal=check.get('boundarySignal'),
            anchors=check.get('asrEdgeAnchors'))
        return edges is not None and edges == [cue['start'],cue['end']]
    except (KeyError,TypeError,ValueError):
        return False


def gap_keys(gaps, cues):
    cues=sorted(cues,key=lambda cue:cue['verse'])
    return {(g.get('start'),g.get('end'),g.get('kind')) for g in gaps
            if boundary_gap_issues([g],cues)}


def review_targets(verses, cues, checks, gaps):
    targets = {v['number'] for v in verses if not checks.get(v['number'],{}).get('boundaryVerified')
               or v['number'] not in cues}
    ordered=sorted(cues.values(),key=lambda cue:cue['verse'])
    for gap in gaps:
        if not boundary_gap_issues([gap],ordered):
            continue
        start,end = gap.get('start'),gap.get('end')
        if start is None or end is None:
            continue
        for check in checks.values():
            bounds=check.get('searchRange')
            if bounds and bounds[0] <= end and bounds[1] >= start:
                targets.add(check['verse'])
    return targets


def review_joint_artifact(engine, artifact, receipt, verses, audio):
    text_sha=hashlib.sha256(json.dumps(verses,ensure_ascii=False,sort_keys=True).encode()).hexdigest()
    if (artifact.get('verificationScope')!='verse-boundaries' or artifact.get('boundaryPolicy')!=POLICY
            or recording_entry(receipt,artifact,text_sha)['alignmentStatus']!='review-required'):
        raise ValueError('Joint boundary review requires a source-matched rejected boundary report')
    result=copy.deepcopy(artifact)
    cues={c['verse']:c for c in result['cues']}
    checks={c['verse']:c for c in result['checks']}
    for verse in verses:
        n=verse['number']
        if not valid_cue(verse,cues.get(n),checks.get(n),artifact['duration'],engine.locale):
            cues.pop(n,None)
            if n in checks:checks[n]['boundaryVerified']=False
    proofs=list(result.get('jointAlignments',[]));seen=set();attempts=[];recovered=set();unattempted=[]
    gaps=result.get('unclaimedSpeech',[])
    targets=review_targets(verses,cues,checks,gaps)
    for index,verse in enumerate(verses):
        number=verse['number']
        if number not in targets or number not in review_targets(verses,cues,checks,gaps):
            continue
        attempted=False
        for first,last in context_groups(index,len(verses)):
            expanded=expand_context_group(first,last,verses,checks,proofs)
            if expanded is None:
                continue
            first,last=expanded
            group=verses[first:last+1]
            bounds=joint_window(group,checks,list(cues.values()),artifact['duration'])
            if bounds is None:
                continue
            signature=(first,last,*bounds)
            if signature in seen:
                continue
            seen.add(signature);attempted=True
            new_cues,new_checks,proof=engine.align_group(audio,group,bounds,checks,receipt['sha256'])
            attempts.append({'verses':[v['number'] for v in group],'range':bounds,
                'failedVerses':[c['verse'] for c in new_checks if not c.get('boundaryVerified')]})
            if new_cues is None or proof is None:
                continue
            trial={**result,'jointAlignments':[proof],'checks':new_checks,'cues':list(cues.values())}
            if not verified_joint_proofs(trial):
                raise ValueError('Generated joint alignment has inconsistent source or partition evidence')
            numbers={v['number'] for v in group}
            candidate={n:c for n,c in cues.items() if n not in numbers}
            candidate.update({c['verse']:c for c in new_cues})
            ordered=[candidate[n] for n in sorted(candidate)]
            if any(left['end']>right['start'] for left,right in zip(ordered,ordered[1:])):
                continue
            old_gaps=gap_keys(gaps,list(cues.values()))
            new_gaps=gap_keys(gaps,ordered)
            if not new_gaps.issubset(old_gaps):
                continue
            if not (numbers-set(cues)) and new_gaps==old_gaps:
                continue
            candidate_checks={**checks,**{c['verse']:c for c in new_checks}}
            used={c['jointProofId'] for c in candidate_checks.values() if c.get('jointProofId')}
            candidate_proofs=[p for p in [*proofs,proof] if p['id'] in used]
            trial={**result,'jointAlignments':candidate_proofs,'checks':list(candidate_checks.values()),
                   'cues':ordered}
            if not verified_joint_proofs(trial):
                continue
            cues=candidate;checks=candidate_checks;proofs=candidate_proofs
            recovered.update(numbers)
            if number not in review_targets(verses,cues,checks,gaps):
                break
        if not attempted and number in review_targets(verses,cues,checks,gaps):
            unattempted.append(number)
    result['cues']=[cues[n] for n in sorted(cues)]
    result['checks']=[checks[n] for n in sorted(checks)]
    issues=[];previous=0
    for verse in verses:
        n=verse['number'];cue=cues.get(n)
        if not valid_cue(verse,cue,checks.get(n),artifact['duration'],engine.locale):
            issues.append(f'unreliable-verse-boundary:{n}')
        elif cue['start']<previous:
            issues.append(f'invalid-phoneme-boundary:{n}')
        if cue:previous=cue['end']
    issues.extend(boundary_gap_issues(gaps,result['cues']))
    used={c['jointProofId'] for c in result['checks'] if c.get('jointProofId')}
    result.update(jointAlignments=[p for p in proofs if p['id'] in used],issues=issues,
        accepted=not issues and len(cues)==len(verses),qualityRecipe=engine.recipe,
        recognizer=engine.recognizer_name,recognizerRevision=engine.recognizer_revision,
        fingerprint=site_fingerprint(receipt['sha256'],text_sha,engine.locale,engine.recipe,engine.recognizer_name),
        boundaryContextReview={'recipe':engine.recipe,'sourceFingerprint':artifact['fingerprint'],
            'sourceRecipe':artifact['qualityRecipe'],'attempts':len(attempts),'attemptDetails':attempts,
            'reverifiedVerses':sorted(recovered),'unattemptedVerses':unattempted,
            'updatedAt':datetime.now(timezone.utc).isoformat()})
    if result['accepted'] and not verified_boundary_artifact(result):
        raise ValueError('Final joint boundary report failed publication verification')
    return result


class JointBoundaryAligner(BoundaryAligner):
    def __init__(self,locale,snapshot):
        super().__init__(locale,snapshot)
        self.recipe=BOUNDARY_CONTEXT_RECIPE

    def align_group(self,audio,group,bounds,old_checks,source_sha):
        from whisperx.alignment import align
        text=' '.join(boundary_text(v['text'],self.locale) for v in group)
        aligned=align([{'start':bounds[0],'end':bounds[1],'text':text}],self.model,self.metadata,
                      audio,self.device,interpolate_method='ignore',return_char_alignments=False)
        words=[w for segment in aligned['segments'] for w in segment['words']]
        try:
            parts=split_joint_words(words,group,self.locale)
        except ValueError:
            return None,[],None
        signal=waveform_signal(audio,*bounds);cues=[];checks=[];anchors={}
        for verse in group:
            n=verse['number'];old=old_checks.get(n,{})
            window={'verse':n,'text':verse['text'],'asrEdgeAnchors':old.get('asrEdgeAnchors',[])}
            cue,check=self.assess_words(audio,window,parts[n],*bounds,
                initial=old.get('independentTranscript'),signal=signal)
            checks.append(check);anchors[str(n)]=check['asrEdgeAnchors']
            if cue:cues.append(cue)
        if len(cues)!=len(group) or any(a['end']>b['start'] for a,b in zip(cues,cues[1:])):
            return None,checks,None
        proof={'verses':[v['number'] for v in group],'range':bounds,'words':words,
               'signal':signal,'anchors':anchors}
        proof['id']=joint_proof_id(source_sha,proof)
        for check in checks:check['jointProofId']=proof['id']
        return cues,checks,proof

    def align_recording(self,receipt,verses,review_rejected=False,source_review=False):
        from whisperx.audio import load_audio
        path=self.snapshot/'alignment'/(receipt['key'].replace(':','__')+'.json')
        artifact=json.loads(path.read_text())
        text_sha=hashlib.sha256(json.dumps(verses,ensure_ascii=False,sort_keys=True).encode()).hexdigest()
        entry=recording_entry(receipt,artifact,text_sha)
        if entry['alignmentStatus']=='aligned':
            return artifact
        if entry['alignmentStatus']!='review-required':
            raise ValueError('Joint review cannot reuse an unmatched source report')
        expected=site_fingerprint(receipt['sha256'],text_sha,self.locale,self.recipe,self.recognizer_name)
        if artifact.get('fingerprint')==expected:
            return artifact
        backup=self.snapshot/'alignment-before-joint-boundary-review'/path.name
        if not backup.exists():write_json(backup,artifact)
        audio_path=ROOT/'storage/resources/media'/(receipt['sha256']+'.mp3')
        if not file_matches(audio_path,receipt['sha256']):
            raise ValueError('Missing or corrupt original recording for joint boundary review')
        audio=load_audio(str(audio_path))
        reviewed=review_joint_artifact(self,artifact,receipt,verses,audio)
        self.materialize(reviewed,receipt,verses,audio_path)
        write_json(path,reviewed)
        return reviewed
