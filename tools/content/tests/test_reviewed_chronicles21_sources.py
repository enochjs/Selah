"""A coarse O clock remains real audio even when it crosses the quiet verse seam."""
import copy,sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))

class ChroniclesSourceClockTests(unittest.TestCase):
    def fixture(self):
        from quiet_gaps import digest
        b=dict(key='1-chronicles:21:en',unclaimedSpeech=[dict(kind='between-verses',text='O',start=222.,end=222.54,allowedHeadingOrClosing=False)])
        r=dict(sourceClockPartition=dict(index=0,gapSha256=digest(b['unclaimedSpeech'][0]),ownerVerses=[22,23],splitAt=222.3),finalCues=[dict(verse=22,start=211.,end=222.3),dict(verse=23,start=222.3,end=233.)],cuts=[dict(verse=22,side='tail'),dict(verse=23,side='head')]);return b,r

    def test_complete_original_positive_interval_is_retained_across_the_quiet_actual_source_seam(self):
        try:from reviewed_chronicles21_sources import chronicles_source_partition
        except ImportError:self.fail('The early ASR clock needs complete source coverage rather than a fake missing word')
        b,r=self.fixture();before=copy.deepcopy(b);self.assertEqual(chronicles_source_partition(b,r),0);self.assertEqual(b,before)

    def test_lost_source_samples_other_words_or_unmeasured_seams_cannot_pass(self):
        try:from reviewed_chronicles21_sources import chronicles_source_partition
        except ImportError:self.fail('The early ASR clock needs complete source coverage rather than a fake missing word')
        for kind in ['gap','word','measure','human','scope']:
            b,r=self.fixture()
            if kind=='gap':r['finalCues'][1]['start']=222.4
            if kind=='word':b['unclaimedSpeech'][0]['text']='another'
            if kind=='measure':r['cuts'].pop()
            if kind=='human':r['cuts'][0]['measurementKind']='user-natural-seam'
            if kind=='scope':b['key']='1-chronicles:22:en'
            with self.assertRaises(ValueError,msg=kind):chronicles_source_partition(b,r)

class SerializedMeanScoreTests(unittest.TestCase):
    def test_one_last_decimal_float_rounding_difference_does_not_change_complete_boundary_evidence(self):
        try:from reviewed_chronicles21_sources import same_serialized_boundary_evidence
        except ImportError:self.fail('Serialized word scores need bounded final-decimal comparison')
        saved=dict(passed=True,reasons=[],meanAlignmentScore=.8228,headScore=.875,tailScore=.705)
        actual={**saved,'meanAlignmentScore':.8227}
        self.assertTrue(same_serialized_boundary_evidence(saved,actual))
        self.assertFalse(same_serialized_boundary_evidence(saved,{**actual,'tailScore':.2}))
        self.assertFalse(same_serialized_boundary_evidence(saved,{**actual,'meanAlignmentScore':.8225}))
