import copy
import importlib.util
from pathlib import Path
import sys
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))

class JointPaddingTests(unittest.TestCase):
    def module(self):
        self.assertIsNotNone(importlib.util.find_spec('joint_padding'))
        import joint_padding
        return joint_padding

    def fixture(self):
        checks=[];cues=[]
        for n,start,end in [(1,1,2),(2,2.02,3)]:
            checks.append({'verse':n,'alignedWords':[{'word':'word','start':start,'end':end,'score':.9}],
                           'asrEdgeAnchors':[]})
            cues.append({'verse':n,'start':start-.06,'end':end+.1})
        return checks,cues

    def test_only_padding_is_reallocated_between_complete_nonoverlapping_word_cores(self):
        m=self.module();checks,cues=self.fixture();before=copy.deepcopy(checks)
        result=m.allocate_padding(checks,cues,4)
        self.assertEqual(result[0]['end'],2.01);self.assertEqual(result[1]['start'],2.01)
        self.assertEqual(result[0]['start'],cues[0]['start']);self.assertEqual(result[1]['end'],cues[1]['end'])
        self.assertEqual(checks,before)

    def test_real_word_overlap_and_conflicting_valid_asr_protection_are_rejected(self):
        m=self.module();checks,cues=self.fixture()
        checks[0]['alignedWords'][0]['end']=2.03
        self.assertIsNone(m.allocate_padding(checks,cues,4))
        checks,cues=self.fixture();checks[0]['asrEdgeAnchors']=[{'start':1,'end':1.2,'probability':.9},{'start':1.9,'end':2.1,'probability':.9}]
        self.assertIsNone(m.allocate_padding(checks,cues,4))

    def test_shortened_clip_cannot_be_shorter_than_the_original_boundary_minimum(self):
        m=self.module();checks,cues=self.fixture()
        checks[0]['alignedWords'][0].update(start=1.8,end=2)
        cues[0].update(start=1.74,end=2.1)
        self.assertIsNone(m.allocate_padding(checks,cues,4))

if __name__=='__main__':unittest.main()
