import importlib.util
import copy
import hashlib
import json
import tempfile
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import align_site
from align_site import spoken_text, matching_text
from alignment_contract import METHOD, site_fingerprint, LEGACY_QUALITY_RECIPE


class SpokenTextTests(unittest.TestCase):
    @unittest.skipUnless(importlib.util.find_spec('nltk'), 'NLTK is installed in the alignment environment')
    def test_tokenizer_cache_is_private_even_with_a_group_writable_umask(self):
        with tempfile.TemporaryDirectory() as directory:
            snapshot = Path(directory)
            (snapshot / 'bible.json').write_text(json.dumps([{'chapters': [[{'en': 'God is good. He is kind.'}]]}]))
            target = snapshot / 'nltk_data/tokenizers/punkt_tab/english'
            target.mkdir(parents=True)
            target.chmod(0o775)
            try:
                align_site.prepare_tokenizer(snapshot)
            except PermissionError as error:
                self.fail('Tokenizer preparation must create its own private cache: ' + str(error))
            self.assertEqual(target.stat().st_mode & 0o077, 0)

    def test_keeps_parenthetical_explanations_that_the_reader_speaks(self):
        self.assertEqual(spoken_text('起名叫玛拉（玛拉就是苦的意思）。', 'zh'),
                         '起名叫玛拉（玛拉就是苦的意思）。')

    def test_excludes_editorial_variant_notes(self):
        self.assertEqual(spoken_text('也不以神为愚妄（或作也不妄评神）。', 'zh'),
                         '也不以神为愚妄。')

    def test_psalm_superscriptions_are_separate_from_spoken_verse_text(self):
        self.assertEqual(spoken_text('（大卫的诗。）耶和华是我的牧者。', 'zh'), '耶和华是我的牧者。')
        self.assertEqual(spoken_text('（神人摩西的祈祷。）主阿，你世世代代作我们的居所。', 'zh'),
                         '主阿，你世世代代作我们的居所。')

    def test_independent_retry_keeps_the_more_complete_transcript(self):
        self.assertTrue(hasattr(align_site, 'best_transcript'))
        text, error = align_site.best_transcript('God is my shepherd',
                                                ['God', 'God is my shepherd'], str.lower)
        self.assertEqual(text, 'God is my shepherd')
        self.assertEqual(error, 0)


@unittest.skipUnless(all(importlib.util.find_spec(name) for name in
                         ['opencc', 'pypinyin', 'cn2an', 'num2words']),
                     'Run with .venv-align/bin/python for language normalization')
class ChapterHeadingTests(unittest.TestCase):
    def test_acoustic_recovery_is_reserved_for_missing_speech_not_another_name_spelling(self):
        self.assertTrue(hasattr(align_site, 'recovery_needed'))
        check = {'text': 'He shut the door behind him', 'independentTranscript': 'He shut the door behind them',
                 'meanAlignmentScore': .9, 'wordCount': 6, 'timedWordCount': 6}
        window = {'start': 1, 'end': 6}
        self.assertFalse(align_site.recovery_needed(window, check, 'en', lambda text: text))
        truncated = {**check, 'independentTranscript': 'He shut the door'}
        self.assertTrue(align_site.recovery_needed(window, truncated, 'en', lambda text: text))
        self.assertTrue(align_site.recovery_needed({'start': None, 'end': None}, None, 'en', lambda text: text))

    def test_early_number_only_heading_requires_the_current_chapter_and_no_scripture(self):
        book = {'id': 'genesis', 'en': 'Genesis', 'zh': '创世纪',
                'chapters': [[{'en': 'God is good.'}]] * 10}
        gap = {'kind': 'leading', 'start': 0, 'end': .8, 'text': '10.'}
        self.assertTrue(align_site.is_chapter_heading(gap, book, 10, 'en'))
        self.assertFalse(align_site.is_chapter_heading({**gap, 'text': '9.'}, book, 10, 'en'))
        self.assertFalse(align_site.is_chapter_heading({**gap, 'end': 20}, book, 10, 'en'))
        self.assertFalse(align_site.is_chapter_heading({**gap, 'text': '10. God spoke'}, book, 10, 'en'))
        book['chapters'][9] = [{'en': 'Ten men came to the city.'}]
        self.assertFalse(align_site.is_chapter_heading(gap, book, 10, 'en'))

    def heading(self, text, locale, chapter=26, **changes):
        gap = {'kind': 'leading', 'start': 0, 'end': 4, 'text': text, **changes}
        book = {'en': '1 Chronicles', 'zh': '申命记'}
        self.assertTrue(hasattr(align_site, 'is_chapter_heading'),
                        'Chapter announcements must be checked independently of scripture')
        return align_site.is_chapter_heading(gap, book, chapter, locale)

    def test_accepts_a_chapter_announcement_without_repeating_the_book_title(self):
        self.assertTrue(self.heading('Chapter 26.', 'en'))
        self.assertTrue(self.heading('Chapter twenty-six.', 'en'))
        self.assertTrue(self.heading('第26章', 'zh'))
        self.assertTrue(self.heading('CHAPTER XXVI', 'en'))
        self.assertFalse(self.heading('CHAPTER XXV', 'en'))
        self.assertFalse(self.heading('CHAPTER XXVI God spoke to Moses', 'en'))

    def test_understands_spelled_ordinal_book_names(self):
        self.assertTrue(self.heading('First Chronicles. Chapter 26.', 'en'))

    def test_accepts_small_recognition_errors_in_chinese_book_titles(self):
        self.assertTrue(self.heading('生命祭，第二十六章。', 'zh'))

    def test_never_treats_missing_scripture_as_a_heading(self):
        self.assertFalse(self.heading('Chapter 26. God spoke to Moses.', 'en'))
        self.assertFalse(self.heading('申命记第二十六章，摩西说', 'zh'))
        self.assertFalse(self.heading('Chapter 25', 'en'))
        self.assertFalse(self.heading('Chapter 26', 'en', kind='between-verses'))
        self.assertFalse(self.heading('Chapter 26', 'en', end=80))

    def test_normalizes_written_numbers_and_chinese_numerals_equally(self):
        self.assertEqual(matching_text('一百三十七岁', 'zh'), matching_text('137岁', 'zh'))

    def test_spoken_book_title_is_not_mistaken_for_the_start_of_the_first_verse(self):
        self.assertTrue(hasattr(align_site, 'heading_word_count'))
        words = [{'word': word, 'start': i, 'end': i + .5} for i, word in enumerate(
            ['First', 'Samuel.', 'Chapter', '1.', 'Samuel', 'said', 'to', 'Saul.'])]
        self.assertEqual(align_site.heading_word_count(words, {'en': '1 Samuel'}, 1, 'en'), 4)

    def test_psalm_superscription_must_match_the_current_chapters_source(self):
        book = {'id': 'psalms', 'en': 'Psalms', 'zh': '诗篇',
                'chapters': [[{'zh': '（大卫的诗。）耶和华是我的牧者。'}]]}
        gap = {'kind': 'leading', 'end': 4, 'text': 'Psalm 1 A Psalm of David'}
        self.assertTrue(align_site.is_chapter_heading(gap, book, 1, 'en'))
        self.assertFalse(align_site.is_chapter_heading({**gap, 'text': 'Psalm 1 A Psalm of Asaph'}, book, 1, 'en'))
        self.assertFalse(align_site.is_chapter_heading(
            {**gap, 'text': 'Psalm 1 A Psalm of David The Lord is my shepherd'}, book, 1, 'en'))

    def test_rechecks_complete_cached_acoustic_evidence_without_loosening_the_threshold(self):
        self.assertTrue(hasattr(align_site, 'recheck_heading_artifact'))
        verses = [{'number': 1, 'text': 'God is good.'}]
        sha = hashlib.sha256(json.dumps(verses, ensure_ascii=False, sort_keys=True).encode()).hexdigest()
        receipt = {'key': 'exodus:20:en', 'locale': 'en', 'chapter': 20, 'sha256': 'a' * 64}
        artifact = {'method': METHOD, 'key': receipt['key'], 'sourceAudioSha256': 'a' * 64,
                    'textSha256': sha, 'duration': 10, 'accepted': False,
                    'recognizer': 'Systran/faster-whisper-small',
                    'fingerprint': site_fingerprint('a' * 64, sha, 'en', LEGACY_QUALITY_RECIPE),
                    'issues': ['unclaimed-narration:leading'],
                    'unclaimedSpeech': [{'kind': 'leading', 'text': 'Chapter 20', 'end': 2}],
                    'checks': [{'verse': 1, 'text': 'God is good.', 'independentTranscript': 'God is good.',
                                'meanAlignmentScore': .9, 'wordCount': 3, 'timedWordCount': 3}],
                    'cues': [{'verse': 1, 'text': 'God is good.', 'start': 3, 'end': 6}]}
        book = {'en': 'Exodus', 'zh': '出埃及记'}
        reviewed = align_site.recheck_heading_artifact(artifact, receipt, book, verses)
        self.assertTrue(reviewed['accepted'])
        self.assertEqual(reviewed['cues'], artifact['cues'])
        self.assertFalse(artifact['accepted'])
        for change in [{'sourceAudioSha256': 'b' * 64}, {'cues': []},
                       {'recognizerRevision': 'unrecognized-model'}, {'unclaimedSpeech': []},
                       {'cues': [{'verse': 1, 'text': 'God is good.', 'start': 3, 'end': 3.1}]},
                       {'issues': ['unclaimed-narration:leading', 'text-audio-needs-review:1']},
                       {'unclaimedSpeech': [{'kind': 'leading', 'text': 'Chapter 20. God said more.', 'end': 2}]}]:
            with self.subTest(change=change):
                self.assertIsNone(align_site.recheck_heading_artifact({**artifact, **change}, receipt, book, verses))
        bad = copy.deepcopy(artifact)
        bad['checks'][0]['independentTranscript'] = 'God is bad.'
        self.assertIsNone(align_site.recheck_heading_artifact(bad, receipt, book, verses))
        misheard = copy.deepcopy(artifact)
        misheard['unclaimedSpeech'][0].update(text='Unrecognized title', start=0)
        heard = {0: {'text': 'Chapter 20', 'range': [0, 2]}}
        reviewed = align_site.recheck_heading_artifact(misheard, receipt, book, verses, heard)
        self.assertTrue(reviewed['accepted'])
        self.assertEqual(reviewed['unclaimedSpeech'][0]['independentHeadingTranscript'], 'Chapter 20')
        self.assertIsNone(align_site.recheck_heading_artifact(misheard, receipt, book, verses,
                          {0: {'text': 'Chapter 20', 'range': [1, 2]}}))
        self.assertIsNone(align_site.recheck_heading_artifact(misheard, receipt, book, verses,
                          {0: {'text': 'Chapter 20. God spoke more.', 'range': [0, 2]}}))


@unittest.skipUnless(importlib.util.find_spec('cmudict'), 'Install alignment language dependencies')
class EnglishPronunciationTests(unittest.TestCase):
    def test_strict_gap_verification_never_removes_word_boundaries(self):
        aligner = align_site.SiteAligner.__new__(align_site.SiteAligner)
        aligner.locale = 'en'
        aligner.normalize = lambda text: text.replace(' ', '')
        self.assertFalse(aligner.exact_correspondence('the rapist', 'therapist'))

    def test_exact_homophones_can_verify_an_independent_transcript(self):
        self.assertTrue(hasattr(align_site, 'same_english_pronunciation'))
        self.assertTrue(align_site.same_english_pronunciation('Cain spoke.', 'Kane spoke.'))
        self.assertTrue(align_site.same_english_pronunciation('The cymbals sounded.', 'The symbols sounded.'))

    def test_different_pronouns_negation_word_boundaries_and_unknown_names_remain_distinct(self):
        self.assertTrue(hasattr(align_site, 'same_english_pronunciation'))
        for reference, transcript in [('behind him', 'behind them'), ('God is good', 'God is not good'),
                                      ('Jegar Sahadutha', 'Jigar Sahadutha'), ('ice cream', 'I scream'),
                                      ('an ice', 'a nice'), ('a name', 'an aim'),
                                      ('can', "can't"), ('lead', 'led')]:
            with self.subTest(reference=reference, transcript=transcript):
                self.assertFalse(align_site.same_english_pronunciation(reference, transcript))


if __name__ == '__main__':
    unittest.main()
