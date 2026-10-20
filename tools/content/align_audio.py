"""Offline wav2vec2 + CTC-Segmentation alignment of known Bible text."""
import argparse
from datetime import datetime, timezone
import json
import logging
import os
from pathlib import Path
import re
import subprocess
import time
from functools import lru_cache

from forced_alignment import (
    METHOD, MODELS, SCHEMA_VERSION, MEDIA_PROFILE, alignment_fingerprint, assess_alignment,
    character_error_rate, file_sha256,
    reusable_artifact,
)

ROOT = Path(__file__).resolve().parents[2]
SAMPLE_RATE = 16000

@lru_cache(maxsize=1)
def chinese_converter():
    from opencc import OpenCC
    return OpenCC('t2s')

def acoustic_text(text, locale):
    normalized = normalize_text(text, locale)
    if locale == 'zh':
        # Mandarin pinyin retains every spoken numeral and rare name. Uroman's
        # numeric normalization (九百六十二 -> 962) would erase spoken syllables
        # in MMS's alphabet-only vocabulary, so it must not be used here.
        from pypinyin import lazy_pinyin, Style
        if re.search(r'\d', normalized):
            from cn2an import an2cn
            normalized = re.sub(r'\d+', lambda m: an2cn(m.group(), 'low'), normalized)
        normalized = ''.join(lazy_pinyin(normalized, style=Style.NORMAL)).lower().replace('v', 'u')
        if re.search(r"[^a-z']", normalized):
            raise ValueError(f'Unrepresentable Mandarin pronunciation: {normalized}')
        return normalized
    return normalized

def normalize_text(text, locale):
    if locale == 'zh':
        # Editorial translation notes are printed text, not narrated scripture.
        text = re.sub(r'（[^（）]*(?:原文|或作|有古卷|古卷|下同|节同|[0-9]|见[^（）]*[章节篇])[^（）]*）', '', text)
        text = chinese_converter().convert(text)
        return ''.join(c for c in text.upper() if c.isalnum())
    from num2words import num2words
    text = text.replace('’', "'")
    text = re.sub(r'\d[\d,]*(?:\.\d+)?', lambda m: num2words(m.group().replace(',', '')), text)
    return ' '.join(re.findall(r"[A-Z]+(?:'[A-Z]+)*", text.upper()))

def align_posteriors(log_probs, texts, vocab, index_duration, recognized_frames=None):
    import numpy as np
    import ctc_segmentation as ctc
    inverse = {i: c for c, i in vocab.items()}
    blank = vocab.get('<blank>', vocab.get('<pad>', 0))
    token_lists = []
    for text in texts:
        chars = text.replace(' ', '|')
        unknown = set(chars) - set(vocab)
        if unknown:
            raise ValueError(f'Characters outside acoustic vocabulary: {sorted(unknown)}')
        token_lists.append(np.array([vocab[c] for c in chars], dtype=np.int64))
    config = ctc.CtcSegmentationParameters(char_list=[inverse[i] for i in range(len(vocab))])
    config.blank = blank
    config.index_duration = index_duration
    config.min_window_size = len(log_probs)
    # Chapter titles / superscriptions can be spoken between canonical verses.
    # Only utterance separators get free blank transitions; spaces remain tokens.
    config.blank_transition_cost_zero = True
    ground_truth, begin = ctc.prepare_token_list(config, token_lists)
    timings, char_probs, _ = ctc.ctc_segmentation(config, log_probs, ground_truth)
    utterances = ctc.determine_utterance_segments(config, begin, char_probs, timings, texts)
    best = log_probs.argmax(axis=-1)
    if recognized_frames is None:
        recognized_frames = [inverse[int(i)] if int(i) != blank else '' for i in best]
    def decode(a, b):
        output, previous = [], ''
        for token in recognized_frames[a:b]:
            if token and token != previous: output.append(token)
            previous = token
        return ''.join(output).replace('|', ' ')
    result = []
    for text, (start, end, score) in zip(texts, utterances):
        a, b = max(0, int(start/index_duration)), min(len(best), int(end/index_duration)+1)
        # Keep a small acoustic safety margin; do not distribute time by text length.
        active = np.flatnonzero(best[a:b] != blank) + a
        if len(active):
            start = max(start, active[0]*index_duration - .08)
            end = min(end, (active[-1]+1)*index_duration + .12)
        recognized = decode(a, b)
        result.append({'start': round(float(start), 3), 'end': round(float(end), 3),
                       'score': round(float(score), 4), 'cer': round(character_error_rate(text, recognized), 4),
                       'recognized': recognized})
    return result


class AcousticAligner:
    def __init__(self, locale, device='auto', batch_size=4):
        import torch
        from transformers import Wav2Vec2ForCTC, Wav2Vec2Processor
        self.torch = torch
        self.locale = locale
        self.batch_size = batch_size
        self.device = ('mps' if torch.backends.mps.is_available() else 'cuda' if torch.cuda.is_available() else 'cpu') if device == 'auto' else device
        name, revision = MODELS[locale]
        self.processor = Wav2Vec2Processor.from_pretrained(name, revision=revision)
        self.model = Wav2Vec2ForCTC.from_pretrained(name, revision=revision).to(self.device).eval()
        self.vocab = self.processor.tokenizer.get_vocab()
        self.inverse = {i: c for c, i in self.vocab.items()}
        torch.set_num_threads(min(6, os.cpu_count() or 1))

    def align(self, audio_path, verses):
        import numpy as np
        torch = self.torch
        raw = subprocess.check_output(['ffmpeg', '-v', 'error', '-i', str(audio_path), '-f', 'f32le', '-ac', '1', '-ar', str(SAMPLE_RATE), '-'])
        waveform = np.frombuffer(raw, dtype='<f4').copy()
        texts = [acoustic_text(v['text'], self.locale) for v in verses]
        if not all(texts): raise ValueError('A nonempty verse has no normalized acoustic text')
        blank = self.vocab.get('<blank>', self.vocab.get('<pad>', 0))
        labels = sorted({blank} | {self.vocab[c] for t in texts for c in t.replace(' ', '|') if c in self.vocab})
        vocabulary = {self.inverse[old]: new for new, old in enumerate(labels)}
        # Wav2vec2 output stride=320 samples (20ms), receptive field=400 samples.
        # Fixed overlapping windows bound transformer memory for 20-minute chapters.
        core, context = 16*SAMPLE_RATE, SAMPLE_RATE
        windows = [(s, max(0, s-context), min(len(waveform), s+core+context), min(len(waveform), s+core)) for s in range(0, len(waveform), core)]
        emissions, recognized = [], []
        # Group-normalized wav2vec2 is sensitive to zero padding. Infer the short
        # final window separately so padding cannot erase the last verse.
        batches = [windows[offset:offset+self.batch_size] for offset in range(0, len(windows)-1, self.batch_size)]
        if batches and batches[-1] and batches[-1][-1] == windows[-1]: batches[-1].pop()
        batches = [b for b in batches if b] + [[windows[-1]]]
        for batch in batches:
            inputs = self.processor([waveform[a:b] for _, a, b, _ in batch], sampling_rate=SAMPLE_RATE, return_tensors='pt', padding=True)
            arguments = {'input_values': inputs.input_values.to(self.device)}
            if self.model.config.feat_extract_norm == 'layer':
                arguments['attention_mask'] = inputs.attention_mask.to(self.device)
            with torch.inference_mode():
                logits = self.model(**arguments).logits
                probabilities = logits.log_softmax(dim=-1)
                best = logits.argmax(dim=-1).cpu().numpy()
                reduced = probabilities[:, :, labels].cpu().numpy()
            for i, (start, a, b, end) in enumerate(batch):
                count = int(self.model._get_feat_extract_output_lengths(b-a))
                centers = a + np.arange(count)*320 + 200
                keep = (centers >= start) & (centers < end)
                emissions.append(reduced[i, :count][keep])
                recognized.extend(self.inverse[int(token)] if int(token) != blank else '' for token in best[i, :count][keep])
        log_probs = np.concatenate(emissions)
        segments = align_posteriors(log_probs, texts, vocabulary, .02, recognized)
        self.unclaimed_speech = []
        for left, right in zip(segments, segments[1:]):
            if right['start']-left['end'] < 1.0: continue
            a, b = int(left['end']/.02), int(right['start']/.02)
            words, previous = [], ''
            for token in recognized[a:b]:
                if token and token != previous: words.append(token)
                previous = token
            spoken = ''.join(words).replace('|', ' ').strip()
            if len(re.sub('[^a-zA-Z]', '', spoken)) > (12 if self.locale == 'zh' else 8):
                self.unclaimed_speech.append({'start':left['end'],'end':right['start'],'recognized':spoken})
        # frame zero is centered at 12.5ms in the decoded 16kHz recording.
        duration = len(waveform)/SAMPLE_RATE
        for verse, segment, normalized in zip(verses, segments, texts):
            segment.update(verse=verse['number'], text=verse['text'], normalized=normalized)
            segment['start'] = round(min(duration, segment['start']+.0125), 3)
            segment['end'] = round(min(duration, segment['end']+.0125), 3)
        return segments, duration


def atomic_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':'))+'\n')
    temporary.replace(path)


def prepare_playback_audio(source, source_sha, media_root, force=False):
    """Decode malformed source frames once; inference and playback use this file."""
    import hashlib
    name = hashlib.sha256((source_sha+MEDIA_PROFILE).encode()).hexdigest()+'.mp3'
    target = media_root/name
    warnings = ''
    if force or not target.is_file():
        target.parent.mkdir(parents=True, exist_ok=True)
        temporary = target.with_suffix('.tmp.mp3')
        result = subprocess.run(['ffmpeg', '-nostdin', '-v', 'warning', '-y', '-i', str(source),
                                 '-map_metadata', '-1', '-vn', '-ac', '1', '-ar', '24000',
                                 '-c:a', 'libmp3lame', '-b:a', '64k', '-write_xing', '1', str(temporary)],
                                capture_output=True, text=True, check=True)
        warnings = result.stderr.strip()
        temporary.replace(target)
    return target, warnings


def run(args):
    from urllib.parse import unquote
    from provider_resources import assert_legacy_catalog
    books = json.loads((ROOT/'packages/content/data/bible.json').read_text())
    catalog = json.loads((ROOT/'packages/content/data/chapter-audio.json').read_text())
    assert_legacy_catalog(catalog)
    lookup = {(b['id'], i+1): chapter for b in books for i, chapter in enumerate(b['chapters'])}
    keys = [k for k in catalog if k.endswith(':'+args.locale)]
    if args.chapters:
        requested = set(args.chapters.split(','))
        keys = [k for k in keys if k.rsplit(':', 1)[0] in requested]
    # Recover known defective timelines first; then common reading chapters.
    keys.sort(key=lambda k: (k not in args.priority.split(','), not not catalog[k]['segments']))
    if args.limit: keys = keys[:args.limit]
    aligner = None
    totals = {'total': len(keys), 'completed': 0, 'accepted': 0, 'review': 0, 'cached': 0}
    started = time.monotonic()
    unpublished = []
    for key in keys:
        recording = catalog[key]
        book, chapter, locale = key.split(':')
        verses = [{'number': v['number'], 'text': v[locale]} for v in lookup[(book, int(chapter))] if v[locale].strip()]
        suffix = unquote(recording.get('originalPath', recording['path']).split('/api/audio/bible/', 1)[1])
        version, relative = suffix.split('/', 1)
        audio_path = args.source/'assets/mp3'/('niv' if version == 'niv' else '和合本')/relative
        sha = file_sha256(audio_path)
        fingerprint = alignment_fingerprint(sha, verses, locale, MODELS[locale][1])
        path = args.output/(key.replace(':', '__')+'.json')
        artifact = json.loads(path.read_text()) if path.is_file() else None
        cache_ready = reusable_artifact(artifact, fingerprint, args.output.parent/'media')
        repair_media = bool(artifact and artifact.get('mediaPath') and not cache_ready)
        if not args.force and cache_ready:
            totals['cached'] += 1
        else:
            artifact = {'schemaVersion': SCHEMA_VERSION, 'method': METHOD, 'key': key, 'fingerprint': fingerprint, 'audioSha256': sha, 'model': {'id': MODELS[locale][0], 'revision': MODELS[locale][1]}, 'createdAt': datetime.now(timezone.utc).isoformat()}
            # Missing models/dependencies are job failures, not evidence of bad
            # recordings. Fail once rather than falsely rejecting every chapter.
            if aligner is None: aligner = AcousticAligner(locale, args.device, args.batch_size)
            try:
                # A matching alignment with missing/damaged playback bytes must
                # reconstruct that exact time base instead of skipping forever.
                playback, warnings = prepare_playback_audio(audio_path, sha, args.output.parent/'media', force=repair_media)
                artifact.update(mediaPath='/api/audio/aligned/'+playback.name, mediaSha256=file_sha256(playback),
                                mediaProfile=MEDIA_PROFILE, sourceDecodeWarnings=warnings)
                segments, duration = aligner.align(playback, verses)
                artifact.update(segments=segments, duration=duration, mediaPath='/api/audio/aligned/'+playback.name,
                                mediaSha256=file_sha256(playback), mediaProfile=MEDIA_PROFILE,
                                sourceDecodeWarnings=warnings, sourceDuration=recording['duration'],
                                quality=assess_alignment(verses, segments, duration, locale))
                artifact['unclaimedSpeech'] = aligner.unclaimed_speech
                if aligner.unclaimed_speech:
                    artifact['quality']['accepted'] = False
                    artifact['quality']['segments'] = []
                    artifact['quality']['reasons'].append('untranscribed-speech-between-verses')
            except Exception as error:
                logging.exception('Alignment failed: %s', key)
                artifact.update(segments=[], duration=recording['duration'], quality={'accepted': False, 'segments': [], 'reasons': [f'{type(error).__name__}: {error}']})
            atomic_json(path, artifact)
        totals['completed'] += 1
        totals['accepted' if artifact['quality']['accepted'] else 'review'] += 1
        status = {**totals, 'current': key, 'elapsedSeconds': round(time.monotonic()-started), 'updatedAt': datetime.now(timezone.utc).isoformat()}
        atomic_json(args.output.parent/('status-'+args.locale+'.json'), status)
        print(json.dumps(status, ensure_ascii=False), flush=True)
        if artifact['quality']['reasons']:
            print('  review:', '; '.join(artifact['quality']['reasons'][:6]), flush=True)
        unpublished.append(path)
        if args.publish and (len(unpublished) >= 25 or totals['completed'] == totals['total']):
            from publish_alignment import publish
            publish(unpublished)
            unpublished.clear()


if __name__ == '__main__':
    import fcntl
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=os.getenv('BIBLE_RESOURCE_ROOT'))
    parser.add_argument('--locale', choices=['en', 'zh'], required=True)
    parser.add_argument('--chapters', help='Optional comma-separated book:chapter references')
    parser.add_argument('--priority', default='genesis:1:en,genesis:2:en,john:1:en,psalms:23:en,genesis:1:zh,genesis:2:zh,john:1:zh,psalms:23:zh,psalms:150:zh')
    parser.add_argument('--limit', type=int)
    parser.add_argument('--device', default='auto', choices=['auto', 'cpu', 'mps', 'cuda'])
    parser.add_argument('--batch-size', type=int, default=4)
    parser.add_argument('--output', type=Path, default=ROOT/'storage/alignment/chapters')
    parser.add_argument('--force', action='store_true')
    parser.add_argument('--publish', action='store_true', help='Publish verified results every 25 chapters')
    arguments = parser.parse_args()
    if not arguments.source: parser.error('Set BIBLE_RESOURCE_ROOT or pass --source')
    arguments.source = Path(arguments.source)
    arguments.output.parent.mkdir(parents=True, exist_ok=True)
    with open(arguments.output.parent/('.worker-'+arguments.locale+'.lock'), 'a') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            parser.error(f'An {arguments.locale} alignment worker is already running; inspect alignment/status-{arguments.locale}.json')
        run(arguments)
