"""Download fresh website books and the exact audio URLs used by its reader."""
import argparse
import concurrent.futures
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import time
import urllib.request

from site_resources import SITE, USFM, book_content, recording_url, stable_book_id, write_json
from media_assets import store_verified

ROOT = Path(__file__).resolve().parents[2]


def download(url, target):
    target.parent.mkdir(parents=True, exist_ok=True)
    receipt = target.with_suffix(target.suffix + '.http.json')
    if target.is_file() and receipt.is_file():
        info = json.loads(receipt.read_text())
        if hashlib.sha256(target.read_bytes()).hexdigest() == info['sha256']:
            return info
    for attempt in range(4):
        try:
            request = urllib.request.Request(url, headers={'User-Agent': 'Selah-resource-import/1.0'})
            temporary = target.with_suffix(target.suffix + '.part')
            with urllib.request.urlopen(request, timeout=45) as response, open(temporary, 'wb') as output:
                shutil.copyfileobj(response, output)
                info = {'url': url, 'etag': response.headers.get('ETag'),
                        'lastModified': response.headers.get('Last-Modified'),
                        'downloadedAt': datetime.now(timezone.utc).isoformat()}
            info.update(sha256=hashlib.sha256(temporary.read_bytes()).hexdigest(), size=temporary.stat().st_size)
            temporary.replace(target)
            write_json(receipt, info)
            return info
        except Exception:
            if attempt == 3:
                raise
            time.sleep(2 ** attempt)


def run(snapshot, workers=6):
    snapshot.mkdir(parents=True, exist_ok=True)
    download(SITE + '/bible/index.json', snapshot / 'index.json')
    download(SITE + '/niv-audio.json', snapshot / 'niv-audio.json')
    index = json.loads((snapshot / 'index.json').read_text())
    audio_index = json.loads((snapshot / 'niv-audio.json').read_text())
    if len(index) != 66 or sum(b['chapters'] for b in index) != 1189:
        raise ValueError('Invalid source book index')
    tasks = [(book, locale) for book in index for locale in ['en', 'zh']]

    def get_book(task):
        book, locale = task
        version = 'niv' if locale == 'en' else 'mandarin'
        path = snapshot / 'books' / version / (book['id'] + '.json')
        download(f"{SITE}/bible/{version}/{book['id']}.json", path)
        return task, json.loads(path.read_text())

    raw = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as pool:
        for (book, locale), data in pool.map(get_book, tasks):
            raw[(book['id'], locale)] = data
    books = [book_content(book, raw[(book['id'], 'en')], raw[(book['id'], 'zh')]) for book in index]
    write_json(snapshot / 'bible.json', books)
    jobs = [(book, chapter, locale) for book in index
            for chapter in range(1, book['chapters'] + 1) for locale in ['en', 'zh']]
    # Make the reported chapter available first for independent verification.
    jobs.sort(key=lambda job: (job[0]['id'] != 'psalms' or job[1] != 23, job[0]['index'], job[1]))
    media_root = ROOT / 'storage/resources/media'
    media_root.mkdir(parents=True, exist_ok=True)

    def get_audio(job):
        book, chapter, locale = job
        key = f"{stable_book_id(book['id'])}:{chapter}:{locale}"
        path = snapshot / 'audio' / (key.replace(':', '__') + '.mp3')
        info = download(recording_url(book, chapter, locale, audio_index), path)
        target = media_root / (info['sha256'] + '.mp3')
        store_verified(path, target, info['sha256'])
        duration = float(subprocess.check_output([
            'ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of',
            'default=noprint_wrappers=1:nokey=1', str(path)]))
        metadata = {**info, 'key': key, 'usfm': USFM[book['index'] - 1], 'chapter': chapter,
                    'locale': locale, 'duration': duration, 'path': '/api/audio/resources/' + target.name}
        write_json(snapshot / 'recordings' / (key.replace(':', '__') + '.json'), metadata)
        return key, metadata

    catalog = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as pool:
        futures = [pool.submit(get_audio, job) for job in jobs]
        for number, future in enumerate(concurrent.futures.as_completed(futures), 1):
            key, info = future.result()
            catalog[key] = info
            if number % 25 == 0 or number == len(jobs):
                status = {'completed': number, 'total': len(jobs), 'current': key,
                          'updatedAt': datetime.now(timezone.utc).isoformat()}
                write_json(snapshot / 'download-status.json', status)
                print(json.dumps(status), flush=True)
    write_json(snapshot / 'recordings.json', catalog)
    write_json(snapshot / 'download-complete.json', {'books': 66, 'chapters': 1189, 'recordings': len(catalog),
                                                  'source': SITE, 'completedAt': datetime.now(timezone.utc).isoformat()})


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--snapshot', type=Path, required=True)
    parser.add_argument('--workers', type=int, default=6)
    arguments = parser.parse_args()
    run(arguments.snapshot.resolve(), arguments.workers)
