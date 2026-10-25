import copy
import hashlib
import json
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


class ContextReviewTests(unittest.TestCase):
    def module(self):
        import importlib.util
        self.assertIsNotNone(importlib.util.find_spec('context_review'),
                             'A bounded independent context review is required')
        import context_review
        return context_review

    def test_resume_skips_accepted_and_already_reviewed_reports(self):
        m = self.module()
        self.assertTrue(m.eligible_for_review({'accepted': False}))
        self.assertFalse(m.eligible_for_review({'accepted': True}))
        self.assertFalse(m.eligible_for_review({'accepted': False,
                         'contextReview': {'recipe': m.CONTEXT_REVIEW_RECIPE}}))

    def test_prefers_complete_exact_transcript_over_an_earlier_small_error(self):
        m = self.module()
        class Engine:
            locale = 'zh'
            normalize = staticmethod(lambda text: text.lower())
            exact_correspondence = staticmethod(lambda x, y: x.lower() == y.lower())
        self.assertEqual(m.choose_transcript(Engine(), 'God is always good',
                         ['God is always god', 'God is always good']), 'God is always good')

    def test_small_edge_recovery_requires_exact_complete_replay_over_the_entire_gap(self):
        m = self.module()
        d, receipt, verses, engine = self.fixture('God is good.')
        cue = {'verse': 1, 'text': 'God is good.', 'start': 2.2, 'end': 5}
        check = {'text': 'God is good.', 'independentTranscript': 'God is good.',
                 'independentlyReheard': True, 'independentRange': [2, 5.3]}
        gap = {'start': 2.1, 'end': 2.4}
        result = m.cover_reheard_edges(engine, cue, check, [gap], (2, 5.3))
        self.assertEqual(result['start'], 2.1)
        self.assertEqual(result['acousticCore'], [2.2, 5])
        for change in [{'independentlyReheard': False}, {'independentRange': [2.2, 5.3]},
                       {'independentTranscript': 'God is bad.'}]:
            with self.subTest(change=change):
                result = m.cover_reheard_edges(engine, cue, {**check, **change}, [gap], (2, 5.3))
                self.assertEqual(result['start'], 2.2)
        for wrong_gap in [{'start': 1, 'end': 2.4}, {'start': 1.9, 'end': 2.0}]:
            self.assertEqual(m.cover_reheard_edges(engine, cue, check, [wrong_gap], (0, 6))['start'], 2.2)

    def test_replay_cannot_cross_verified_neighbors_or_exceed_memory_bound(self):
        m = self.module()
        check = {'verse': 2, 'searchRange': [5, 9]}
        cues = [{'verse': 1, 'end': 4.9}, {'verse': 3, 'start': 9.2}]
        self.assertEqual(m.review_bounds(check, cues, 20, 1), (4.9, 9.2))
        self.assertIsNone(m.review_bounds({'verse': 2, 'searchRange': [0, 70]}, [], 80, 1))

    def test_targets_failed_verses_and_both_sides_of_unclaimed_speech(self):
        m = self.module()
        d = {'issues': ['text-audio-needs-review:1'],
             'checks': [{'verse': 1, 'searchRange': [0, 3]},
                        {'verse': 2, 'searchRange': [4, 6]},
                        {'verse': 3, 'searchRange': [7, 9]}],
             'unclaimedSpeech': [{'kind': 'between-verses', 'start': 6.2, 'end': 7.2,
                                   'allowedHeadingOrClosing': False}]}
        self.assertEqual(m.review_targets(d), {1, 2, 3})

    def fixture(self, replay):
        from alignment_contract import METHOD, QUALITY_RECIPE, RECOGNIZERS, site_fingerprint
        from align_site import SiteAligner
        verses = [{'number': 1, 'text': 'God is good.'}]
        sha = hashlib.sha256(json.dumps(verses, ensure_ascii=False, sort_keys=True).encode()).hexdigest()
        receipt = {'key': 'genesis:1:en', 'locale': 'en', 'chapter': 1, 'sha256': 'a' * 64,
                   'path': '/source.mp3', 'url': 'https://example.test/source.mp3', 'duration': 10}
        recognizer = 'Systran/faster-whisper-small'
        d = {'method': METHOD, 'qualityRecipe': QUALITY_RECIPE, 'key': receipt['key'],
             'sourceAudioSha256': receipt['sha256'], 'textSha256': sha,
             'recognizer': recognizer, 'recognizerRevision': RECOGNIZERS[recognizer],
             'fingerprint': site_fingerprint(receipt['sha256'], sha, 'en'),
             'duration': 10, 'accepted': False, 'issues': ['text-audio-needs-review:1'],
             'unclaimedSpeech': [], 'cues': [],
             'checks': [{'verse': 1, 'text': verses[0]['text'], 'searchRange': [2, 5],
                         'independentTranscript': 'God is bad.', 'meanAlignmentScore': .9,
                         'wordCount': 3, 'timedWordCount': 3}]}
        class Engine:
            locale = 'en'
            normalize = staticmethod(lambda s: ''.join(c.lower() for c in s if c.isalnum()))
            exact_correspondence = lambda self, x, y: self.normalize(x) == self.normalize(y)
            calls = []
            def retry_transcripts(self, audio):
                yield replay
            def verify_range(self, audio, window, start, end, initial=None):
                self.calls.append((start, end, initial))
                return ({'verse': 1, 'text': verses[0]['text'], 'start': 2, 'end': 5},
                        {'verse': 1, 'text': verses[0]['text'], 'searchRange': [start, end],
                         'independentTranscript': initial, 'normalizedErrorRate': 0,
                         'meanAlignmentScore': .9, 'wordCount': 3, 'timedWordCount': 3,
                         'independentlyReheard': False})
        return d, receipt, verses, Engine()

    def test_replay_proves_correct_words_without_changing_original_report(self):
        m = self.module()
        d, receipt, verses, engine = self.fixture('God is good.')
        before = copy.deepcopy(d)
        result = m.review_artifact(engine, d, receipt, verses, [0] * 160000)
        self.assertTrue(result['accepted'])
        self.assertEqual(result['issues'], [])
        self.assertTrue(result['checks'][0]['independentlyReheard'])
        self.assertEqual(result['checks'][0]['independentRange'], [1.75, 5.25])
        self.assertEqual(d, before)

    def test_real_word_difference_stays_rejected(self):
        m = self.module()
        d, receipt, verses, engine = self.fixture('God is bad.')
        result = m.review_artifact(engine, d, receipt, verses, [0] * 160000)
        self.assertFalse(result['accepted'])
        self.assertIn('text-audio-needs-review:1', result['issues'])

    def test_uncovered_speech_stays_rejected_even_after_correct_verse_replay(self):
        m = self.module()
        d, receipt, verses, engine = self.fixture('God is good.')
        d['unclaimedSpeech'] = [{'kind': 'trailing', 'text': 'extra words', 'start': 5.1, 'end': 5.2,
                                  'allowedHeadingOrClosing': False}]
        result = m.review_artifact(engine, d, receipt, verses, [0] * 160000)
        self.assertFalse(result['accepted'])
        self.assertIn('unclaimed-narration:trailing', result['issues'])

    def test_source_identity_mismatch_must_not_reuse_evidence(self):
        m = self.module()
        d, receipt, verses, engine = self.fixture('God is good.')
        d['sourceAudioSha256'] = 'b' * 64
        with self.assertRaises(ValueError):
            m.review_artifact(engine, d, receipt, verses, [0] * 160000)

    def test_missing_recognition_gets_a_real_bounded_replay(self):
        m = self.module()
        d, receipt, verses, engine = self.fixture('God is good.')
        d.update(issues=['no-recognized-speech:1'], checks=[])
        result = m.review_artifact(engine, d, receipt, verses, [0] * 160000)
        self.assertTrue(result['accepted'])
        self.assertGreater(result['contextReview']['attempts'], 0)

    def test_unbounded_missing_recognition_is_unattempted_and_retryable(self):
        m = self.module()
        d, receipt, verses, engine = self.fixture('God is good.')
        d.update(issues=['no-recognized-speech:1'], checks=[], duration=80)
        result = m.review_artifact(engine, d, receipt, verses, [0] * 160000)
        self.assertFalse(result['accepted'])
        self.assertEqual(result['contextReview']['unattemptedVerses'], [1])
        self.assertIn('no-recognized-speech:1', result['issues'])
        self.assertTrue(m.eligible_for_review(result))

    def test_old_check_without_search_range_can_be_replayed_with_a_gap(self):
        m = self.module()
        d, receipt, verses, engine = self.fixture('God is good.')
        del d['checks'][0]['searchRange']
        d['unclaimedSpeech'] = [{'kind': 'leading', 'start': 1.5, 'end': 2,
                                'allowedHeadingOrClosing': False}]
        result = m.review_artifact(engine, d, receipt, verses, [0] * 160000)
        self.assertGreater(result['contextReview']['attempts'], 0)
        self.assertFalse(result['accepted'])


if __name__ == '__main__':
    unittest.main()
