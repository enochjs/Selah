"""Whisper recognition + WhisperX phoneme alignment of a fresh site snapshot.

Inputs are immutable HTTP downloads, not historical timing files. Outputs retain
recognition evidence, canonical WebVTT cues and independently loopable MP3s.
"""
import argparse
from datetime import datetime, timezone
from functools import partial
import hashlib
import json
import logging
import os
import fcntl
from pathlib import Path
import re
import time

from site_resources import write_json
from timed_text import normalized, recognition_windows, webvtt, narration_gaps
from verse_clips import create_verse_files
from media_assets import store_verified
from alignment_contract import METHOD, ALIGN_MODELS, ALIGN_REVISIONS, RECOGNIZER_REVISION, site_fingerprint

ROOT = Path(__file__).resolve().parents[2]


def prepare_tokenizer(snapshot):
    """Punkt is used only for sentences inside each already matched Bible verse."""
    os.environ.setdefault('NLTK_DATA', str(snapshot / 'nltk_data'))
    import nltk
    from nltk.tokenize.punkt import PunktTrainer, save_punkt_params
    target = snapshot / 'nltk_data/tokenizers/punkt_tab/english'
    with open(snapshot / '.tokenizer.lock', 'a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        if not (target / 'collocations.tab').is_file():
            books = json.loads((snapshot / 'bible.json').read_text())
            trainer = PunktTrainer()
            trainer.train(' '.join(v['en'] for b in books for chapter in b['chapters'] for v in chapter),
                          finalize=True)
            target.mkdir(parents=True, exist_ok=True)
            save_punkt_params(trainer.get_params(), dir=str(target))
    nltk.data.path.insert(0, str(snapshot / 'nltk_data'))


def spoken_text(text, locale):
    # Source typography/translation notes remain in the published reading text.
    if locale == 'zh':
        return re.sub(r'（[^（）]*）|\([^()]*\)', '', text).strip()
    # The site occasionally joins sentences without a space ("valley,I").
    return re.sub(r'([,;:!?])(?=[A-Za-z])', r'\1 ', text).strip()


def matching_text(text, locale):
    text = spoken_text(text, locale)
    if locale == 'zh':
        from opencc import OpenCC
        from pypinyin import lazy_pinyin
        text = ''.join(lazy_pinyin(OpenCC('t2s').convert(text)))
    else:
        from num2words import num2words
        text = re.sub(r'\d[\d,]*', lambda match: num2words(match.group().replace(',', '')), text)
    return normalized(text)


class SiteAligner:
    def __init__(self, locale, snapshot):
        os.environ.setdefault('NLTK_DATA', str(snapshot / 'nltk_data'))
        import nltk
        import torch
        from faster_whisper import WhisperModel
        from huggingface_hub import snapshot_download
        from whisperx.alignment import load_align_model
        nltk.data.path.insert(0, str(snapshot / 'nltk_data'))
        prepare_tokenizer(snapshot)
        self.locale = locale
        self.snapshot = snapshot
        self.normalize = partial(matching_text, locale=locale)
        self.books = {b['id']: b for b in json.loads((snapshot / 'bible.json').read_text())}
        self.device = 'mps' if torch.backends.mps.is_available() else 'cpu'
        torch.set_num_threads(4)
        recognizer_path = snapshot_download('Systran/faster-whisper-small', revision=RECOGNIZER_REVISION,
                                            local_files_only=True)
        self.recognizer = WhisperModel(recognizer_path, device='cpu', compute_type='int8',
                                       cpu_threads=4, local_files_only=True)
        model_path = snapshot_download(ALIGN_MODELS[locale], revision=ALIGN_REVISIONS[locale],
                                       local_files_only=True)
        self.model, self.metadata = load_align_model(
            locale, self.device, model_name=model_path, model_cache_only=True)

    def recognize(self, source, word_timestamps=True):
        segments, _ = self.recognizer.transcribe(
            source, language=self.locale, word_timestamps=word_timestamps,
            condition_on_previous_text=False, beam_size=5, vad_filter=False)
        return [{'start': s.start, 'end': s.end, 'text': s.text,
                 'words': [{'word': w.word, 'start': w.start, 'end': w.end,
                            'probability': w.probability} for w in (s.words or [])]}
                for s in segments]

    def materialize(self, artifact, receipt, verses, audio_path):
        if not artifact['accepted']:
            return
        key = receipt['key'].replace(':', '__')
        vtt = webvtt(receipt['usfm'], receipt['chapter'], artifact['cues'])
        artifact['vttSha256'] = hashlib.sha256(vtt.encode()).hexdigest()
        timing = ROOT / 'storage/resources/timings' / (artifact['vttSha256'] + '.vtt')
        timing.parent.mkdir(parents=True, exist_ok=True)
        temporary = timing.with_suffix('.tmp')
        temporary.write_text(vtt)
        temporary.replace(timing)
        artifact['vttFile'] = timing.name
        artifact['verseFiles'] = create_verse_files(
            audio_path, [[c['verse'], c['start'], c['end']] for c in artifact['cues']],
            ROOT / 'storage/resources/media', self.snapshot / 'clips' / (key + '.json'))
        for item in artifact['verseFiles']:
            verse = next(v for v in verses if v['number'] == item['verse'])
            if verse.get('coveredVerses'):
                item['coveredVerses'] = verse['coveredVerses']

    def align_recording(self, receipt, verses):
        from whisperx.alignment import align
        from whisperx.audio import load_audio
        audio_path = ROOT / 'storage/resources/media' / (receipt['sha256'] + '.mp3')
        store_verified(self.snapshot / 'audio' / (receipt['key'].replace(':', '__') + '.mp3'),
                       audio_path, receipt['sha256'])
        text_sha = hashlib.sha256(json.dumps(verses, ensure_ascii=False, sort_keys=True).encode()).hexdigest()
        fingerprint = site_fingerprint(receipt['sha256'], text_sha, self.locale)
        key = receipt['key'].replace(':', '__')
        artifact_path = self.snapshot / 'alignment' / (key + '.json')
        if artifact_path.is_file():
            cached = json.loads(artifact_path.read_text())
            if cached.get('fingerprint') == fingerprint:
                self.materialize(cached, receipt, verses, audio_path)
                write_json(artifact_path, cached)
                return cached
        audio = load_audio(str(audio_path))
        duration = len(audio) / 16000
        recognition = self.recognize(audio)
        words = [word for segment in recognition for word in segment['words']]
        windows = recognition_windows(verses, words, self.normalize)
        cues, checks, issues = [], [], []
        gaps = narration_gaps(windows, words)
        book = self.books[receipt['key'].split(':')[0]]
        for gap in gaps:
            text = normalized(gap['text'])
            title = self.normalize(book['en'] if self.locale == 'en' else book['zh'])
            chapter_heading = (gap['kind'] == 'leading' and gap['end'] <= 40 and
                               (title in self.normalize(gap['text']) or
                                (receipt['usfm'] == 'PSA' and 'psalm' in text)))
            closing_amen = gap['kind'] == 'trailing' and text in ('amen', '阿门', '阿們')
            gap['allowedHeadingOrClosing'] = chapter_heading or closing_amen
            if not gap['allowedHeadingOrClosing']:
                issues.append('unclaimed-narration:' + gap['kind'])
        for index, window in enumerate(windows):
            number = window['verse']
            if window['start'] is None or window['end'] <= window['start']:
                issues.append(f'no-recognized-speech:{number}')
                continue
            previous_end = windows[index - 1]['end'] if index else 0
            next_start = windows[index + 1]['start'] if index + 1 < len(windows) else duration
            start = max(0, window['start'] - .4,
                        (previous_end + window['start']) / 2 if previous_end is not None else 0)
            end = min(duration, window['end'] + .4,
                      (window['end'] + next_start) / 2 if next_start is not None else duration)
            if end <= start:
                issues.append(f'overlapping-recognition:{number}')
                continue
            # The recognizer has no reference prompt. Retry doubtful verses in
            # isolation to distinguish ASR errors from a different translation.
            error = window['errorRate']
            limit = .10 if self.locale == 'zh' else .025
            independent = window['recognized']
            if error > limit:
                from timed_text import error_rate
                retry = self.recognize(audio[round(start * 16000):round(end * 16000)], False)
                independent = ''.join(s['text'] for s in retry)
                error = error_rate(self.normalize(window['text']), self.normalize(independent))
            result = align([{'start': start, 'end': end,
                             'text': spoken_text(window['text'], self.locale)}],
                           self.model, self.metadata, audio, self.device,
                           interpolate_method='ignore', return_char_alignments=False)
            aligned = [word for segment in result['segments'] for word in segment['words']]
            timed = [word for word in aligned if 'start' in word and 'end' in word]
            score = sum(word.get('score', 0) for word in timed) / max(1, len(timed))
            check = {'verse': number, 'text': window['text'], 'independentTranscript': independent,
                     'normalizedErrorRate': round(error, 4), 'meanAlignmentScore': round(score, 4),
                     'wordCount': len(aligned), 'timedWordCount': len(timed)}
            checks.append(check)
            if error > limit or not timed or len(timed) != len(aligned) or score < .35:
                issues.append(f'text-audio-needs-review:{number}')
                continue
            cue_start = max(start, min(w['start'] for w in timed) - .06)
            cue_end = min(end, max(w['end'] for w in timed) + .10)
            if cue_end - cue_start < .35 or (cues and cue_start < cues[-1]['end']):
                issues.append(f'invalid-phoneme-boundary:{number}')
                continue
            cues.append({'verse': number, 'start': round(cue_start, 3), 'end': round(cue_end, 3),
                         'text': window['text']})
        artifact = {'schemaVersion': 1, 'method': METHOD, 'fingerprint': fingerprint,
                    'key': receipt['key'], 'sourceUrl': receipt['url'], 'sourceAudioSha256': receipt['sha256'],
                    'textSha256': text_sha, 'recognizer': 'Systran/faster-whisper-small',
                    'recognizerRevision': RECOGNIZER_REVISION,
                    'alignModel': ALIGN_MODELS[self.locale], 'alignModelRevision': ALIGN_REVISIONS[self.locale],
                    'duration': duration,
                    'checks': checks, 'recognition': recognition, 'issues': issues,
                    'unclaimedSpeech': gaps,
                    'accepted': not issues and len(cues) == len(verses), 'cues': cues,
                    'createdAt': datetime.now(timezone.utc).isoformat()}
        self.materialize(artifact, receipt, verses, audio_path)
        write_json(artifact_path, artifact)
        return artifact


def run(snapshot, locale, keys=None, limit=0):
    books = json.loads((snapshot / 'bible.json').read_text())
    chapters = {(b['id'], i + 1): chapter for b in books for i, chapter in enumerate(b['chapters'])}
    receipts = [json.loads(path.read_text()) for path in (snapshot / 'recordings').glob('*.json')]
    receipts = [receipt for receipt in receipts if receipt['locale'] == locale
                and (not keys or receipt['key'] in keys)]
    common = [f'{key}:{locale}' for key in ['psalms:23', 'john:1', 'genesis:1', 'psalms:150']]
    book_order = {book['id']: i for i, book in enumerate(books)}
    receipts.sort(key=lambda r: (common.index(r['key']) if r['key'] in common else len(common),
                                 book_order[r['key'].split(':')[0]], r['chapter']))
    if limit:
        receipts = receipts[:limit]
    aligner = SiteAligner(locale, snapshot)
    accepted, completed = 0, 0
    started = time.monotonic()
    for receipt in receipts:
        book_id, chapter, _ = receipt['key'].split(':')
        source_chapter = chapters[(book_id, int(chapter))]
        verses = [{'number': v['number'], 'text': v[locale]} for v in source_chapter
                  if v[locale].strip()]
        if locale == 'zh':
            for verse in verses:
                aliases = [v['number'] for v in source_chapter if v.get('zhMergedInto') == verse['number']]
                if aliases:
                    verse['coveredVerses'] = sorted([verse['number'], *aliases])
        try:
            result = aligner.align_recording(receipt, verses)
            accepted += result['accepted']
        except Exception:
            logging.exception('Alignment job failed: %s', receipt['key'])
            raise
        completed += 1
        status = {'locale': locale, 'completed': completed, 'total': len(receipts), 'accepted': accepted,
                  'current': receipt['key'], 'elapsedSeconds': round(time.monotonic() - started),
                  'updatedAt': datetime.now(timezone.utc).isoformat()}
        write_json(snapshot / f'alignment-status-{locale}.json', status)
        print(json.dumps(status), result['issues'], flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--snapshot', type=Path, required=True)
    parser.add_argument('--locale', choices=['en', 'zh'], required=True)
    parser.add_argument('--keys', help='Comma-separated canonical book:chapter:locale keys')
    parser.add_argument('--limit', type=int, default=0)
    args = parser.parse_args()
    run(args.snapshot.resolve(), args.locale, args.keys.split(',') if args.keys else None, args.limit)
