"""Import canonical NIV/CUV text and verified acoustic alignment artifacts.
The old ASR .timing.json files are deliberately never read.
"""
import argparse, concurrent.futures, json, os, re, subprocess
from pathlib import Path
from urllib.parse import quote
from forced_alignment import MODELS, alignment_fingerprint, file_sha256
from publish_alignment import apply_artifact, update_manifest
from provider_resources import assert_legacy_catalog
ROOT = Path(__file__).resolve().parents[2]

def normalize_verses(verses):
    grouped={}
    for verse in verses:
        canonical_id=re.fullmatch(r'[A-Z0-9]+\.\d+\.(\d+)',verse.get('id',''))
        number=int(canonical_id.group(1)) if canonical_id else verse['number']
        text=verse.get('text','').strip()
        grouped[number]=(grouped.get(number,'')+'\n'+text).strip()
    return [{'number':number,'text':text} for number,text in sorted(grouped.items())]

def read_json(path): return json.loads(path.read_text(encoding='utf-8-sig'))
def write_json(path, value):
    temporary=path.with_suffix('.tmp')
    temporary.write_text(json.dumps(value,ensure_ascii=False,separators=(',',':'))+'\n')
    temporary.replace(path)

def import_resources(source):
    assert_legacy_catalog(read_json(ROOT/'packages/content/data/chapter-audio.json'))
    source=source.resolve();text_root=source/'assets/books';audio_root=source/'assets/mp3'
    if not text_root.is_dir() or not audio_root.is_dir(): raise ValueError('Resource project needs assets/books and assets/mp3')
    previous=read_json(ROOT/'packages/content/data/bible.json')
    stable_ids=[b['id'] for b in previous]
    corrections=read_json(ROOT/'packages/content/data/text-corrections.json')
    texts={};book_lists={}
    for locale,version in [('en','niv'),('zh','和合本')]:
        book_lists[locale]=sorted(read_json(text_root/version/'books.json'),key=lambda b:b['bookId'])
        chapters={}
        for path in (text_root/version).rglob('*.json'):
            data=read_json(path)
            if isinstance(data,dict) and 'verses' in data:
                chapters[(data['book']['code'].upper(),data['chapter'])]=(path,data)
        assert len(chapters)==1189, f'{version}: missing text chapters'
        texts[locale]=chapters
    books=[];jobs=[]
    for index,en_book in enumerate(book_lists['en']):
        zh_book=book_lists['zh'][index];bid=stable_ids[index];chapters=[]
        for ch in range(1,en_book['bookChapterMaxNumber']+1):
            loaded={lang:texts[lang][(en_book['bookUsfm'],ch)] for lang in ['en','zh']}
            vm={lang:{v['number']:v['text'] for v in normalize_verses(loaded[lang][1]['verses'])} for lang in loaded}
            for lang in vm:
                for number, text in vm[lang].items():
                    correction=corrections.get(f'{bid}:{ch}:{lang}:{number}')
                    if correction:
                        if text != correction['originalText']: raise ValueError(f'Source text changed; recheck correction {bid}:{ch}:{lang}:{number}')
                        vm[lang][number]=correction['text']
            verses=[];previous_zh=1;previous_en=1
            for number in sorted(set(vm['en'])|set(vm['zh'])):
                verse={'number':number,'en':vm['en'].get(number,''),'zh':vm['zh'].get(number,'')}
                if not verse['en']:
                    if number in vm['en']:verse['enOmitted']=True
                    else:verse['enMergedInto']={'chapter':ch,'verse':previous_en}
                else:previous_en=number
                if not verse['zh']:verse['zhMergedInto']=previous_zh
                else:previous_zh=number
                verses.append(verse)
            chapters.append(verses)
            for lang,version in [('en','niv'),('zh','和合本')]:
                text_path,raw_chapter=loaded[lang]
                audio_path=audio_root/version/text_path.parent.name/(text_path.stem+'.mp3')
                jobs.append((bid,ch,lang,version,audio_path,[{'number':n,'text':t} for n,t in vm[lang].items()]))
        books.append({'id':bid,'en':previous[index]['en'],'zh':zh_book['bookName'],'testament':'old' if index<39 else 'new','chapters':chapters})
    catalog={};missing=[]
    def prepare(job):
        bid,ch,lang,version,path,verses=job
        if not path.is_file():return f'{bid}:{ch}:{lang}',None
        key=f'{bid}:{ch}:{lang}'
        duration=float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',str(path)]))
        normalized=[v for v in normalize_verses(verses) if v['text'].strip()]
        fingerprint=alignment_fingerprint(file_sha256(path),normalized,lang,MODELS[lang][1])
        artifact_path=ROOT/'storage/alignment/chapters'/(key.replace(':','__')+'.json')
        artifact=read_json(artifact_path) if artifact_path.is_file() else None
        relative=path.relative_to(audio_root/version)
        url='/api/audio/bible/'+('niv' if lang=='en' else 'cuv')+'/'+ '/'.join(quote(part,safe='') for part in relative.parts)
        recording={'path':url,'originalPath':url,'originalDuration':round(duration,3),'duration':round(duration,3),'segments':[],'timingQuality':'unaligned','alignmentStatus':'pending'}
        return key,apply_artifact(recording,artifact,fingerprint,normalized,lang,ROOT/'storage/alignment')
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        for n,(key,value) in enumerate(pool.map(prepare,jobs),1):
            if value:catalog[key]=value
            else:missing.append(key)
            if n%300==0:print(f'Prepared {n}/{len(jobs)} chapter recordings',flush=True)
    if missing:raise ValueError(f'Missing MP3 resources: {missing[:20]} ({len(missing)} total)')
    import fcntl
    directory=ROOT/'storage/alignment';directory.mkdir(exist_ok=True)
    with open(directory/'.publish.lock','a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX)
        assert_legacy_catalog(read_json(ROOT/'packages/content/data/chapter-audio.json'))
        write_json(ROOT/'packages/content/data/bible.json',books)
        write_json(ROOT/'packages/content/data/chapter-audio.json',catalog)
        manifest={'sourceProject':'enochjs/bible','textSource':'assets/books','audioSource':'assets/mp3','versions':{'en':{'id':'niv','name':'New International Version'},'zh':{'id':'cunps','name':'新标点和合本'}},'books':len(books),'chapters':sum(len(b['chapters']) for b in books)}
        update_manifest(catalog,manifest)
        write_json(ROOT/'packages/content/data/resource-manifest.json',manifest)
    from publish_alignment import publish
    publish(sorted((directory/'chapters').glob('*.json')))
    print(json.dumps(manifest,ensure_ascii=False,indent=2),flush=True)

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('source',type=Path,nargs='?',default=os.environ.get('BIBLE_RESOURCE_ROOT'));args=parser.parse_args()
    if args.source is None:parser.error('Provide the source project path or BIBLE_RESOURCE_ROOT')
    import_resources(Path(args.source))
