"""Zero markers and an early word clock are preserved by separate real source proofs."""
import copy,sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))

class PartitionedZeroSourceTests(unittest.TestCase):
    def fixture(self):
        from quiet_gaps import digest
        b=dict(duration=12.,unclaimedSpeech=[dict(kind='between-verses',text='16.',start=2.,end=2.,allowedHeadingOrClosing=False),dict(kind='between-verses',text='The',start=6.3,end=7.1,allowedHeadingOrClosing=False)])
        r=dict(zeroClocks=[dict(index=0,gapSha256=digest(b['unclaimedSpeech'][0]))],clockPartitions=[dict(index=1,ownerVerses=[1,2],splitAt=6.7,gapSha256=digest(b['unclaimedSpeech'][1]))],finalCues=[dict(verse=1,start=1.,end=6.7),dict(verse=2,start=6.7,end=10.)],cuts=[dict(verse=1,side='tail'),dict(verse=2,side='head')]);c={2:dict(text='The wicked',alignedWords=[dict(word='The',start=7.,end=7.2,score=.9)])};return b,r,c

    def test_every_zero_sample_and_positive_interval_stays_in_real_output_audio(self):
        try:from reviewed_partitioned_zero_sources import partitioned_zero_roles
        except ImportError:self.fail('Mixed zero diagnostics and positive clocks need separate source ownership')
        b,r,c=self.fixture();before=copy.deepcopy(b);self.assertEqual(partitioned_zero_roles(b,r,c),{0,1});self.assertEqual(b,before)

    def test_a_zero_sample_outside_outputs_or_a_positive_source_gap_cannot_disappear(self):
        try:from reviewed_partitioned_zero_sources import partitioned_zero_roles
        except ImportError:self.fail('Mixed zero diagnostics and positive clocks need separate source ownership')
        for kind in ['zero','positive','gap']:
            b,r,c=self.fixture()
            if kind=='zero':r['finalCues'][0]['start']=2.1
            if kind=='positive':r['finalCues'][1]['start']=6.8
            if kind=='gap':r['clockPartitions'][0]['gapSha256']='a'*64
            with self.assertRaises(ValueError,msg=kind):partitioned_zero_roles(b,r,c)
