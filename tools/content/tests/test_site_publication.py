import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from publish_site import recording_entry
from alignment_contract import site_fingerprint


class SitePublicationTests(unittest.TestCase):
    def setUp(self):
        self.receipt = {'key': 'psalms:23:en', 'sha256': 'a' * 64, 'locale': 'en',
                        'url': 'https://source.test/Ps23.mp3', 'duration': 60,
                        'path': '/api/audio/resources/' + 'a' * 64 + '.mp3'}
        self.artifact = {'method': 'whisperx-3.8.6-phoneme-alignment-v1', 'key': self.receipt['key'],
                         'sourceAudioSha256': 'a' * 64, 'textSha256': 'b' * 64,
                         'accepted': True, 'issues': [], 'fingerprint': site_fingerprint('a' * 64, 'b' * 64, 'en'),
                         'vttFile': 'd' * 64 + '.vtt', 'vttSha256': 'd' * 64,
                         'verseFiles': [{'verse': 4, 'path': '/four.mp3', 'duration': 12}]}

    def test_only_publishes_clips_for_the_exact_new_audio_and_text(self):
        result = recording_entry(self.receipt, self.artifact, 'b' * 64)
        self.assertEqual(result['timingQuality'], 'verse-file')
        self.assertEqual(result['verseFiles'], self.artifact['verseFiles'])
        self.assertEqual(result['segments'], [])
        self.assertEqual(result['voiceType'], 'human')

    def test_never_reuses_timestamps_for_changed_media_text_or_another_chapter(self):
        for change in [{'sourceAudioSha256': 'e' * 64}, {'textSha256': 'e' * 64},
                       {'key': 'psalms:24:en'}, {'method': 'ctc-forced-alignment'},
                       {'fingerprint': 'e' * 64}]:
            result = recording_entry(self.receipt, {**self.artifact, **change}, 'b' * 64)
            self.assertNotIn('verseFiles', result)
            self.assertEqual(result['alignmentStatus'], 'pending')

    def test_marks_actual_mismatches_for_review_without_publishing_partial_clips(self):
        result = recording_entry(self.receipt, {**self.artifact, 'accepted': False,
                                               'issues': ['text-audio-needs-review:4']}, 'b' * 64)
        self.assertEqual(result['alignmentStatus'], 'review-required')
        self.assertNotIn('verseFiles', result)
