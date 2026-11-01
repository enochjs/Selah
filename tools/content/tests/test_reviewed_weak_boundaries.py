"""Fixed source review can resolve a weak edge without rewriting model facts."""
import copy,hashlib,importlib,json,shutil,sys,tempfile,unittest,wave
from pathlib import Path
from unittest.mock import patch
from array import array
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))

@unittest.skipUnless(shutil.which('ffmpeg'),'ffmpeg required for source output provenance')
class ReviewedWeakBoundaryTests(unittest.TestCase):
    def setUp(self):
        try:self.m=importlib.import_module('reviewed_weak_boundaries')
        except ModuleNotFoundError:self.m=None
        self.assertIsNotNone(self.m,'Registered acoustic review must support a rejected weak-edge base')
        from test_speech_span import SpeechSpanTests
        from alignment_contract import METHOD,BOUNDARY_RECOGNIZER,site_fingerprint
        from verse_clips import create_verse_files
        from timed_text import webvtt
        self.a,self.pcm,_=SpeechSpanTests().fixture()
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup);self.root=Path(self.tmp.name);self.source=self.root/'source.wav'
        with wave.open(str(self.source),'wb') as f:f.setnchannels(1);f.setsampwidth(2);f.setframerate(16000);f.writeframes(self.pcm.tobytes())
        self.a.update(sourceAudioSha256=hashlib.sha256(self.source.read_bytes()).hexdigest(),method=METHOD,recognizer=BOUNDARY_RECOGNIZER)
        self.a['fingerprint']=site_fingerprint(self.a['sourceAudioSha256'],self.a['textSha256'],'en',self.a['qualityRecipe'],BOUNDARY_RECOGNIZER)
        self.cues=copy.deepcopy(self.a['cues']);self.cues[0]['end']=2.2
        self.cues.insert(1,{'verse':2,'text':self.a['checks'][1]['text'],'start':2.2,'end':5.8})
        (self.root/'evidence.json').write_text('{"originalSourceAcousticReview":true}')
        from quiet_gaps import digest
        self.r={k:self.a[k] for k in ['key','duration','sourceAudioSha256','textSha256']}
        self.r.update(schemaVersion=2,caseId='weak-fixture',baseEvidenceSha256=digest(self.a),usfm='GEN',chapter=1,weakVerses=[2],finalCues=self.cues,
          evidence=[{'file':'evidence.json','sha256':hashlib.sha256((self.root/'evidence.json').read_bytes()).hexdigest()}],cuts=[])
        for v,side,voice,previous,nxt,window,refs in [(1,'tail',[1,1.9],0,2.3,[2.18,2.22],[[.7,2.2],[2.2,5.7]]),(2,'head',[2.3,5.5],1.9,6.5,[2.18,2.22],[[2.2,5.7],[6.2,7.4]]),(2,'tail',[2.3,5.5],1.9,6.5,[5.78,5.82],[[2.2,5.7],[6.2,7.4]])]:
            old=next((c for c in self.a['cues'] if c['verse']==v),None);new=next(c for c in self.cues if c['verse']==v)
            self.r['cuts'].append({'verse':v,'side':side,'before':[old['start'],old['end']] if old else None,'after':[new['start'],new['end']],
              'ownVoice':voice,'previousVoiceEnd':previous,'nextVoiceStart':nxt,'window':[round(t*16000) for t in window],'referenceRanges':[[round(t*16000) for t in x] for x in refs]})
        self.r['shadowCues']=copy.deepcopy(self.cues)
        self.r['outputInventory']=create_verse_files(self.source,[[c['verse'],c['start'],c['end']] for c in self.cues],self.root,self.root/'clips.json')
        self.r['outputVttSha256']=hashlib.sha256(webvtt('GEN',1,self.cues).encode()).hexdigest()
        import reviewed_boundaries
        self.approvals={};self.patch=patch.multiple(reviewed_boundaries,CASES_DIR=self.root,APPROVALS=self.approvals);self.patch.start();self.addCleanup(self.patch.stop);self.approve()

    def approve(self):
        raw=(json.dumps(self.r,ensure_ascii=False,indent=2)+'\n').encode();(self.root/'receipt.json').write_bytes(raw)
        self.approvals['weak-fixture']={'file':'receipt.json','sha256':hashlib.sha256(raw).hexdigest()}

    def wrap(self):
        a=self.m.apply_reviewed_weak_boundaries(self.a,'weak-fixture',self.pcm,self.root)
        a.update(verseFiles=copy.deepcopy(self.r['outputInventory']),vttSha256=self.r['outputVttSha256'],vttFile=self.r['outputVttSha256']+'.vtt')
        return a

    def test_registered_weak_edge_and_neighbor_cut_publish_without_rewriting_raw_evidence(self):
        from boundary_quality import verified_boundary_artifact
        from publish_site import recording_entry
        before=copy.deepcopy(self.a);a=self.wrap();self.assertTrue(verified_boundary_artifact(a));self.assertTrue(self.m.verify_reviewed_weak_output_media(a,self.source))
        self.assertEqual(a['recognition'],before['recognition']);self.assertEqual(a['checks'][1]['boundaryEvidence'],before['checks'][1]['boundaryEvidence']);self.assertEqual(a['checks'][1]['alignedWords'],before['checks'][1]['alignedWords']);self.assertEqual(a['reviewedWeakReview']['baseEvidence'],before);self.assertEqual(self.a,before)
        r={'key':a['key'],'locale':'en','sha256':a['sourceAudioSha256'],'duration':8,'path':'/source.mp3','url':'https://source.test/audio.mp3'}
        self.assertEqual(recording_entry(r,a,a['textSha256'])['alignmentStatus'],'aligned')

    def test_unapproved_cuts_raw_model_rewrites_and_legacy_labels_are_rejected(self):
        from boundary_quality import verified_boundary_artifact
        from quiet_gaps import digest
        for change in ['cue','base','checks','evidence','legacy','inventory']:
            a=self.wrap()
            if change=='cue':a['cues'][0]['end']+=.001
            if change=='base':a['reviewedWeakReview']['baseEvidence']['checks'][1]['alignedWords'][0]['score']=.99
            if change=='checks':a['checks'][1]['alignedWords'][0]['score']=.99
            if change=='evidence':a['reviewedWeakReview']['evidenceFiles'][0]['utf8']='forged'
            if change=='legacy':a['qualityRecipe']=self.a['qualityRecipe']
            if change=='inventory':a['verseFiles'][0]=copy.deepcopy(a['verseFiles'][2])
            a['reviewedWeakReview']['id']=digest({k:v for k,v in a['reviewedWeakReview'].items() if k!='id'})
            check=self.m.verified_reviewed_weak_output_inventory(a) if change=='inventory' else verified_boundary_artifact(a)
            self.assertFalse(check,change)

    def test_registry_cannot_waive_another_failure_or_unreviewed_boundary_change(self):
        from quiet_gaps import digest
        for change in ['other-failure','untouched-cue','joint','missing-edge','extra-raw-cue']:
            old_a,old_r=copy.deepcopy(self.a),copy.deepcopy(self.r)
            if change=='other-failure':self.a['issues'].append('boundary-unassigned-speech:between-verses')
            if change=='untouched-cue':self.r['finalCues'][2]['start']+=.01
            if change=='joint':self.a['checks'][1]['jointProofId']='fake'
            if change=='missing-edge':self.r['cuts'].pop()
            if change=='extra-raw-cue':self.a['cues'].append({'verse':99,'text':'unknown','start':6.,'end':7.8})
            self.r['baseEvidenceSha256']=digest(self.a);self.approve()
            with self.assertRaises(ValueError,msg=change):self.wrap()
            self.a,self.r=old_a,old_r;self.approve()

    def test_original_pcm_and_every_output_byte_are_verified(self):
        a=self.wrap();bad=array('h',self.pcm);bad[34880:35520]=array('h',[30000])*640
        self.assertFalse(self.m.reviewed_weak_measurements_match(a,bad))
        f=self.root/(a['verseFiles'][2]['sha256']+'.mp3');f.write_bytes(b'corrupted unchanged verse')
        self.assertFalse(self.m.verify_reviewed_weak_output_media(a,self.source))

    def test_chinese_editorial_notes_keep_raw_text_and_use_the_formal_spoken_reference(self):
        from alignment_contract import BOUNDARY_RECOGNIZER,site_fingerprint
        from boundary_quality import verse_boundary
        from partial_audio import source_text_sha
        from quiet_gaps import digest
        from spoken_text import boundary_text
        from verse_clips import create_verse_files
        from timed_text import webvtt
        self.a['key']='genesis:1:zh';self.a['boundarySourceVerses'][0]['text']+='（原文作别名）'
        c=self.a['checks'][0];c['text']=self.a['boundarySourceVerses'][0]['text'];self.a['cues'][0]['text']=c['text']
        for c in self.a['checks']:
            edges,e=verse_boundary(c['alignedWords'],c['searchRange'],8,'zh',reference=boundary_text(c['text'],'zh'),signal=c['boundarySignal'],anchors=c['asrEdgeAnchors']);c['boundaryEvidence']=e
            if edges:
                cue=next(x for x in self.a['cues'] if x['verse']==c['verse']);cue.update(start=edges[0],end=edges[1])
        self.a['textSha256']=source_text_sha(self.a['boundarySourceVerses']);self.a['fingerprint']=site_fingerprint(self.a['sourceAudioSha256'],self.a['textSha256'],'zh',self.a['qualityRecipe'],BOUNDARY_RECOGNIZER)
        self.r.update(key=self.a['key'],textSha256=self.a['textSha256'],baseEvidenceSha256=digest(self.a));self.r['shadowCues'][0]['text']=self.r['finalCues'][0]['text']=self.a['checks'][0]['text']
        for cut in self.r['cuts']:
            old=next((x for x in self.a['cues'] if x['verse']==cut['verse']),None);cut['before']=[old['start'],old['end']] if old else None
        self.r['outputInventory']=create_verse_files(self.source,[[c['verse'],c['start'],c['end']] for c in self.r['finalCues']],self.root,self.root/'zh.json');self.r['outputVttSha256']=hashlib.sha256(webvtt('GEN',1,self.r['finalCues']).encode()).hexdigest();self.approve()
        try:a=self.wrap()
        except ValueError:a=None
        self.assertIsNotNone(a,'Preflight must use the same editorial-note normalization as the formal proof')
        self.assertTrue(self.m.verify_reviewed_weak_output_media(a,self.source));self.assertIn('原文作别名',a['cues'][0]['text'])

    def test_registered_independent_complete_edges_resolve_mean_only_failure_in_separate_identity(self):
        from boundary_quality import verse_boundary,verified_boundary_artifact
        from quiet_gaps import digest
        from alignment_contract import REVIEWED_ANCHOR_SOURCE_RECIPE
        c=self.a['checks'][1]
        for i,w in enumerate(c['alignedWords']):w['score']=.8 if i in {0,len(c['alignedWords'])-1} else .5
        c['asrEdgeAnchors'][0]['probability']=.95
        _,e=verse_boundary(c['alignedWords'],c['searchRange'],8,'en',reference=c['text'],signal=c['boundarySignal'],anchors=c['asrEdgeAnchors'])
        self.assertEqual(e['reasons'],['weak-verse-location']);c['boundaryEvidence']=e
        self.r.update(schemaVersion=27,baseEvidenceSha256=digest(self.a),failureReasons=[dict(verse=2,reasons=e['reasons'])],gapAssignments=[]);self.approve()
        a=self.wrap();self.assertEqual(a['qualityRecipe'],REVIEWED_ANCHOR_SOURCE_RECIPE);self.assertTrue(verified_boundary_artifact(a));self.assertTrue(self.m.verify_reviewed_weak_output_media(a,self.source));self.assertEqual(a['checks'][1]['alignedWords'],c['alignedWords']);self.assertEqual(a['checks'][1]['boundaryEvidence'],e)
        self.r['schemaVersion']=4;self.approve()
        with self.assertRaises(ValueError):self.wrap()

    def test_full_source_user_confirmed_verse_preserves_original_failed_scores(self):
        from quiet_gaps import digest
        from boundary_quality import verified_boundary_artifact
        raw=json.dumps(self.a,ensure_ascii=False,indent=2)+'\n';p=self.root/'original-base.json';p.write_text(raw)
        self.r.update(schemaVersion=29,baseReportFile=p.name,approvedBy='user-complete-source-verse',humanDecision='完整且不串节，可以采用',sourceAcousticApproval=False,userVerse=dict(verse=2,sourceRange=[2.2,5.8]),weakVerses=[2],failureReasons=[dict(verse=2,reasons=self.a['checks'][1]['boundaryEvidence']['reasons'])],gapAssignments=[])
        self.r['evidence'].append(dict(file=p.name,sha256=hashlib.sha256(p.read_bytes()).hexdigest()))
        for c in self.r['cuts']:
            if c['verse']==2:c.update(measurementKind='user-natural-seam',protectedCore=c.pop('ownVoice'))
        self.approve()
        try:a=self.wrap()
        except ValueError:a=None
        self.assertIsNotNone(a,'Full original source should support the same explicit complete-verse decision as a partial source')
        self.assertTrue(verified_boundary_artifact(a));self.assertTrue(self.m.verify_reviewed_weak_output_media(a,self.source));self.assertEqual(a['checks'][1]['boundaryEvidence'],self.a['checks'][1]['boundaryEvidence'])
        bad=copy.deepcopy(a);bad['cues'][1]['start']=2.51;self.assertFalse(verified_boundary_artifact(bad))

    def source_window_receipt(self):
        from boundary_quality import verse_boundary
        from quiet_gaps import digest
        from verse_clips import create_verse_files
        from timed_text import webvtt
        c=self.a['checks'][1];c['searchRange'][0]=2.5;c['boundarySignal']['headRms']=.1;c['asrEdgeAnchors'][0].update(start=2.35,probability=.95)
        _,e=verse_boundary(c['alignedWords'],c['searchRange'],8,'en',reference=c['text'],signal=c['boundarySignal'],anchors=c['asrEdgeAnchors']);c['boundaryEvidence']=e
        self.a['unclaimedSpeech']=[{'kind':'between-verses','text':'Go','start':6.3,'end':6.7,'allowedHeadingOrClosing':False}]
        self.a['issues'].append('boundary-unassigned-speech:between-verses')
        self.r.update(schemaVersion=4,baseEvidenceSha256=digest(self.a),failureReasons=[{'verse':2,'reasons':e['reasons']}],gapAssignments=[{'index':0,'gapSha256':digest(self.a['unclaimedSpeech'][0]),'ownerVerse':3}])
        self.r['finalCues'][2]['start']=6.2;old=self.a['cues'][1];new=self.r['finalCues'][2]
        self.r['cuts'].append(dict(verse=3,side='head',before=[old['start'],old['end']],after=[new['start'],new['end']],ownVoice=[6.3,7.1],previousVoiceEnd=5.5,nextVoiceStart=8,window=[98880,99520],referenceRanges=[[35200,91200],[99200,118400]]))
        self.r['outputInventory']=create_verse_files(self.source,[[x['verse'],x['start'],x['end']] for x in self.r['finalCues']],self.root,self.root/'window.json');self.r['outputVttSha256']=hashlib.sha256(webvtt('GEN',1,self.r['finalCues']).encode()).hexdigest();self.approve()

    def test_registered_source_window_can_recover_exact_truncated_prefix_and_owned_gap(self):
        self.source_window_receipt();before=copy.deepcopy(self.a)
        try:a=self.wrap()
        except ValueError:a=None
        self.assertIsNotNone(a,'A fixed original-source proof must distinguish a truncated search window from low confidence alone')
        self.assertTrue(self.m.verify_reviewed_weak_output_media(a,self.source));self.assertEqual(self.a,before);self.assertEqual(a['checks'][1]['searchRange'],[2.5,5.7]);self.assertEqual(a['unclaimedSpeech'],before['unclaimedSpeech'])
        from alignment_contract import REVIEWED_WEAK_RECIPE
        self.assertNotEqual(a['qualityRecipe'],REVIEWED_WEAK_RECIPE)

    def test_source_window_cannot_waive_unregistered_failures_or_drop_gap_provenance(self):
        self.source_window_receipt();original=copy.deepcopy(self.r)
        for change in ['missing-reason','gap-owner','gap-digest','no-gap','gap-cue']:
            self.r=copy.deepcopy(original)
            if change=='missing-reason':self.r['failureReasons'][0]['reasons'].pop()
            if change=='gap-owner':self.r['gapAssignments'][0]['ownerVerse']=2
            if change=='gap-digest':self.r['gapAssignments'][0]['gapSha256']='0'*64
            if change=='no-gap':self.r['gapAssignments']=[]
            if change=='gap-cue':self.r['finalCues'][2]['start']=6.44
            self.approve()
            with self.assertRaises(ValueError,msg=change):self.wrap()

    def test_source_window_keeps_zero_clock_owned_by_unchanged_complete_original_verse(self):
        from quiet_gaps import digest
        self.source_window_receipt()
        self.a['unclaimedSpeech'].append(dict(kind='between-verses',text='came',start=1.5,end=1.5,allowedHeadingOrClosing=False))
        self.r['baseEvidenceSha256']=digest(self.a);self.approve()
        a=self.wrap()
        self.assertTrue(self.m.verify_reviewed_weak_output_media(a,self.source))
        self.assertEqual(a['unclaimedSpeech'][-1],self.a['unclaimedSpeech'][-1])

    def test_source_window_zero_clock_outside_original_verified_cues_still_needs_real_source_proof(self):
        from quiet_gaps import digest
        self.source_window_receipt()
        self.a['unclaimedSpeech'].append(dict(kind='between-verses',text='Go',start=4.,end=4.,allowedHeadingOrClosing=False))
        self.r['baseEvidenceSha256']=digest(self.a);self.approve()
        with self.assertRaises(ValueError):self.wrap()

    def test_source_window_cannot_ignore_non_heading_speech_outside_old_chapter_cuts(self):
        from quiet_gaps import digest
        self.source_window_receipt();self.a['unclaimedSpeech']=[{'kind':'trailing','text':'now','start':7.3,'end':7.6,'allowedHeadingOrClosing':False}];self.a['issues']=['unreliable-verse-boundary:2']
        self.r.update(baseEvidenceSha256=digest(self.a),gapAssignments=[]);self.approve()
        with self.assertRaises(ValueError):self.wrap()

    def test_source_window_cannot_drop_an_extra_raw_cue_used_to_hide_gap_ownership(self):
        from quiet_gaps import digest
        self.source_window_receipt();self.a['cues'].append({'verse':99,'text':'unknown','start':6.,'end':7.8});self.a['issues']=['unreliable-verse-boundary:2']
        self.r.update(baseEvidenceSha256=digest(self.a),gapAssignments=[]);self.approve()
        with self.assertRaises(ValueError):self.wrap()

    def human_window_receipt(self):
        from verse_clips import create_verse_files
        from timed_text import webvtt
        self.source_window_receipt();self.r.update(schemaVersion=5,approvedBy='user-natural-seam-tolerance',humanDecision='Accept this natural seam.',sourceAcousticApproval=False,
          naturalSeam={'leftVerse':1,'rightVerse':2,'cut':2.52,'uncertainty':[2.50,2.54]},
          modelClockExceptions=[{'verse':2,'wordIndex':0,'side':'head','originalWord':copy.deepcopy(self.a['checks'][1]['alignedWords'][0])}],
          retainedSourceSpans=[{'verse':1,'range':[1.,1.9]},{'verse':2,'range':[2.54,5.5]},{'verse':3,'range':[6.5,7.1]}])
        self.r['finalCues'][0]['end']=2.52;self.r['finalCues'][1]['start']=2.52
        for c in self.r['cuts']:
            v=c['verse'];new=self.r['finalCues'][v-1];c['after']=[new['start'],new['end']];c['protectedCore']=c.pop('ownVoice')
            if v==1:c['nextVoiceStart']=2.54
            if v==2:c['protectedCore'][0]=2.54
            if (v,c['side']) in {(1,'tail'),(2,'head')}:c.update(measurementKind='user-natural-seam',window=[40000,40640])
        self.r['outputInventory']=create_verse_files(self.source,[[x['verse'],x['start'],x['end']] for x in self.r['finalCues']],self.root,self.root/'human.json');self.r['outputVttSha256']=hashlib.sha256(webvtt('GEN',1,self.r['finalCues']).encode()).hexdigest();self.approve()

    def test_explicit_human_nonquiet_seam_keeps_raw_model_clock_exception_and_uncertainty(self):
        self.human_window_receipt();before=copy.deepcopy(self.a)
        try:a=self.wrap()
        except ValueError:a=None
        self.assertIsNotNone(a,'An explicit human decision must be represented without pretending the seam is quiet or rewriting the model clock')
        self.assertTrue(self.m.verify_reviewed_weak_output_media(a,self.source));self.assertEqual(a['checks'][1]['alignedWords'],before['checks'][1]['alignedWords']);self.assertEqual(a['reviewedWeakReview']['baseEvidence'],before)
        from alignment_contract import REVIEWED_WINDOW_RECIPE
        self.assertNotEqual(a['qualityRecipe'],REVIEWED_WINDOW_RECIPE)

    def test_human_window_does_not_authorize_other_words_or_discard_retained_source(self):
        self.human_window_receipt();original=copy.deepcopy(self.r)
        for change in ['no-decision','other-word','no-exception','lost-source','no-human-cut','claims-certainty']:
            self.r=copy.deepcopy(original)
            if change=='no-decision':self.r['humanDecision']=''
            if change=='other-word':self.r['modelClockExceptions'][0]['wordIndex']=1
            if change=='no-exception':self.r['modelClockExceptions']=[]
            if change=='lost-source':self.r['retainedSourceSpans'][0]['range'][1]=2.53
            if change=='no-human-cut':self.r['cuts'][0].pop('measurementKind')
            if change=='claims-certainty':self.r['sourceAcousticApproval']=True
            self.approve()
            with self.assertRaises(ValueError,msg=change):self.wrap()

    def preserved_clock_human_receipt(self):
        from alignment_contract import site_fingerprint,BOUNDARY_RECOGNIZER
        from quiet_gaps import digest
        from verse_clips import create_verse_files
        self.pcm[34880:35520]=array('h',[5000])*640
        with wave.open(str(self.source),'wb') as f:
            f.setnchannels(1);f.setsampwidth(2);f.setframerate(16000);f.writeframes(self.pcm.tobytes())
        self.a['sourceAudioSha256']=hashlib.sha256(self.source.read_bytes()).hexdigest()
        self.a['fingerprint']=site_fingerprint(self.a['sourceAudioSha256'],self.a['textSha256'],'en',self.a['qualityRecipe'],BOUNDARY_RECOGNIZER)
        self.r.update(schemaVersion=8,sourceAudioSha256=self.a['sourceAudioSha256'],baseEvidenceSha256=digest(self.a),
          failureReasons=[{'verse':2,'reasons':self.a['checks'][1]['boundaryEvidence']['reasons']}],gapAssignments=[],
          approvedBy='user-natural-seam-tolerance',humanDecision='Accept this natural seam.',sourceAcousticApproval=False,
          naturalSeam={'leftVerse':1,'rightVerse':2,'cut':2.2,'uncertainty':[2.18,2.22]},modelClockExceptions=[],
          retainedSourceSpans=[{'verse':1,'range':[1.,1.9]},{'verse':2,'range':[2.3,5.5]}])
        for c in self.r['cuts']:
            c['protectedCore']=c.pop('ownVoice')
            if (c['verse'],c['side']) in {(1,'tail'),(2,'head')}:c['measurementKind']='user-natural-seam'
        self.r['outputInventory']=create_verse_files(self.source,[[x['verse'],x['start'],x['end']] for x in self.r['finalCues']],self.root,self.root/'preserved-human.json')
        self.approve()

    def test_user_nonquiet_seam_preserves_all_original_word_clocks_without_exception(self):
        self.preserved_clock_human_receipt();before=copy.deepcopy(self.a)
        try:a=self.wrap()
        except ValueError:a=None
        self.assertIsNotNone(a,'A fixed human seam with all raw word clocks retained needs its own identity')
        self.assertTrue(self.m.verify_reviewed_weak_output_media(a,self.source))
        self.assertEqual(a['checks'][1]['alignedWords'],before['checks'][1]['alignedWords'])
        self.assertFalse(a['reviewedWeakReview']['policy']['modelClockExceptionsAllowed'])
        from alignment_contract import USER_SOURCE_SEAM_RECIPE
        self.assertNotEqual(a['qualityRecipe'],USER_SOURCE_SEAM_RECIPE)

    def test_preserved_clock_human_seam_cannot_borrow_exception_identity_or_waive_other_edges(self):
        self.preserved_clock_human_receipt();original=copy.deepcopy(self.r)
        for change in ['no-decision','clock-exception','legacy','lost-source','other-nonquiet-cut','claims-certainty']:
            self.r=copy.deepcopy(original)
            if change=='no-decision':self.r['humanDecision']=''
            if change=='clock-exception':self.r['modelClockExceptions']=[{'verse':2,'wordIndex':0,'side':'head','originalWord':self.a['checks'][1]['alignedWords'][0]}]
            if change=='legacy':self.r['schemaVersion']=5
            if change=='lost-source':self.r['retainedSourceSpans'][0]['range'][1]=2.21
            if change=='other-nonquiet-cut':self.r['cuts'][-1]['measurementKind']='user-natural-seam'
            if change=='claims-certainty':self.r['sourceAcousticApproval']=True
            self.approve()
            with self.assertRaises(ValueError,msg=change):self.wrap()

    def official_prefix_receipt(self):
        from datetime import datetime,timezone
        from alignment_contract import site_fingerprint,BOUNDARY_RECOGNIZER
        from quiet_gaps import digest
        from verse_clips import create_verse_files
        from timed_text import webvtt
        self.pcm[1600:6720]=array('h',[2500])*5120;self.pcm[8000:14400]=array('h',[3000])*6400
        with wave.open(str(self.source),'wb') as f:f.setnchannels(1);f.setsampwidth(2);f.setframerate(16000);f.writeframes(self.pcm.tobytes())
        self.a['sourceAudioSha256']=hashlib.sha256(self.source.read_bytes()).hexdigest();self.a['fingerprint']=site_fingerprint(self.a['sourceAudioSha256'],self.a['textSha256'],'en',self.a['qualityRecipe'],BOUNDARY_RECOGNIZER)
        title={'kind':'leading','text':'Chapter 1','start':0.,'end':.4,'allowedHeadingOrClosing':True};gap={'kind':'leading','text':'Preface','start':.4,'end':.8,'allowedHeadingOrClosing':False};self.a['unclaimedSpeech']=[title,gap]
        self.r.update(schemaVersion=6,sourceAudioSha256=self.a['sourceAudioSha256'],baseEvidenceSha256=digest(self.a),failureReasons=[{'verse':2,'reasons':['weak-edge-word']}],gapAssignments=[{'index':1,'gapSha256':digest(gap),'ownerVerse':1}])
        self.r['finalCues'][0]['start']=.45
        raw='<div class="passage-col version-NIV" data-translation="NIV"><div class="passage-text">'+''.join('<p><span class="text Gen-1-'+str(v['number'])+'">'+('Preface ' if v['number']==1 else '')+v['text']+'</span></p>' for v in self.a['boundarySourceVerses'])+'</div></div>'
        url='https://www.biblegateway.com/passage/?search=Genesis%201&version=NIV';meta={'url':url,'finalUrl':url,'status':200,'fetchedAt':datetime.now(timezone.utc).isoformat(),'sha256':hashlib.sha256(raw.encode()).hexdigest(),'bytes':len(raw.encode()),'headers':{'Content-Type':'text/html; charset=UTF-8'}}
        (self.root/'official.html').write_text(raw);(self.root/'official.http.json').write_text(json.dumps(meta))
        for name in ['official.html','official.http.json']:self.r['evidence'].append({'file':name,'sha256':hashlib.sha256((self.root/name).read_bytes()).hexdigest()})
        self.r['sourcePrefixes']=[{'verse':1,'text':'Preface','gapIndex':1,'gapSha256':digest(gap),'sourceRange':[.5,.9],'discardedRawPrefixClock':[.4,.45],
          'precedingHeading':{'gapIndex':0,'gapSha256':digest(title),'voiceEnd':.42},'reference':{'htmlFile':'official.html','httpFile':'official.http.json'}}]
        for cut in self.r['cuts']:
            if cut['verse']==1:cut['after'][0]=.45;cut['ownVoice'][0]=.5;cut['previousVoiceEnd']=.42
        old=self.a['cues'][0];self.r['cuts'].append(dict(verse=1,side='head',before=[old['start'],old['end']],after=[.45,2.2],ownVoice=[.5,1.9],previousVoiceEnd=.42,nextVoiceStart=2.3,window=[6880,7520],referenceRanges=[[7200,35200],[35200,91200]]))
        self.r['outputInventory']=create_verse_files(self.source,[[x['verse'],x['start'],x['end']] for x in self.r['finalCues']],self.root,self.root/'prefix.json');self.r['outputVttSha256']=hashlib.sha256(webvtt('GEN',1,self.r['finalCues']).encode()).hexdigest();self.approve()
        try:
            import official_source_prefixes
            p=patch.dict(official_source_prefixes.SOURCE_BOOKS,{'genesis':('Genesis','Gen',50)});p.start();self.addCleanup(p.stop)
        except ModuleNotFoundError:pass

    def test_official_same_verse_prefix_recovers_actual_audio_without_rewriting_text_or_asr_clock(self):
        self.official_prefix_receipt();before=copy.deepcopy(self.a)
        try:a=self.wrap()
        except ValueError:a=None
        self.assertIsNotNone(a,'A proven official same-verse prefix needs actual source ownership, not a fake heading flag')
        self.assertTrue(self.m.verify_reviewed_weak_output_media(a,self.source));self.assertEqual(a['boundarySourceVerses'],before['boundarySourceVerses']);self.assertEqual(a['unclaimedSpeech'],before['unclaimedSpeech']);self.assertEqual(a['cues'][0]['text'],'They came.')

    def test_official_prefix_requires_same_verse_http_identity_and_retained_source_range(self):
        self.official_prefix_receipt();original=copy.deepcopy(self.r)
        for change in ['no-prefix','wrong-verse','wrong-voice','wrong-old-clock','fake-heading']:
            self.r=copy.deepcopy(original)
            if change=='no-prefix':self.r['sourcePrefixes']=[]
            if change=='wrong-verse':self.r['sourcePrefixes'][0]['verse']=3
            if change=='wrong-voice':self.r['sourcePrefixes'][0]['sourceRange']=[.4,.9]
            if change=='wrong-old-clock':self.r['sourcePrefixes'][0]['discardedRawPrefixClock']=[.4,.6]
            if change=='fake-heading':self.r['sourcePrefixes'][0]['precedingHeading']['gapSha256']='0'*64
            self.approve()
            with self.assertRaises(ValueError,msg=change):self.wrap()

    def test_official_prefix_cannot_use_foreign_edition_or_heading_instead_of_verse_body(self):
        self.official_prefix_receipt();original=copy.deepcopy(self.r);html=(self.root/'official.html').read_text();http=json.loads((self.root/'official.http.json').read_text())
        for change in ['edition','url','heading','verse-id','html-sha','untimed']:
            self.r=copy.deepcopy(original);raw=html;meta=copy.deepcopy(http)
            if change=='edition':raw=raw.replace('data-translation="NIV"','data-translation="KJV"')
            if change=='url':meta['url']=meta['finalUrl']=meta['url'].replace('version=NIV','version=KJV')
            if change=='heading':raw=raw.replace('Preface ','').replace('<div class="passage-text">','<div class="passage-text"><h3><span class="text Gen-1-1">Preface</span></h3>')
            if change=='verse-id':raw=raw.replace('Gen-1-1','Gen-2-1')
            if change=='untimed':meta['fetchedAt']='2026-10-27T00:00:00'
            meta['sha256']=hashlib.sha256(raw.encode()).hexdigest();meta['bytes']=len(raw.encode())
            if change=='html-sha':meta['sha256']='0'*64
            (self.root/'official.html').write_text(raw);(self.root/'official.http.json').write_text(json.dumps(meta))
            for item in self.r['evidence']:
                if item['file'] in {'official.html','official.http.json'}:item['sha256']=hashlib.sha256((self.root/item['file']).read_bytes()).hexdigest()
            self.approve()
            with self.assertRaises(ValueError,msg=change):self.wrap()

    def quantization_floor_receipt(self):
        import base64
        from alignment_contract import site_fingerprint,BOUNDARY_RECOGNIZER
        from quiet_gaps import digest,rms
        from verse_clips import create_verse_files
        self.pcm[120000]=4;self.pcm[120010]=2;self.pcm[120020]=-1
        with wave.open(str(self.source),'wb') as f:f.setnchannels(1);f.setsampwidth(2);f.setframerate(16000);f.writeframes(self.pcm.tobytes())
        self.a['sourceAudioSha256']=hashlib.sha256(self.source.read_bytes()).hexdigest();self.a['fingerprint']=site_fingerprint(self.a['sourceAudioSha256'],self.a['textSha256'],'en',self.a['qualityRecipe'],BOUNDARY_RECOGNIZER)
        gap={'kind':'trailing','text':'Echo','start':7.5,'end':7.6,'allowedHeadingOrClosing':False};self.a['unclaimedSpeech']=[gap]
        lo,hi=113600,128000;raw=self.pcm[lo:hi].tobytes();values=self.pcm[lo:hi];doc={'key':self.a['key'],'sourceAudioSha256':self.a['sourceAudioSha256'],'format':'s16le','sampleRate':16000,'sampleRange':[lo,hi],
          'sampleCount':hi-lo,'pcmS16LeBase64':base64.b64encode(raw).decode(),'pcmSha256':hashlib.sha256(raw).hexdigest(),'peakLsb':4,'rms':rms(self.pcm,lo,hi),'nonzeroSamples':3}
        (self.root/'floor.json').write_text(json.dumps(doc));self.r['evidence'].append({'file':'floor.json','sha256':hashlib.sha256((self.root/'floor.json').read_bytes()).hexdigest()})
        self.r.update(schemaVersion=7,sourceAudioSha256=self.a['sourceAudioSha256'],baseEvidenceSha256=digest(self.a),failureReasons=[{'verse':2,'reasons':['weak-edge-word']}],gapAssignments=[],sourceSilences=[{'gapIndex':0,'gapSha256':digest(gap),'windowSamples':[lo,hi],'evidenceFile':'floor.json'}])
        self.r['outputInventory']=create_verse_files(self.source,[[c['verse'],c['start'],c['end']] for c in self.r['finalCues']],self.root,self.root/'floor-clips.json');self.approve()

    def numeric_source_receipt(self):
        from alignment_contract import NUMERIC_REVIEW_RECIPE,site_fingerprint,BOUNDARY_RECOGNIZER
        from numeric_alignment import NUMERIC_POLICY
        from partial_audio import source_text_sha
        from quiet_gaps import digest
        from timed_text import webvtt
        self.source_window_receipt();base=self.a['qualityRecipe']
        self.a['boundarySourceVerses'][2]['text']='Go 2.';self.a['checks'][2]['text']='Go 2.'
        w=self.a['checks'][2]['alignedWords'][-1];w['word']='2.'
        w['numericExpansion']={'variant':'plain','words':[{'word':'two','start':w['start'],'end':w['end'],'score':w['score']}]}
        self.a['recognition'][2]['words'][-1]['word']='two'
        self.a['cues'][-1]['text']='Go 2.';self.r['finalCues'][-1]['text']='Go 2.'
        self.a.update(numericAlignmentPolicy=copy.deepcopy(NUMERIC_POLICY),numericBaseRecipe=base,qualityRecipe=NUMERIC_REVIEW_RECIPE)
        self.a['textSha256']=source_text_sha(self.a['boundarySourceVerses'])
        self.a['fingerprint']=site_fingerprint(self.a['sourceAudioSha256'],self.a['textSha256'],'en',NUMERIC_REVIEW_RECIPE,BOUNDARY_RECOGNIZER)
        self.r.update(schemaVersion=9,textSha256=self.a['textSha256'],baseEvidenceSha256=digest(self.a),outputVttSha256=hashlib.sha256(webvtt('GEN',1,self.r['finalCues']).encode()).hexdigest())
        self.approve()

    def numeric_user_seam_receipt(self):
        self.numeric_source_receipt()
        self.r.update(schemaVersion=17,approvedBy='user-natural-seam-tolerance',humanDecision='Accept this natural seam.',sourceAcousticApproval=False,
            naturalSeam=dict(leftVerse=1,rightVerse=2,cut=2.2,uncertainty=[2.18,2.22]),modelClockExceptions=[],
            retainedSourceSpans=[dict(verse=1,range=[1.,1.9]),dict(verse=2,range=[2.3,5.5])])
        for c in self.r['cuts']:
            c['protectedCore']=c.pop('ownVoice')
            if (c['verse'],c['side']) in {(1,'tail'),(2,'head')}:c['measurementKind']='user-natural-seam'
        self.approve()

    def test_numeric_source_can_retain_original_expansions_and_an_accepted_natural_seam(self):
        self.numeric_user_seam_receipt();before=copy.deepcopy(self.a);a=self.wrap()
        self.assertTrue(self.m.verify_reviewed_weak_output_media(a,self.source))
        self.assertEqual(a['reviewedWeakReview']['baseEvidence'],before)
        self.assertEqual(a['checks'][2]['alignedWords'],before['checks'][2]['alignedWords'])

    def test_numeric_user_seam_cannot_waive_numeric_children_or_missing_user_decision(self):
        from quiet_gaps import digest
        self.numeric_user_seam_receipt();self.r['humanDecision']='';self.approve()
        with self.assertRaises(ValueError):self.wrap()
        self.r['humanDecision']='Accept this natural seam.'
        self.a['checks'][2]['alignedWords'][-1]['numericExpansion']['words'][0]['end']+=.1
        self.r['baseEvidenceSha256']=digest(self.a);self.approve()
        with self.assertRaises(ValueError):self.wrap()

    def gap_source_receipt(self):
        from alignment_contract import GAP_REVIEW_RECIPE,BOUNDARY_RECOGNIZER,site_fingerprint
        from boundary_quality import verse_boundary,boundary_gap_issues
        from quiet_gaps import digest,measure_gaps,verified_quiet_gaps
        from verse_clips import create_verse_files
        from timed_text import webvtt
        self.pcm[100800:104000]=array('h',[3000])*3200
        with wave.open(str(self.source),'wb') as f:
            f.setnchannels(1);f.setsampwidth(2);f.setframerate(16000);f.writeframes(self.pcm.tobytes())
        self.a['sourceAudioSha256']=hashlib.sha256(self.source.read_bytes()).hexdigest();model_recipe=self.a['qualityRecipe']
        self.a['checks'][1]['alignedWords'][0]['score']=.9;self.a['checks'][1]['asrEdgeAnchors'][0]['probability']=.95
        cues=[]
        for c in self.a['checks']:
            edges,e=verse_boundary(c['alignedWords'],c['searchRange'],8,'en',reference=c['text'],signal=c['boundarySignal'],anchors=c['asrEdgeAnchors'])
            self.assertIsNotNone(edges);c.update(boundaryVerified=True,boundaryEvidence=e);cues.append({'verse':c['verse'],'text':c['text'],'start':edges[0],'end':edges[1]})
        self.a['cues']=cues;self.a['unclaimedSpeech']=[{'kind':'between-verses','text':'Go','start':6.3,'end':6.7,'allowedHeadingOrClosing':False}]
        self.a['issues']=boundary_gap_issues(self.a['unclaimedSpeech'],cues)
        self.a['gapReview']={'recipe':GAP_REVIEW_RECIPE,'sourceFingerprint':site_fingerprint(self.a['sourceAudioSha256'],self.a['textSha256'],'en',model_recipe,BOUNDARY_RECOGNIZER)}
        self.a['qualityRecipe']=GAP_REVIEW_RECIPE;self.a['fingerprint']=site_fingerprint(self.a['sourceAudioSha256'],self.a['textSha256'],'en',GAP_REVIEW_RECIPE,BOUNDARY_RECOGNIZER)
        self.a['acousticGapReview']=measure_gaps(self.a,self.pcm,[[16000,30400],[40000,88000],[100800,113600]])
        self.assertFalse(verified_quiet_gaps(self.a));self.assertFalse(self.a['accepted'])
        final=copy.deepcopy(cues);final[2]['start']=6.2
        self.r={k:self.a[k] for k in ['key','duration','sourceAudioSha256','textSha256']}
        self.r.update(schemaVersion=10,caseId='weak-fixture',baseEvidenceSha256=digest(self.a),usfm='GEN',chapter=1,weakVerses=[],failureReasons=[],
          gapAssignments=[{'index':0,'gapSha256':digest(self.a['unclaimedSpeech'][0]),'ownerVerse':3}],finalCues=final,
          evidence=[{'file':'evidence.json','sha256':hashlib.sha256((self.root/'evidence.json').read_bytes()).hexdigest()}],
          cuts=[{'verse':3,'side':'head','before':[cues[2]['start'],cues[2]['end']],'after':[final[2]['start'],final[2]['end']],
            'ownVoice':[6.3,7.1],'previousVoiceEnd':5.5,'nextVoiceStart':8,'window':[98880,99520],'referenceRanges':[[35200,91200],[99200,118400]]}])
        self.r['outputInventory']=create_verse_files(self.source,[[c['verse'],c['start'],c['end']] for c in final],self.root,self.root/'source-gap-clips.json')
        self.r['outputVttSha256']=hashlib.sha256(webvtt('GEN',1,final).encode()).hexdigest();self.approve()

    def user_split_gap_receipt(self):
        from quiet_gaps import digest,measure_gaps
        from verse_clips import create_verse_files
        from timed_text import webvtt
        self.gap_source_receipt()
        self.a['unclaimedSpeech'][0].update(start=5.7,end=6.4)
        self.a['acousticGapReview']=measure_gaps(self.a,self.pcm,self.a['acousticGapReview']['speechSegments'])
        final=copy.deepcopy(self.a['cues']);final[1]['end']=6.;final[2]['start']=6.
        self.r.update(schemaVersion=16,baseEvidenceSha256=digest(self.a),finalCues=final,
            approvedBy='user-natural-seam-tolerance',humanDecision='Accept the natural shared seam.',sourceAcousticApproval=False,
            naturalSeam=dict(leftVerse=2,rightVerse=3,cut=6.,uncertainty=[5.98,6.02]),modelClockExceptions=[],
            retainedSourceSpans=[dict(verse=2,range=[2.5,5.5]),dict(verse=3,range=[6.3,7.1])],
            gapAssignments=[dict(index=0,gapSha256=digest(self.a['unclaimedSpeech'][0]),ownerVerses=[2,3],splitAt=6.)],cuts=[])
        for v,side,core,prev,nxt in [(2,'tail',[2.5,5.5],1.9,6.3),(3,'head',[6.3,7.1],5.5,8.)]:
            old=self.a['cues'][v-1];new=final[v-1]
            self.r['cuts'].append(dict(verse=v,side=side,before=[old['start'],old['end']],after=[new['start'],new['end']],
                protectedCore=core,previousVoiceEnd=prev,nextVoiceStart=nxt,window=[95680,96320],referenceRanges=[[40000,88000],[100800,113600]],measurementKind='user-natural-seam'))
        self.r['outputInventory']=create_verse_files(self.source,[[c['verse'],c['start'],c['end']] for c in final],self.root,self.root/'user-split-clips.json')
        self.r['outputVttSha256']=hashlib.sha256(webvtt('GEN',1,final).encode()).hexdigest();self.approve()

    def test_user_gap_seam_preserves_full_raw_gap_audio_across_both_adjacent_verses(self):
        self.user_split_gap_receipt();before=copy.deepcopy(self.a);a=self.wrap()
        self.assertTrue(self.m.verify_reviewed_weak_output_media(a,self.source))
        self.assertEqual(a['reviewedWeakReview']['baseEvidence'],before)
        self.assertEqual(a['unclaimedSpeech'],before['unclaimedSpeech'])
        self.assertEqual(a['checks'],before['checks'])
        self.assertEqual(a['cues'][1]['end'],a['cues'][2]['start'])

    def test_user_gap_seam_cannot_drop_raw_audio_or_change_words_or_waive_another_gap(self):
        self.user_split_gap_receipt();original=copy.deepcopy(self.r)
        for change in ['missing-split','wrong-seam','gap-sha','owners','decision','gap-hole','drop-word']:
            self.r=copy.deepcopy(original)
            if change=='missing-split':self.r['gapAssignments']=[]
            if change=='wrong-seam':self.r['gapAssignments'][0]['splitAt']=6.01
            if change=='gap-sha':self.r['gapAssignments'][0]['gapSha256']='0'*64
            if change=='owners':self.r['gapAssignments'][0]['ownerVerses']=[1,3]
            if change=='decision':self.r['humanDecision']=''
            if change=='gap-hole':self.r['finalCues'][2]['start']=6.1
            if change=='drop-word':self.r['cuts'][0]['protectedCore'][1]=5.2
            self.approve()
            with self.assertRaises(ValueError,msg=change):self.wrap()

    def partial_source_receipt(self,human=False):
        from test_partial_audio import PartialAudioTests
        from alignment_contract import BOUNDARY_REVIEW_RECIPE,BOUNDARY_RECOGNIZER,site_fingerprint
        from boundary_quality import verse_boundary
        from audio_coverage import measure_coverage,verified_coverage
        from quiet_gaps import digest,GAP_POLICY
        from verse_clips import create_verse_files
        from timed_text import webvtt
        original,_=PartialAudioTests().fixture();final=copy.deepcopy(original['cues']);roles=original['confirmedCoverage']['roles'];niv=original['confirmedCoverage']['nivEvidence']
        self.pcm=array('h',[0])*192000;speech=[]
        for lo,hi in [(2.,2.8),(5.,5.8),(8.,8.8)]:
            x,y=round(lo*16000),round(hi*16000);self.pcm[x:y]=array('h',[4000])*(y-x);speech.append([x,y])
        if human:self.pcm[121280:121920]=array('h',[5000])*640
        with wave.open(str(self.source),'wb') as f:
            f.setnchannels(1);f.setsampwidth(2);f.setframerate(16000);f.writeframes(self.pcm.tobytes())
        original['sourceAudioSha256']=hashlib.sha256(self.source.read_bytes()).hexdigest()
        original['fingerprint']=site_fingerprint(original['sourceAudioSha256'],original['textSha256'],'en',original['qualityRecipe'],BOUNDARY_RECOGNIZER)
        self.a=original;self.a.pop('missingVerses');self.a.pop('confirmedCoverage');self.a.update(accepted=False,issues=['unreliable-verse-boundary:38','coverage-neighbor-or-boundary-unverified'],recognition=[],coverageDiagnostic='Coverage must retain full source identity and exactly the narrated cue/check roots')
        self.a['boundaryEvidenceReuse']={'sourceRecipe':BOUNDARY_REVIEW_RECIPE,'sourceFingerprint':site_fingerprint(self.a['sourceAudioSha256'],self.a['textSha256'],'en',BOUNDARY_REVIEW_RECIPE,BOUNDARY_RECOGNIZER),'sourceReportSha256':'a'*64,'verses':[]}
        c=self.a['checks'][1];c['alignedWords'][0]['score']=.4
        edges,e=verse_boundary(c['alignedWords'],c['searchRange'],12,'en',reference=c['text'],signal=c['boundarySignal'],anchors=[])
        self.assertIsNone(edges);self.assertEqual(e['reasons'],['weak-edge-word']);c.update(boundaryVerified=False,boundaryEvidence=e)
        self.a['cues']=[c for c in self.a['cues'] if c['verse']!=38]
        if human:final[1]['end']=7.6;final[2]['start']=7.6
        trial={**self.a,'cues':final,'missingVerses':roles['missingVerses']};coverage=measure_coverage(trial,self.pcm,speech,roles,niv);self.assertTrue(verified_coverage({**trial,'confirmedCoverage':coverage}))
        doc={'key':self.a['key'],'sourceAudioSha256':self.a['sourceAudioSha256'],'textSha256':self.a['textSha256'],'originalBaseEvidenceSha256':digest(self.a),'confirmedCoverage':coverage}
        (self.root/'original-base.json').write_text(json.dumps(self.a))
        audit={'key':self.a['key'],'sourceAudioSha256':self.a['sourceAudioSha256'],'originalRecipe':self.a['qualityRecipe'],'sourceReportSha256':hashlib.sha256((self.root/'original-base.json').read_bytes()).hexdigest(),'sampleCount':len(self.pcm),'speechSegments':speech,'vadModelSha256':GAP_POLICY['vadModelSha256']}
        (self.root/'coverage.json').write_text(json.dumps(doc));(self.root/'speech.json').write_text(json.dumps(audit))
        self.r={k:self.a[k] for k in ['key','duration','sourceAudioSha256','textSha256']};self.r.update(schemaVersion=12 if human else 11,caseId='weak-fixture',baseEvidenceSha256=digest(self.a),usfm='ACT',chapter=8,weakVerses=[38],failureReasons=[{'verse':38,'reasons':['weak-edge-word']}],gapAssignments=[],finalCues=final,coverageEvidenceFile='coverage.json',speechAuditFile='speech.json',baseReportFile='original-base.json',
          evidence=[{'file':n,'sha256':hashlib.sha256((self.root/n).read_bytes()).hexdigest()} for n in ['coverage.json','speech.json','original-base.json']],cuts=[])
        for side,window in [('head',[4.92,4.96]),('tail',[7.58,7.62] if human else [5.88,5.92])]:
            cut={'verse':38,'side':side,'before':None,'after':[final[1]['start'],final[1]['end']],'ownVoice':[5.,5.8],'previousVoiceEnd':2.8,'nextVoiceStart':8.,'window':[round(t*16000) for t in window],'referenceRanges':[[64000,112000],[112000,160000]]}
            self.r['cuts'].append(cut)
        if human:
            self.r.update(approvedBy='user-natural-seam-tolerance',humanDecision='Accept the exact natural seam.',sourceAcousticApproval=False,naturalSeam={'leftVerse':38,'rightVerse':40,'cut':7.6,'uncertainty':[7.58,7.62]},modelClockExceptions=[],retainedSourceSpans=[{'verse':38,'range':[5.,5.8]},{'verse':40,'range':[8.,8.8]}])
            self.r['cuts'][-1]['measurementKind']='user-natural-seam'
            self.r['cuts'].append({'verse':40,'side':'head','before':[original['cues'][-1]['start'],original['cues'][-1]['end']],'after':[final[2]['start'],final[2]['end']],
              'ownVoice':[8.,8.8],'previousVoiceEnd':5.8,'nextVoiceStart':12.,'window':[121280,121920],'referenceRanges':[[64000,112000],[112000,160000]],'measurementKind':'user-natural-seam'})
            for cut in self.r['cuts']:cut['protectedCore']=cut.pop('ownVoice')
        self.r['outputInventory']=create_verse_files(self.source,[[c['verse'],c['start'],c['end']] for c in final],self.root,self.root/'partial-source-clips.json')
        self.r['outputVttSha256']=hashlib.sha256(webvtt('ACT',8,final).encode()).hexdigest();self.approve()

    def test_partial_source_recovers_only_narrated_roots_and_keeps_confirmed_absence(self):
        self.partial_source_receipt();before=copy.deepcopy(self.a)
        try:a=self.wrap()
        except ValueError:a=None
        self.assertIsNotNone(a,'An exact source repair must retain the full canonical text and prove missing narration separately')
        self.assertTrue(self.m.verify_reviewed_weak_output_media(a,self.source));self.assertEqual(a['reviewedWeakReview']['baseEvidence'],before)
        self.assertEqual(a['boundarySourceVerses'],before['boundarySourceVerses']);self.assertEqual([f['verse'] for f in a['verseFiles']],[36,38,40]);self.assertEqual(a['missingVerses'],[{'verse':37,'reason':'not-narrated-in-source'}])
        from publish_site import recording_entry
        source={'key':a['key'],'locale':'en','sha256':a['sourceAudioSha256'],'duration':12,'path':'/source.mp3','url':'https://source.test/audio.mp3'}
        self.assertEqual(recording_entry(source,a,a['textSha256'])['alignmentStatus'],'partial')

    def test_partial_source_human_seam_is_explicit_and_does_not_relax_coverage(self):
        self.partial_source_receipt(human=True)
        try:a=self.wrap()
        except ValueError:a=None
        self.assertIsNotNone(a,'Human seam approval and missing-narration coverage require distinct retained proofs')
        self.assertTrue(self.m.verify_reviewed_weak_output_media(a,self.source))
        self.r['humanDecision']='';self.approve()
        with self.assertRaises(ValueError):self.wrap()

    def test_partial_source_rejects_forged_absence_vad_and_missing_word_proofs(self):
        from quiet_gaps import digest
        self.partial_source_receipt();base=copy.deepcopy(self.a);receipt=copy.deepcopy(self.r);document=json.loads((self.root/'coverage.json').read_text());audit=json.loads((self.root/'speech.json').read_text())
        for change in ['wrong-source','missing-role','forged-vad','missing-policy','missing-word','legacy','missing-coverage-issue','extra-coverage-issue']:
            self.a=copy.deepcopy(base);self.r=copy.deepcopy(receipt);doc=copy.deepcopy(document);vad=copy.deepcopy(audit)
            if change=='wrong-source':doc['sourceAudioSha256']='0'*64
            if change=='missing-role':doc['confirmedCoverage']['roles']['missingVerses']=[]
            if change=='forged-vad':vad['speechSegments']=[]
            if change=='missing-policy':doc['confirmedCoverage']['policy']={}
            if change=='missing-word':self.a['checks'][1]['alignedWords'].pop()
            if change=='legacy':self.r['schemaVersion']=4
            if change=='missing-coverage-issue':self.a['issues'].pop()
            if change=='extra-coverage-issue':self.a['issues'].append('coverage-neighbor-or-boundary-unverified')
            self.r['baseEvidenceSha256']=digest(self.a);doc['originalBaseEvidenceSha256']=digest(self.a)
            (self.root/'coverage.json').write_text(json.dumps(doc));(self.root/'speech.json').write_text(json.dumps(vad))
            for item in self.r['evidence']:item['sha256']=hashlib.sha256((self.root/item['file']).read_bytes()).hexdigest()
            self.approve()
            with self.assertRaises(ValueError,msg=change):self.wrap()

    def test_registered_source_gap_ownership_retains_the_original_failed_quiet_proof(self):
        from quiet_gaps import verified_quiet_gaps
        self.gap_source_receipt();before=copy.deepcopy(self.a)
        try:a=self.wrap()
        except ValueError:a=None
        self.assertIsNotNone(a,'Confirmed source speech must be retained in its real verse without falsifying the original failed quiet proof')
        self.assertTrue(self.m.verify_reviewed_weak_output_media(a,self.source));self.assertEqual(a['reviewedWeakReview']['baseEvidence'],before)
        self.assertEqual(a['acousticGapReview'],before['acousticGapReview']);self.assertFalse(verified_quiet_gaps(before));self.assertEqual(a['unclaimedSpeech'],before['unclaimedSpeech'])
        from publish_site import recording_entry
        source={'key':a['key'],'locale':'en','sha256':a['sourceAudioSha256'],'duration':8,'path':'/source.mp3','url':'https://source.test/audio.mp3'}
        self.assertEqual(recording_entry(source,a,a['textSha256'])['alignmentStatus'],'aligned')

    def test_registered_source_gap_rejects_forged_old_measurements_and_unowned_voice(self):
        from quiet_gaps import digest
        self.gap_source_receipt();base=copy.deepcopy(self.a);receipt=copy.deepcopy(self.r)
        for change in ['old-rms','old-policy','old-cue','wrong-owner','fake-heading','weak-verse','legacy']:
            self.a=copy.deepcopy(base);self.r=copy.deepcopy(receipt)
            if change=='old-rms':self.a['acousticGapReview']['proofs'][0]['parts'][0]['frames'][0]+=.1
            if change=='old-policy':self.a['acousticGapReview']['policy']['maximumRms']=1
            if change=='old-cue':self.a['cues'][2]['start']=6.3
            if change=='wrong-owner':self.r['gapAssignments'][0]['ownerVerse']=2
            if change=='fake-heading':self.a['unclaimedSpeech'][0]['allowedHeadingOrClosing']=True
            if change=='weak-verse':self.r['weakVerses']=[2]
            if change=='legacy':self.r['schemaVersion']=4
            proof=self.a['acousticGapReview'];proof['id']=digest({k:v for k,v in proof.items() if k!='id'})
            self.r['baseEvidenceSha256']=digest(self.a);self.approve()
            with self.assertRaises(ValueError,msg=change):self.wrap()

    def test_numeric_source_recovery_retains_expanded_proof_and_original_identity(self):
        self.numeric_source_receipt();before=copy.deepcopy(self.a)
        try:a=self.wrap()
        except ValueError:a=None
        self.assertIsNotNone(a,'Source review must verify and retain the complete numeric proof before recovering a weak edge')
        self.assertTrue(self.m.verify_reviewed_weak_output_media(a,self.source))
        self.assertEqual(a['reviewedWeakReview']['baseEvidence'],before)
        self.assertEqual(a['numericAlignmentPolicy'],before['numericAlignmentPolicy'])
        self.assertEqual(a['numericBaseRecipe'],before['numericBaseRecipe'])
        self.assertEqual(a['checks'][2]['alignedWords'],before['checks'][2]['alignedWords'])
        from publish_site import recording_entry
        source={'key':a['key'],'locale':'en','sha256':a['sourceAudioSha256'],'duration':8,'path':'/source.mp3','url':'https://source.test/audio.mp3'}
        self.assertEqual(recording_entry(source,a,a['textSha256'])['alignmentStatus'],'aligned')

    def test_numeric_source_recovery_cannot_drop_or_fabricate_expansion_provenance(self):
        from quiet_gaps import digest
        self.numeric_source_receipt();original=copy.deepcopy(self.a);receipt=copy.deepcopy(self.r)
        for change in ['missing-expansion','wrong-expanded-word','collapsed-score','wrong-policy','unsupported-base','wrong-fingerprint','legacy-schema']:
            self.a=copy.deepcopy(original);self.r=copy.deepcopy(receipt)
            if change=='missing-expansion':self.a['checks'][2]['alignedWords'][-1].pop('numericExpansion')
            if change=='wrong-expanded-word':self.a['checks'][2]['alignedWords'][-1]['numericExpansion']['words'][0]['word']='three'
            if change=='collapsed-score':self.a['checks'][2]['alignedWords'][-1]['score']=.1
            if change=='wrong-policy':self.a['numericAlignmentPolicy']={}
            if change=='unsupported-base':self.a['numericBaseRecipe']=self.a['qualityRecipe']
            if change=='wrong-fingerprint':self.a['fingerprint']='0'*64
            if change=='legacy-schema':self.r['schemaVersion']=4
            self.r['baseEvidenceSha256']=digest(self.a);self.approve()
            with self.assertRaises(ValueError,msg=change):self.wrap()

    def test_numeric_source_cuts_protect_every_overlapping_expanded_child(self):
        from quiet_gaps import digest
        from partial_audio import source_text_sha
        from alignment_contract import site_fingerprint,BOUNDARY_RECOGNIZER
        from numeric_alignment import numeric_words_verified
        from verse_clips import create_verse_files
        from timed_text import webvtt
        self.numeric_source_receipt()
        w=self.a['checks'][2]['alignedWords'][-1];w['word']='22.'
        w['numericExpansion']['words']=[{'word':'twenty','start':6.8,'end':7.11,'score':.9},{'word':'two','start':7.095,'end':7.1,'score':.9}]
        for rows,field in [(self.a['boundarySourceVerses'],'text'),(self.a['checks'],'text'),(self.a['cues'],'text'),(self.r['finalCues'],'text')]:rows[-1][field]='Go 22.'
        self.a['textSha256']=source_text_sha(self.a['boundarySourceVerses']);self.a['fingerprint']=site_fingerprint(self.a['sourceAudioSha256'],self.a['textSha256'],'en',self.a['qualityRecipe'],BOUNDARY_RECOGNIZER)
        self.r.update(textSha256=self.a['textSha256'],baseEvidenceSha256=digest(self.a));self.assertTrue(numeric_words_verified(self.a['checks'][2]['alignedWords'],'Go 22.'))
        # The old number proof legitimately accepts this slight child overlap;
        # the new source-cut proof must protect its larger physical extent.
        self.r['outputVttSha256']=hashlib.sha256(webvtt('GEN',1,self.r['finalCues']).encode()).hexdigest();self.approve()
        with self.assertRaises(ValueError,msg='child beyond ownVoice'):self.wrap()
        self.r['finalCues'][-1]['end']=7.1
        self.r['cuts'][-1]['after'][1]=7.1
        self.r['cuts'].append({'verse':3,'side':'tail','before':[self.a['cues'][-1]['start'],self.a['cues'][-1]['end']],
          'after':[6.2,7.1],'ownVoice':[6.3,7.1],'previousVoiceEnd':5.5,'nextVoiceStart':8,'window':[113600,113760],
          'referenceRanges':[[35200,91200],[99200,118400]]})
        self.r['outputInventory']=create_verse_files(self.source,[[x['verse'],x['start'],x['end']] for x in self.r['finalCues']],self.root,self.root/'overlap-number.json')
        self.r['outputVttSha256']=hashlib.sha256(webvtt('GEN',1,self.r['finalCues']).encode()).hexdigest();self.approve()
        with self.assertRaises(ValueError,msg='child beyond final cue'):self.wrap()

    def test_registered_quantization_floor_resolves_phantom_gap_without_fake_heading_or_owner(self):
        self.quantization_floor_receipt();before=copy.deepcopy(self.a)
        try:a=self.wrap()
        except ValueError:a=None
        self.assertIsNotNone(a,'A complete original-PCM quantization-floor proof must resolve a phantom ASR gap')
        self.assertTrue(self.m.verify_reviewed_weak_output_media(a,self.source));self.assertEqual(a['unclaimedSpeech'],before['unclaimedSpeech']);self.assertEqual(a['cues'][-1],before['cues'][-1])
        bad=array('h',self.pcm);bad[121000:121160]=array('h',[3000])*160
        self.assertFalse(self.m.reviewed_weak_measurements_match(a,bad))

    def test_quantization_floor_cannot_discard_voice_or_use_tiny_clock_only(self):
        self.quantization_floor_receipt();original=copy.deepcopy(self.r);document=json.loads((self.root/'floor.json').read_text())
        for change in ['no-proof','short-guard','wrong-gap','fake-zero','voiced-guard']:
            self.r=copy.deepcopy(original);doc=copy.deepcopy(document)
            if change=='no-proof':self.r['sourceSilences']=[]
            if change=='short-guard':self.r['sourceSilences'][0]['windowSamples']=[120000,121600]
            if change=='wrong-gap':self.r['sourceSilences'][0]['gapSha256']='0'*64
            if change=='fake-zero':doc['peakLsb']=0;doc['rms']=0;doc['nonzeroSamples']=0
            if change=='voiced-guard':doc['peakLsb']=3000
            (self.root/'floor.json').write_text(json.dumps(doc));next(x for x in self.r['evidence'] if x['file']=='floor.json')['sha256']=hashlib.sha256((self.root/'floor.json').read_bytes()).hexdigest();self.approve()
            with self.assertRaises(ValueError,msg=change):self.wrap()

    def test_decoder_tolerance_does_not_expand_actual_quantization_floor(self):
        self.quantization_floor_receipt();a=self.wrap()
        lo,hi=self.r['sourceSilences'][0]['windowSamples']
        shifted=array('h',self.pcm)
        shifted[lo:hi]=array('h',(v+1 for v in shifted[lo:hi]))
        self.assertFalse(self.m.reviewed_weak_measurements_match(a,shifted))

    def test_extra_registered_source_edge_is_separate_from_complete_shadow_proof(self):
        from verse_clips import create_verse_files
        from timed_text import webvtt
        self.r['finalCues'][0]['start']=.8
        old=self.a['cues'][0];new=self.r['finalCues'][0]
        self.r['cuts'].append({'verse':1,'side':'head','before':[old['start'],old['end']],'after':[new['start'],new['end']],
          'ownVoice':[1,1.9],'previousVoiceEnd':0,'nextVoiceStart':2.3,'window':[12480,13120],'referenceRanges':[[11200,35200],[35200,91200]]})
        for cut in self.r['cuts']:
            if cut['verse']==1:cut['after'][0]=.8
        self.r['outputInventory']=create_verse_files(self.source,[[c['verse'],c['start'],c['end']] for c in self.r['finalCues']],self.root,self.root/'extra.json')
        self.r['outputVttSha256']=hashlib.sha256(webvtt('GEN',1,self.r['finalCues']).encode()).hexdigest();self.approve()
        a=self.wrap();self.assertTrue(self.m.verify_reviewed_weak_output_media(a,self.source));self.assertEqual(a['cues'][0]['start'],.8)
        from quiet_gaps import digest
        a['reviewedWeakReview']['baseEvidence']['cues'][0]['start']=.8;a['reviewedWeakReview']['id']=digest({k:v for k,v in a['reviewedWeakReview'].items() if k!='id'})
        self.assertFalse(self.m.verified_reviewed_weak_artifact(a))

    def test_joint_outer_source_extension_preserves_raw_group_and_rejects_internal_move(self):
        from test_boundary_context_review import BoundaryContextTests
        from boundary_context_review import review_joint_artifact
        from boundary_quality import verse_boundary
        from alignment_contract import BOUNDARY_RECOGNIZER,site_fingerprint
        from joint_boundaries import joint_proof_id
        from verse_clips import create_verse_files
        from timed_text import webvtt
        from quiet_gaps import digest
        verses,receipt,base,engine=BoundaryContextTests().fixture();self.a=review_joint_artifact(engine,base,receipt,verses,[])
        self.pcm=array('h',[0])*160000
        for lo,hi in [(1,1.8),(3,3.8),(5,6),(7,7.8)]:self.pcm[round(lo*16000):round(hi*16000)]=array('h',[5000])*round((hi-lo)*16000)
        with wave.open(str(self.source),'wb') as f:f.setnchannels(1);f.setsampwidth(2);f.setframerate(16000);f.writeframes(self.pcm.tobytes())
        self.a['sourceAudioSha256']=hashlib.sha256(self.source.read_bytes()).hexdigest()
        for group in self.a['jointAlignments']:
            old=group['id'];group['id']=joint_proof_id(self.a['sourceAudioSha256'],group)
            for c in self.a['checks']:
                if c.get('jointProofId')==old:c['jointProofId']=group['id']
        c=self.a['checks'][3];c['alignedWords'][0]['score']=.4
        _,e=verse_boundary(c['alignedWords'],c['searchRange'],10,'en',reference=c['text'],signal=c['boundarySignal']);c.update(boundaryVerified=False,boundaryEvidence=e)
        self.a.update(accepted=False,issues=['unreliable-verse-boundary:4']);self.a['cues']=[c for c in self.a['cues'] if c['verse']!=4]
        self.a['fingerprint']=site_fingerprint(self.a['sourceAudioSha256'],self.a['textSha256'],'en',self.a['qualityRecipe'],BOUNDARY_RECOGNIZER)
        shadow=copy.deepcopy(self.a['cues'])+[{'verse':4,'text':c['text'],'start':6.96,'end':7.94}];final=copy.deepcopy(shadow);final[2]['end']=6.1
        self.r={k:self.a[k] for k in ['key','duration','sourceAudioSha256','textSha256']};self.r.update(schemaVersion=2,caseId='weak-fixture',baseEvidenceSha256=digest(self.a),weakVerses=[4],usfm='GEN',chapter=1,shadowCues=shadow,finalCues=final,evidence=[{'file':'evidence.json','sha256':hashlib.sha256((self.root/'evidence.json').read_bytes()).hexdigest()}],cuts=[])
        for v,side,voice,prev,nxt,window in [(3,'tail',[5,6],3.8,7,[6.08,6.12]),(4,'head',[7,7.8],6,10,[6.94,6.98]),(4,'tail',[7,7.8],6,10,[7.92,7.96])]:
            old=next((x for x in self.a['cues'] if x['verse']==v),None);new=final[v-1]
            self.r['cuts'].append(dict(verse=v,side=side,before=[old['start'],old['end']] if old else None,after=[new['start'],new['end']],ownVoice=voice,previousVoiceEnd=prev,nextVoiceStart=nxt,window=[round(t*16000) for t in window],referenceRanges=[[72000,99200],[104000,131200]]))
        self.r['outputInventory']=create_verse_files(self.source,[[x['verse'],x['start'],x['end']] for x in final],self.root,self.root/'joint.json');self.r['outputVttSha256']=hashlib.sha256(webvtt('GEN',1,final).encode()).hexdigest();self.approve()
        a=self.wrap();self.assertTrue(self.m.verify_reviewed_weak_output_media(a,self.source));self.assertEqual(a['jointAlignments'],self.a['jointAlignments']);self.assertEqual(a['checks'][:3],self.a['checks'][:3])
        self.r['finalCues'][1]['end']=4.1;old=self.a['cues'][1]
        self.r['cuts'].append(dict(verse=2,side='tail',before=[old['start'],old['end']],after=[old['start'],4.1],ownVoice=[3,3.8],previousVoiceEnd=1.8,nextVoiceStart=5,window=[65280,65920],referenceRanges=[[40000,67200],[72000,99200]]));self.approve()
        with self.assertRaisesRegex(ValueError,'joint internal'):self.wrap()
