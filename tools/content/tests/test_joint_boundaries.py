import importlib.util
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


class JointBoundaryTests(unittest.TestCase):
    def module(self):
        self.assertIsNotNone(importlib.util.find_spec('joint_boundaries'),
                             'Adjacent verses need a joint acoustic context without splitting by duration')
        import joint_boundaries
        return joint_boundaries

    def test_partition_uses_canonical_words_and_preserves_the_model_word_times(self):
        m = self.module()
        verses = [{'number': 2, 'text': 'God is love.'}, {'number': 3, 'text': 'He is kind.'}]
        words = [{'word': word, 'start': time, 'end': time+.1, 'score': .9}
                 for word, time in zip(['God','is','love.','He','is','kind.'], [2,3,6,7,7.3,7.6])]
        parts = m.split_joint_words(words, verses, 'en')
        self.assertEqual(parts[2], words[:3])
        self.assertEqual(parts[3], words[3:])
        self.assertEqual(parts[2][-1]['end'], 6.1)
        self.assertEqual(parts[3][0]['start'], 7)

    def test_missing_crossed_or_substituted_words_cannot_be_assigned_to_another_verse(self):
        m = self.module()
        verses = [{'number': 1, 'text': 'God is good.'}, {'number': 2, 'text': 'He is kind.'}]
        for tokens in [['is','good.','He','is','kind.'], ['God','is','goodHe','is','kind.'],
                       ['God','is','bad.','He','is','kind.']]:
            with self.assertRaises(ValueError):
                m.split_joint_words([{'word': word} for word in tokens], verses, 'en')
        # An interior un-timed token stays in the proof; it is never silently dropped.
        words = [{'word': x} for x in ['God','is','good.','He','is','kind.']]
        self.assertEqual(len(m.split_joint_words(words, verses, 'en')[1]), 3)

    def test_joint_window_can_move_the_internal_boundary_but_cannot_cross_verified_outer_verses(self):
        m = self.module()
        verses = [{'number': n, 'text': 'word'} for n in [1,2,3,4]]
        checks = {2: {'searchRange':[5,10]}, 3: {'searchRange':[10,15]}}
        cues = [{'verse':1,'start':0,'end':4.8}, {'verse':3,'start':10.2,'end':15.2},
                {'verse':4,'start':16,'end':20}]
        bounds = m.joint_window(verses[1:3], checks, cues, 25)
        self.assertEqual(bounds, [4.8,15.75])
        self.assertGreater(bounds[1], checks[2]['searchRange'][1])
        self.assertLessEqual(bounds[1], cues[-1]['start'])
        self.assertIsNone(m.joint_window(verses[1:3], {2:{'searchRange':[5,150]}}, [], 200))

    def test_fractional_source_end_is_rounded_inward_before_acoustic_alignment(self):
        m=self.module()
        verses=[{'number':n,'text':'God is good.'} for n in [1,2,3]]
        bounds=m.joint_window(verses[1:],{},[{'verse':1,'start':0,'end':4.8006}],15.7496)
        self.assertEqual(bounds,[4.801,15.749])
        from boundary_quality import verse_boundary
        words=[{'word':word,'start':start,'end':end,'score':.9}
               for word,start,end in [('God',13,13.2),('is',14,14.2),('good.',15.2,15.65)]]
        edges,_=verse_boundary(words,bounds,15.7496,'en',reference='God is good.',
            signal={'headRms':.1,'tailRms':.1,'verseRms':.1})
        self.assertIsNotNone(edges)
        self.assertLessEqual(edges[-1],15.7496)

    def test_overlapping_context_is_expanded_to_keep_the_existing_joint_group_atomic(self):
        m=self.module()
        verses=[{'number':n,'text':'word'} for n in range(1,6)]
        proofs=[{'id':'old','verses':[2,3]}]
        checks={2:{'jointProofId':'old'},3:{'jointProofId':'old'}}
        self.assertEqual(m.expand_context_group(2,3,verses,checks,proofs), (1,3))
        self.assertIsNone(m.expand_context_group(0,1,verses,checks,
            [{'id':'old','verses':[2,3,4]}]))

    def test_candidate_groups_are_adjacent_unique_and_never_a_single_verse(self):
        m = self.module()
        self.assertEqual(m.context_groups(0,3), [(0,1),(0,2)])
        self.assertEqual(m.context_groups(1,3), [(1,2),(0,1),(0,2)])
        self.assertEqual(m.context_groups(2,3), [(1,2),(0,2)])
        self.assertEqual(m.context_groups(0,1), [])


if __name__ == '__main__':
    unittest.main()
