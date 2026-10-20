import importlib.util
import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from align_audio import align_posteriors, normalize_text, acoustic_text


@unittest.skipUnless(importlib.util.find_spec('ctc_segmentation'), 'Run with .venv-align/bin/python for acoustic integration tests')
class AcousticAlignmentTests(unittest.TestCase):
    def test_normalizes_spoken_numbers_and_chinese_script(self):
        self.assertEqual(normalize_text('There were 46,500 men.', 'en'), 'THERE WERE FORTY SIX THOUSAND FIVE HUNDRED MEN')
        self.assertEqual(normalize_text('神創造天地。', 'zh'), '神创造天地')
        self.assertEqual(normalize_text('你们都要受割礼（“受割礼”原文作“割阳皮”。14、23节同）。', 'zh'), '你们都要受割礼')

    def test_boundaries_follow_acoustic_peaks_not_text_length(self):
        import numpy as np
        vocab = {'<pad>': 0, 'A': 1, 'B': 2}
        # Equal-length references, deliberately unequal spoken durations.
        logits = np.full((100, 3), -12., dtype=np.float32)
        logits[:, 0] = -.001
        logits[10:35, 1] = -.001
        logits[10:35, 0] = -12
        logits[70:80, 2] = -.001
        logits[70:80, 0] = -12
        segments = align_posteriors(logits, ['A', 'B'], vocab, .02)
        self.assertEqual(len(segments), 2)
        self.assertGreater(segments[1]['start'], 1.3)
        self.assertLess(segments[0]['end'], .9)
        self.assertEqual([s['recognized'] for s in segments], ['A', 'B'])

    def test_chinese_numerals_are_spoken_in_full_not_silently_removed(self):
        self.assertEqual(acoustic_text('九百六十二', 'zh'), 'jiubailiushier')
        self.assertEqual(acoustic_text('七十七倍', 'zh'), 'qishiqibei')
        self.assertEqual(acoustic_text('共144人', 'zh'), 'gongyibaisishisiren')

    def test_editorial_cross_references_are_not_narrated(self):
        self.assertEqual(normalize_text('西门（约翰在马太16章17节称约拿）称矶法（翻出来就是彼得）', 'zh'), '西门称矶法翻出来就是彼得')


if __name__ == '__main__': unittest.main()
