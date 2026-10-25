"""Whisper recognition + WhisperX phoneme alignment of a fresh site snapshot.

Inputs are immutable HTTP downloads, not historical timing files. Outputs retain
recognition evidence, canonical WebVTT cues and independently loopable MP3s.
"""
import argparse
import copy
from datetime import datetime, timezone
from functools import partial, lru_cache
import hashlib
import importlib.util
import json
import logging
import math
import os
import fcntl
from pathlib import Path
import re
import time

from site_resources import write_json
from timed_text import (normalized, recognition_windows, webvtt, narration_gaps,
                        recovery_range, gap_covered_by_verse, error_rate)
from verse_clips import create_verse_files
from media_assets import store_verified
from pronunciation import same_english_pronunciation, english_words
from source_metadata import load_psalm_captions
from alignment_contract import (METHOD, ALIGN_MODELS, ALIGN_REVISIONS, RECOGNIZER_REVISION,
                                TURBO_MODEL, TURBO_REVISION, QUALITY_RECIPE, HYBRID_MODEL,
                                CPU_TURBO_MODEL, CPU_TURBO_REVISION, CPU_HYBRID_MODEL,
                                RECOGNIZERS, LEGACY_QUALITY_RECIPE, SUPPORTED_RECIPES, site_fingerprint,
                                PSALM_CAPTION_REFERENCE_SHA256, SOURCE_REVIEW_RECIPE)

ROOT = Path(__file__).resolve().parents[2]


def recording_shard(key, count):
    if count < 1:
        raise ValueError('Shard count must be positive')
    return int.from_bytes(hashlib.sha256(key.encode()).digest()[:8], 'big') % count


def prepare_tokenizer(snapshot):
    """Punkt is used only for sentences inside each already matched Bible verse."""
    os.environ.setdefault('NLTK_DATA', str(snapshot / 'nltk_data'))
    import nltk
    from nltk.tokenize.punkt import PunktTrainer, save_punkt_params
    target = snapshot / 'nltk_data/tokenizers/punkt_tab/english'
    with open(snapshot / '.tokenizer.lock', 'a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        # NLTK rejects a group-writable cache, including Linux installations
        # whose default umask is 0002. Keep this runtime cache private.
        for path in [snapshot / 'nltk_data', snapshot / 'nltk_data/tokenizers',
                     snapshot / 'nltk_data/tokenizers/punkt_tab', target]:
            path.mkdir(mode=0o700, parents=True, exist_ok=True)
            path.chmod(0o700)
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
        # Psalm superscriptions are metadata, unlike spoken explanations
        # inside a verse. Keep them in reading text and account for any
        # narrated superscription separately as a chapter heading.
        text = re.sub(r'^（[^（）]*(?:的诗|的金诗|的训诲|的祈祷|的默想|流离歌|上行(?:之)?诗|交与伶长)[^（）]*）', '', text)
        # The WordProject reader speaks explanatory parentheses, including
        # names and their meanings. Only editorial variant/cross-reference
        # notes are omitted; dropping every parenthesis loses real speech.
        editorial = (r'原文|或作|或译|有古卷|下同|节同|此句乃照[^（）()]*所加'
                     r'|[零〇一二三四五六七八九十百\d]+章[零〇一二三四五六七八九十百\d]+节作')
        return re.sub(r'（[^（）]*(?:' + editorial + r')[^（）]*）'
                      r'|\([^()]*(?:' + editorial + r')[^()]*\)'
                      r'|（(?:又作吕彼亚人|有作四年的|又作以色列人|有作以东人的)）'
                      r'|\((?:又作吕彼亚人|有作四年的|又作以色列人|有作以东人的)\)'
                      r'|（就是要赞美耶和华的意思）|\(就是要赞美耶和华的意思\)', '', text).strip()
    # The site occasionally joins sentences without a space ("valley,I").
    return re.sub(r'([,;:!?])(?=[A-Za-z])', r'\1 ', text).strip()


@lru_cache(maxsize=1)
def chinese_converter():
    from opencc import OpenCC
    return OpenCC('t2s')


def matching_text(text, locale):
    text = spoken_text(text, locale)
    if locale == 'zh':
        from cn2an import an2cn
        from pypinyin import lazy_pinyin
        text = chinese_converter().convert(text)
        text = re.sub(r'\d[\d,]*', lambda match: an2cn(match.group().replace(',', ''), 'low'), text)
        text = ''.join(lazy_pinyin(text))
    else:
        from num2words import num2words
        text = re.sub(r'\d[\d,]*', lambda match: num2words(match.group().replace(',', '')), text)
    return normalized(text)


def roman_number(number):
    result = ''
    for value, symbol in [(100, 'C'), (90, 'XC'), (50, 'L'), (40, 'XL'),
                          (10, 'X'), (9, 'IX'), (5, 'V'), (4, 'IV'), (1, 'I')]:
        count, number = divmod(number, value)
        result += symbol * count
    return result


def is_chapter_heading(gap, book, chapter, locale):
    if gap['kind'] != 'leading' or gap.get('end', float('inf')) > 40:
        return False
    normalize = partial(matching_text, locale=locale)
    text = normalize(gap['text'])
    if locale == 'en':
        title = re.sub(r'^[123] ', lambda match: {'1 ': 'First ', '2 ': 'Second ', '3 ': 'Third '}[match.group()],
                       book['en'])
        titles = [book['en'], title]
        forms = [f'Chapter {chapter}', f'Chapter {roman_number(chapter)}']
        if gap.get('end', 40) <= 10 and book.get('chapters'):
            first = book['chapters'][chapter - 1][0].get('en', '')
            number = normalize(str(chapter))
            if first and not normalize(first).startswith(number):
                forms.append(str(chapter))
        if book.get('id') == 'psalms':
            forms.extend([f'Psalm {chapter}', f'Psalms {chapter}'])
            caption = book.get('audioHeadings', {}).get(chapter)
            if caption:
                forms.extend([caption['text'], f"Psalm {chapter} {caption['text']}",
                              f"Psalms {chapter} {caption['text']}"])
        forms.extend(form for name in titles for form in [name, f'{name} Chapter {chapter}', f'{name} {chapter}'])
        if book.get('id') == 'psalms' and book.get('chapters'):
            # The website's English verses omit some superscriptions. Require
            # an exact rendering attested by this chapter's Chinese source;
            # a general "contains Psalm" exception can hide missing scripture.
            source = book['chapters'][chapter - 1][0]['zh']
            prefix = re.match(r'^（([^（）]*)）', source)
            renderings = {'大卫的诗。': 'A Psalm of David', '亚萨的诗。': 'A Psalm of Asaph',
                          '上行之诗。': 'A Song of Ascents', '上行诗。': 'A Song of Ascents'}
            superscription = renderings.get(prefix.group(1)) if prefix else None
            if superscription:
                forms.extend([superscription, f'Psalm {chapter} {superscription}',
                              f'Psalms {chapter} {superscription}'])
        return text in {normalize(form) for form in forms}
    title = normalize(book['zh'])
    if book.get('id') == 'psalms' and book.get('chapters'):
        prefix = re.match(r'^（([^（）]*)）', book['chapters'][chapter - 1][0]['zh'])
        if prefix:
            superscription = prefix.group(1)
            if text in {normalize(form) for form in [superscription,
                        f'诗篇第{chapter}篇{superscription}', f'诗篇第{chapter}章{superscription}']}:
                return True
    for suffix in [f'第{chapter}章', f'第{chapter}篇', f'{chapter}篇']:
        ending = normalize(suffix)
        if text == ending:
            return True
        if text.endswith(ending):
            prefix = text[:-len(ending)]
            # Require the expected chapter and a near-identical book name,
            # never merely a book name somewhere in a lost scripture clause.
            from timed_text import error_rate
            if prefix and error_rate(title, prefix) <= .15:
                return True
    return text == title


def heading_word_count(words, book, chapter, locale):
    count = 0
    for end, word in enumerate(words):
        if word['end'] > 40:
            break
        gap = {'kind': 'leading', 'end': word['end'],
               'text': ' '.join(item['word'] for item in words[:end + 1])}
        if is_chapter_heading(gap, book, chapter, locale):
            count = end + 1
    return count


def best_transcript(reference, candidates, normalize):
    from timed_text import error_rate
    return min(((text, error_rate(normalize(reference), normalize(text))) for text in candidates),
               key=lambda result: result[1])


def recovery_needed(window, check, locale, normalize):
    if window['start'] is None or check is None:
        return True
    if (not check['timedWordCount'] or check['timedWordCount'] != check['wordCount']
            or not math.isfinite(check['meanAlignmentScore']) or check['meanAlignmentScore'] < .35):
        return True
    if locale == 'en':
        return len(english_words(check['independentTranscript'])) + 1 < len(english_words(check['text']))
    return len(normalize(check['independentTranscript'])) < .85 * len(normalize(check['text']))


def recheck_heading_artifact(artifact, receipt, book, verses, heading_verifications=None,
                             target_recipe=QUALITY_RECIPE):
    """Recheck complete existing evidence when the only failure was a heading."""
    text_sha = hashlib.sha256(json.dumps(verses, ensure_ascii=False, sort_keys=True).encode()).hexdigest()
    recipe = artifact.get('qualityRecipe', LEGACY_QUALITY_RECIPE)
    recognizer = artifact.get('recognizer', 'Systran/faster-whisper-small')
    if (artifact.get('issues') != ['unclaimed-narration:leading']
            or artifact.get('method') != METHOD or artifact.get('key') != receipt['key']
            or artifact.get('sourceAudioSha256') != receipt['sha256']
            or artifact.get('textSha256') != text_sha or recipe not in SUPPORTED_RECIPES
            or recognizer not in RECOGNIZERS
            or artifact.get('recognizerRevision', RECOGNIZERS[recognizer]) != RECOGNIZERS[recognizer]
            or artifact.get('fingerprint') != site_fingerprint(receipt['sha256'], text_sha,
                                                                receipt['locale'], recipe, recognizer)
            or len(artifact.get('cues', [])) != len(verses)
            or len(artifact.get('checks', [])) != len(verses)
            or not any(gap['kind'] == 'leading' for gap in artifact.get('unclaimedSpeech', []))):
        return None
    normalize = partial(matching_text, locale=receipt['locale'])
    limit = .10 if receipt['locale'] == 'zh' else .025
    end = 0
    for verse, cue, check in zip(verses, artifact['cues'], artifact['checks']):
        _, error = best_transcript(verse['text'], [check['independentTranscript']], normalize)
        if (cue['verse'] != verse['number'] or cue['text'] != verse['text']
                or check['verse'] != verse['number'] or check['text'] != verse['text']
                or not end <= cue['start'] < cue['end'] <= artifact['duration']
                or cue['end'] - cue['start'] < .35
                or (error > limit and not (receipt['locale'] == 'en' and
                    same_english_pronunciation(verse['text'], check['independentTranscript'])))
                or check['meanAlignmentScore'] < .35
                or not math.isfinite(check['meanAlignmentScore'])
                or check['wordCount'] <= 0 or check['wordCount'] != check['timedWordCount']
                or (receipt['locale'] == 'zh' and spoken_text(verse['text'], 'zh') !=
                    re.sub(r'（[^（）]*）|\([^()]*\)', '', verse['text']).strip())):
            return None
        end = cue['end']
    heading_verifications = heading_verifications or {}
    for index, gap in enumerate(artifact.get('unclaimedSpeech', [])):
        heard = heading_verifications.get(index)
        rechecked = (heard and gap.get('start') is not None and gap.get('end') is not None
                     and heard['range'][0] <= gap['start'] <= gap['end'] <= heard['range'][1]
                     and is_chapter_heading({**gap, 'text': heard['text']}, book, receipt['chapter'], receipt['locale']))
        if not (is_chapter_heading(gap, book, receipt['chapter'], receipt['locale']) or rechecked
                or (gap['kind'] == 'trailing' and normalized(gap['text']) in ('amen', '阿门', '阿們'))):
            return None
    reviewed = copy.deepcopy(artifact)
    reviewed.update(accepted=True, issues=[], qualityRecipe=target_recipe,
                    fingerprint=site_fingerprint(receipt['sha256'], text_sha, receipt['locale'],
                                                 recipe=target_recipe, recognizer=recognizer),
                    reviewedAt=datetime.now(timezone.utc).isoformat())
    for index, gap in enumerate(reviewed.get('unclaimedSpeech', [])):
        gap['allowedHeadingOrClosing'] = True
        if index in heading_verifications:
            heard = heading_verifications[index]
            gap.update(independentHeadingTranscript=heard['text'], headingVerificationRange=heard['range'])
    return reviewed


class SiteAligner:
    def __init__(self, locale, snapshot, source_review=False):
        os.environ.setdefault('NLTK_DATA', str(snapshot / 'nltk_data'))
        import nltk
        import torch
        from huggingface_hub import snapshot_download
        from whisperx.alignment import load_align_model
        nltk.data.path.insert(0, str(snapshot / 'nltk_data'))
        prepare_tokenizer(snapshot)
        self.locale = locale
        self.source_review = source_review
        self.recipe = SOURCE_REVIEW_RECIPE if source_review else QUALITY_RECIPE
        self.snapshot = snapshot
        self.normalize = partial(matching_text, locale=locale)
        self.books = {b['id']: b for b in json.loads((snapshot / 'bible.json').read_text())}
        if locale == 'en':
            captions = load_psalm_captions(snapshot, required=source_review)
            if captions:
                self.books['psalms']['audioHeadings'] = captions
        self.device = 'mps' if torch.backends.mps.is_available() else 'cpu'
        threads = int(os.environ.get('SELAH_ALIGNMENT_THREADS', '4'))
        if not 1 <= threads <= 8:
            raise ValueError('Alignment threads must be between 1 and 8')
        torch.set_num_threads(threads)
        torch.set_num_interop_threads(1)
        self.turbo_path = None
        if self.device == 'mps' and importlib.util.find_spec('mlx_whisper') is not None:
            try:
                import mlx_whisper
                self.turbo_path = snapshot_download(TURBO_MODEL, revision=TURBO_REVISION,
                                                    local_files_only=True)
            except (ImportError, OSError):
                logging.warning('Optional MLX recognizer unavailable; retaining the offline small recognizer')
        self.recognizer_name = HYBRID_MODEL if self.turbo_path else 'Systran/faster-whisper-small'
        self.recognizer_revision = RECOGNIZERS[self.recognizer_name]
        recognizer_path = snapshot_download('Systran/faster-whisper-small', revision=RECOGNIZER_REVISION,
                                            local_files_only=True)
        from faster_whisper import WhisperModel
        self.recognizer = WhisperModel(recognizer_path, device='cpu', compute_type='int8',
                                       cpu_threads=threads, local_files_only=True)
        self.cpu_retry = None
        if self.device == 'cpu':
            try:
                retry_path = snapshot_download(CPU_TURBO_MODEL, revision=CPU_TURBO_REVISION,
                                                local_files_only=True)
                self.cpu_retry = WhisperModel(retry_path, device='cpu', compute_type='int8',
                                              cpu_threads=threads, local_files_only=True)
                self.recognizer_name = CPU_HYBRID_MODEL
                self.recognizer_revision = RECOGNIZERS[self.recognizer_name]
            except OSError:
                logging.warning('Optional CPU turbo model unavailable; using the offline small recognizer')
        model_path = snapshot_download(ALIGN_MODELS[locale], revision=ALIGN_REVISIONS[locale],
                                       local_files_only=True)
        self.model, self.metadata = load_align_model(
            locale, self.device, model_name=model_path, model_cache_only=True)

    def recognize(self, source, word_timestamps=True, vad_filter=False):
        segments, _ = self.recognizer.transcribe(
            source, language=self.locale, word_timestamps=word_timestamps,
            condition_on_previous_text=False, beam_size=5, vad_filter=vad_filter,
            **({'vad_parameters': {'threshold': .25, 'min_silence_duration_ms': 150,
                                   'speech_pad_ms': 250}} if vad_filter else {}))
        return [{'start': s.start, 'end': s.end, 'text': s.text,
                 'words': [{'word': w.word, 'start': w.start, 'end': w.end,
                            'probability': w.probability} for w in (s.words or [])]}
                for s in segments]

    def retry_transcripts(self, source, full_coverage=False):
        vad = getattr(self, 'source_review', False) and not full_coverage
        yield ''.join(segment['text'] for segment in self.recognize(source, False, vad_filter=vad))
        if self.turbo_path:
            import mlx_whisper
            result = mlx_whisper.transcribe(
                source, path_or_hf_repo=self.turbo_path, language=self.locale,
                word_timestamps=False, condition_on_previous_text=False, verbose=None, temperature=0)
            yield result['text']
        if self.cpu_retry:
            segments, _ = self.cpu_retry.transcribe(
                source, language=self.locale, word_timestamps=False,
                condition_on_previous_text=False, beam_size=5, vad_filter=vad,
                **({'vad_parameters': {'threshold': .25, 'min_silence_duration_ms': 150,
                                       'speech_pad_ms': 250}} if vad else {}))
            yield ''.join(segment.text for segment in segments)

    def exact_correspondence(self, reference, transcript):
        if self.locale == 'en':
            return same_english_pronunciation(reference, transcript)
        return self.normalize(reference) == self.normalize(transcript)

    def verify_range(self, audio, window, start, end, initial=None):
        from whisperx.alignment import align
        result = align([{'start': start, 'end': end, 'text': spoken_text(window['text'], self.locale)}],
                       self.model, self.metadata, audio, self.device,
                       interpolate_method='ignore', return_char_alignments=False)
        words = [word for segment in result['segments'] for word in segment['words']]
        timed = [word for word in words if 'start' in word and 'end' in word]
        score = sum(word.get('score', 0) for word in timed) / max(1, len(timed))
        check = {'verse': window['verse'], 'text': window['text'],
                 'spokenText': spoken_text(window['text'], self.locale),
                 'independentTranscript': initial or '', 'normalizedErrorRate': 1.0,
                 'meanAlignmentScore': round(score, 4), 'wordCount': len(words),
                 'timedWordCount': len(timed), 'phoneticVerified': False, 'searchRange': [start, end],
                 'independentlyReheard': False}
        if (not timed or len(timed) != len(words) or not math.isfinite(score) or score < .35
                or not all(math.isfinite(word['start']) and math.isfinite(word['end']) for word in timed)):
            return None, check
        cue_start = max(start, min(word['start'] for word in timed) - .06)
        cue_end = min(end, max(word['end'] for word in timed) + .10)
        if not start <= cue_start < cue_end <= end or cue_end - cue_start < .35:
            return None, check
        limit = .10 if self.locale == 'zh' else .025
        if initial and error_rate(self.normalize(window['text']), self.normalize(initial)) <= limit:
            candidates = [initial]
        else:
            # Re-listen to the acoustically located utterance, without giving
            # either recognizer the reference text or neighboring scripture.
            a, b = max(start, cue_start - .2), min(end, cue_end + .2)
            candidates = list(self.retry_transcripts(audio[round(a * 16000):round(b * 16000)]))
            filtered = getattr(self, 'source_review', False)
            check.update(independentlyReheard=True, replaySearchRange=[a, b],
                         independentRange=None if filtered else [a, b],
                         independentRangeFiltered=filtered)
        independent, error = best_transcript(window['text'], candidates, self.normalize)
        phonetic = False
        if error > limit and self.locale == 'en':
            for candidate in candidates:
                if same_english_pronunciation(window['text'], candidate):
                    independent = candidate
                    error = error_rate(self.normalize(window['text']), self.normalize(candidate))
                    phonetic = True
                    break
        check.update(independentTranscript=independent, normalizedErrorRate=round(error, 4),
                     phoneticVerified=phonetic)
        if error > limit and not phonetic:
            return None, check
        return {'verse': window['verse'], 'start': round(cue_start, 3),
                'end': round(cue_end, 3), 'text': window['text']}, check

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

    def align_recording(self, receipt, verses, review_rejected=False, source_review=False):
        from whisperx.audio import load_audio
        audio_path = ROOT / 'storage/resources/media' / (receipt['sha256'] + '.mp3')
        store_verified(self.snapshot / 'audio' / (receipt['key'].replace(':', '__') + '.mp3'),
                       audio_path, receipt['sha256'])
        text_sha = hashlib.sha256(json.dumps(verses, ensure_ascii=False, sort_keys=True).encode()).hexdigest()
        fingerprint = site_fingerprint(receipt['sha256'], text_sha, self.locale,
                                       recipe=self.recipe, recognizer=self.recognizer_name)
        key = receipt['key'].replace(':', '__')
        artifact_path = self.snapshot / 'alignment' / (key + '.json')
        audio = None
        if artifact_path.is_file():
            cached = json.loads(artifact_path.read_text())
            if source_review and not cached.get('accepted'):
                backup = self.snapshot / 'alignment-before-source-review' / artifact_path.name
                if not backup.exists():
                    write_json(backup, cached)
            if review_rejected:
                from context_review import eligible_for_review, review_artifact
                if not eligible_for_review(cached):
                    return cached
                audio = load_audio(str(audio_path))
                reviewed = review_artifact(self, cached, receipt, verses, audio)
                backup = self.snapshot / 'alignment-before-context-review' / artifact_path.name
                if not backup.exists():
                    write_json(backup, cached)
                self.materialize(reviewed, receipt, verses, audio_path)
                write_json(artifact_path, reviewed)
                return reviewed
            book = self.books[receipt['key'].split(':')[0]]
            reviewed = recheck_heading_artifact(cached, receipt, book, verses, target_recipe=self.recipe)
            if reviewed is None and cached.get('issues') == ['unclaimed-narration:leading']:
                audio = load_audio(str(audio_path))
                heard = {}
                for index, gap in enumerate(cached.get('unclaimedSpeech', [])):
                    if (gap['kind'] != 'leading' or is_chapter_heading(gap, book, receipt['chapter'], self.locale)
                            or not 0 < gap.get('end', 0) - gap.get('start', 0) <= 15):
                        continue
                    a = max(0, gap['start'] - .2)
                    b = min(gap['end'] + .2, cached['cues'][0]['start'] if cached.get('cues') else len(audio) / 16000)
                    if b < gap['end']:
                        continue
                    for transcript in self.retry_transcripts(audio[round(a * 16000):round(b * 16000)], full_coverage=True):
                        if is_chapter_heading({**gap, 'text': transcript}, book, receipt['chapter'], self.locale):
                            heard[index] = {'text': transcript, 'range': [a, b]}
                            break
                reviewed = recheck_heading_artifact(cached, receipt, book, verses, heard, target_recipe=self.recipe)
            if reviewed:
                reviewed['sourceMetadata'] = {'captionManifestSha256': PSALM_CAPTION_REFERENCE_SHA256,
                                               'retryVadFilter': self.source_review}
                self.materialize(reviewed, receipt, verses, audio_path)
                write_json(artifact_path, reviewed)
                return reviewed
            cached_recognizer = cached.get('recognizer', 'Systran/faster-whisper-small')
            cached_recipe = cached.get('qualityRecipe', LEGACY_QUALITY_RECIPE)
            verified_artifact = (cached.get('accepted') and cached_recipe in SUPPORTED_RECIPES
                                 and cached.get('method') == METHOD and cached.get('key') == receipt['key']
                                 and cached.get('sourceAudioSha256') == receipt['sha256']
                                 and cached.get('textSha256') == text_sha
                                 and cached_recognizer in RECOGNIZERS
                                 and cached.get('recognizerRevision') == RECOGNIZERS[cached_recognizer]
                                 and cached.get('fingerprint') == site_fingerprint(
                                     receipt['sha256'], text_sha, self.locale, cached_recipe, cached_recognizer))
            if cached.get('fingerprint') == fingerprint or verified_artifact:
                self.materialize(cached, receipt, verses, audio_path)
                write_json(artifact_path, cached)
                return cached
        if audio is None:
            audio = load_audio(str(audio_path))
        duration = len(audio) / 16000
        recognition = None
        # This is the independent ASR evidence from this exact HTTP audio
        # snapshot, not a reused verse timeline. Keep it when only the text
        # normalization/verification recipe changes.
        for candidate in [artifact_path, self.snapshot / 'alignment-before-playback-repair' / artifact_path.name]:
            if candidate.is_file():
                previous = json.loads(candidate.read_text())
                if (previous.get('sourceAudioSha256') == receipt['sha256']
                        and previous.get('key') == receipt['key']
                        and previous.get('primaryRecognizer', previous.get('recognizer')) == 'Systran/faster-whisper-small'
                        and previous.get('primaryRecognizerRevision', previous.get('recognizerRevision')) == RECOGNIZER_REVISION):
                    recognition = previous.get('recognition')
                    break
        if recognition is None:
            recognition = self.recognize(audio)
        words = [word for segment in recognition for word in segment.get('words', [])]
        book = self.books[receipt['key'].split(':')[0]]
        prefix = heading_word_count(words, book, receipt['chapter'], self.locale)
        heading = words[:prefix]
        words = words[prefix:]
        windows = recognition_windows(verses, words, self.normalize)
        cues, checks, issues = [], [], []
        gaps = narration_gaps(windows, words)
        if heading:
            gaps.insert(0, {'kind': 'leading', 'text': ' '.join(w['word'] for w in heading),
                            'start': heading[0]['start'], 'end': heading[-1]['end']})
        for gap in gaps:
            text = normalized(gap['text'])
            chapter_heading = is_chapter_heading(gap, book, receipt['chapter'], self.locale)
            if (not chapter_heading and gap['kind'] == 'leading'
                    and 0 < gap.get('end', 0) - gap.get('start', 0) <= 15):
                start = max(0, gap['start'] - .2)
                end = min(duration, gap['end'] + .2)
                if windows and windows[0]['start'] is not None and windows[0]['start'] > gap['end']:
                    end = min(end, windows[0]['start'])
                for transcript in self.retry_transcripts(audio[round(start * 16000):round(end * 16000)], full_coverage=True):
                    if is_chapter_heading({**gap, 'text': transcript}, book, receipt['chapter'], self.locale):
                        gap['independentHeadingTranscript'] = transcript
                        gap['headingVerificationRange'] = [start, end]
                        gap['headingVerificationFiltered'] = False
                        chapter_heading = True
                        break
            closing_amen = gap['kind'] == 'trailing' and text in ('amen', '阿门', '阿們')
            gap['allowedHeadingOrClosing'] = chapter_heading or closing_amen
        heading_end = max([gap['end'] for gap in gaps if gap['kind'] == 'leading'
                           and gap['allowedHeadingOrClosing']] + [0])
        for index, window in enumerate(windows):
            number = window['verse']
            cue, check = None, None
            floor = max(heading_end, cues[-1]['end'] if cues else 0)
            if window['start'] is not None and window['end'] > window['start']:
                previous_end = windows[index - 1]['end'] if index else floor
                next_start = windows[index + 1]['start'] if index + 1 < len(windows) else duration
                start = max(floor, window['start'] - .4,
                            (previous_end + window['start']) / 2 if previous_end is not None else floor)
                end = min(duration, window['end'] + .4,
                          (window['end'] + next_start) / 2 if next_start is not None else duration)
                if end > start:
                    cue, check = self.verify_range(audio, window, start, end, initial=window['recognized'])
            if cue is None and recovery_needed(window, check, self.locale, self.normalize):
                bounds = recovery_range(windows, index, duration, floor=floor)
                if bounds:
                    cue, check = self.verify_range(audio, window, *bounds)
                    check['acousticRecovery'] = True
            if check is None:
                issues.append(f'no-recognized-speech:{number}')
                continue
            checks.append(check)
            if cue is None:
                issues.append(f'text-audio-needs-review:{number}')
                continue
            if cues and cue['start'] < cues[-1]['end']:
                issues.append(f'invalid-phoneme-boundary:{number}')
                continue
            cues.append(cue)
        for gap in gaps:
            if gap['allowedHeadingOrClosing']:
                continue
            for cue in cues:
                check = next(item for item in checks if item['verse'] == cue['verse'])
                if (cue['start'] <= gap.get('start', -1) <= gap.get('end', -1) <= cue['end']
                        and (not check['independentlyReheard'] or check.get('independentRangeFiltered'))
                        and not check.get('gapReplayRejected')):
                    a = max(check['searchRange'][0], cue['start'] - .2)
                    b = min(check['searchRange'][1], cue['end'] + .2)
                    candidates = list(self.retry_transcripts(audio[round(a * 16000):round(b * 16000)], full_coverage=True))
                    independent = next((text for text in candidates if self.exact_correspondence(check['text'], text)), None)
                    if independent is not None:
                        error = error_rate(self.normalize(check['text']), self.normalize(independent))
                        check.update(independentTranscript=independent, normalizedErrorRate=round(error, 4),
                                     phoneticVerified=(self.locale == 'en' and error > .025),
                                     independentlyReheard=True, independentRange=[a, b],
                                     independentRangeFiltered=False)
                    else:
                        check.update(gapReplayRejected=True, gapReplayCandidates=candidates)
                    break
            verse = gap_covered_by_verse(gap, cues, checks, self.exact_correspondence)
            if verse is not None:
                gap['accountedByVerifiedVerse'] = verse
            else:
                issues.append('unclaimed-narration:' + gap['kind'])
        artifact = {'schemaVersion': 1, 'method': METHOD, 'fingerprint': fingerprint,
                    'key': receipt['key'], 'sourceUrl': receipt['url'], 'sourceAudioSha256': receipt['sha256'],
                    'textSha256': text_sha, 'recognizer': self.recognizer_name,
                    'recognizerRevision': self.recognizer_revision,
                    'primaryRecognizer': 'Systran/faster-whisper-small',
                    'primaryRecognizerRevision': RECOGNIZER_REVISION,
                    'alignModel': ALIGN_MODELS[self.locale], 'alignModelRevision': ALIGN_REVISIONS[self.locale],
                    'duration': duration,
                    'qualityRecipe': self.recipe,
                    'sourceMetadata': {'captionManifestSha256': PSALM_CAPTION_REFERENCE_SHA256,
                                       'retryVadFilter': getattr(self, 'source_review', False)},
                    'checks': checks, 'recognition': recognition, 'issues': issues,
                    'unclaimedSpeech': gaps,
                    'accepted': not issues and len(cues) == len(verses), 'cues': cues,
                    'createdAt': datetime.now(timezone.utc).isoformat()}
        self.materialize(artifact, receipt, verses, audio_path)
        write_json(artifact_path, artifact)
        return artifact


def run(snapshot, locale, keys=None, limit=0, shard_index=0, shard_count=1, review_rejected=False,
        source_review=False):
    if not 0 <= shard_index < shard_count:
        raise ValueError('Invalid alignment shard')
    if source_review and review_rejected:
        raise ValueError('Choose only one review phase')
    books = json.loads((snapshot / 'bible.json').read_text())
    chapters = {(b['id'], i + 1): chapter for b in books for i, chapter in enumerate(b['chapters'])}
    receipts = [json.loads(path.read_text()) for path in (snapshot / 'recordings').glob('*.json')]
    receipts = [receipt for receipt in receipts if receipt['locale'] == locale
                and (not keys or receipt['key'] in keys)]
    if review_rejected:
        from context_review import eligible_for_review
        reports = {p.stem.replace('__', ':'): json.loads(p.read_text())
                   for p in (snapshot / 'alignment').glob('*.json')}
        receipts = [r for r in receipts if eligible_for_review(reports.get(r['key']))]
        receipts.sort(key=lambda r: (len(reports[r['key']]['issues']), r['key']))
    if source_review:
        reports = {p.stem.replace('__', ':'): json.loads(p.read_text())
                   for p in (snapshot / 'alignment').glob('*.json')}
        receipts = [r for r in receipts if reports.get(r['key'], {}).get('accepted') is False
                    and reports[r['key']].get('qualityRecipe') != SOURCE_REVIEW_RECIPE]
        receipts.sort(key=lambda r: (reports[r['key']]['issues'] != ['unclaimed-narration:leading'],
                                     len(reports[r['key']]['issues']), r['key']))
    common = [f'{key}:{locale}' for key in ['psalms:23', 'john:1', 'genesis:1', 'psalms:150']]
    book_order = {book['id']: i for i, book in enumerate(books)}
    heading_only = set()
    for path in (snapshot / 'alignment').glob('*.json'):
        artifact = json.loads(path.read_text())
        if artifact.get('issues') == ['unclaimed-narration:leading']:
            heading_only.add(artifact['key'])
    if not review_rejected and not source_review:
        receipts.sort(key=lambda r: (r['key'] not in heading_only,
                                 common.index(r['key']) if r['key'] in common else len(common),
                                 book_order[r['key'].split(':')[0]], r['chapter']))
    if limit:
        receipts = receipts[:limit]
    receipts = [receipt for receipt in receipts
                if recording_shard(receipt['key'], shard_count) == shard_index]
    aligner = SiteAligner(locale, snapshot, source_review=source_review)
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
            result = aligner.align_recording(receipt, verses, review_rejected=review_rejected,
                                            source_review=source_review)
            accepted += result['accepted']
        except Exception:
            logging.exception('Alignment job failed: %s', receipt['key'])
            raise
        completed += 1
        status = {'locale': locale, 'shard': shard_index, 'shardCount': shard_count,
                  'runId': os.environ.get('SELAH_ALIGNMENT_RUN_ID', ''),
                  'completed': completed, 'total': len(receipts), 'accepted': accepted,
                  'current': receipt['key'], 'elapsedSeconds': round(time.monotonic() - started),
                  'updatedAt': datetime.now(timezone.utc).isoformat()}
        suffix = f'-{shard_index}' if shard_count > 1 else ''
        write_json(snapshot / f'alignment-status-{locale}{suffix}.json', status)
        print(json.dumps(status), result['issues'], flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--snapshot', type=Path, required=True)
    parser.add_argument('--locale', choices=['en', 'zh'], required=True)
    parser.add_argument('--keys', help='Comma-separated canonical book:chapter:locale keys')
    parser.add_argument('--limit', type=int, default=0)
    parser.add_argument('--shard-index', type=int, default=0)
    parser.add_argument('--shard-count', type=int, default=1)
    review = parser.add_mutually_exclusive_group()
    review.add_argument('--review-rejected', action='store_true', help='Re-listen only to disputed verses in rejected reports')
    review.add_argument('--source-review', action='store_true', help='Review failures using pinned source captions, editorial notes and VAD retries')
    args = parser.parse_args()
    run(args.snapshot.resolve(), args.locale, args.keys.split(',') if args.keys else None,
        args.limit, args.shard_index, args.shard_count, args.review_rejected, args.source_review)
