"""Explicit offline full-Whisper review of rejected English recordings."""
import hashlib
from pathlib import Path

from align_site import SiteAligner
from timed_text import error_rate
from alignment_contract import (DEEP_REVIEW_RECIPE, DEEP_RECOGNIZER, RECOGNIZERS,
                                FULL_MODEL, FULL_REVISION, FULL_MODEL_SHA256,
                                CPU_HYBRID_MODEL)


class DeepReviewAligner(SiteAligner):
    def __init__(self, locale, snapshot):
        if locale != 'en':
            raise ValueError('Full model review has only been validated for English')
        super().__init__(locale, snapshot, source_review=True)
        if self.device != 'cpu' or self.recognizer_name != CPU_HYBRID_MODEL:
            raise ValueError('Full review requires the pinned CPU small and turbo recognizers')
        from huggingface_hub import snapshot_download
        from faster_whisper import WhisperModel
        model_path = Path(snapshot_download(FULL_MODEL, revision=FULL_REVISION, local_files_only=True))
        digest = hashlib.sha256()
        with (model_path / 'model.bin').open('rb') as source:
            for block in iter(lambda: source.read(4 * 1024 * 1024), b''):
                digest.update(block)
        if digest.hexdigest() != FULL_MODEL_SHA256:
            raise ValueError('Full model differs from its pinned official SHA-256')
        import os
        self.full_retry = WhisperModel(str(model_path), device='cpu', compute_type='int8',
                                      cpu_threads=int(os.environ.get('SELAH_ALIGNMENT_THREADS', '4')),
                                      local_files_only=True)
        self.recipe = DEEP_REVIEW_RECIPE
        self.recognizer_name = DEEP_RECOGNIZER
        self.recognizer_revision = RECOGNIZERS[DEEP_RECOGNIZER]

    def retry_transcripts(self, source, full_coverage=False):
        yield from super().retry_transcripts(source, full_coverage=full_coverage)
        # No reference prompt or filtering: a full-model candidate still has
        # to satisfy the existing text, acoustic and complete-coverage checks.
        segments, _ = self.full_retry.transcribe(
            source, language=self.locale, word_timestamps=False, vad_filter=False,
            condition_on_previous_text=False, beam_size=5)
        yield ''.join(segment.text for segment in segments)

    def verse_transcripts(self, source, reference):
        candidates = []
        for transcript in self.retry_transcripts(source):
            candidates.append(transcript)
            if (error_rate(self.normalize(reference), self.normalize(transcript)) <= .025
                    or self.exact_correspondence(reference, transcript)):
                break
        return candidates
