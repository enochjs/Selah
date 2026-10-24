"""Create exact, independently loopable MP3s from verified verse intervals."""
import hashlib
import json
import math
import subprocess
import tempfile
from pathlib import Path

from media_assets import file_sha256
from alignment_contract import CLIP_PROFILE


def create_verse_files(audio, segments, media_root, cache_path):
    previous_end = 0
    numbers = set()
    for number, start, end in segments:
        if (number in numbers or not all(math.isfinite(t) for t in (start, end))
                or not 0 <= previous_end <= start < end):
            raise ValueError('Invalid or overlapping verse intervals')
        numbers.add(number)
        previous_end = end
    if not segments:
        return []
    media_root = Path(media_root)
    cache_path = Path(cache_path)
    fingerprint = hashlib.sha256(json.dumps(
        [CLIP_PROFILE, file_sha256(audio), segments], separators=(',', ':')
    ).encode()).hexdigest()
    if cache_path.is_file():
        cached = json.loads(cache_path.read_text())
        if cached.get('fingerprint') == fingerprint and all(
            (media_root / (item['sha256'] + '.mp3')).is_file()
            and file_sha256(media_root / (item['sha256'] + '.mp3')) == item['sha256']
            for item in cached['files']
        ):
            return cached['files']
    media_root.mkdir(parents=True, exist_ok=True)
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='verse-clips-', dir=cache_path.parent) as directory:
        staging = Path(directory)
        count = len(segments)
        filters = ([f'[0:a]asplit={count}' + ''.join(f'[v{i}]' for i in range(count))]
                   if count > 1 else [])
        for i, (_, start, end) in enumerate(segments):
            source = f'v{i}' if count > 1 else '0:a'
            filters.append(f'[{source}]atrim=start={start}:end={end},asetpts=PTS-STARTPTS[out{i}]')
        command = ['ffmpeg', '-v', 'error', '-nostdin', '-y', '-i', str(audio),
                   '-filter_complex_threads', '1', '-filter_complex', ';'.join(filters)]
        for i in range(count):
            command.extend(['-map', f'[out{i}]', '-map_metadata', '-1', '-ac', '1',
                            '-ar', '24000', '-c:a', 'libmp3lame', '-b:a', '64k',
                            '-threads', '1', '-write_xing', '1', str(staging / f'{i}.mp3')])
        subprocess.run(command, check=True, capture_output=True, timeout=300)
        files = []
        for i, (number, start, end) in enumerate(segments):
            temporary = staging / f'{i}.mp3'
            sha = file_sha256(temporary)
            target = media_root / (sha + '.mp3')
            temporary.replace(target)
            files.append({'verse': number, 'path': '/api/audio/resources/' + target.name,
                          'duration': round(end - start, 3), 'sha256': sha,
                          'sourceStart': start, 'sourceEnd': end})
    temporary = cache_path.with_suffix('.tmp')
    temporary.write_text(json.dumps({'profile': CLIP_PROFILE, 'fingerprint': fingerprint,
                                     'files': files}, separators=(',', ':')) + '\n')
    temporary.replace(cache_path)
    return files
