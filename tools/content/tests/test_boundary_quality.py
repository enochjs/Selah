import copy
import importlib.util
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


class BoundaryQualityTests(unittest.TestCase):
    def policy(self):
        self.assertIsNotNone(importlib.util.find_spec('boundary_quality'),
                             'Verse boundaries must have a separate verification policy')
        import boundary_quality
        return boundary_quality

    def words(self):
        return [{'word': 'God', 'start': 2, 'end': 2.8, 'score': .9},
                {'word': 'is', 'start': 3, 'end': 3.4, 'score': .8},
                {'word': 'good', 'start': 3.5, 'end': 4.1, 'score': .85}]

    def test_strong_acoustic_edges_do_not_require_a_matching_asr_transcript(self):
        policy = self.policy()
        cue, evidence = policy.verse_boundary(self.words(), [1, 5], 10, 'en')
        self.assertIsNotNone(cue)
        self.assertLess(cue[0], 2)
        self.assertGreater(cue[1], 4.1)
        self.assertEqual(evidence['acousticCore'], [2, 4.1])
        self.assertTrue(evidence['passed'])

    def test_missing_or_weak_first_or_last_word_cannot_claim_verified_edges(self):
        policy = self.policy()
        for index in [0, -1]:
            for change in [{'score': .1}, {'start': None}, {'end': None}]:
                words = self.words()
                words[index].update(change)
                cue, evidence = policy.verse_boundary(words, [1, 5], 10, 'en')
                self.assertIsNone(cue)
                self.assertFalse(evidence['passed'])

    def test_an_unaligned_interior_word_does_not_erase_reliable_verse_edges(self):
        words = self.words()
        words[1:1] = [{'word': 'editorial'} , {'word': 'name', 'start': 2.9, 'end': 3, 'score': .8}]
        cue, evidence = self.policy().verse_boundary(words, [1, 5], 10, 'en')
        self.assertIsNotNone(cue)
        self.assertEqual(evidence['timedFraction'], .8)

    def test_search_truncation_nonfinite_reversed_times_and_implausible_rate_are_rejected(self):
        policy = self.policy()
        for words, bounds in [(self.words(), [2, 5]), (self.words(), [1, 4.1]),
                              ([{**w, 'start': float('nan')} for w in self.words()], [1, 5]),
                              (list(reversed(self.words())), [1, 5]),
                              ([{'word': 'x', 'start': 2 + i*.001, 'end': 2 + (i+1)*.001,
                                 'score': .99} for i in range(100)], [1, 5])]:
            cue, evidence = policy.verse_boundary(words, bounds, 10, 'en')
            self.assertIsNone(cue)
            self.assertFalse(evidence['passed'])

    def test_punctuation_is_not_a_spoken_edge_and_a_clipped_search_requires_quiet_audio(self):
        p = self.policy()
        words = self.words() + [{'word': '”', 'start': 4.12, 'end': 4.15, 'score': .01}]
        cue, proof = p.verse_boundary(words, [1, 5], 10, 'en', reference='God is good.”')
        self.assertIsNotNone(cue)
        self.assertEqual(proof['acousticCore'], [2, 4.1])
        cue, _ = p.verse_boundary(self.words(), [1, 4.1], 10, 'en', reference='God is good',
                                  signal={'headRms': .001, 'tailRms': .001, 'verseRms': .1})
        self.assertIsNotNone(cue)
        for tail in [.1, float('nan'), None]:
            cue, _ = p.verse_boundary(self.words(), [1, 4.1], 10, 'en', reference='God is good',
                                      signal={'tailRms': tail, 'verseRms': .1})
            self.assertIsNone(cue)

    def test_cross_verse_editorial_marker_is_not_mistaken_for_spoken_verse_tail(self):
        import spoken_text
        self.assertTrue(hasattr(spoken_text, 'boundary_text'))
        text = '回到差遣他们的人那里去。（有古卷在此有'
        self.assertEqual(spoken_text.boundary_text(text, 'zh'), '回到差遣他们的人那里去。')
        self.assertEqual(spoken_text.spoken_text(text, 'zh'), text)  # Historical recipes remain unchanged.
        real = '同伴（他们是作预兆的），都当听。'
        self.assertEqual(spoken_text.boundary_text(real, 'zh'), real)

    def test_agreeing_independent_word_clocks_support_a_continuous_speech_boundary(self):
        p = self.policy()
        words = self.words()
        words[-1]['score'] = .4
        anchors = [{'word': 'God', 'start': 1.9, 'end': 2.8, 'probability': .99},
                   {'word': 'good', 'start': 3.5, 'end': 4.1, 'probability': .99}]
        cue, proof = p.verse_boundary(words, [1, 4.1], 10, 'en', reference='God is good', anchors=anchors)
        self.assertIsNotNone(cue)
        self.assertLess(cue[0], 1.9)  # Preserve the independently timed word head.
        self.assertEqual(cue[1], 4.1)
        for change in [{'probability': .1}, {'end': 4.8}]:
            bad = [dict(a) for a in anchors];bad[-1].update(change)
            cue, _ = p.verse_boundary(words, [1, 4.1], 10, 'en', reference='God is good', anchors=bad)
            self.assertIsNone(cue)

    def test_supported_independent_edges_cannot_be_cut_off_by_search_bounds(self):
        p = self.policy()
        anchors = [{'word': 'God', 'start': 1.9, 'end': 2.8, 'probability': .99},
                   {'word': 'good', 'start': 3.5, 'end': 4.1, 'probability': .99}]
        cue, evidence = p.verse_boundary(self.words(), [2, 5], 10, 'en',
                                         reference='God is good', anchors=anchors)
        self.assertIsNone(cue)
        self.assertIn('independent-edge-outside-range', evidence['reasons'])
        anchors[-1]['end'] = 4.2
        anchors[0]['start'] = 2
        cue, evidence = p.verse_boundary(self.words(), [1, 4.1], 10, 'en',
                                         reference='God is good', anchors=anchors)
        self.assertIsNone(cue)
        self.assertIn('independent-edge-outside-range', evidence['reasons'])

    def test_publisher_rejects_an_interior_token_masquerading_as_complete_verse_edges(self):
        import hashlib, json
        p = self.policy()
        verses = [{'number': 1, 'text': 'God is very good and merciful.'}]
        sha = hashlib.sha256(json.dumps(verses, ensure_ascii=False, sort_keys=True).encode()).hexdigest()
        report = {'key': 'genesis:1:en', 'accepted': True, 'issues': [], 'duration': 10,
                  'verificationScope': 'verse-boundaries', 'boundaryPolicy': p.POLICY,
                  'textSha256': sha, 'boundarySourceVerses': verses, 'expectedVerseNumbers': [1],
                  'cues': [{'verse': 1, 'text': verses[0]['text'], 'start': 1.94, 'end': 3.1}],
                  'checks': [{'verse': 1, 'text': verses[0]['text'], 'boundaryVerified': True,
                              'searchRange': [1, 4], 'alignedWords': [
                                  {'word': 'very', 'start': 2, 'end': 3, 'score': .95}]}],
                  'unclaimedSpeech': []}
        self.assertFalse(p.verified_boundary_artifact(report))

    def test_spelling_difference_inside_a_verified_verse_is_not_unassigned_audio(self):
        p = self.policy()
        cues = [{'verse': 1, 'start': 2, 'end': 5}, {'verse': 2, 'start': 6, 'end': 9}]
        gaps = [{'kind': 'leading', 'start': 0, 'end': 1, 'text': 'Book title'},
                {'kind': 'between-verses', 'start': 3, 'end': 4, 'text': 'Korea'},
                {'kind': 'trailing', 'start': 9.2, 'end': 10, 'text': 'Closing'}]
        self.assertEqual(p.boundary_gap_issues(gaps, cues), [])
        gaps.append({'kind': 'between-verses', 'start': 5.1, 'end': 5.8, 'text': 'unassigned speech'})
        self.assertEqual(p.boundary_gap_issues(gaps, cues), ['boundary-unassigned-speech:between-verses'])
        gaps[-1].update(start=4.9, end=6.1)
        self.assertTrue(p.boundary_gap_issues(gaps, cues))


if __name__ == '__main__':
    unittest.main()
