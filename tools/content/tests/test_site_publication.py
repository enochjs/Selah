import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from publish_site import recording_entry
from alignment_contract import site_fingerprint, QUALITY_RECIPE, LEGACY_QUALITY_RECIPE


class SitePublicationTests(unittest.TestCase):
    def setUp(self):
        self.receipt = {'key': 'psalms:23:en', 'sha256': 'a' * 64, 'locale': 'en',
                        'url': 'https://source.test/Ps23.mp3', 'duration': 60,
                        'path': '/api/audio/resources/' + 'a' * 64 + '.mp3'}
        self.artifact = {'method': 'whisperx-3.8.6-phoneme-alignment-v1', 'key': self.receipt['key'],
                         'sourceAudioSha256': 'a' * 64, 'textSha256': 'b' * 64,
                         'accepted': True, 'issues': [], 'qualityRecipe': QUALITY_RECIPE,
                         'fingerprint': site_fingerprint('a' * 64, 'b' * 64, 'en'),
                         'vttFile': 'd' * 64 + '.vtt', 'vttSha256': 'd' * 64,
                         'verseFiles': [{'verse': 4, 'path': '/four.mp3', 'duration': 12}]}

    def test_only_publishes_clips_for_the_exact_new_audio_and_text(self):
        result = recording_entry(self.receipt, self.artifact, 'b' * 64)
        self.assertEqual(result['timingQuality'], 'verse-file')
        self.assertEqual(result['verseFiles'], self.artifact['verseFiles'])
        self.assertEqual(result['segments'], [])
        self.assertEqual(result['voiceType'], 'human')

    def test_legacy_recipe_cannot_publish_partial_without_confirmed_coverage(self):
        for extra in [{'missingVerses':[{'verse':4,'reason':'not-narrated-in-source'}]},
                      {'missingVerses':[]},{'confirmedCoverage':{}}]:
            result=recording_entry(self.receipt,{**self.artifact,**extra},'b'*64)
            self.assertEqual(result['alignmentStatus'],'pending')
            self.assertNotIn('missingVerses',result)

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

    def test_rejects_unrecognized_verification_recipes(self):
        result = recording_entry(self.receipt, {**self.artifact, 'qualityRecipe': 'unchecked'}, 'b' * 64)
        self.assertEqual(result['alignmentStatus'], 'pending')

    def test_rejects_pre_release_v6_results_without_the_final_replay_guards(self):
        recipe = 'independent-en025-zh10-cmu113-acoustic-recovery-heading-v6'
        artifact = {**self.artifact, 'qualityRecipe': recipe,
                    'fingerprint': site_fingerprint('a' * 64, 'b' * 64, 'en', recipe)}
        self.assertEqual(recording_entry(self.receipt, artifact, 'b' * 64)['alignmentStatus'], 'pending')

    def test_rejects_pre_release_v8_results_without_unfiltered_gap_proof(self):
        recipe = 'independent-en025-zh10-vad-source-meta-075d7c318fcb-v8'
        artifact = {**self.artifact, 'qualityRecipe': recipe,
                    'fingerprint': site_fingerprint('a' * 64, 'b' * 64, 'en', recipe)}
        self.assertEqual(recording_entry(self.receipt, artifact, 'b' * 64)['alignmentStatus'], 'pending')

    def test_boundary_publication_requires_reproducible_edge_proof_not_an_asr_match(self):
        import hashlib, json, copy
        from alignment_contract import BOUNDARY_REVIEW_RECIPE, BOUNDARY_RECOGNIZER, RECOGNIZERS
        from boundary_quality import POLICY
        verses = [{'number': 4, 'text': 'God is good.'}]
        sha = hashlib.sha256(json.dumps(verses, ensure_ascii=False, sort_keys=True).encode()).hexdigest()
        artifact = {**self.artifact, 'qualityRecipe': BOUNDARY_REVIEW_RECIPE,
                    'recognizer': BOUNDARY_RECOGNIZER, 'recognizerRevision': RECOGNIZERS[BOUNDARY_RECOGNIZER],
                    'textSha256': sha, 'fingerprint': site_fingerprint('a' * 64, sha, 'en',
                                                                     BOUNDARY_REVIEW_RECIPE, BOUNDARY_RECOGNIZER)}
        self.assertEqual(recording_entry(self.receipt, artifact, sha)['alignmentStatus'], 'pending')
        words = [{'word': 'God', 'start': 2, 'end': 2.8, 'score': .9},
                 {'word': 'is', 'start': 3, 'end': 3.4, 'score': .9},
                 {'word': 'good.', 'start': 3.5, 'end': 4.1, 'score': .9}]
        artifact.update(verificationScope='verse-boundaries', boundaryPolicy=POLICY,
                        expectedVerseNumbers=[4], boundarySourceVerses=verses, duration=60,
                        cues=[{'verse': 4, 'text': verses[0]['text'], 'start': 1.94, 'end': 4.2}],
                        checks=[{'verse': 4, 'text': verses[0]['text'], 'boundaryVerified': True,
                                 'alignedWords': words, 'searchRange': [1, 5],
                                 'independentTranscript': 'Different spelling is diagnostic only'}],
                        unclaimedSpeech=[])
        published = recording_entry(self.receipt, artifact, sha)
        self.assertEqual(published['alignmentStatus'], 'aligned')
        self.assertEqual(published['alignment']['verificationScope'], 'verse-boundaries')
        for change in ['cut-tail', 'missing-edge-word', 'partial-verse-list']:
            damaged = copy.deepcopy(artifact)
            if change == 'cut-tail': damaged['cues'][0]['end'] = 3.9
            if change == 'missing-edge-word': damaged['checks'][0]['alignedWords'][-1].pop('end')
            if change == 'partial-verse-list': damaged['boundarySourceVerses'].append({'number': 5, 'text': 'More.'})
            self.assertEqual(recording_entry(self.receipt, damaged, sha)['alignmentStatus'], 'pending')

    def test_full_model_recipe_cannot_claim_a_small_or_turbo_only_run(self):
        from alignment_contract import DEEP_REVIEW_RECIPE, DEEP_RECOGNIZER, RECOGNIZERS
        artifact = {**self.artifact, 'qualityRecipe': DEEP_REVIEW_RECIPE,
                    'fingerprint': site_fingerprint('a' * 64, 'b' * 64, 'en', DEEP_REVIEW_RECIPE)}
        self.assertEqual(recording_entry(self.receipt, artifact, 'b' * 64)['alignmentStatus'], 'pending')
        artifact.update(recognizer=DEEP_RECOGNIZER, recognizerRevision=RECOGNIZERS[DEEP_RECOGNIZER],
                        fingerprint=site_fingerprint('a' * 64, 'b' * 64, 'en', DEEP_REVIEW_RECIPE,
                                                     DEEP_RECOGNIZER))
        self.assertEqual(recording_entry(self.receipt, artifact, 'b' * 64)['alignmentStatus'], 'aligned')

    def test_final_v8_reports_remain_valid_with_distinct_v9_fingerprints(self):
        from alignment_contract import PREVIOUS_QUALITY_RECIPE, PREVIOUS_SOURCE_REVIEW_RECIPE
        for recipe in [PREVIOUS_QUALITY_RECIPE, PREVIOUS_SOURCE_REVIEW_RECIPE]:
            fingerprint = site_fingerprint('a' * 64, 'b' * 64, 'en', recipe)
            self.assertNotEqual(fingerprint, self.artifact['fingerprint'])
            artifact = {**self.artifact, 'qualityRecipe': recipe, 'fingerprint': fingerprint}
            self.assertEqual(recording_entry(self.receipt, artifact, 'b' * 64)['alignmentStatus'], 'aligned')
            rejected = {**artifact, 'accepted': False, 'issues': ['text-audio-needs-review:4']}
            self.assertEqual(recording_entry(self.receipt, rejected, 'b' * 64)['alignmentStatus'],
                             'review-required')

    def test_preserves_verified_media_while_new_verification_is_in_progress(self):
        artifact = {**self.artifact}
        artifact.pop('qualityRecipe')
        artifact['fingerprint'] = site_fingerprint('a' * 64, 'b' * 64, 'en', LEGACY_QUALITY_RECIPE)
        result = recording_entry(self.receipt, artifact, 'b' * 64)
        self.assertEqual(result['alignmentStatus'], 'aligned')
