"""A complete source-verse acceptance may waive scores, never clock/body loss."""
import copy,sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))

class HumanBodyTests(unittest.TestCase):
    def fixture(self):
        from test_speech_span import SpeechSpanTests
        b,_,_=SpeechSpanTests().fixture();c=b['checks'][1]
        r=dict(approvedBy='user-complete-source-verse',humanDecision='完整且不串节，可以采用',sourceAcousticApproval=False,userVerse=dict(verse=2,sourceRange=[2.2,5.8]),finalCues=sorted([*copy.deepcopy(b['cues']),dict(verse=2,text=c['text'],start=2.2,end=5.8)],key=lambda x:x['verse']))
        return b,r

    def test_complete_user_accepted_body_retains_raw_failed_model(self):
        from reviewed_human_partial_sources import user_verified_body
        b,r=self.fixture();before=copy.deepcopy(b);self.assertEqual(user_verified_body(b,r),2);self.assertEqual(b,before)

    def test_no_human_decision_source_text_change_or_truncated_body_can_pass(self):
        from reviewed_human_partial_sources import user_verified_body
        for kind in ['decision','range','word','text']:
            b,r=self.fixture()
            if kind=='decision':r['humanDecision']=''
            if kind=='range':r['userVerse']['sourceRange'][1]=5.7
            if kind=='word':b['checks'][1]['alignedWords'][-1]['end']=6.
            if kind=='text':next(c for c in r['finalCues'] if c['verse']==2)['text']='Other scripture.'
            with self.assertRaises(ValueError,msg=kind):user_verified_body(b,r)

class TimedSourceOwnerTests(unittest.TestCase):
    def fixture(self):
        from test_speech_span import SpeechSpanTests
        from quiet_gaps import digest
        b,_,_=SpeechSpanTests().fixture();c=next(c for c in b['checks'] if c['verse']==3);w=c['alignedWords'][0];b['unclaimedSpeech']=[dict(kind='between-verses',text='No',start=w['start']-.02,end=w['end']+.02,allowedHeadingOrClosing=False)]
        r=dict(schemaVersion=25,gapAssignments=[dict(index=0,ownerVerse=3,modelWordIndex=0,modelWordSha256=digest(w),gapSha256=digest(b['unclaimedSpeech'][0]))]);return b,r

    def test_original_strong_model_word_can_own_a_mistyped_asr_clock_without_rewriting_it(self):
        from reviewed_human_partial_sources import timed_source_gap_owners
        b,r=self.fixture();before=copy.deepcopy(b);self.assertEqual(timed_source_gap_owners(b,r),{0:3});self.assertEqual(b,before)

    def test_unrelated_clock_weak_word_or_changed_proof_cannot_take_ownership(self):
        from reviewed_human_partial_sources import timed_source_gap_owners
        for kind in ['time','weak','digest']:
            b,r=self.fixture()
            if kind=='time':b['unclaimedSpeech'][0].update(start=5.,end=5.2)
            if kind=='weak':next(c for c in b['checks'] if c['verse']==3)['alignedWords'][0]['score']=.2
            if kind=='digest':r['gapAssignments'][0]['modelWordSha256']='x'
            with self.assertRaises(ValueError,msg=kind):timed_source_gap_owners(b,r)
