"""Archive NIV passage-number absence evidence without changing canonical text.

This proves only which verse sections are absent from the official NIV body.
It is independent of ASR, does not establish acoustic boundaries, and must not
be used to replace the imported chapter text or to invent missing narration.
"""
from datetime import datetime, timezone
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import tempfile
from urllib.parse import quote
from urllib.request import Request, urlopen

# Exact stable repository IDs -> BibleGateway search name, body identifier, chapters.
_BOOKS = {
    'matthew': ('Matthew', 'Matt', 28),
    'mark': ('Mark', 'Mark', 16),
    'luke': ('Luke', 'Luke', 24),
    'john': ('John', 'John', 21),
    'acts': ('Acts', 'Acts', 28),
    'romans': ('Romans', 'Rom', 16),
    '3-john': ('3 John', '3John', 1),
    'proverbs': ('Proverbs', 'Prov', 31),
    'nehemiah': ('Nehemiah', 'Neh', 13),
}
_VOID = {'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link',
         'meta', 'param', 'source', 'track', 'wbr'}
_EXCLUDED_TAGS = {'script', 'style', 'sup', 'template', 'noscript', 'nav', 'aside',
                  'footer', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'}
_EXCLUDED_CLASSES = {'resources-section', 'resources-content', 'passage-display',
                     'chapternum', 'versenum', 'copyright-table', 'passage-copyright'}
_EXCLUDED_PREFIXES = ('footnote', 'crossref', 'publisher-info')
_REFERENCE = re.compile(r'([1-3]?[A-Za-z]+)-([1-9][0-9]*)-([1-9][0-9]*)\Z')


def _request(key, verses):
    if not isinstance(key, str) or not re.fullmatch(r'(?:[1-3]-)?[a-z]+:[1-9][0-9]*:en', key):
        raise ValueError('NIV source evidence requires an exact English chapter key')
    book_id, chapter, _ = key.split(':')
    chapter = int(chapter)
    if book_id not in _BOOKS or chapter > _BOOKS[book_id][2]:
        raise ValueError('Unsupported NIV evidence book or chapter')
    if not isinstance(verses, (list, tuple)) or not verses:
        raise ValueError('A complete canonical chapter is required')
    numbers = [verse.get('number') if isinstance(verse, dict) else verse for verse in verses]
    if (any(type(number) is not int for number in numbers)
            or numbers != list(range(1, len(numbers) + 1))):
        raise ValueError('Canonical verse numbers must contain the full ordered chapter from verse one')
    search_name, body_name, _ = _BOOKS[book_id]
    url = 'https://www.biblegateway.com/passage/?search=' + quote(f'{search_name} {chapter}') + '&version=NIV'
    return book_id, chapter, body_name, numbers, url


class _NivBodyParser(HTMLParser):
    def __init__(self, book, chapter):
        super().__init__(convert_charrefs=True)
        self.book, self.chapter = book, chapter
        self.stack = []
        self.columns = self.closed_columns = self.bodies = self.closed_bodies = 0
        self.present = set()
        self.order = []

    def handle_starttag(self, tag, attributes):
        attributes = dict(attributes)
        classes = set(attributes.get('class', '').split())
        parent = self.stack[-1] if self.stack else {}
        column = tag == 'div' and 'passage-col' in classes
        starts_column = column and 'version-NIV' in classes
        in_niv = parent.get('niv', False)
        if column:
            if in_niv:
                raise ValueError('Nested passage columns are not valid source evidence')
            in_niv = starts_column and attributes.get('data-translation') == 'NIV'
            if starts_column and not in_niv:
                raise ValueError('The passage column does not identify the NIV edition')
            if in_niv:
                self.columns += 1
        excluded = (parent.get('excluded', False) or tag in _EXCLUDED_TAGS
                    or bool(classes & _EXCLUDED_CLASSES) or 'hidden' in attributes
                    or attributes.get('aria-hidden') == 'true'
                    or bool(re.search(r'display\s*:\s*none|visibility\s*:\s*hidden',
                                      attributes.get('style', ''), re.I))
                    or any(token.startswith(_EXCLUDED_PREFIXES)
                           for token in classes | {attributes.get('id', '')}))
        if in_niv and not excluded and any(
                token.startswith('version-') and token != 'version-NIV' for token in classes):
            raise ValueError('A different edition is nested inside the NIV body')
        starts_body = in_niv and not excluded and 'passage-text' in classes
        if starts_body:
            if parent.get('body', False):
                raise ValueError('Nested NIV passage bodies are ambiguous')
            self.bodies += 1
        body = starts_body or parent.get('body', False)
        references = []
        if in_niv and body and not excluded and 'text' in classes:
            for token in classes:
                match = _REFERENCE.fullmatch(token)
                if match:
                    book, chapter, verse = match.groups()
                    if book != self.book or int(chapter) != self.chapter:
                        raise ValueError('NIV passage body includes a different book or chapter')
                    references.append(int(verse))
            self.order.extend(sorted(references))
        frame = {'tag': tag, 'niv': in_niv, 'body': body, 'excluded': excluded,
                 'column': starts_column, 'starts_body': starts_body,
                 'references': references, 'text': []}
        if tag not in _VOID:
            self.stack.append(frame)

    def handle_endtag(self, tag):
        index = next((i for i in range(len(self.stack) - 1, -1, -1)
                      if self.stack[i]['tag'] == tag), None)
        if index is None:
            return
        frames = self.stack[index:]
        if any(frame['column'] or frame['starts_body'] or frame['references'] for frame in frames[1:]):
            raise ValueError('NIV body contains an unclosed passage or verse section')
        frame = frames[0]
        if frame['references'] and ''.join(frame['text']).strip():
            self.present.update(frame['references'])
        if frame['column']:
            self.closed_columns += 1
        if frame['starts_body']:
            self.closed_bodies += 1
        del self.stack[index:]

    def handle_data(self, text):
        if not self.stack or self.stack[-1]['excluded']:
            return
        for frame in reversed(self.stack):
            if frame['references']:
                frame['text'].append(text)
                break

    def result(self, numbers):
        self.close()
        if (self.columns != 1 or self.closed_columns != 1 or self.bodies != 1
                or self.closed_bodies != 1 or not self.present or not self.order
                or self.order != sorted(self.order)
                or min(self.present) != 1 or max(self.present) != numbers[-1]
                or not self.present.issubset(set(numbers))):
            raise ValueError('One complete NIV chapter body with canonical first and last verses is required')
        return sorted(self.present)


def _present_numbers(raw_html, body_name, chapter, numbers):
    if not isinstance(raw_html, str):
        raise ValueError('Complete original NIV HTML is required')
    parser = _NivBodyParser(body_name, chapter)
    parser.feed(raw_html)
    return parser.result(numbers)


def _validate(evidence, key, verses):
    book_id, chapter, body_name, numbers, url = _request(key, verses)
    if (not isinstance(evidence, dict) or type(evidence.get('schemaVersion')) is not int
            or evidence['schemaVersion'] != 1 or evidence.get('edition') != 'NIV'
            or evidence.get('key') != key or evidence.get('bookId') != book_id
            or type(evidence.get('chapter')) is not int or evidence['chapter'] != chapter
            or evidence.get('url') != url):
        raise ValueError('NIV evidence identity or official source URL does not match the chapter')
    raw_html = evidence.get('rawHtml')
    if (not isinstance(raw_html, str)
            or hashlib.sha256(raw_html.encode('utf-8')).hexdigest() != evidence.get('sha256')):
        raise ValueError('The original NIV HTML differs from its HTTP snapshot digest')
    fetched_at = datetime.fromisoformat(evidence.get('fetchedAt', ''))
    if fetched_at.tzinfo is None:
        raise ValueError('NIV evidence needs its original HTTP fetch timestamp with timezone')
    present = _present_numbers(raw_html, body_name, chapter, numbers)
    missing = sorted(set(numbers) - set(present))
    if (evidence.get('presentVerseNumbers') != present or evidence.get('missingVerseNumbers') != missing
            or any(type(number) is not int for number in evidence.get('presentVerseNumbers', []))
            or any(type(number) is not int for number in evidence.get('missingVerseNumbers', []))):
        raise ValueError('NIV evidence verse lists differ from the archived original passage body')
    return missing


def validate_niv_evidence(evidence, key, verses):
    """Return whether the stored HTTP evidence proves section numbering for this chapter."""
    try:
        _validate(evidence, key, verses)
        return True
    except (ValueError, TypeError, KeyError, UnicodeError, OverflowError):
        return False


def niv_missing_numbers(evidence, key, verses):
    """Reparse valid evidence and return canonical IDs absent from the official body; otherwise raise."""
    if not validate_niv_evidence(evidence, key, verses):
        raise ValueError('Invalid or incomplete NIV section-absence evidence')
    return _validate(evidence, key, verses)


def _atomic_write(path, content):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(dir=path.parent, prefix=path.name + '.', suffix='.tmp', delete=False) as handle:
            temporary = Path(handle.name)
            handle.write(content)
        temporary.replace(path)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def fetch_niv_reference(snapshot, key, verses):
    """Fetch or validate an archived official NIV HTML response; network failures propagate.

    Return schemaVersion, edition, key, bookId, chapter, url, sha256, rawHtml,
    fetchedAt, presentVerseNumbers and missingVerseNumbers. Cache the unmodified
    UTF-8 response and its HTTP receipt under snapshot/source-omissions/niv/.
    Only the mapped English books are supported; unknown keys fail closed.
    """
    book_id, chapter, body_name, numbers, url = _request(key, verses)
    folder = Path(snapshot) / 'source-omissions' / 'niv'
    html_path = folder / f'{book_id}-{chapter}.html'
    receipt_path = html_path.with_suffix('.http.json')
    if html_path.exists() or receipt_path.exists():
        if not html_path.is_file() or not receipt_path.is_file():
            raise ValueError('Incomplete cached NIV HTTP evidence; preserve and inspect the snapshot')
        evidence = json.loads(receipt_path.read_text(encoding='utf-8'))
        if not isinstance(evidence, dict):
            raise ValueError('Invalid cached NIV HTTP receipt')
        evidence['rawHtml'] = html_path.read_bytes().decode('utf-8')
        if not validate_niv_evidence(evidence, key, verses):
            raise ValueError('Cached NIV HTTP evidence is invalid or has been modified')
        return evidence
    with urlopen(Request(url, headers={'User-Agent': 'Selah resource verification/1.0'}), timeout=30) as response:
        if (response.status != 200 or response.url != url
                or response.headers.get('Content-Type', '').split(';')[0].strip().lower() != 'text/html'):
            raise ValueError('Unexpected NIV source HTTP response or redirected URL')
        raw = response.read()
    raw_html = raw.decode('utf-8')
    present = _present_numbers(raw_html, body_name, chapter, numbers)
    evidence = {
        'schemaVersion': 1, 'edition': 'NIV', 'key': key, 'bookId': book_id, 'chapter': chapter,
        'url': url, 'sha256': hashlib.sha256(raw).hexdigest(), 'rawHtml': raw_html,
        'fetchedAt': datetime.now(timezone.utc).isoformat(), 'presentVerseNumbers': present,
        'missingVerseNumbers': sorted(set(numbers) - set(present)),
    }
    if not validate_niv_evidence(evidence, key, verses):
        raise ValueError('The downloaded NIV response is not complete chapter-number evidence')
    receipt = {name: value for name, value in evidence.items() if name != 'rawHtml'}
    _atomic_write(html_path, raw)
    _atomic_write(receipt_path, (json.dumps(receipt, ensure_ascii=False, indent=2) + '\n').encode('utf-8'))
    return evidence
