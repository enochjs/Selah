import hashlib
from pathlib import Path
import sys
import tempfile
import types
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import deep_review
from alignment_contract import CPU_HYBRID_MODEL, DEEP_REVIEW_RECIPE, DEEP_RECOGNIZER


class DeepReviewTests(unittest.TestCase):
    def test_corrupt_model_is_rejected_before_the_full_recognizer_is_created(self):
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory)
            (folder / 'model.bin').write_bytes(b'a small test fixture, never a model')
            hub, whisper = types.ModuleType('huggingface_hub'), types.ModuleType('faster_whisper')
            calls = []
            hub.snapshot_download = lambda *args, **kwargs: str(folder)
            whisper.WhisperModel = lambda *args, **kwargs: calls.append((args, kwargs))
            def base_init(engine, *args, **kwargs):
                engine.device, engine.recognizer_name = 'cpu', CPU_HYBRID_MODEL
            with patch.object(deep_review.SiteAligner, '__init__', base_init), \
                    patch.dict(sys.modules, {'huggingface_hub': hub, 'faster_whisper': whisper}):
                with self.assertRaisesRegex(ValueError, 'SHA-256'):
                    deep_review.DeepReviewAligner('en', folder)
                self.assertEqual(calls, [])
                # Constructor plumbing uses a test digest and fake model, with no local ML.
                sha = hashlib.sha256((folder / 'model.bin').read_bytes()).hexdigest()
                with patch.object(deep_review, 'FULL_MODEL_SHA256', sha):
                    engine = deep_review.DeepReviewAligner('en', folder)
                self.assertEqual(engine.recipe, DEEP_REVIEW_RECIPE)
                self.assertEqual(engine.recognizer_name, DEEP_RECOGNIZER)
                self.assertEqual(len(calls), 1)
                self.assertTrue(calls[0][1]['local_files_only'])

    def test_full_model_is_only_consumed_when_existing_candidates_fail(self):
        engine = deep_review.DeepReviewAligner.__new__(deep_review.DeepReviewAligner)
        engine.locale = 'en'
        engine.normalize = lambda text: text.lower()
        engine.exact_correspondence = lambda reference, transcript: reference.lower() == transcript.lower()
        calls = []
        def candidates(source):
            for text in ['God is bad', 'God is good', 'unexpected expensive full retry']:
                calls.append(text)
                yield text
        engine.retry_transcripts = candidates
        self.assertEqual(engine.verse_transcripts(b'original', 'God is good'),
                         ['God is bad', 'God is good'])
        self.assertEqual(len(calls), 2)
        calls.clear()
        self.assertEqual(engine.verse_transcripts(b'original', 'God is kind'),
                         ['God is bad', 'God is good', 'unexpected expensive full retry'])
        self.assertEqual(len(calls), 3)

    def test_unvalidated_locale_is_rejected_before_loading_any_models(self):
        with patch.object(deep_review.SiteAligner, '__init__') as load:
            with self.assertRaisesRegex(ValueError, 'English'):
                deep_review.DeepReviewAligner('zh', Path('/unused'))
            load.assert_not_called()


if __name__ == '__main__':
    unittest.main()
