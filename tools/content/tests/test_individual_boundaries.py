import copy
import importlib.util
import json
from array import array
from pathlib import Path
import sys
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import test_speech_span
import test_word_pause

class IndividualBoundaryTests(unittest.TestCase):
    def fixture(self):
        from boundary_quality import verse_boundary
        from partial_audio import source_text_sha
        a,pcm,speech=test_speech_span.SpeechSpanTests().fixture();c=a['checks'][1]
        c['text']=c['text'].replace('He ','from ',1);c['alignedWords'][0].update(word='from',score=.9)
        gap={'word':'from','start':2.32,'end':2.56,'probability':.997}
        a['recognition'][0]['words'].append(copy.deepcopy(gap));a['recognition'][1]['words'][0].update(word='From',start=2.56,end=2.6,probability=.23)
        c['asrEdgeAnchors'][0]=copy.deepcopy(a['recognition'][1]['words'][0]);a['boundarySourceVerses'][1]['text']=c['text'];a['textSha256']=source_text_sha(a['boundarySourceVerses'])
        edges,e=verse_boundary(c['alignedWords'],c['searchRange'],8,'en',reference=c['text'],signal=c['boundarySignal'],anchors=c['asrEdgeAnchors']);c.update(boundaryVerified=True,boundaryEvidence=e)
        a['cues'].insert(1,{'verse':2,'text':c['text'],'start':edges[0],'end':edges[1]})
        a['unclaimedSpeech']=[{'kind':'between-verses','text':'from','start':2.32,'end':2.56,'allowedHeadingOrClosing':False}];a['issues']=['boundary-unassigned-speech:between-verses']
        pcm[37120:40000]=array('h',[3000])*(40000-37120);speech[1][0]=37120
        return a,pcm,speech

    def test_duplicated_recognition_word_is_preserved_inside_its_real_verse(self):
        self.assertIsNotNone(importlib.util.find_spec('individual_boundaries'),'Each residual case needs complete, source-bound ownership and local-pause attempts')
        from individual_boundaries import repair_individual,individual_measurements_match
        from boundary_quality import verified_boundary_artifact
        a,pcm,speech=self.fixture();before=copy.deepcopy(a);r,attempts=repair_individual(a,pcm,speech)
        self.assertTrue(r['accepted']);self.assertTrue(verified_boundary_artifact(r));self.assertTrue(individual_measurements_match(r,pcm))
        self.assertLessEqual(r['cues'][1]['start'],2.32);self.assertLessEqual(r['cues'][0]['end'],r['cues'][1]['start'])
        self.assertEqual(r['recognition'],before['recognition']);self.assertEqual(r['unclaimedSpeech'],before['unclaimedSpeech'])
        for x,y in zip(r['checks'],before['checks']):self.assertEqual(x['alignedWords'],y['alignedWords']);self.assertEqual(x['asrEdgeAnchors'],y['asrEdgeAnchors'])
        self.assertTrue(verified_boundary_artifact(json.loads(json.dumps(r))));self.assertEqual(a,before);self.assertTrue(attempts)

    def test_wrong_owner_weak_model_or_no_quiet_prefix_stays_for_review(self):
        from individual_boundaries import repair_individual
        for change in ['word','weak','noise','changed-clock']:
            a,pcm,speech=self.fixture()
            if change=='word':a['unclaimedSpeech'][0]['text']='another'
            if change=='weak':a['checks'][1]['alignedWords'][0]['score']=.1
            if change=='noise':pcm[30400:40000]=array('h',[10000])*9600
            if change=='changed-clock':a['recognition'][0]['words'][-1]['end']+=.3
            r,attempts=repair_individual(a,pcm,speech);self.assertFalse(r['accepted'],change);self.assertTrue(attempts)

    def test_scoped_local_pause_reuses_verified_numeric_source_without_losing_it(self):
        from individual_boundaries import repair_individual
        from alignment_contract import NUMERIC_REVIEW_RECIPE,BOUNDARY_REVIEW_RECIPE
        from numeric_alignment import NUMERIC_POLICY,expansion,collapse_words
        from partial_audio import source_text_sha
        from boundary_quality import verified_boundary_artifact
        a,pcm=test_word_pause.WordPauseTests().fixture()
        first=a['checks'][0];first['text']='They 182';a['boundarySourceVerses'][0]['text']=first['text'];a['cues'][0]['text']=first['text']
        spoken,groups=expansion('182','en','plain');raw=[{'word':w,'start':1.4+i*.125,'end':1.4+(i+1)*.125,'score':.9} for i,w in enumerate(spoken.split())];first['alignedWords'][-1]=collapse_words(raw,groups,'plain')[0]
        first['asrEdgeAnchors'][-1]['word']='182';a['recognition'][0]['words'][1]['word']='182'
        a['textSha256']=source_text_sha(a['boundarySourceVerses']);a.update(qualityRecipe=NUMERIC_REVIEW_RECIPE,numericBaseRecipe=BOUNDARY_REVIEW_RECIPE,numericAlignmentPolicy=NUMERIC_POLICY)
        r,_=repair_individual(a,pcm,[[16000,30400],[40000,104000]])
        self.assertTrue(r['accepted']);self.assertTrue(verified_boundary_artifact(r))
        ready,receipt=self.materialized(r)
        from publish_site import recording_entry
        self.assertEqual(recording_entry(receipt,ready,ready['textSha256'])['alignmentStatus'],'aligned')
        r['checks'][0]['alignedWords'][-1].pop('numericExpansion');self.assertFalse(verified_boundary_artifact(r))

    def test_empty_model_words_report_a_specific_diagnostic(self):
        from individual_boundaries import repair_individual
        a,pcm,speech=self.fixture();a['checks'][1].update(alignedWords=[],boundaryVerified=False)
        _,attempts=repair_individual(a,pcm,speech)
        reasons=[x.get('reason','') for x in attempts]
        self.assertIn('No timed source words for this verse or its neighbor',reasons)
        self.assertNotIn('list index out of range',reasons)

    def materialized(self,a):
        from alignment_contract import METHOD,BOUNDARY_RECOGNIZER
        r=copy.deepcopy(a);r.update(method=METHOD,recognizer=BOUNDARY_RECOGNIZER,vttSha256='b'*64,vttFile='b'*64+'.vtt')
        r['verseFiles']=[{'verse':c['verse'],'sourceStart':c['start'],'sourceEnd':c['end'],'duration':c['end']-c['start'],
            'sha256':'c'*64,'path':'/api/audio/resources/'+'c'*64+'.mp3'} for c in r['cues']]
        return r,{'key':r['key'],'locale':'en','sha256':'a'*64,'duration':8,'path':'/source.mp3','url':'https://example.com/source.mp3'}

    def test_publisher_rechecks_the_materialized_edge_owner_range(self):
        from individual_boundaries import repair_individual
        from publish_site import recording_entry
        a,pcm,speech=self.fixture();r,_=repair_individual(a,pcm,speech);r,receipt=self.materialized(r)
        self.assertEqual(recording_entry(receipt,r,r['textSha256'])['alignmentStatus'],'aligned')
        r['verseFiles'][1]['sourceStart']+=.1
        self.assertEqual(recording_entry(receipt,r,r['textSha256'])['alignmentStatus'],'pending')

    def test_edited_ranges_proofs_and_legacy_identity_are_not_publishable(self):
        from individual_boundaries import repair_individual,individual_measurements_match
        from boundary_quality import verified_boundary_artifact
        a,pcm,speech=self.fixture();r,_=repair_individual(a,pcm,speech)
        for change in ['range','proof','legacy','text','vad']:
            x=copy.deepcopy(r)
            if change=='range':x['cues'][1]['start']+=.3
            if change=='proof':x['individualBoundaryReview']['proofs']=[]
            if change=='legacy':x['qualityRecipe']=a['qualityRecipe']
            if change=='text':x['boundarySourceVerses'][1]['text']='Different'
            if change=='vad':x['individualBoundaryReview']['speechSegments'][0][1]+=100
            self.assertFalse(verified_boundary_artifact(x),change)
        pcm[34000:35500]=array('h',[15000])*1500
        self.assertFalse(individual_measurements_match(r,pcm))

    def test_previous_source_matched_case_alignment_can_be_reused_without_dropping_its_proofs(self):
        from individual_boundaries import repair_individual
        from alignment_contract import CASE_REVIEW_RECIPE,PADDING_REVIEW_RECIPE
        from case_evidence import CASE_POLICY
        from boundary_quality import verified_boundary_artifact
        from publish_site import recording_entry
        a,pcm,speech=self.fixture();a.update(qualityRecipe=CASE_REVIEW_RECIPE,caseReviewPolicy=CASE_POLICY,caseBaseRecipe=PADDING_REVIEW_RECIPE)
        r,_=repair_individual(a,pcm,speech);self.assertTrue(r['accepted']);self.assertTrue(verified_boundary_artifact(r))
        r,receipt=self.materialized(r);self.assertEqual(recording_entry(receipt,r,r['textSha256'])['alignmentStatus'],'aligned')
        r['caseReviewPolicy']={};self.assertFalse(verified_boundary_artifact(r))

    def test_voice_free_backing_audio_does_not_hide_a_complete_owned_word(self):
        from individual_boundaries import repair_individual,individual_measurements_match
        a,pcm,speech=self.fixture();pcm[32000:37120]=array('h',[1200])*(37120-32000)
        r,_=repair_individual(a,pcm,speech);self.assertTrue(r['accepted']);self.assertTrue(individual_measurements_match(r,pcm))
        self.assertEqual(r['individualBoundaryReview']['proofs'][0]['proof']['acousticBasis'],'voice-free-background')
        voiced=copy.deepcopy(speech);voiced.insert(1,[32000,37120])
        r,_=repair_individual(a,pcm,voiced);self.assertFalse(r['accepted'])

if __name__=='__main__':unittest.main()
