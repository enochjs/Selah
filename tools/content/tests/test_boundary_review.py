import importlib.util
from pathlib import Path
import sys
import types
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


class BoundaryReviewTests(unittest.TestCase):
    @unittest.skipUnless(importlib.util.find_spec('numpy'), 'Waveform RMS is checked in the remote alignment environment')
    def test_spelling_and_word_differences_do_not_block_strong_acoustic_edges(self):
        self.assertIsNotNone(importlib.util.find_spec('boundary_review'))
        from boundary_review import BoundaryAligner
        alignment = types.ModuleType('whisperx.alignment')
        alignment.align = lambda *args, **kwargs: {'segments': [{'words': [
            {'word': 'Johanan', 'start': 2, 'end': 2.8, 'score': .9},
            {'word': 'son', 'start': 3, 'end': 3.3, 'score': .9},
            {'word': 'of', 'start': 3.4, 'end': 3.5, 'score': .8},
            {'word': 'Kareah.', 'start': 3.6, 'end': 4.2, 'score': .85}]}]}
        package = types.ModuleType('whisperx');package.__path__ = []
        engine = BoundaryAligner.__new__(BoundaryAligner)
        engine.locale, engine.model, engine.metadata, engine.device = 'en', object(), {}, 'cpu'
        engine.normalize = lambda text: ''.join(c.lower() for c in text if c.isalnum())
        with patch.dict(sys.modules, {'whisperx': package, 'whisperx.alignment': alignment}):
            cue, check = engine.verify_range([0] * 160000,
                {'verse': 14, 'text': 'Johanan son of Kareah.'}, 1, 5, initial='Johanan son of Korea.')
        self.assertIsNotNone(cue)
        self.assertTrue(check['boundaryVerified'])
        self.assertEqual(check['independentTranscript'], 'Johanan son of Korea.')
        self.assertFalse(check['phoneticVerified'])
        self.assertFalse(check['independentlyReheard'])
        self.assertGreater(check['normalizedErrorRate'], .025)
        self.assertEqual(list(engine.retry_transcripts(b'unused')), [])

    def test_boundary_mode_never_demands_a_letter_for_letter_gap_replay(self):
        self.assertIsNotNone(importlib.util.find_spec('boundary_review'))
        from boundary_review import BoundaryAligner
        engine = BoundaryAligner.__new__(BoundaryAligner)
        cues = [{'verse': 1, 'start': 2, 'end': 5}]
        gaps = [{'kind': 'between-verses', 'start': 3, 'end': 4, 'text': 'Korea'}]
        self.assertEqual(engine.assess_gaps([], gaps, cues, []), [])


if __name__ == '__main__':
    unittest.main()
