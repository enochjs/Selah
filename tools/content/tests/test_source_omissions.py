import copy
import hashlib
import importlib.util
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
from urllib.error import HTTPError

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def chapter_html(book='Acts', chapter=8, last=40, missing=(37,), edition='NIV', extra=''):
    verses = ''.join(
        f'<span class="text {book}-{chapter}-{verse}" id="en-{edition}-{verse}">'
        f'<sup class="versenum">{verse}</sup>Spoken verse {verse}.</span>'
        for verse in range(1, last + 1) if verse not in missing)
    return ('<!doctype html><html><body>'
            f'<div class="passage-col passage-col-mobile version-{edition}" data-translation="{edition}">'
            '<h1 class="passage-display">Reference</h1><div class="passage-text">'
            f'<div class="passage-content"><div class="version-{edition} text-html">'
            f'<p>{verses}</p>{extra}</div></div></div></div></body></html>')


def evidence(html, key='acts:8:en', book='Acts', present=None, last=40):
    numbers = list(range(1, last + 1))
    present = [n for n in numbers if n != 37] if present is None else present
    return {
        'schemaVersion': 1, 'edition': 'NIV', 'key': key,
        'bookId': key.split(':')[0], 'chapter': int(key.split(':')[1]),
        'url': f'https://www.biblegateway.com/passage/?search={book}%20{key.split(":")[1]}&version=NIV',
        'sha256': hashlib.sha256(html.encode('utf-8')).hexdigest(), 'rawHtml': html,
        'fetchedAt': '2026-10-25T00:00:00+00:00',
        'presentVerseNumbers': present,
        'missingVerseNumbers': sorted(set(numbers) - set(present)),
    }


class SourceOmissionsTests(unittest.TestCase):
    def test_numbered_book_reference_does_not_claim_a_present_niv_verse_is_missing(self):
        m=self.module();html=chapter_html(book='3John',chapter=1,last=15,missing=())
        e=evidence(html,key='3-john:1:en',book='3%20John',present=list(range(1,16)),last=15)
        verses=[dict(number=i,text='Spoken verse.') for i in range(1,16)]
        self.assertTrue(m.validate_niv_evidence(e,'3-john:1:en',verses))
        self.assertEqual(m.niv_missing_numbers(e,'3-john:1:en',verses),[])

    def test_proverbs_headings_reference_still_requires_complete_same_edition_body(self):
        m=self.module();raw=chapter_html(book='Prov',chapter=24,last=34,missing=())
        e=evidence(raw,key='proverbs:24:en',book='Proverbs',present=list(range(1,35)),last=34)
        verses=[dict(number=i,text='Original imported text stays unchanged.') for i in range(1,35)]
        self.assertTrue(m.validate_niv_evidence(e,'proverbs:24:en',verses))
        self.assertEqual(m.niv_missing_numbers(e,'proverbs:24:en',verses),[])
        self.assertFalse(m.validate_niv_evidence(e,'proverbs:32:en',verses))

    def module(self):
        self.assertIsNotNone(importlib.util.find_spec('source_omissions'))
        import source_omissions
        return source_omissions

    def verses(self, last=40):
        return [{'number': n, 'text': f'Canonical source verse {n}'} for n in range(1, last + 1)]

    def test_only_main_body_ids_prove_absent_sections_and_complete_raw_html_is_retained(self):
        m = self.module()
        appendix = ''.join(
            f'<div class="{container}"><p><span class="text Acts-8-37">Footnote-only verse.</span>'
            '<span class="text John-1-1">Unrelated citation.</span></p></div>'
            for container in ['footnotes', 'crossrefs', 'publisher-info', 'resources-section'])
        raw = chapter_html(extra=appendix)
        result = evidence(raw)
        self.assertTrue(m.validate_niv_evidence(result, 'acts:8:en', self.verses()))
        self.assertEqual(m.niv_missing_numbers(result, 'acts:8:en', self.verses()), [37])
        self.assertIn('Footnote-only verse.', result['rawHtml'])
        self.assertEqual(result['sha256'], hashlib.sha256(raw.encode()).hexdigest())

    def test_wrong_edition_and_spoofed_niv_column_are_rejected(self):
        m = self.module()
        documents = [chapter_html(edition='KJV'),
                     chapter_html().replace('data-translation="NIV"', 'data-translation="KJV"'),
                     chapter_html().replace('class="version-NIV text-html"', 'class="version-KJV text-html"')]
        for html in documents:
            with self.subTest(html=html[:100]):
                self.assertFalse(m.validate_niv_evidence(evidence(html), 'acts:8:en', self.verses()))

    def test_cross_chapter_cross_book_or_multiple_passage_bodies_are_rejected(self):
        m = self.module()
        for html in [chapter_html().replace('Acts-8-20', 'Acts-9-20'),
                     chapter_html().replace('Acts-8-20', 'John-8-20'),
                     chapter_html() + chapter_html()]:
            self.assertFalse(m.validate_niv_evidence(evidence(html), 'acts:8:en', self.verses()))

    def test_first_last_empty_verse_and_unclosed_body_are_not_complete_evidence(self):
        m = self.module()
        for html in [chapter_html(last=39), chapter_html(missing=(1, 37)),
                     chapter_html().split('</p>')[0],
                     chapter_html().replace('Spoken verse 40.', ''),
                     chapter_html().replace('Acts-8-40', 'Acts-8-41')]:
            self.assertFalse(m.validate_niv_evidence(evidence(html), 'acts:8:en', self.verses()))

    def test_section_identifiers_in_headings_hidden_markup_and_superscripts_do_not_fill_missing_verse(self):
        m = self.module()
        extra = ('<h3><span class="text Acts-8-37">Heading reference</span></h3>'
                 '<div hidden><span class="text Acts-8-37">Hidden reference</span></div>'
                 '<sup><span class="text Acts-8-37">Note reference</span></sup>')
        self.assertTrue(m.validate_niv_evidence(evidence(chapter_html(extra=extra)), 'acts:8:en', self.verses()))

    def test_evidence_metadata_digest_and_derived_lists_are_revalidated(self):
        m = self.module()
        original = evidence(chapter_html())
        changes = {'edition': 'KJV', 'bookId': 'john', 'chapter': 9, 'key': 'acts:9:en',
                   'url': 'https://example.test/passage/?search=Acts%208&version=NIV',
                   'sha256': '0' * 64, 'presentVerseNumbers': list(range(1, 41)),
                   'missingVerseNumbers': [], 'fetchedAt': 'not-a-timestamp', 'schemaVersion': 2}
        for field, value in changes.items():
            changed = copy.deepcopy(original)
            changed[field] = value
            with self.subTest(field=field):
                self.assertFalse(m.validate_niv_evidence(changed, 'acts:8:en', self.verses()))
                with self.assertRaises(ValueError):
                    m.niv_missing_numbers(changed, 'acts:8:en', self.verses())
        self.assertFalse(m.validate_niv_evidence(original, 'acts:8:zh', self.verses()))
        self.assertFalse(m.validate_niv_evidence(original, 'acts:8:en', self.verses()[1:]))

    def test_complete_chapter_with_no_absence_is_valid_and_returns_empty_list(self):
        m = self.module()
        result = evidence(chapter_html(missing=()), present=list(range(1, 41)))
        self.assertEqual(m.niv_missing_numbers(result, 'acts:8:en', self.verses()), [])

    def test_exact_book_mappings_accept_only_their_own_niv_body_ids(self):
        m = self.module()
        cases = [('matthew', 'Matthew', 'Matt', 17, 27, [21]),
                 ('mark', 'Mark', 'Mark', 9, 50, [44, 46]),
                 ('luke', 'Luke', 'Luke', 17, 37, [36]),
                 ('john', 'John', 'John', 5, 47, [4]),
                 ('romans', 'Romans', 'Rom', 16, 27, [24])]
        for book_id, search, body, chapter, last, missing in cases:
            with self.subTest(book=book_id):
                key = f'{book_id}:{chapter}:en'
                present = [number for number in range(1, last + 1) if number not in missing]
                html = chapter_html(book=body, chapter=chapter, last=last, missing=missing)
                result = evidence(html, key=key, book=search, present=present, last=last)
                self.assertEqual(m.niv_missing_numbers(result, key, self.verses(last)), missing)
                changed = html.replace(f'{body}-{chapter}-1', f'Acts-{chapter}-1')
                result = evidence(changed, key=key, book=search, present=present, last=last)
                self.assertFalse(m.validate_niv_evidence(result, key, self.verses(last)))

    def test_http_rejection_creates_no_evidence(self):
        m = self.module()
        url = 'https://www.biblegateway.com/passage/?search=Acts%208&version=NIV'
        with tempfile.TemporaryDirectory() as folder, patch.object(
                m, 'urlopen', side_effect=HTTPError(url, 403, 'Forbidden', {}, None)):
            with self.assertRaises(HTTPError):
                m.fetch_niv_reference(Path(folder), 'acts:8:en', self.verses())
            self.assertEqual(list(Path(folder).rglob('*')), [])

    def test_fetch_caches_exact_response_and_refuses_modified_cache(self):
        m = self.module()
        raw = chapter_html().encode('utf-8')
        class Response:
            status = 200
            url = 'https://www.biblegateway.com/passage/?search=Acts%208&version=NIV'
            headers = {'Content-Type': 'text/html; charset=utf-8'}
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def read(self): return raw
        with tempfile.TemporaryDirectory() as folder, patch.object(m, 'urlopen', return_value=Response()) as request:
            result = m.fetch_niv_reference(Path(folder), 'acts:8:en', self.verses())
            self.assertEqual(result['rawHtml'].encode('utf-8'), raw)
            self.assertEqual(m.niv_missing_numbers(result, 'acts:8:en', self.verses()), [37])
            self.assertEqual(m.fetch_niv_reference(Path(folder), 'acts:8:en', self.verses()), result)
            self.assertEqual(request.call_count, 1)
            cached = Path(folder) / 'source-omissions/niv/acts-8.html'
            self.assertEqual(cached.read_bytes(), raw)
            cached.write_bytes(raw + b' altered')
            with self.assertRaises(ValueError):
                m.fetch_niv_reference(Path(folder), 'acts:8:en', self.verses())
            self.assertEqual(request.call_count, 1)

    def test_fetch_rejects_chinese_unknown_books_and_external_redirects(self):
        m = self.module()
        with tempfile.TemporaryDirectory() as folder, patch.object(m, 'urlopen') as request:
            for key in ['acts:8:zh', 'act:8:en', 'acts:0:en', 'romans:17:en']:
                with self.assertRaises(ValueError):
                    m.fetch_niv_reference(Path(folder), key, self.verses())
            request.assert_not_called()
        class Response:
            status = 200
            url = 'https://example.test/passage/?search=Acts%208&version=NIV'
            headers = {'Content-Type': 'text/html'}
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def read(self): return chapter_html().encode()
        with tempfile.TemporaryDirectory() as folder, patch.object(m, 'urlopen', return_value=Response()):
            with self.assertRaises(ValueError):
                m.fetch_niv_reference(Path(folder), 'acts:8:en', self.verses())
            self.assertEqual(list(Path(folder).rglob('*.html')), [])


if __name__ == '__main__':
    unittest.main()


class NehemiahReferenceTests(unittest.TestCase):
    def test_complete_same_edition_nehemiah_chapter_is_available_for_source_fragment_verification(self):
        from source_omissions import validate_niv_evidence
        raw=chapter_html(book='Neh',chapter=7,last=73,missing=())
        e=evidence(raw,key='nehemiah:7:en',book='Nehemiah',present=list(range(1,74)),last=73)
        self.assertTrue(validate_niv_evidence(e,'nehemiah:7:en',[dict(number=v,text='Original imported text') for v in range(1,74)]))
