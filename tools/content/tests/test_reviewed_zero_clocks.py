"""A zero-duration numeric ASR marker does not establish an audio interval."""
import copy,sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))

class ZeroClockTests(unittest.TestCase):
    def fixture(self):
        from quiet_gaps import digest
        b=dict(duration=30.,unclaimedSpeech=[dict(kind='between-verses',text='2.',start=15.56,end=15.56,allowedHeadingOrClosing=False),dict(kind='between-verses',text='3.',start=21.54,end=21.54,allowedHeadingOrClosing=False)])
        r=dict(zeroClocks=[dict(index=i,gapSha256=digest(g)) for i,g in enumerate(b['unclaimedSpeech'])]);return b,r

    def test_exact_zero_points_remain_unchanged_diagnostics(self):
        try:from reviewed_zero_clocks import zero_clock_roles
        except ImportError:self.fail('Zero-length numeric ASR diagnostics need a distinct verification identity')
        b,r=self.fixture();before=copy.deepcopy(b);self.assertEqual(zero_clock_roles(b,r),{0,1});self.assertEqual(b,before)

    def test_positive_voice_intervals_lexical_text_and_changed_marker_are_not_waived(self):
        try:from reviewed_zero_clocks import zero_clock_roles
        except ImportError:self.fail('Zero-length numeric ASR diagnostics need a distinct verification identity')
        from quiet_gaps import digest
        for kind in ['duration','word','flag','kind','hash','duplicate','missing','range']:
            b,r=self.fixture()
            if kind=='duration':b['unclaimedSpeech'][0]['end']+=.01
            if kind=='word':b['unclaimedSpeech'][0]['text']='word'
            if kind=='flag':b['unclaimedSpeech'][0]['allowedHeadingOrClosing']=True
            if kind=='kind':b['unclaimedSpeech'][0]['kind']='trailing'
            if kind=='hash':r['zeroClocks'][0]['gapSha256']='f'*64
            if kind=='duplicate':r['zeroClocks'].append(copy.deepcopy(r['zeroClocks'][0]))
            if kind=='missing':r['zeroClocks'].pop()
            if kind=='range':b['unclaimedSpeech'][0]['start']=b['unclaimedSpeech'][0]['end']=31.
            if kind not in {'hash','duplicate','missing'}:r['zeroClocks'][0]['gapSha256']=digest(b['unclaimedSpeech'][0])
            with self.assertRaises(ValueError,msg=kind):zero_clock_roles(b,r)
