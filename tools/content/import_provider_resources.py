"""Import openly licensed, matching text/audio sets; publish only complete imports.

English: BSB / Barry Hays, with AO Lab's reader-specific published timings.
Chinese: Unique Bible App CUVs text and its individually published verse MP3s.
No ASR timing is inferred for the Chinese verse files.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
import fcntl
import hashlib
import html
import io
import json
import math
import os
from pathlib import Path
import re
import sqlite3
import tempfile
import time
import urllib.error
import urllib.request
import zipfile

from mutagen.mp3 import MP3
from forced_alignment import file_sha256
from provider_resources import flatten_content, provider_segments, verse_audio_reference, validate_verse_files, merged_verse_aliases, verified_local_timing

ROOT = Path(__file__).resolve().parents[2]
RESOURCE_ROOT = ROOT/'storage/resources'
AUDIO_REVISION = '7b61c12e0d60b14ae1f7ca2c69a12488f8fb1861'
TEXT_REVISION = 'cb28d569bd6e6405c67f4616966c7ad568a620a1'
AUDIO_REPO = 'eliranwong/MP3_ChineseUnionVersion_mandarin'
TEXT_REPO = 'otseng/UniqueBible_Bibles'
AO_URL = 'https://bible.helloao.org/api/BSB/complete.json'


def atomic_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(data,ensure_ascii=False,separators=(',',':'))+'\n')
    temporary.replace(path)


def download(url, target):
    if target.is_file() and target.stat().st_size:
        return target
    target.parent.mkdir(parents=True, exist_ok=True)
    for attempt in range(4):
        try:
            request = urllib.request.Request(url, headers={'User-Agent':'SelahBible-resource-import/1.0'})
            with urllib.request.urlopen(request,timeout=60) as response, open(target.with_suffix('.part'),'wb') as output:
                while chunk := response.read(1024*1024): output.write(chunk)
            target.with_suffix('.part').replace(target)
            return target
        except (OSError, urllib.error.URLError):
            if attempt == 3: raise
            time.sleep(min(2**attempt, 4))


def store_media(data=None, source=None):
    digest = hashlib.sha256(data).hexdigest() if data is not None else file_sha256(source)
    target = RESOURCE_ROOT/'media'/f'{digest}.mp3'
    target.parent.mkdir(parents=True, exist_ok=True)
    if not target.exists():
        temporary = None
        try:
            if source:
                os.link(source,target)
            else:
                with tempfile.NamedTemporaryFile(dir=target.parent,delete=False) as output:
                    output.write(data); temporary=Path(output.name)
                os.link(temporary,target)
        except FileExistsError:
            pass
        finally:
            if temporary: temporary.unlink(missing_ok=True)
    if file_sha256(target) != digest: raise ValueError(f'Damaged media: {target}')
    return '/api/audio/resources/'+target.name, digest


def plain_cuv(text):
    text = re.sub(r'<[^>]+>', '', text)
    return html.unescape(text).strip()


def supplement_local_timing(recording, key, verses):
    if recording['timingQuality']=='provider-timing': return recording
    recording={**recording,'segments':[],'timingQuality':'unaligned','alignmentStatus':'review-required',
               'alignmentIssues':['provider-timing-unavailable']}
    recording.pop('timingSupplement',None)
    path=RESOURCE_ROOT/'timing-overrides'/(key.replace(':','__')+'.json')
    if not path.is_file(): return recording
    override=json.loads(path.read_text())
    name=override.get('auditFile','')
    if not re.fullmatch(r'[a-z0-9-]+\.json',name): return recording
    audit_path=RESOURCE_ROOT/'audits'/name
    if not audit_path.is_file() or file_sha256(audit_path)!=override.get('auditSha256'): return recording
    media=RESOURCE_ROOT/'media'/recording['path'].rsplit('/',1)[-1]
    if not media.is_file() or file_sha256(media)!=recording['mediaSha256']: return recording
    audit=json.loads(audit_path.read_text())
    segments=verified_local_timing(override,key,recording['mediaSha256'],verses,recording['duration'],audit)
    if segments:
        recording.update(segments=segments,timingQuality='forced-alignment',alignmentStatus='aligned',alignmentIssues=[],
                         timingSupplement={'method':override['method'],'model':override['model'],
                                           'textSha256':override['textSha256'],'mediaSha256':recording['mediaSha256'],
                                           'artifactSha256':file_sha256(path),'auditSha256':override['auditSha256'],
                                           'source':'local-verified-supplement'})
    return recording


def import_english(bsb, legacy):
    def chapter_job(book, chapter, old_book):
        number = chapter['chapter']['number']
        key = f"{old_book['id']}:{number}:en"
        verses = {v['number']:flatten_content(v['content']) for v in chapter['chapter']['content'] if v['type']=='verse'}
        numbers = list(verses)
        url = chapter['thisChapterAudioLinks']['hays']
        if not url.startswith('https://audio.bible.helloao.org/api/BSB/'):
            raise ValueError(f'Unexpected audio URL: {url}')
        cached = RESOURCE_ROOT/'cache/bsb'/f"{book['id']}-{number}-hays.mp3"
        download(url,cached)
        duration = round(MP3(cached).info.length, 6)
        path, digest = store_media(source=cached)
        starts = chapter['thisChapterAudioTimings'].get('hays')
        recording = {'path':path,'duration':duration,'segments':[], 'timingQuality':'unaligned',
                     'alignmentStatus':'review-required','alignmentIssues':['provider-timing-unavailable'],
                     'provider':'ao-bsb','translationId':'BSB','reader':'Barry Hays','voiceType':'human',
                     'sourceUrl':url,'mediaSha256':digest}
        if starts is not None:
            recording.update(segments=provider_segments(numbers,starts,duration),
                             timingQuality='provider-timing',alignmentStatus='aligned',alignmentIssues=[])
        else:
            # Keep the source's actual coverage honest. Currently LEV 19 has no
            # published timing for any reader; it remains chapter-only.
            print(f'Review: {key}: no published provider timing',flush=True)
        atomic_json(RESOURCE_ROOT/'chapters'/f"{old_book['id']}__{number}__en.json",recording)
        return key,recording,verses

    result = {}
    with ThreadPoolExecutor(max_workers=6) as pool:
        futures = [pool.submit(chapter_job,b,c,legacy[b['order']-1]) for b in bsb['books'] for c in b['chapters']]
        for i,future in enumerate(as_completed(futures),1):
            key,recording,verses = future.result(); result[key]=(recording,verses)
            if i%25 == 0 or i==1189: print(f'English audio: {i}/1189',flush=True)
    return result


def import_chinese(legacy):
    url = f'https://raw.githubusercontent.com/{TEXT_REPO}/{TEXT_REVISION}/CUVs.bible.zip'
    archive = download(url, RESOURCE_ROOT/'cache'/f'CUVs-{TEXT_REVISION}.zip')
    with zipfile.ZipFile(archive) as z:
        database = RESOURCE_ROOT/'cache'/f'CUVs-{TEXT_REVISION}.bible'
        database.write_bytes(z.read('CUVs.bible'))
    with sqlite3.connect(database) as connection:
        rows = connection.execute('SELECT Book, Chapter, Verse, Scripture FROM Verses ORDER BY Book,Chapter,Verse').fetchall()
    text = {}
    for book,chapter,verse,scripture in rows:
        key = f"{legacy[book-1]['id']}:{chapter}:zh"
        text.setdefault(key,{})[verse] = plain_cuv(scripture)
    listing_url = f'https://api.github.com/repos/{AUDIO_REPO}/git/trees/{AUDIO_REVISION}'
    listing = download(listing_url,RESOURCE_ROOT/'cache'/f'zh-tree-{AUDIO_REVISION}.json')
    tree = json.loads(listing.read_text())['tree']
    archives = [v['path'] for v in tree if re.fullmatch(r'\d\d_.+\.zip',v['path'])]
    if len(archives) != 66: raise ValueError('Chinese audio must contain all 66 books')

    def book_job(name):
        book_number = int(name[:2]); book_id = legacy[book_number-1]['id']
        url = f'https://raw.githubusercontent.com/{AUDIO_REPO}/{AUDIO_REVISION}/{name}'
        archive = download(url,RESOURCE_ROOT/'cache/zh'/name)
        archive_digest = file_sha256(archive)
        chapters = {}; seen = set()
        with zipfile.ZipFile(archive) as z:
            for entry in z.infolist():
                if entry.is_dir(): continue
                if entry.filename.startswith('__MACOSX/') or entry.filename.endswith('.DS_Store'): continue
                chapter,verse = verse_audio_reference(entry.filename,book_number)
                if (chapter,verse) in seen: raise ValueError(f'Duplicate verse file: {entry.filename}')
                seen.add((chapter,verse))
                data = z.read(entry)
                duration = round(MP3(io.BytesIO(data)).info.length,6)
                if not math.isfinite(duration) or duration <= 0: raise ValueError(entry.filename)
                path,digest = store_media(data=data)
                chapters.setdefault(chapter,[]).append({'verse':verse,'path':path,'duration':duration,'sha256':digest})
        result = {}
        if sorted(chapters) != list(range(1,len(legacy[book_number-1]['chapters'])+1)):
            raise ValueError(f'Incomplete Chinese book: {book_id}')
        for chapter,files in chapters.items():
            key = f'{book_id}:{chapter}:zh'; files.sort(key=lambda f:f['verse'])
            validate_verse_files(list(text[key]),files)
            aliases = merged_verse_aliases(text[key])
            scripture = {n:t for n,t in text[key].items() if n not in aliases}
            files = [f for f in files if f['verse'] not in aliases]
            for f in files:
                covered = sorted([n for n,target in aliases.items() if target==f['verse']]+[f['verse']])
                if len(covered)>1:f['coveredVerses']=covered
            validate_verse_files(list(scripture),files)
            recording = {'path':files[0]['path'],'duration':round(sum(f['duration'] for f in files),6),
                         'segments':[],'verseFiles':files,'verseAliases':aliases,'timingQuality':'verse-file','alignmentStatus':'aligned',
                         'alignmentIssues':[], 'provider':'uba-cuv','translationId':'CUVs','voiceType':'synthetic',
                         'reader':'Unique Bible App · Mandarin TTS','sourceUrl':url,'sourceRevision':AUDIO_REVISION,
                         'archiveSha256':archive_digest}
            atomic_json(RESOURCE_ROOT/'chapters'/f'{book_id}__{chapter}__zh.json',recording)
            result[key]=(recording,scripture)
        return result

    result = {}
    with ThreadPoolExecutor(max_workers=4) as pool:
        futures = [pool.submit(book_job,name) for name in archives]
        for i,future in enumerate(as_completed(futures),1):
            result.update(future.result())
            print(f'Chinese verse MP3s: {i}/66 books',flush=True)
    return result,{'textUrl':url,'textRevision':TEXT_REVISION,'textSha256':file_sha256(archive),
                   'audioUrl':f'https://github.com/{AUDIO_REPO}','audioRevision':AUDIO_REVISION}


def main():
    parser=argparse.ArgumentParser(); parser.add_argument('--locale',choices=['en','zh','all'],default='all')
    args=parser.parse_args()
    RESOURCE_ROOT.mkdir(exist_ok=True)
    with open(RESOURCE_ROOT/'.import.lock','a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        legacy=json.loads((ROOT/'packages/content/data/bible.json').read_text())
        bsb_path=download(AO_URL,RESOURCE_ROOT/'cache/BSB.json')
        bsb=json.loads(bsb_path.read_text())
        if [b['order'] for b in bsb['books']] != list(range(1,67)): raise ValueError('Invalid BSB book order')
        if bsb['translation']['id'] != 'BSB': raise ValueError('Unexpected translation')
        # Separate locale checkpoints allow download/validation to resume without
        # publishing a partial Bible into the application.
        if args.locale in ['en','all']:
            en=import_english(bsb,legacy); atomic_json(RESOURCE_ROOT/'english.json',en)
        if args.locale in ['zh','all']:
            zh,provenance=import_chinese(legacy); atomic_json(RESOURCE_ROOT/'chinese.json',zh)
            atomic_json(RESOURCE_ROOT/'chinese-source.json',provenance)
        if not all((RESOURCE_ROOT/f'{x}.json').exists() for x in ['english','chinese']): return
        en=json.loads((RESOURCE_ROOT/'english.json').read_text()); zh=json.loads((RESOURCE_ROOT/'chinese.json').read_text())
        if len(en)!=1189 or len(zh)!=1189: raise ValueError('Refusing incomplete resource publication')
        books=[];catalog={}
        for book in legacy:
            chapters=[]
            for chapter,old_verses in enumerate(book['chapters'],1):
                en_key=f"{book['id']}:{chapter}:en";zh_key=f"{book['id']}:{chapter}:zh"
                en_record,en_verses=en[en_key];zh_record,zh_verses=zh[zh_key]
                en_verses={int(n):t for n,t in en_verses.items()};zh_verses={int(n):t for n,t in zh_verses.items()}
                en_record=supplement_local_timing(en_record,en_key,[{'number':n,'text':t} for n,t in en_verses.items()])
                verses=[];old={v['number']:v for v in old_verses}
                for number in sorted(set(en_verses)|set(zh_verses)|set(old)):
                    v={'number':number,'en':en_verses.get(number,''),'zh':zh_verses.get(number,'')}
                    if not v['en']: v['enOmitted']=True
                    if not v['zh']:
                        target=zh_record.get('verseAliases',{}).get(str(number))
                        if target:v['zhMergedInto']=target
                        for field in ['zhMergedInto','zhMergedChapter']:
                            if not target and field in old.get(number,{}):v[field]=old[number][field]
                        if 'zhMergedInto' not in v: v['zhOmitted']=True
                    covered=next((f.get('coveredVerses') for f in zh_record['verseFiles'] if f['verse']==number),None)
                    if covered:v['zhMergedFrom']=covered
                    verses.append(v)
                chapters.append(verses);catalog[en_key]=en_record;catalog[zh_key]=zh_record
            books.append({**book,'chapters':chapters})
        aligned=sum(r['alignmentStatus']=='aligned' for r in catalog.values())
        manifest={'importedAt':datetime.now(timezone.utc).isoformat(),'resourceSet':'open-provider-v1',
                  'books':66,'chapters':1189,'recordings':2378,'alignedRecordings':aligned,'pendingRecordings':0,
                  'reviewRecordings':2378-aligned,'verseBoundaries':sum(len(r['segments'])+len(r.get('verseFiles',[])) for r in catalog.values()),
                  'chapterOnlyRecordings':[key for key,r in catalog.items() if r['alignmentStatus']!='aligned'],
                  'providerTimingRecordings':sum(r['timingQuality']=='provider-timing' for r in catalog.values()),
                  'localTimingRecordings':sum(bool(r.get('timingSupplement')) for r in catalog.values()),
                  'verseFileRecordings':len(zh), 'timingQuality':'provider-supplied timing / verified local acoustic supplement / independently published verse MP3s',
                  'mergedVerseReferences':sum(len(r.get('verseAliases',{})) for r in catalog.values()),
                  'versions':{'en':{'id':'BSB','name':'Berean Standard Bible','textSource':AO_URL,'textSha256':file_sha256(bsb_path),
                                     'audioSource':'https://bereanbible.com/audio/','reader':'Barry Hays','license':'CC0 1.0',
                                     'licenseUrl':'https://berean.bible/terms.htm'},
                              'zh':{'id':'CUVs','name':'和合本 · 上帝版（简体）','voiceType':'synthetic',
                                     **json.loads((RESOURCE_ROOT/'chinese-source.json').read_text()),
                                     'license':'Text: Public Domain; Audio: CC BY 4.0',
                                     'attribution':'MP3 Bible – Chinese Union Version (Mandarin), Eliran Wong / Unique Bible App. Unmodified verse MP3s. CC BY 4.0.',
                                     'licenseUrl':'https://creativecommons.org/licenses/by/4.0/'}},
                  'timingProvider':{'name':'AO Lab Free Use Bible API','url':'https://bible.helloao.org/docs/reference/translations/standard.html'}}
        (ROOT/'storage/alignment').mkdir(exist_ok=True)
        with open(ROOT/'storage/alignment/.publish.lock','a') as publish_lock:
            fcntl.flock(publish_lock,fcntl.LOCK_EX)
            for name,data in [('bible.json',books),('chapter-audio.json',catalog),('resource-manifest.json',manifest)]:
                atomic_json(ROOT/'packages/content/data'/name,data)
        print(f'Published: {aligned}/2378 verse-playable chapters; {2378-aligned} chapter-only',flush=True)


if __name__=='__main__':main()
