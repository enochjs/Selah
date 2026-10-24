import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from site_resources import recording_url, book_content, USFM, AUDIO_PREFIXES


class SiteResourceTests(unittest.TestCase):
    def test_uses_the_sites_exact_audio_identifiers(self):
        book = {'id': 'psalms', 'index': 19, 'chapters': 150}
        self.assertEqual(recording_url(book, 23, 'en', {'psalms': {'23': 'a' * 32}}),
                         'https://stream.biblegateway.com/bibles/32/niv-dramatized/Ps.23.' + 'a' * 32 + '.mp3')
        self.assertEqual(recording_url(book, 23, 'zh', {}),
                         'https://wordproaudio.org/bibles/app/audio/4/19/23.mp3')
        self.assertEqual(len(USFM), 66)
        self.assertEqual(len(AUDIO_PREFIXES), 66)
        with self.assertRaises(ValueError):
            recording_url(book, 151, 'en', {})

    def test_preserves_canonical_omitted_verses_and_stable_learning_identifiers(self):
        book = {'id': 'song-of-songs', 'chapters': 1, 'testament': 'OT',
                'nameEn': 'Song of Songs', 'nameZh': '雅歌'}
        data = book_content(book, {'id': book['id'], 'chapters': [['One', '', 'Three']]},
                            {'id': book['id'], 'chapters': [['一', '二', '三']]})
        self.assertEqual(data['id'], 'song-of-solomon')
        self.assertEqual(data['chapters'][0][1], {'number': 2, 'en': '', 'enOmitted': True, 'zh': '二'})
