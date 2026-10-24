"""Adapters for the current public Chinese and English Bible website."""
import json
from pathlib import Path
import re

SITE = 'https://chineseandenglishbible.com'
USFM = ('GEN EXO LEV NUM DEU JOS JDG RUT 1SA 2SA 1KI 2KI 1CH 2CH EZR NEH EST JOB PSA '
        'PRO ECC SNG ISA JER LAM EZK DAN HOS JOL AMO OBA JON MIC NAM HAB ZEP HAG ZEC MAL '
        'MAT MRK LUK JHN ACT ROM 1CO 2CO GAL EPH PHP COL 1TH 2TH 1TI 2TI TIT PHM HEB '
        'JAS 1PE 2PE 1JN 2JN 3JN JUD REV').split()
# BibleGateway identifiers used by the website, not inferred from file names.
AUDIO_PREFIXES = dict(zip(USFM, (
    'Gen Exod Lev Num Deut Josh Judg Ruth 1Sam 2Sam 1Kgs 2Kgs 1Chr 2Chr Ezra Neh Esth Job Ps '
    'Prov Eccl Song Isa Jer Lam Ezek Dan Hos Joel Amos Obad Jonah Mic Nah Hab Zeph Hag Zech Mal '
    'Matt Mark Luke John Acts Rom 1Cor 2Cor Gal Eph Phil Col 1Thess 2Thess 1Tim 2Tim Titus '
    'Phlm Heb Jas 1Pet 2Pet 1John 2John 3John Jude Rev').split()))


def stable_book_id(source_id):
    return 'song-of-solomon' if source_id == 'song-of-songs' else source_id


def recording_url(book, chapter, locale, audio_index):
    if not 1 <= chapter <= book['chapters']:
        raise ValueError('Chapter outside book')
    if locale == 'zh':
        return f"https://wordproaudio.org/bibles/app/audio/4/{book['index']}/{chapter}.mp3"
    if locale != 'en':
        raise ValueError('Unsupported audio language')
    digest = audio_index[book['id']][str(chapter)]
    if not re.fullmatch('[a-f0-9]{32}', digest):
        raise ValueError('Invalid source audio identifier')
    prefix = AUDIO_PREFIXES[USFM[book['index'] - 1]]
    return f'https://stream.biblegateway.com/bibles/32/niv-dramatized/{prefix}.{chapter}.{digest}.mp3'


def book_content(book, english, chinese):
    for data in [english, chinese]:
        if data['id'] != book['id'] or len(data['chapters']) != book['chapters']:
            raise ValueError('Source book or chapter count differs')
    chapters = []
    for en, zh in zip(english['chapters'], chinese['chapters']):
        chapter = []
        for index in range(max(len(en), len(zh))):
            verse = {'number': index + 1, 'en': en[index] if index < len(en) else '',
                     'zh': zh[index] if index < len(zh) else ''}
            if not verse['en'].strip():
                verse['enOmitted'] = True
            if not verse['zh'].strip():
                previous = next((v for v in reversed(chapter) if v['zh'].strip()), None)
                if previous:
                    verse['zhMergedInto'] = previous['number']
                else:
                    verse['zhOmitted'] = True
            chapter.append(verse)
        chapters.append(chapter)
    return {'id': stable_book_id(book['id']), 'en': book['nameEn'], 'zh': book['nameZh'],
            'testament': 'old' if book['testament'] == 'OT' else 'new', 'chapters': chapters}


def write_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(value, ensure_ascii=False, separators=(',', ':')) + '\n')
    temporary.replace(path)
