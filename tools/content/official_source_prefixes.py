"""Recover an imported verse's missing spoken prefix from the same NIV verse ID.

Canonical text and old ASR clocks remain unchanged. A fixed source witness may
separate an incorrectly broad prefix clock from the preceding chapter title.
"""
import hashlib,json
from datetime import datetime
from urllib.parse import quote
from boundary_quality import finite
from quiet_gaps import digest
from timed_text import normalized
from verse_completion import _Fragments

SOURCE_BOOKS={'zechariah':('Zechariah','Zech',14)}
OFFICIAL_PREFIX_POLICY={'version':'registered-official-same-verse-spoken-prefix-v1',
 'base':'registered-truncated-source-window-recovery-v1','edition':'NIV',
 'reference':'fresh-full-HTTP-snapshot; exact-same-verse-prefix-plus-unchanged-canonical-body',
 'scope':'first-imported-verse-only; actual-prefix-audio-must-be-retained',
 'clocks':'original-gap-and-heading-unchanged; fixed-source-clock-refinement-not-fake-heading',
 'maximumClockDisplacementSeconds':1.,'outputs':'complete-original-source-inventory-and-vtt'}


def source_prefix_rules(base,receipt,materials,original,final):
    book,chapter,locale=base['key'].split(':');chapter=int(chapter)
    if locale!='en' or book not in SOURCE_BOOKS:raise ValueError('Unsupported same-edition prefix source')
    search,body,maximum=SOURCE_BOOKS[book]
    if not 1<=chapter<=maximum:raise ValueError('Invalid official source chapter')
    if not materials or len({m['file'] for m in materials})!=len(materials):raise ValueError('Need complete immutable HTTP review material')
    data={m['file']:m['utf8'] for m in materials};approved={m['file']:m['sha256'] for m in receipt['evidence']}
    def read(file):
        text=data[file]
        if hashlib.sha256(text.encode()).hexdigest()!=approved[file]:raise ValueError('Official source HTTP material changed')
        return text
    rules={};prefixes=receipt['sourcePrefixes']
    if len(prefixes)!=1:raise ValueError('Need one exact first-verse official prefix')
    for prefix in prefixes:
        v,i=prefix['verse'],prefix['gapIndex'];ref=prefix['reference'];meta=json.loads(read(ref['httpFile']));raw=read(ref['htmlFile'])
        url='https://www.biblegateway.com/passage/?search='+quote(f'{search} {chapter}')+'&version=NIV'
        if (meta['url']!=url or meta['finalUrl']!=url or meta['status']!=200 or datetime.fromisoformat(meta['fetchedAt']).tzinfo is None
            or meta['sha256']!=hashlib.sha256(raw.encode()).hexdigest() or meta['bytes']!=len(raw.encode())
            or meta['headers']['Content-Type'].split(';')[0].strip().lower()!='text/html'):
            raise ValueError('Wrong same-edition official source HTTP identity')
        parser=_Fragments(body,chapter);parser.feed(raw)
        if parser.result(base['expectedVerseNumbers'])!=base['expectedVerseNumbers']:raise ValueError('Need the complete official chapter body')
        canonical=next(t['text'] for t in base['boundarySourceVerses'] if t['number']==v);complete=' '.join(parser.fragments.get(v,[]))
        if (v!=base['expectedVerseNumbers'][0] or v not in original or not normalized(prefix['text'])
            or normalized(complete)!=normalized(prefix['text']+' '+canonical)):
            raise ValueError('Prefix is not the exact missing beginning of the same official verse')
        gaps=base['unclaimedSpeech']
        if type(i) is not int or not 0<=i<len(gaps):raise ValueError('Missing original source prefix clock')
        gap=gaps[i];lo,hi=prefix['sourceRange'];prior=prefix['precedingHeading'];j=prior['gapIndex']
        if type(j) is not int or not 0<=j<i:raise ValueError('Missing preceding original chapter heading')
        heading=gaps[j];voice_end=prior['voiceEnd'];cut=next(c for c in receipt['cuts'] if c['verse']==v and c['side']=='head')
        if (gap['kind']!='leading' or gap.get('allowedHeadingOrClosing') is not False or prefix['gapSha256']!=digest(gap)
            or normalized(gap['text'])!=normalized(prefix['text']) or not 0<=gap['start']<gap['end']<=original[v]['start']
            or prior['gapSha256']!=digest(heading) or heading.get('allowedHeadingOrClosing') is not True or heading['kind']!='leading'
            or normalized(heading['text'])!='chapter'+str(chapter) or abs(heading['end']-gap['start'])>.001
            or not all(finite(t) for t in [lo,hi,voice_end]) or not heading['start']<voice_end<=lo<hi<=original[v]['start']
            or max(abs(lo-gap['start']),abs(hi-gap['end']),abs(voice_end-heading['end']))>1.
            or cut['previousVoiceEnd']!=voice_end or cut['ownVoice'][0]!=lo or not hi<=cut['ownVoice'][1]
            or not final[v]['start']<=lo<hi<=final[v]['end']):
            raise ValueError('Original prefix clock, chapter-title separation, or retained source range differs')
        discarded=[gap['start'],final[v]['start']] if gap['start']<final[v]['start'] else []
        if prefix['discardedRawPrefixClock']!=discarded:raise ValueError('Old coarse prefix-clock exclusion was not explicitly preserved')
        rules[i]={'verse':v,'text':prefix['text'],'range':[lo,hi]}
    return rules
