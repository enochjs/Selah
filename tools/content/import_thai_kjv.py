"""Import the eBible.org Thai KJV VPL archive without rewriting verse text."""
import argparse
from hashlib import sha256
import json
from pathlib import Path
from xml.etree import ElementTree
from zipfile import ZipFile

from site_resources import USFM, write_json


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('archive', type=Path)
    args = parser.parse_args()
    content = Path(__file__).resolve().parents[2] / 'packages/content/data'
    canon = json.loads((content / 'bible.json').read_text())
    books = dict(zip(USFM, canon, strict=True))
    chapters = {
        book['id']: [{} for _ in book['chapters']] for book in books.values()
    }
    references = set()
    with ZipFile(args.archive) as archive:
        xml = ElementTree.fromstring(archive.read('thaKJV_vpl.xml'))
    for row in xml:
        code = row.attrib['b']
        chapter = int(row.attrib['c'])
        verse = int(row.attrib['v'])
        book = chapters[books[code]['id']]
        reference = (code, chapter, verse)
        # The VPL XML adds a trailing separator space to each verse.
        text = (row.text or '').removesuffix(' ')
        if (
            row.tag != 'v' or len(row) or not text.strip()
            or not 1 <= chapter <= len(book) or verse < 1 or reference in references
        ):
            raise ValueError(f'Invalid Thai KJV verse: {reference}')
        references.add(reference)
        book[chapter - 1][verse] = text

    parallel_references = {
        (code, chapter, verse['number'])
        for code, book in books.items()
        for chapter, verses in enumerate(book['chapters'], 1)
        for verse in verses
    }
    if (
        len(references) != 31_102
        or references - parallel_references != {('JHN', 7, 53)}
        or parallel_references - references != {('1CH', 21, 31), ('3JN', 1, 15)}
        or not all(chapter for book in chapters.values() for chapter in book)
    ):
        raise ValueError('Thai KJV coverage differs from the verified verse references')

    write_json(content / 'thai-kjv.json', {
        'version': {'id': 'tha-kjv', 'language': 'th', 'label': 'ภาษาไทย · KJV'},
        'name': 'พระคัมภีร์ภาษาไทยฉบับ KJV',
        'attribution': 'Thai KJV Bible · © 2003 Philip Pope',
        'license': 'CC BY-NC-ND 4.0',
        'licenseUrl': 'https://creativecommons.org/licenses/by-nc-nd/4.0/',
        'textSource': 'https://ebible.org/details.php?id=thaKJV',
        'archiveUrl': 'https://ebible.org/Scriptures/thaKJV_vpl.zip',
        'archiveSha256': sha256(args.archive.read_bytes()).hexdigest(),
        'books': chapters,
    })


if __name__ == '__main__':
    main()
