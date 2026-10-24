import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from timed_text import recognition_windows, webvtt, narration_gaps


class TimedTextTests(unittest.TestCase):
    def test_word_times_are_matched_to_verses_after_a_spoken_title(self):
        words = [{'word': word, 'start': i, 'end': i + .8}
                 for i, word in enumerate(['Psalm', '23.', 'God', 'is', 'love.', 'He', 'is', 'good.'])]
        windows = recognition_windows([{'number': 4, 'text': 'God is love.'},
                                       {'number': 5, 'text': 'He is good.'}], words)
        self.assertEqual([(w['verse'], w['start'], w['end']) for w in windows],
                         [(4, 2, 4.8), (5, 5, 7.8)])
        self.assertEqual(windows[0]['errorRate'], 0)

    def test_different_translations_are_not_accepted_as_matching(self):
        words = [{'word': word, 'start': i, 'end': i + .8}
                 for i, word in enumerate('I walk through the valley of the shadow of death'.split())]
        window = recognition_windows([{'number': 4, 'text': 'I walk through the darkest valley'}], words)[0]
        self.assertGreater(window['errorRate'], .05)

    def test_detects_extra_spoken_clauses_between_otherwise_matching_verses(self):
        words = [{'word': word, 'start': i, 'end': i + .8}
                 for i, word in enumerate('God is good but his wrath destroys all people He is kind'.split())]
        windows = recognition_windows([{'number': 1, 'text': 'God is good.'},
                                       {'number': 2, 'text': 'He is kind.'}], words)
        gaps = narration_gaps(windows, words)
        self.assertEqual(gaps[0]['kind'], 'between-verses')
        self.assertEqual(gaps[0]['text'], 'but his wrath destroys all people')

    def test_exports_standard_webvtt_canonical_ids_and_milliseconds(self):
        data = webvtt('PSA', 23, [{'verse': 4, 'start': 24.773, 'end': 36.672,
                                  'text': 'Even though I walk & fear no evil.'}])
        self.assertIn('WEBVTT\n\nPSA.23.4\n00:00:24.773 --> 00:00:36.672', data)
        self.assertIn('&amp;', data)
        with self.assertRaises(ValueError):
            webvtt('PSA', 23, [{'verse': 4, 'start': 5, 'end': 4, 'text': 'Invalid'}])
