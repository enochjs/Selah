import copy,hashlib,importlib,json,shutil,sys,tempfile,unittest,wave
from pathlib import Path
from array import array
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))

class ReviewedBoundaryTests(unittest.TestCase):
    def setUp(self):
        try:self.module=importlib.import_module('reviewed_boundaries')
        except ModuleNotFoundError:self.module=None
        self.assertIsNotNone(self.module,'Source-reviewed corrections must have their own verified identity')
        from test_context_padding import ContextPaddingTests
        from alignment_contract import METHOD,BOUNDARY_RECOGNIZER,site_fingerprint,CASE_REVIEW_RECIPE,PADDING_REVIEW_RECIPE
        from case_evidence import CASE_POLICY
        from quiet_gaps import digest
        self.a,self.pcm,_,_=ContextPaddingTests().fixture()
        self.a.update(qualityRecipe=CASE_REVIEW_RECIPE,caseReviewPolicy=CASE_POLICY,caseBaseRecipe=PADDING_REVIEW_RECIPE)
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup);self.root=Path(self.tmp.name)
        self.source=self.root/'source.wav'
        with wave.open(str(self.source),'wb') as f:f.setnchannels(1);f.setsampwidth(2);f.setframerate(16000);f.writeframes(self.pcm.tobytes())
        self.a.update(sourceAudioSha256=hashlib.sha256(self.source.read_bytes()).hexdigest(),method=METHOD,recognizer=BOUNDARY_RECOGNIZER)
        self.a['fingerprint']=site_fingerprint(self.a['sourceAudioSha256'],self.a['textSha256'],'en',self.a['qualityRecipe'],BOUNDARY_RECOGNIZER)
        data=json.dumps({'sourceAudioSha256':self.a['sourceAudioSha256'],'review':'complete first voice preserved'}).encode()
        (self.root/'evidence.json').write_bytes(data)
        self.receipt={'schemaVersion':1,'caseId':'fixture-head','key':self.a['key'],'sourceAudioSha256':self.a['sourceAudioSha256'],
          'textSha256':self.a['textSha256'],'baseEvidenceSha256':digest(self.a),'duration':8,'usfm':'GEN','chapter':1,
          'evidence':[{'file':'evidence.json','sha256':hashlib.sha256(data).hexdigest()}],
          'cuts':[{'verse':2,'before':[2.44,5.5],'after':[2.2,5.5],'ownVoice':[2.3,5.5],'previousVoiceEnd':2.,'nextVoiceStart':6.5,
                   'window':[34880,35520],'referenceRanges':[[11200,35200],[35200,91200]]}]}
        from timed_text import webvtt
        cues=copy.deepcopy(self.a['cues']);cues[1]['start']=2.2
        self.receipt['outputInventory']=[{'verse':c['verse'],'sourceStart':c['start'],'sourceEnd':c['end'],'duration':round(c['end']-c['start'],3),'sha256':'c'*64,'path':'/api/audio/resources/'+'c'*64+'.mp3'} for c in cues]
        self.receipt['outputVttSha256']=hashlib.sha256(webvtt('GEN',1,cues).encode()).hexdigest()
        raw=json.dumps(self.receipt,ensure_ascii=False).encode();(self.root/'receipt.json').write_bytes(raw)
        self.patch=patch.multiple(self.module,CASES_DIR=self.root,APPROVALS={'fixture-head':{'file':'receipt.json','sha256':hashlib.sha256(raw).hexdigest()}})
        self.patch.start();self.addCleanup(self.patch.stop)

    def wrap(self):return self.module.apply_reviewed_boundaries(self.a,'fixture-head',self.pcm,self.root)

    def approve_fixture_outputs(self):
        from verse_clips import create_verse_files
        cues=copy.deepcopy(self.a['cues']);cues[1]['start']=2.2
        files=create_verse_files(self.source,[[c['verse'],c['start'],c['end']] for c in cues],self.root,self.root/'approved-output-cache.json')
        self.receipt['outputInventory']=files;raw=json.dumps(self.receipt,ensure_ascii=False).encode();(self.root/'receipt.json').write_bytes(raw)
        self.module.APPROVALS['fixture-head']['sha256']=hashlib.sha256(raw).hexdigest()
        return files

    def test_fixed_review_preserves_complete_source_and_original_model_evidence(self):
        from boundary_quality import verified_boundary_artifact
        before=copy.deepcopy(self.a);r=self.wrap()
        self.assertTrue(verified_boundary_artifact(r));self.assertTrue(self.module.reviewed_measurements_match(r,self.pcm))
        self.assertEqual(r['cues'][1]['start'],2.2);self.assertEqual(r['checks'],before['checks']);self.assertEqual(r['recognition'],before['recognition']);self.assertEqual(self.a,before)
        self.assertTrue(self.module.verify_reviewed_source_media(r,self.source))

    def test_unknown_case_and_self_rewritten_receipt_cannot_approve_a_cut(self):
        with self.assertRaises(ValueError):self.module.apply_reviewed_boundaries(self.a,'invented',self.pcm,self.root)
        r=self.wrap();self.receipt['cuts'][0]['after'][0]=2.4;(self.root/'receipt.json').write_text(json.dumps(self.receipt))
        self.assertFalse(self.module.verified_reviewed_artifact(r))

    def test_changing_base_voice_evidence_or_cut_is_rejected_even_after_rehash(self):
        from quiet_gaps import digest
        r=self.wrap()
        for change in ['cut','base','source','evidence','window','case']:
            x=copy.deepcopy(r);review=x['reviewedSourceReview']
            if change=='cut':x['cues'][1]['start']=2.4
            if change=='base':review['baseEvidence']['checks'][1]['alignedWords'][0]['score']=.1
            if change=='source':x['sourceAudioSha256']='f'*64
            if change=='evidence':review['evidenceFiles'][0]['utf8']='forged source review'
            if change=='window':review['measurements'][0]['window'][0]+=320
            if change=='case':review['caseId']='invented'
            review['id']=digest({k:v for k,v in review.items() if k!='id'})
            self.assertFalse(self.module.verified_reviewed_artifact(x),change)

    def test_wrong_pcm_and_legacy_label_remain_rejected(self):
        from boundary_quality import verified_boundary_artifact
        r=self.wrap();r['qualityRecipe']=self.a['qualityRecipe'];self.assertFalse(verified_boundary_artifact(r))
        r=self.wrap();bad=copy.deepcopy(self.pcm);bad[34880:35520]=array('h',[30000])*640
        self.assertFalse(self.module.reviewed_measurements_match(r,bad))
        with self.assertRaises(ValueError):self.module.apply_reviewed_boundaries(self.a,'fixture-head',bad,self.root)

    def human_seam_receipt(self):
        from timed_text import webvtt
        first,second=self.a['cues'][:2];self.receipt.update(schemaVersion=3,humanDecision='Accept this natural seam; I will listen later.',approvedBy='user-natural-seam-tolerance',remainingSeamUncertainty=[2.18,2.22],sourceAcousticApproval=False)
        self.receipt['cuts']=[{'verse':1,'before':[first['start'],first['end']],'after':[first['start'],2.2],'protectedCore':[1.,1.9],'previousVoiceEnd':0.,'nextVoiceStart':2.3,'window':[34880,35520],'referenceRanges':[[11200,35200],[35200,91200]]},
          {'verse':2,'before':[second['start'],second['end']],'after':[2.2,second['end']],'protectedCore':[2.3,5.5],'previousVoiceEnd':1.9,'nextVoiceStart':6.5,'window':[34880,35520],'referenceRanges':[[11200,35200],[35200,91200]]}]
        cues=copy.deepcopy(self.a['cues']);cues[0]['end']=2.2;cues[1]['start']=2.2
        for f,c in zip(self.receipt['outputInventory'],cues):f.update(sourceStart=c['start'],sourceEnd=c['end'],duration=round(c['end']-c['start'],3))
        self.receipt['outputVttSha256']=hashlib.sha256(webvtt('GEN',1,cues).encode()).hexdigest()
        self.approve_human_receipt()

    def approve_human_receipt(self):
        raw=json.dumps(self.receipt,ensure_ascii=False).encode();(self.root/'receipt.json').write_bytes(raw);self.module.APPROVALS['fixture-head']['sha256']=hashlib.sha256(raw).hexdigest()

    def test_human_accepted_natural_seam_preserves_uncertainty_with_distinct_identity(self):
        from boundary_quality import verified_boundary_artifact
        self.human_seam_receipt()
        try:a=self.wrap()
        except ValueError:a=None
        self.assertIsNotNone(a,'Explicit human natural-seam tolerance needs a distinct verification identity')
        self.assertTrue(verified_boundary_artifact(a));self.assertNotEqual(a['qualityRecipe'],self.a['qualityRecipe'])
        from alignment_contract import REVIEWED_BOUNDARY_RECIPE
        self.assertNotEqual(a['qualityRecipe'],REVIEWED_BOUNDARY_RECIPE);self.assertEqual(a['reviewedSourceReview']['baseEvidence'],self.a)
        a['qualityRecipe']=REVIEWED_BOUNDARY_RECIPE;self.assertFalse(verified_boundary_artifact(a))

    def test_human_seam_requires_decision_adjacent_pair_and_fixed_uncertainty_window(self):
        self.human_seam_receipt();original=copy.deepcopy(self.receipt)
        for change in ['decision','pair','uncertainty','core','claims-acoustic-certainty']:
            self.receipt=copy.deepcopy(original)
            if change=='decision':self.receipt['humanDecision']=''
            if change=='pair':self.receipt['cuts'].pop()
            if change=='uncertainty':self.receipt['remainingSeamUncertainty']=[1.,2.22]
            if change=='core':self.receipt['cuts'][0]['protectedCore'][1]=2.21
            if change=='claims-acoustic-certainty':self.receipt['sourceAcousticApproval']=True
            self.approve_human_receipt()
            with self.assertRaises(ValueError,msg=change):self.wrap()

    def test_publisher_requires_registered_identity_and_exact_new_clip_ranges(self):
        from publish_site import recording_entry
        from timed_text import webvtt
        r=self.wrap();r['vttSha256']=hashlib.sha256(webvtt('GEN',1,r['cues']).encode()).hexdigest();r['vttFile']=r['vttSha256']+'.vtt'
        r['verseFiles']=copy.deepcopy(self.receipt['outputInventory'])
        receipt={'key':r['key'],'locale':'en','sha256':r['sourceAudioSha256'],'duration':8,'path':'/source.mp3','url':'https://source.test/audio.mp3'}
        self.assertEqual(recording_entry(receipt,r,r['textSha256'])['alignmentStatus'],'aligned')
        r['verseFiles'][1]['sourceStart']=2.44
        self.assertEqual(recording_entry(receipt,r,r['textSha256'])['alignmentStatus'],'pending')

    @unittest.skipUnless(shutil.which('ffmpeg'),'ffmpeg required for real clip provenance test')
    def test_old_clip_with_rewritten_range_cannot_substitute_for_reencoded_audio(self):
        from verse_clips import create_verse_files
        from timed_text import webvtt
        approved=self.approve_fixture_outputs();r=self.wrap();segments=lambda a:[[c['verse'],c['start'],c['end']] for c in a['cues']]
        old=create_verse_files(self.source,segments(self.a),self.root/'old',self.root/'old.json')
        r['verseFiles']=copy.deepcopy(approved)
        r['vttSha256']=hashlib.sha256(webvtt('GEN',1,r['cues']).encode()).hexdigest();r['vttFile']=r['vttSha256']+'.vtt'
        self.assertTrue(self.module.verify_reviewed_output_media(r,self.source))
        r['verseFiles'][1].update(sha256=old[1]['sha256'],path=old[1]['path'])
        self.assertFalse(self.module.verify_reviewed_output_media(r,self.source))

    @unittest.skipUnless(shutil.which('ffmpeg'),'ffmpeg required for real clip provenance test')
    def test_untouched_verse_cannot_be_replaced_with_another_verse_audio(self):
        from verse_clips import create_verse_files
        from timed_text import webvtt
        approved=self.approve_fixture_outputs();r=self.wrap();r['verseFiles']=copy.deepcopy(approved)
        r['vttSha256']=hashlib.sha256(webvtt('GEN',1,r['cues']).encode()).hexdigest();r['vttFile']=r['vttSha256']+'.vtt'
        self.assertTrue(self.module.verify_reviewed_output_media(r,self.source))
        r['verseFiles'][0].update(sha256=r['verseFiles'][2]['sha256'],path=r['verseFiles'][2]['path'])
        self.assertFalse(self.module.verify_reviewed_output_media(r,self.source))

    @unittest.skipUnless(shutil.which('ffmpeg'),'ffmpeg required for real clip provenance test')
    def test_registered_output_metadata_does_not_hide_modified_media_bytes(self):
        approved=self.approve_fixture_outputs();r=self.wrap();r.update(verseFiles=copy.deepcopy(approved),vttSha256=self.receipt['outputVttSha256'],vttFile=self.receipt['outputVttSha256']+'.vtt')
        self.assertTrue(self.module.verify_reviewed_output_media(r,self.source))
        first=self.root/(approved[0]['sha256']+'.mp3');other=self.root/(approved[2]['sha256']+'.mp3');first.write_bytes(other.read_bytes())
        self.assertFalse(self.module.verify_reviewed_output_media(r,self.source))

if __name__=='__main__':unittest.main()
