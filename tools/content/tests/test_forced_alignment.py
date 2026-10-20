import hashlib
import sys
import unittest
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from forced_alignment import assess_alignment, alignment_fingerprint, verified_alignment, SCHEMA_VERSION, METHOD
from forced_alignment import reusable_artifact, file_sha256


class ForcedAlignmentTests(unittest.TestCase):
    def test_low_confidence_is_rejected_instead_of_interpolated(self):
        verses = [{'number': 1, 'text': 'God is light.'}]
        segments = [{'verse': 1, 'start': 1., 'end': 3., 'score': -9., 'cer': .8}]
        self.assertFalse(assess_alignment(verses, segments, 5, 'en')['accepted'])

    def test_different_chinese_wording_is_not_published_as_verified(self):
        verses = [{'number': 7, 'text': '你若行得好，岂不蒙悦纳？'}]
        segments = [{'verse': 7, 'start': 1., 'end': 5., 'score': -2.025, 'cer': .3409}]
        self.assertFalse(assess_alignment(verses, segments, 6, 'zh')['accepted'])

    def test_missing_verse_invalidates_chapter(self):
        verses = [{'number': 1, 'text': 'God is light.'}, {'number': 2, 'text': 'Shine brightly.'}]
        segments = [{'verse': 1, 'start': 1., 'end': 3., 'score': -.2, 'cer': 0.}]
        result = assess_alignment(verses, segments, 5, 'en')
        self.assertFalse(result['accepted'])
        self.assertIn('missing-verses', result['reasons'])

    def test_valid_acoustic_boundaries_are_preserved(self):
        verses = [{'number': 1, 'text': 'God is light.'}, {'number': 2, 'text': 'Shine brightly.'}]
        segments = [{'verse': 1, 'start': 1.14, 'end': 3.22, 'score': -.2, 'cer': 0.},
                    {'verse': 2, 'start': 3.72, 'end': 5.14, 'score': -.3, 'cer': .1}]
        result = assess_alignment(verses, segments, 6, 'en')
        self.assertTrue(result['accepted'])
        self.assertEqual(result['segments'], [[1, 1.14, 3.22], [2, 3.72, 5.14]])

    def test_out_of_bounds_overlap_and_nonfinite_values_are_rejected(self):
        verses = [{'number': 1, 'text': 'God is light.'}]
        for start, end in [(-1, 2), (2, 1), (1, 9), (float('nan'), 3)]:
            result = assess_alignment(verses, [{'verse': 1, 'start': start, 'end': end, 'score': -.2, 'cer': 0.}], 5, 'en')
            self.assertFalse(result['accepted'])

    def test_cache_changes_when_audio_text_or_model_changes(self):
        baseline = alignment_fingerprint('audio-sha', [{'number': 1, 'text': 'light'}], 'en', 'model-revision')
        for audio, text, model in [('other-sha', 'light', 'model-revision'), ('audio-sha', 'love', 'model-revision'), ('audio-sha', 'light', 'other-revision')]:
            self.assertNotEqual(baseline, alignment_fingerprint(audio, [{'number': 1, 'text': text}], 'en', model))

    def test_old_or_unverified_sidecars_are_never_used(self):
        fingerprint = 'expected'
        for artifact in [None, {'fingerprint': 'other', 'quality': {'accepted': True}},
                         {'fingerprint': fingerprint, 'method': 'transcript-estimate', 'quality': {'accepted': True}}]:
            self.assertIsNone(verified_alignment(artifact, fingerprint))

    def test_import_rechecks_quality_instead_of_trusting_a_cached_accepted_flag(self):
        verses=[{'number': 1, 'text': 'God is light.'}]
        artifact={'schemaVersion': SCHEMA_VERSION, 'method': METHOD, 'fingerprint': 'expected',
                  'quality': {'accepted': True},
                  'segments': [{'verse': 1, 'start': 1., 'end': 3., 'score': -9., 'cer': .9}]}
        self.assertIsNone(verified_alignment(artifact, 'expected', verses, 5, 'en'))

    def test_cached_alignment_requires_its_exact_playback_audio(self):
        with tempfile.TemporaryDirectory() as root:
            media = Path(root)/('a'*64+'.mp3')
            media.write_bytes(b'normalized recording')
            artifact={'schemaVersion':SCHEMA_VERSION,'method':METHOD,'fingerprint':'expected',
                      'mediaPath':'/api/audio/aligned/'+media.name,'mediaSha256':file_sha256(media)}
            self.assertTrue(reusable_artifact(artifact,'expected',Path(root)))
            media.unlink()
            self.assertFalse(reusable_artifact(artifact,'expected',Path(root)))
            media.write_bytes(b'damaged cache')
            self.assertFalse(reusable_artifact(artifact,'expected',Path(root)))


if __name__ == '__main__':
    unittest.main()
