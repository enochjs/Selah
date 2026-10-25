import hashlib
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


class SourceMetadataTests(unittest.TestCase):
    def module(self):
        self.assertIsNotNone(importlib.util.find_spec('source_metadata'),
                             'Source metadata must be verified separately from verse text')
        import source_metadata
        return source_metadata

    def html(self, title, chapter=81, version='NIV'):
        return (f'<div class="passage-col version-{version}" data-translation="{version}">'
                f'<h4><span class="text Ps-{chapter}-1">{title}</span></h4>'
                f'<p><span class="text Ps-{chapter}-1"><sup class="versenum">1</sup>'
                'Sing for joy to God our strength.</span></p></div>')

    def test_only_extracts_the_heading_not_footnotes_or_first_verse(self):
        m = self.module()
        html = self.html('For the director of music. According to <i>gittith.</i>'
                         '<sup class="footnote">[<a href="#note">a</a>]</sup> Of Asaph.')
        self.assertEqual(m.extract_psalm_captions(html, 81, 81),
                         {81: 'For the director of music. According to gittith. Of Asaph.'})

    def test_wrong_translation_or_chapter_is_not_a_reference(self):
        m = self.module()
        with self.assertRaises(ValueError):
            m.extract_psalm_captions(self.html('A Psalm of David.', version='KJV'), 81, 81)
        with self.assertRaises(ValueError):
            m.extract_psalm_captions(self.html('A Psalm of David.', chapter=82), 81, 81)

    def test_verse_numbered_content_and_later_headings_are_never_captions(self):
        m = self.module()
        html = self.html('<sup class="versenum">1</sup>Sing for joy to God our strength.')
        self.assertEqual(m.extract_psalm_captions(html, 81, 81), {})
        html = self.html('A Psalm of David.').replace('</div>',
               '<h4><span class="text Ps-81-1">Lost scripture.</span></h4></div>')
        self.assertEqual(m.extract_psalm_captions(html, 81, 81), {81: 'A Psalm of David.'})

    def test_all_introductory_blocks_must_be_preserved(self):
        m = self.module()
        html = self.html('A Psalm of David.').replace('<p>',
               '<h4><span class="text Ps-81-1">When he fled.</span></h4><p>')
        self.assertEqual(m.extract_psalm_captions(html, 81, 81),
                         {81: 'A Psalm of David. When he fled.'})

    def test_book_division_range_is_not_part_of_a_psalm_caption(self):
        m = self.module()
        html = self.html('For the director of music.').replace(
            '<h4>', '<h4><span class="text Ps-81-1">Psalms 81–100</span></h4><h4>', 1)
        self.assertEqual(m.extract_psalm_captions(html, 81, 81), {81: 'For the director of music.'})

    def test_overlapping_passage_columns_are_not_combined(self):
        m = self.module()
        html = self.html('A Psalm of David.') + self.html('Different caption.')
        with self.assertRaises(ValueError):
            m.extract_psalm_captions(html, 81, 81)

    def test_pinned_manifest_and_document_hashes_are_both_required(self):
        m = self.module()
        with tempfile.TemporaryDirectory() as directory:
            snapshot = Path(directory)
            folder = snapshot / 'caption-references/niv'
            folder.mkdir(parents=True)
            html = self.html('A Psalm of David.').encode()
            (folder / 'psalms-081-081.html').write_bytes(html)
            manifest = {'version': 'NIV', 'book': 'psalms', 'documents': [{
                'file': 'psalms-081-081.html', 'sha256': hashlib.sha256(html).hexdigest(),
                'url': 'https://www.biblegateway.com/passage/?search=Psalm%2081&version=NIV',
                'firstChapter': 81, 'lastChapter': 81}]}
            raw = json.dumps(manifest).encode()
            (folder / 'manifest.json').write_bytes(raw)
            sha = hashlib.sha256(raw).hexdigest()
            self.assertEqual(m.load_psalm_captions(snapshot, sha)[81]['text'], 'A Psalm of David.')
            with self.assertRaises(ValueError):
                m.load_psalm_captions(snapshot, '0' * 64)
            (folder / 'psalms-081-081.html').write_text(self.html('Hidden extra text.'))
            with self.assertRaises(ValueError):
                m.load_psalm_captions(snapshot, sha)

    def test_optional_reference_absence_does_not_change_existing_verse_content(self):
        m = self.module()
        with tempfile.TemporaryDirectory() as directory:
            self.assertEqual(m.load_psalm_captions(Path(directory)), {})
            with self.assertRaises(ValueError):
                m.load_psalm_captions(Path(directory), required=True)


if __name__ == '__main__':
    unittest.main()
