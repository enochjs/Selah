"""Align verse edges without requiring letter-for-letter independent ASR agreement."""
import json
import os

from align_site import SiteAligner, matching_text, prepare_tokenizer
from spoken_text import boundary_text
from alignment_contract import (ALIGN_MODELS, ALIGN_REVISIONS, BOUNDARY_REVIEW_RECIPE,
                                BOUNDARY_RECOGNIZER, RECOGNIZERS, RECOGNIZER_REVISION)
from boundary_quality import POLICY, verse_boundary, boundary_gap_issues, finite
from source_metadata import load_psalm_captions
from timed_text import error_rate


class BoundaryAligner(SiteAligner):
    verse_issue_prefix = 'unreliable-verse-boundary'

    def __init__(self, locale, snapshot):
        import torch
        from huggingface_hub import snapshot_download
        from whisperx.alignment import load_align_model
        self.locale, self.snapshot, self.device = locale, snapshot, 'cpu'
        self.source_review = False
        self.recipe = BOUNDARY_REVIEW_RECIPE
        self.recognizer_name = BOUNDARY_RECOGNIZER
        self.recognizer_revision = RECOGNIZERS[BOUNDARY_RECOGNIZER]
        self.recognizer = None
        self.normalize = lambda text: matching_text(boundary_text(text, locale), locale)
        self.threads = int(os.environ.get('SELAH_ALIGNMENT_THREADS', '4'))
        if not 1 <= self.threads <= 8:
            raise ValueError('Alignment threads must be between 1 and 8')
        torch.set_num_threads(self.threads)
        torch.set_num_interop_threads(1)
        prepare_tokenizer(snapshot)
        self.books = {book['id']: book for book in json.loads((snapshot / 'bible.json').read_text())}
        if locale == 'en':
            captions = load_psalm_captions(snapshot)
            if captions:
                self.books['psalms']['audioHeadings'] = captions
        model_path = snapshot_download(ALIGN_MODELS[locale], revision=ALIGN_REVISIONS[locale], local_files_only=True)
        self.model, self.metadata = load_align_model(locale, self.device, model_name=model_path, model_cache_only=True)

    def recognize(self, source, word_timestamps=True, vad_filter=False):
        # Existing source-matched ASR word times are only coarse location anchors.
        # Load small lazily only if those anchors are absent; no large-model retries.
        if self.recognizer is None:
            from faster_whisper import WhisperModel
            from huggingface_hub import snapshot_download
            path = snapshot_download('Systran/faster-whisper-small', revision=RECOGNIZER_REVISION,
                                     local_files_only=True)
            self.recognizer = WhisperModel(path, device='cpu', compute_type='int8',
                                          cpu_threads=self.threads, local_files_only=True)
        return super().recognize(source, word_timestamps, vad_filter)

    def retry_transcripts(self, source, full_coverage=False):
        return iter(())

    def verify_range(self, audio, window, start, end, initial=None):
        from whisperx.alignment import align
        result = align([{'start': start, 'end': end, 'text': boundary_text(window['text'], self.locale)}],
                       self.model, self.metadata, audio, self.device,
                       interpolate_method='ignore', return_char_alignments=False)
        words = [word for segment in result['segments'] for word in segment['words']]
        import numpy as np
        sample_rate = 16000
        def rms(a, b):
            values = np.asarray(audio[max(0, round(a*sample_rate)):min(len(audio), round(b*sample_rate))])
            return float(np.sqrt(np.mean(np.square(values)))) if len(values) else 0.0
        signal = {'headRms': rms(start-.02, start+.02), 'tailRms': rms(end-.02, end+.02),
                  'verseRms': rms(start, end)}
        edges, evidence = verse_boundary(words, [start, end], len(audio)/16000, self.locale,
                                         reference=boundary_text(window['text'], self.locale), signal=signal,
                                         anchors=window.get('asrEdgeAnchors'))
        timed = [w for w in words if finite(w.get('start')) and finite(w.get('end'))]
        check = {'verse': window['verse'], 'text': window['text'],
                 'spokenText': boundary_text(window['text'], self.locale),
                 'independentTranscript': initial or '', 'normalizedErrorRate':
                 round(error_rate(self.normalize(window['text']), self.normalize(initial or '')), 4),
                 'meanAlignmentScore': evidence.get('meanAlignmentScore', 0),
                 'wordCount': len(words), 'timedWordCount': len(timed), 'alignedWords': words,
                 'searchRange': [start, end], 'boundarySignal': signal, 'boundaryVerified': evidence['passed'],
                 'boundaryEvidence': evidence, 'asrEdgeAnchors': window.get('asrEdgeAnchors', []),
                 'independentlyReheard': False, 'phoneticVerified': False}
        if edges is None:
            return None, check
        return {'verse': window['verse'], 'text': window['text'], 'start': edges[0], 'end': edges[1]}, check

    def needs_recovery(self, window, check):
        return not check or not check.get('boundaryVerified')

    def decorate_windows(self, windows, words):
        for window in windows:
            if 'firstWord' in window and 'lastWord' in window:
                window['asrEdgeAnchors'] = [words[window['firstWord']], words[window['lastWord']]]
        return windows

    def assess_gaps(self, audio, gaps, cues, checks):
        return boundary_gap_issues(gaps, cues)

    def publication_evidence(self, verses):
        return {'verificationScope': 'verse-boundaries', 'boundaryPolicy': dict(POLICY),
                'expectedVerseNumbers': [v['number'] for v in verses], 'boundarySourceVerses': verses}
