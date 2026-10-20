import sys
import unittest
import copy
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from provider_resources import flatten_content, provider_segments, verse_audio_reference, validate_verse_files, assert_legacy_catalog, merged_verse_aliases, verified_local_timing, canonical_text_sha256


class ProviderResourceTests(unittest.TestCase):
    def timing_fixture(self):
        verses=[{'number':1,'text':'God is light.'}]
        audit={'key':'leviticus:19:en','mediaSha256':'a'*64,'recognizer':'Systran/faster-whisper-small','globalNormalizedErrorRate':0,'checks':[{'verse':1,'start':1.,'end':3.,'printedText':'God is light.','normalizedErrorRate':0}], 'boundaryDbfs':[-60,-61]}
        override={'schemaVersion':1,'key':'leviticus:19:en','translationId':'BSB','reader':'Barry Hays',
                  'method':'ctc-forced-alignment','model':{'id':'facebook/wav2vec2-base-960h','revision':'22aad52d435eb6dbaf354bdad9b0da84ce7d6156'},
                  'mediaSha256':'a'*64,'textSha256':canonical_text_sha256(verses),
                  'quality':{'accepted':True},'unclaimedSpeech':[],
                  'segments':[{'verse':1,'start':1.,'end':3.,'score':-.2,'cer':0.}]}
        return verses,audit,override

    def test_only_publishes_verified_timing_for_the_exact_audio_and_text(self):
        verses,audit,override=self.timing_fixture()
        self.assertEqual(verified_local_timing(override,'leviticus:19:en','a'*64,verses,5,audit),[[1,1.,3.]])
        self.assertIsNone(verified_local_timing(override,'leviticus:19:en','b'*64,verses,5,audit))
        self.assertIsNone(verified_local_timing(override,'leviticus:19:en','a'*64,[{'number':1,'text':'Different words.'}],5,audit))
        self.assertIsNone(verified_local_timing(override,'leviticus:18:en','a'*64,verses,5,audit))

    def test_rejects_incomplete_or_unreliable_independent_checks(self):
        verses,audit,override=self.timing_fixture()
        for invalid in ({**audit,'checks':[]},{**audit,'globalNormalizedErrorRate':.2},{**audit,'boundaryDbfs':[-20,-60]}, {**audit,'mediaSha256':'b'*64}):
            with self.subTest(audit=invalid):self.assertIsNone(verified_local_timing(override,'leviticus:19:en','a'*64,verses,5,invalid))
        invalid=copy.deepcopy(override);invalid['segments'][0]['end']=7
        self.assertIsNone(verified_local_timing(invalid,'leviticus:19:en','a'*64,verses,5,audit))

    def test_merged_verse_markers_are_resolved_to_the_actual_scripture(self):
        self.assertEqual(merged_verse_aliases({6:'〔6～8〕',7:'〔6～8〕',8:'万物都服在他的脚下。'}), {6:8,7:8})
        with self.assertRaises(ValueError): merged_verse_aliases({6:'〔6～8〕'})
    def test_legacy_jobs_cannot_replace_a_paired_provider_catalog(self):
        assert_legacy_catalog({'genesis:1:en':{'originalPath':'/api/audio/bible/niv/Genesis/Genesis1.mp3'}})
        with self.assertRaisesRegex(ValueError,'provider'):
            assert_legacy_catalog({'genesis:1:en':{'provider':'ao-bsb'}})
    def test_keeps_text_but_excludes_footnote_and_heading_metadata(self):
        self.assertEqual(flatten_content(['God said,', {'noteId': 1}, {'text': 'Let there be light.', 'wordsOfJesus': True}, {'lineBreak': True}, 'And there was light.']), 'God said, Let there be light.\nAnd there was light.')

    def test_maps_provider_starts_to_canonical_verses_not_array_positions(self):
        self.assertEqual(provider_segments([1, 2, 3, 5], [2, 4, 6, 9], 12), [[1, 2, 4], [2, 4, 6], [3, 6, 9], [5, 9, 12]])

    def test_rejects_missing_nonmonotonic_or_out_of_bounds_timing(self):
        for starts in ([1], [1, 1], [2, 1], [-1, 2], [1, 12], [1, float('nan')]):
            with self.subTest(starts=starts), self.assertRaises(ValueError):
                provider_segments([1, 2], starts, 10)

    def test_only_accepts_published_verse_file_names(self):
        self.assertEqual(verse_audio_reference('8_1/CUVs_8_1_14.mp3', 8), (1, 14))
        for name in ('../CUVs_8_1_14.mp3', '8_1/CUVs_9_1_14.mp3', '8_2/CUVs_8_1_14.mp3', '8_1/CUVs_8_0_1.mp3'):
            with self.subTest(name=name), self.assertRaises(ValueError):
                verse_audio_reference(name, 8)

    def test_requires_exact_verse_file_coverage(self):
        files = [{'verse': 1, 'path': '/api/audio/resources/'+'a'*64+'.mp3', 'duration': 4}, {'verse': 3, 'path': '/api/audio/resources/'+'b'*64+'.mp3', 'duration': 8}]
        validate_verse_files([1, 3], files)
        for invalid in (files[:1], files+files[:1], files[::-1], [dict(files[0], duration=0),files[1]]):
            with self.subTest(invalid=invalid), self.assertRaises(ValueError):
                validate_verse_files([1, 3], invalid)


if __name__ == '__main__': unittest.main()
