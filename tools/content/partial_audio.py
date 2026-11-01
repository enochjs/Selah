"""Verified available verses with explicit source-bound missing narration."""
import copy
import hashlib
import json
import math
import re
from pathlib import Path

from align_site import ROOT
from boundary_quality import POLICY,boundary_gap_issues
from projection_review import ProjectionBoundaryAligner
from spoken_projection import projection_for,projection_matches
from quiet_gaps import measure_gaps,verified_quiet_gaps,measurements_match,GAP_POLICY
from gap_review import decode_pcm
from media_assets import file_matches
from site_resources import write_json

_media_checks={}


def source_text_sha(verses):
    return hashlib.sha256(json.dumps(verses,ensure_ascii=False,sort_keys=True).encode()).hexdigest()


def verified_partial_files(artifact):
    """Check the materialized clip inventory against the verified narrated cues."""
    from audio_coverage import narrated_verses
    try:
        roots=narrated_verses(artifact)
        files=artifact['verseFiles'];cues=artifact['cues']
        numbers=[verse['number'] for verse in roots]
        if ([item['verse'] for item in files]!=numbers
                or [cue['verse'] for cue in cues]!=numbers):return False
        for verse,item,cue in zip(roots,files,cues):
            if item.get('coveredVerses',[item['verse']])!=verse.get('coveredVerses',[verse['number']]):return False
            start,end,duration=item['sourceStart'],item['sourceEnd'],item['duration']
            if (any(type(value) not in (int,float) or not math.isfinite(value) for value in (start,end,duration))
                    or start!=cue['start'] or end!=cue['end'] or end<=start or duration<=0
                    or abs(duration-(end-start))>0.002
                    or not re.fullmatch(r'[a-f0-9]{64}',item['sha256'])
                    or item['path']!='/api/audio/resources/'+item['sha256']+'.mp3'):return False
        return True
    except (KeyError,TypeError,ValueError,IndexError):return False


def verified_partial_boundary_artifact(artifact):
    """Validate the full source partition before rechecking every narrated root."""
    try:
        from audio_coverage import verified_coverage,narrated_verses
        from alignment_contract import PROJECTION_REVIEW_RECIPE,PARTIAL_REVIEW_RECIPE
        from boundary_quality import verified_boundary_artifact
        full=artifact['boundarySourceVerses']
        if (artifact.get('qualityRecipe')!=PARTIAL_REVIEW_RECIPE or not artifact.get('accepted') or artifact.get('issues')
                or artifact.get('verificationScope')!='verse-boundaries' or artifact.get('boundaryPolicy')!=POLICY
                or artifact['textSha256']!=source_text_sha(full)
                or artifact['expectedVerseNumbers']!=[v['number'] for v in full]
                or not projection_matches(artifact) or not verified_coverage(artifact)
                or artifact.get('missingVerses',[])!=artifact['confirmedCoverage']['roles']['missingVerses']
                or any(c.get('jointClipRange') is not None for c in artifact['checks'])):
            return False
        narrated=narrated_verses(artifact)
        if artifact.get('jointAlignments') or any(c.get('jointProofId') for c in artifact['checks']):
            from joint_boundaries import verified_joint_proofs
            if not verified_joint_proofs({**artifact,'boundarySourceVerses':narrated}):return False
        gaps=artifact['unclaimedSpeech']
        if boundary_gap_issues(gaps,artifact['cues']):
            if not verified_quiet_gaps(artifact):return False
            # Original gaps and source SHA remain in the published report. This
            # internal witness only reuses the unchanged single-verse verifier.
            gaps=[]
        elif artifact.get('acousticGapReview') is not None:
            return False
        trial={**artifact,'qualityRecipe':PROJECTION_REVIEW_RECIPE,
               'boundarySourceVerses':narrated,'expectedVerseNumbers':[v['number'] for v in narrated],
               'textSha256':source_text_sha(narrated),'spokenProjection':projection_for(artifact['key'],narrated),
               'unclaimedSpeech':gaps}
        trial.pop('acousticGapReview',None)
        trial.pop('jointAlignments',None)
        trial['checks']=copy.deepcopy(artifact['checks'])
        for check in trial['checks']:check.pop('jointProofId',None)
        trial.pop('confirmedCoverage',None)
        trial.pop('missingVerses',None)
        return verified_boundary_artifact(trial)
    except (KeyError,TypeError,ValueError,IndexError,ZeroDivisionError):return False


def verify_partial_media(artifact,path):
    from audio_coverage import coverage_media_matches
    path=Path(path);info=path.stat()
    if not file_matches(path,artifact['sourceAudioSha256']):return False
    key=(str(path),info.st_size,info.st_mtime_ns,artifact['confirmedCoverage']['id'],
         artifact.get('acousticGapReview',{}).get('id'))
    if key not in _media_checks:
        pcm=decode_pcm(path)
        _media_checks[key]=(coverage_media_matches(artifact,pcm)
            and (artifact.get('acousticGapReview') is None or measurements_match(artifact,pcm)))
    return _media_checks[key]


class CoverageBoundaryAligner(ProjectionBoundaryAligner):
    def __init__(self,locale,snapshot):
        super().__init__(locale,snapshot)
        from alignment_contract import PARTIAL_REVIEW_RECIPE
        self.recipe=PARTIAL_REVIEW_RECIPE
        self._full_verses=[];self._roles={};self._niv=None;self._pcm=None;self._speech=[];self._original=None

    def publication_evidence(self,verses):
        return {'verificationScope':'verse-boundaries','boundaryPolicy':dict(POLICY),
                'expectedVerseNumbers':[v['number'] for v in self._full_verses],
                'boundarySourceVerses':self._full_verses,
                'spokenProjection':projection_for(self.current_key,self._full_verses)}

    def align_recording(self,receipt,verses,**options):
        import numpy as np
        from faster_whisper import vad
        from audio_coverage import candidate_roles,narrated_verses
        from source_omissions import fetch_niv_reference
        self._full_verses=copy.deepcopy(verses)
        self._niv=(fetch_niv_reference(self.snapshot,receipt['key'],list(range(1,max(v['number'] for v in verses)+1)))
                   if self.locale=='en' else None)
        self._roles=candidate_roles(receipt['key'],verses,self._niv)
        if not self._roles['missingVerses'] and not self._roles['aliases']:
            raise ValueError('No source-supported missing narration or merged source verse')
        narrated=narrated_verses({'key':receipt['key'],'boundarySourceVerses':verses,
                                'confirmedCoverage':{'roles':self._roles}})
        name=receipt['key'].replace(':','__')+'.json';path=self.snapshot/'alignment'/name
        backup=self.snapshot/'alignment-before-confirmed-coverage'/name
        self._original=json.loads(path.read_text()) if path.exists() else None
        if self._original and not backup.exists():write_json(backup,self._original)
        source=ROOT/'storage/resources/media'/(receipt['sha256']+'.mp3')
        if not file_matches(source,receipt['sha256']):raise ValueError('Original recording SHA differs')
        model=Path(vad.__file__).parent/'assets/silero_vad_v6.onnx'
        if not file_matches(model,GAP_POLICY['vadModelSha256']):raise ValueError('Unexpected VAD model')
        self._pcm=decode_pcm(source)
        audio=np.asarray(self._pcm,dtype=np.float32)/32768
        settings=vad.VadOptions(threshold=GAP_POLICY['vadThreshold'],neg_threshold=GAP_POLICY['vadNegativeThreshold'],
            min_speech_duration_ms=GAP_POLICY['vadMinimumSpeechMs'],min_silence_duration_ms=GAP_POLICY['vadMinimumSilenceMs'],
            speech_pad_ms=GAP_POLICY['vadPaddingMs'])
        self._speech=[[x['start'],x['end']] for x in vad.get_speech_timestamps(audio,vad_options=settings)]
        return super().align_recording(receipt,narrated,**options)

    def restore_verified_boundaries(self,artifact,receipt,verses):
        # Keep already verified measurements when a fresh independent window
        # fails. Joint measurements are retained only as complete raw groups.
        from publish_site import recording_entry
        from boundary_quality import verse_boundary
        from spoken_projection import project_text
        from joint_boundaries import verified_joint_proofs
        source=self._original
        if (not source or source.get('boundaryPolicy')!=POLICY
                or source.get('recognition')!=artifact.get('recognition')
                or recording_entry(receipt,source,artifact['textSha256'])['alignmentStatus'] not in {'aligned','partial','review-required'}):return
        by_number={v['number']:v for v in verses}
        old_checks={c['verse']:c for c in source['checks']};old_cues={c['verse']:c for c in source['cues']}
        checks={c['verse']:c for c in artifact['checks']};cues={c['verse']:c for c in artifact['cues']}
        old_proofs={p['id']:p for p in source.get('jointAlignments',[])};kept=[];reused=[]
        def valid(number,check,cue):
            if not check or not cue or not check.get('boundaryVerified') or check.get('jointClipRange') is not None:return False
            verse=by_number[number]
            if check['text']!=verse['text'] or cue['text']!=verse['text']:return False
            edges,_=verse_boundary(check['alignedWords'],check['searchRange'],artifact['duration'],self.locale,
                reference=project_text(receipt['key'],number,verse['text']),signal=check.get('boundarySignal'),anchors=check.get('asrEdgeAnchors'))
            return edges==[cue['start'],cue['end']]
        # Prefer a complete already-verified available timeline. Keeping its
        # original outer cues also preserves every retained joint search bound.
        if all(valid(n,old_checks.get(n),old_cues.get(n)) for n in by_number):
            complete_checks=[copy.deepcopy(old_checks[n]) for n in by_number]
            complete_cues=[copy.deepcopy(old_cues[n]) for n in by_number]
            used={c['jointProofId'] for c in complete_checks if c.get('jointProofId')}
            complete_proofs=[copy.deepcopy(p) for p in source.get('jointAlignments',[]) if p['id'] in used]
            trial={**artifact,'boundarySourceVerses':verses,'cues':complete_cues,'checks':complete_checks,
                   'jointAlignments':complete_proofs}
            if (not any(a['end']>b['start'] for a,b in zip(complete_cues,complete_cues[1:]))
                    and (not used or verified_joint_proofs(trial))):
                artifact.update(cues=complete_cues,checks=complete_checks,jointAlignments=complete_proofs,
                    issues=boundary_gap_issues(artifact['unclaimedSpeech'],complete_cues),
                    boundaryEvidenceReuse={'sourceRecipe':source['qualityRecipe'],'sourceFingerprint':source['fingerprint'],
                        'sourceReportSha256':source_text_sha(source),'verses':list(by_number),
                        'mode':'complete-original-available-timeline'})
                return
        for number in by_number:
            if valid(number,checks.get(number),cues.get(number)):continue
            check=old_checks.get(number,{})
            proof=old_proofs.get(check.get('jointProofId'))
            if check.get('jointProofId') and proof is None:continue
            group=proof['verses'] if proof else [number]
            if proof and proof.get('paddingAllocation') is not None:continue
            if any(n not in by_number or not valid(n,old_checks.get(n),old_cues.get(n)) for n in group):continue
            candidate={**cues,**{n:copy.deepcopy(old_cues[n]) for n in group}}
            ordered=[candidate[n] for n in sorted(candidate)]
            if any(a['end']>b['start'] for a,b in zip(ordered,ordered[1:])):continue
            candidate_checks={**checks,**{n:copy.deepcopy(old_checks[n]) for n in group}}
            candidate_proofs=[*kept,*([copy.deepcopy(proof)] if proof and proof['id'] not in {p['id'] for p in kept} else [])]
            if candidate_proofs and not verified_joint_proofs({**artifact,'boundarySourceVerses':verses,
                    'cues':ordered,'checks':list(candidate_checks.values()),'jointAlignments':candidate_proofs}):continue
            cues,checks,kept=candidate,candidate_checks,candidate_proofs;reused.extend(group)
        if reused:
            artifact['cues']=[cues[n] for n in sorted(cues)]
            artifact['checks']=[checks[n] for n in sorted(checks)]
            artifact['jointAlignments']=kept
            artifact['boundaryEvidenceReuse']={'sourceRecipe':source['qualityRecipe'],'sourceFingerprint':source['fingerprint'],
                'sourceReportSha256':source_text_sha(source),'verses':sorted(set(reused))}
            recovered=set(reused)
            artifact['issues']=[q for q in artifact['issues'] if not (q.startswith(('unreliable-verse-boundary:','invalid-phoneme-boundary:'))
                and int(q.rsplit(':',1)[-1]) in recovered)]
            artifact['issues']=[q for q in artifact['issues'] if not q.startswith('boundary-unassigned-speech:')]
            artifact['issues'].extend(boundary_gap_issues(artifact['unclaimedSpeech'],artifact['cues']))

    def materialize(self,artifact,receipt,verses,audio_path):
        from audio_coverage import measure_coverage,verified_coverage
        from alignment_contract import site_fingerprint
        full_sha=source_text_sha(self._full_verses)
        artifact.update(textSha256=full_sha,fingerprint=site_fingerprint(receipt['sha256'],full_sha,self.locale,
                         self.recipe,self.recognizer_name))
        self.restore_verified_boundaries(artifact,receipt,verses)
        try:
            artifact['confirmedCoverage']=measure_coverage(artifact,self._pcm,self._speech,self._roles,self._niv)
        except ValueError as error:
            artifact['accepted']=False
            artifact['issues'].append('coverage-neighbor-or-boundary-unverified')
            artifact['coverageDiagnostic']=str(error)
            return
        if not verified_coverage(artifact):
            artifact['accepted']=False
            artifact['issues'].append('missing-narration-evidence-unconfirmed')
            return
        if boundary_gap_issues(artifact['unclaimedSpeech'],artifact['cues']):
            proof=measure_gaps(artifact,self._pcm,self._speech)
            if verified_quiet_gaps({**artifact,'acousticGapReview':proof}):
                artifact['acousticGapReview']=proof
                artifact['issues']=[q for q in artifact['issues'] if not q.startswith('boundary-unassigned-speech:')]
        artifact['missingVerses']=self._roles['missingVerses']
        artifact['accepted']=not artifact['issues'] and len(artifact['cues'])==len(verses)
        if artifact['accepted'] and not verified_partial_boundary_artifact(artifact):
            raise ValueError('Final partial recording failed complete source/boundary validation')
        super().materialize(artifact,receipt,verses,audio_path)
