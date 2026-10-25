"""Pinned NIV caption evidence; never a replacement for the imported verses."""
import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import re
from urllib.parse import parse_qs, quote, urlsplit
from urllib.request import Request, urlopen

from alignment_contract import PSALM_CAPTION_REFERENCE_SHA256
from site_resources import write_json


class CaptionParser(HTMLParser):
    def __init__(self, first, last):
        super().__init__(convert_charrefs=True)
        self.first, self.last = first, last
        self.stack, self.caption = [], None
        self.seen_niv, self.body_chapters, self.result = False, set(), {}
        self.scope, self.result_scopes = 0, {}

    def handle_starttag(self, tag, attributes):
        attributes = dict(attributes)
        classes = attributes.get('class', '').split()
        niv = self.stack[-1]['niv'] if self.stack else False
        if tag == 'div' and 'passage-col' in classes:
            niv = attributes.get('data-translation') == 'NIV' and 'version-NIV' in classes
            self.seen_niv |= niv
            if niv:
                self.scope += 1
        match = re.search(r'\bPs-(\d+)-(\d+)\b', attributes.get('class', ''))
        reference = (int(match[1]), int(match[2])) if match else None
        frame = {'tag': tag, 'niv': niv, 'reference': reference}
        if tag not in {'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'}:
            self.stack.append(frame)
        if tag == 'h4' and niv:
            self.caption = {'depth': len(self.stack), 'chapters': set(), 'text': [], 'numbered': False}
        if self.caption and reference:
            if reference[1] != 1:
                self.caption['numbered'] = True
            self.caption['chapters'].add(reference[0])
        if niv and set(classes) & {'versenum', 'chapternum'}:
            if self.caption:
                self.caption['numbered'] = True
            ref = next((f['reference'] for f in reversed(self.stack) if f['reference']), None)
            if ref:
                self.body_chapters.add(ref[0])

    def handle_endtag(self, tag):
        index = next((i for i in range(len(self.stack) - 1, -1, -1) if self.stack[i]['tag'] == tag), None)
        if index is None:
            return
        if tag == 'h4' and self.caption and self.caption['depth'] == index + 1:
            heading = self.caption
            if len(heading['chapters']) == 1 and not heading['numbered']:
                chapter = next(iter(heading['chapters']))
                if not self.first <= chapter <= self.last:
                    raise ValueError('Caption belongs to another requested chapter')
                text = ' '.join(''.join(heading['text']).split())
                if re.fullmatch(r'Psalms?\s+\d+\s*[–—-]\s*\d+', text):
                    text = ''
                if chapter in self.result_scopes and self.result_scopes[chapter] != self.scope:
                    raise ValueError('Overlapping passage columns')
                if text and chapter not in self.body_chapters:
                    if chapter in self.result:
                        self.result[chapter] += ' ' + text
                    else:
                        self.result[chapter] = text
                        self.result_scopes[chapter] = self.scope
            self.caption = None
        del self.stack[index:]

    def handle_data(self, text):
        if self.caption and not any(f['tag'] in {'sup', 'script', 'style'} for f in self.stack):
            self.caption['text'].append(text)


def extract_psalm_captions(html, first, last):
    if not 1 <= first <= last <= 150:
        raise ValueError('Invalid Psalm range')
    parser = CaptionParser(first, last)
    parser.feed(html)
    parser.close()
    if not parser.seen_niv or parser.caption:
        raise ValueError('A complete NIV passage column is required')
    return parser.result


def validate_document_url(document):
    first, last = document['firstChapter'], document['lastChapter']
    parsed = urlsplit(document['url'])
    expected = f'Psalm {first}' if first == last else f'Psalm {first}-{last}'
    query = parse_qs(parsed.query)
    if (parsed.scheme != 'https' or parsed.netloc != 'www.biblegateway.com' or parsed.path != '/passage/'
            or query.get('version') != ['NIV'] or query.get('search') != [expected]
            or not 1 <= first <= last <= 150
            or not re.fullmatch(r'psalms-\d{3}-\d{3}\.html', document['file'])):
        raise ValueError('Unrecognized caption reference source')


def load_psalm_captions(snapshot, expected_sha=PSALM_CAPTION_REFERENCE_SHA256, required=False):
    folder = snapshot / 'caption-references/niv'
    manifest_path = folder / 'manifest.json'
    if not manifest_path.is_file():
        if required:
            raise ValueError('Download and pin the NIV caption references first')
        return {}
    raw = manifest_path.read_bytes()
    if hashlib.sha256(raw).hexdigest() != expected_sha:
        raise ValueError('Caption manifest differs from the pinned verification recipe')
    manifest = json.loads(raw)
    if manifest['version'] != 'NIV' or manifest['book'] != 'psalms':
        raise ValueError('Wrong caption reference edition or book')
    result = {}
    for document in manifest['documents']:
        validate_document_url(document)
        raw = (folder / document['file']).read_bytes()
        if hashlib.sha256(raw).hexdigest() != document['sha256']:
            raise ValueError('Caption reference HTTP snapshot was modified')
        for chapter, text in extract_psalm_captions(raw.decode('utf-8'), document['firstChapter'],
                                                  document['lastChapter']).items():
            if chapter in result:
                raise ValueError('Overlapping caption references')
            result[chapter] = {'text': text, 'url': document['url'], 'sha256': document['sha256']}
    return result


def fetch_references(snapshot):
    folder = snapshot / 'caption-references/niv'
    folder.mkdir(parents=True, exist_ok=True)
    def fetch(first):
        last = min(150, first + 9)
        name = f'psalms-{first:03}-{last:03}.html'
        url = 'https://www.biblegateway.com/passage/?search=' + quote(f'Psalm {first}-{last}') + '&version=NIV'
        path = folder / name
        receipt = path.with_suffix('.http.json')
        if path.is_file() and receipt.is_file():
            metadata = json.loads(receipt.read_text())
            raw = path.read_bytes()
            if metadata.get('url') != url or hashlib.sha256(raw).hexdigest() != metadata.get('sha256'):
                raise ValueError('Existing caption download does not match its HTTP receipt')
        else:
            with urlopen(Request(url, headers={'User-Agent': 'Selah resource verification/1.0'}), timeout=30) as response:
                if response.status != 200 or urlsplit(response.url).netloc != 'www.biblegateway.com':
                    raise ValueError('Unexpected caption HTTP response')
                raw = response.read()
            extract_psalm_captions(raw.decode('utf-8'), first, last)
            temporary = path.with_suffix('.tmp')
            temporary.write_bytes(raw)
            temporary.replace(path)
            write_json(receipt, {'url': url, 'sha256': hashlib.sha256(raw).hexdigest(),
                                 'fetchedAt': datetime.now(timezone.utc).isoformat()})
        print('NIV caption reference saved:', first, last, flush=True)
        return {'file': name, 'url': url, 'sha256': hashlib.sha256(raw).hexdigest(),
                'firstChapter': first, 'lastChapter': last}
    with ThreadPoolExecutor(max_workers=2) as pool:
        documents = list(pool.map(fetch, range(1, 151, 10)))
    write_json(folder / 'manifest.json', {'version': 'NIV', 'book': 'psalms', 'documents': documents})
    return hashlib.sha256((folder / 'manifest.json').read_bytes()).hexdigest()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--snapshot', type=Path, required=True)
    args = parser.parse_args()
    print('Caption manifest SHA-256:', fetch_references(args.snapshot.resolve()))
