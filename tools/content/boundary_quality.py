"""ML-free checks of verse location and acoustic edges, not ASR spelling."""
import math
import hashlib
import json
from spoken_text import boundary_text
from timed_text import normalized

POLICY = {'minimumMeanScore': .65, 'minimumEdgeScore': .50, 'minimumTimedFraction': .80,
          'searchEdgeMargin': .03, 'headPadding': .06, 'tailPadding': .10,
          'maximumQuietRms': .01, 'quietRelativeRms': .15,
          'minimumAnchorProbability': .70, 'maximumEdgeAnchorDistance': .20,
          'maximumAnchorPaddingDistance': 1.0, 'minimumSupportedEdgeScore': .35,
          'spokenTextRecipe': 'site-notes-trailing-cross-verse-marker-v1',
          'anchorContainment': 'complete-supported-edges-v1'}


def finite(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def verse_boundary(words, bounds, duration, locale, reference=None, signal=None, anchors=None):
    evidence = {'passed': False, 'reasons': []}
    reasons = evidence['reasons']
    if (locale not in {'en', 'zh'} or len(bounds) != 2
            or not all(finite(v) for v in [*bounds, duration])
            or not 0 <= bounds[0] < bounds[1] <= duration or not words):
        reasons.append('invalid-search-range-or-empty-verse')
        return None, evidence
    start, end = bounds
    if reference is not None and normalized(''.join(w.get('word', '') for w in words)) != normalized(reference):
        reasons.append('incomplete-source-word-sequence')
        return None, evidence
    # Punctuation is not a spoken edge and may be assigned a blank-frame time.
    words = [w for w in words if normalized(w.get('word', ''))]
    if not words:
        reasons.append('empty-spoken-verse')
        return None, evidence
    for word in words:
        if any(value is not None and not finite(value)
               for value in [word.get('start'), word.get('end'), word.get('score')]):
            reasons.append('nonfinite-word-evidence')
            return None, evidence
    timed = [word for word in words if finite(word.get('start')) and finite(word.get('end'))
             and finite(word.get('score'))]
    fraction = len(timed) / len(words)
    evidence['timedFraction'] = round(fraction, 4)
    if not timed or timed[0] is not words[0] or timed[-1] is not words[-1]:
        reasons.append('missing-edge-word')
        return None, evidence
    mean = sum(word['score'] for word in timed) / len(timed)
    head, tail = words[0]['score'], words[-1]['score']
    anchors = anchors or []
    def anchor(index):
        if len(anchors) != 2:
            return None
        value = anchors[index]
        if (not all(finite(value.get(k)) for k in ['start', 'end', 'probability'])
                or not 0 <= value['start'] < value['end'] <= duration
                or not POLICY['minimumAnchorProbability'] <= value['probability'] <= 1):
            return None
        return value
    head_anchor, tail_anchor = anchor(0), anchor(1)
    head_supported = (head_anchor is not None and head >= POLICY['minimumSupportedEdgeScore']
                      and abs(head_anchor['start']-words[0]['start']) <= POLICY['maximumEdgeAnchorDistance'])
    tail_supported = (tail_anchor is not None and tail >= POLICY['minimumSupportedEdgeScore']
                      and abs(tail_anchor['end']-words[-1]['end']) <= POLICY['maximumEdgeAnchorDistance'])
    evidence.update(meanAlignmentScore=round(mean, 4), headScore=head, tailScore=tail)
    if fraction < POLICY['minimumTimedFraction'] or mean < POLICY['minimumMeanScore']:
        reasons.append('weak-verse-location')
    if ((head < POLICY['minimumEdgeScore'] and not head_supported)
            or (tail < POLICY['minimumEdgeScore'] and not tail_supported)):
        reasons.append('weak-edge-word')
    previous = start
    for word in timed:
        if (not 0 <= word['score'] <= 1 or not start <= word['start'] < word['end'] <= end
                or word['start'] < previous - .02):
            reasons.append('invalid-word-order-or-range')
            break
        previous = word['end']
    core_start, core_end = words[0]['start'], words[-1]['end']
    evidence['acousticCore'] = [core_start, core_end]
    signal = signal or {}
    reference_rms = signal.get('verseRms', 0)
    quiet_limit = (min(POLICY['maximumQuietRms'], reference_rms * POLICY['quietRelativeRms'])
                   if finite(reference_rms) and reference_rms > 0 else 0)
    def quiet(name):
        value = signal.get(name)
        return (finite(value) and finite(signal.get('verseRms')) and signal['verseRms'] > 0
                and 0 <= value <= quiet_limit)
    if ((start > 0 and core_start - start < POLICY['searchEdgeMargin'] and not quiet('headRms') and not head_supported)
            or (end < duration and end - core_end < POLICY['searchEdgeMargin'] and not quiet('tailRms') and not tail_supported)):
        reasons.append('edge-at-search-limit')
    if core_end - core_start < .25 or len(words) / max(.001, core_end-core_start) > (12 if locale == 'zh' else 8):
        reasons.append('implausible-verse-duration')
    protected_start, protected_end = core_start, core_end
    if head_anchor and abs(head_anchor['start']-core_start) <= POLICY['maximumAnchorPaddingDistance']:
        protected_start = min(protected_start, head_anchor['start'])
    if tail_anchor and abs(tail_anchor['end']-core_end) <= POLICY['maximumAnchorPaddingDistance']:
        protected_end = max(protected_end, tail_anchor['end'])
    cue = [round(max(start, protected_start-POLICY['headPadding']), 3),
           round(min(end, protected_end+POLICY['tailPadding']), 3)]
    if protected_start < start-.001 or protected_end > end+.001:
        reasons.append('independent-edge-outside-range')
    if cue[1] - cue[0] < .35:
        reasons.append('verse-too-short')
    evidence['passed'] = not reasons
    return (cue if evidence['passed'] else None), evidence


def boundary_gap_issues(gaps, cues):
    """Headers/closings may remain outside clips; interior speech needs a home."""
    if not cues:
        return ['missing-verse-boundaries']
    first, last = cues[0]['start'], cues[-1]['end']
    issues = []
    for gap in gaps:
        start, end = gap.get('start'), gap.get('end')
        if not finite(start) or not finite(end) or not 0 <= start <= end:
            issues.append('invalid-unassigned-speech-range')
        elif end <= first or start >= last:
            continue
        elif not any(cue['start'] <= start <= end <= cue['end'] for cue in cues):
            issues.append('boundary-unassigned-speech:' + gap.get('kind', 'unknown'))
    return issues


def verified_boundary_artifact(artifact):
    """Publication rechecks edge evidence; a recipe label alone is insufficient."""
    try:
        if (artifact.get('verificationScope') != 'verse-boundaries' or artifact.get('boundaryPolicy') != POLICY
                or not artifact.get('accepted') or artifact.get('issues')):
            return False
        expected = artifact['expectedVerseNumbers']
        verses = artifact['boundarySourceVerses']
        text_sha = hashlib.sha256(json.dumps(verses, ensure_ascii=False, sort_keys=True).encode()).hexdigest()
        if text_sha != artifact['textSha256'] or [v['number'] for v in verses] != expected:
            return False
        cues, checks = artifact['cues'], artifact['checks']
        if (not expected or len(set(expected)) != len(expected)
                or [c['verse'] for c in cues] != expected or [c['verse'] for c in checks] != expected):
            return False
        previous = 0
        recognized_words = [w for segment in artifact.get('recognition', []) for w in segment.get('words', [])]
        for cue, check, verse in zip(cues, checks, verses):
            anchors = check.get('asrEdgeAnchors')
            if anchors and (len(anchors) != 2 or any(anchor not in recognized_words for anchor in anchors)):
                return False
            edges, evidence = verse_boundary(check['alignedWords'], check['searchRange'],
                                             artifact['duration'], artifact['key'].rsplit(':', 1)[-1],
                                             reference=boundary_text(verse['text'], artifact['key'].rsplit(':', 1)[-1]),
                                             signal=check.get('boundarySignal'), anchors=anchors)
            if (edges is None or not check.get('boundaryVerified') or check['text'] != cue['text']
                    or check['text'] != verse['text']
                    or cue['start'] != edges[0] or cue['end'] != edges[1]
                    or not previous <= cue['start'] < cue['end'] <= artifact['duration']):
                return False
            previous = cue['end']
        return not boundary_gap_issues(artifact['unclaimedSpeech'], cues)
    except (KeyError, TypeError, ValueError, IndexError, ZeroDivisionError):
        return False
