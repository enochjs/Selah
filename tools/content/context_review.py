"""Re-listen to disputed verses without changing text or weakening acceptance."""
import copy
from datetime import datetime, timezone
import hashlib
import json
import math

from alignment_contract import CONTEXT_REVIEW_RECIPE, site_fingerprint
from publish_site import recording_entry
from timed_text import error_rate, gap_covered_by_verse


def eligible_for_review(artifact):
    return (artifact is not None and artifact.get('accepted') is False
            and (artifact.get('contextReview', {}).get('recipe') != CONTEXT_REVIEW_RECIPE
                 or bool(artifact.get('contextReview', {}).get('unattemptedVerses'))))


def review_bounds(check, cues, duration, margin):
    number = check['verse']
    previous = max([c['end'] for c in cues if c['verse'] < number] + [0])
    following = min([c['start'] for c in cues if c['verse'] > number] + [duration])
    start = max(0, previous, check['searchRange'][0] - margin)
    end = min(duration, following, check['searchRange'][1] + margin)
    return (start, end) if 0 <= start < end and end - start <= 60 else None


def review_targets(artifact):
    targets = {int(issue.rsplit(':', 1)[1]) for issue in artifact['issues']
               if issue.startswith(('text-audio-needs-review:', 'no-recognized-speech:'))}
    targets.update(c['verse'] for c in artifact['checks'] if 'searchRange' not in c)
    checks = [c for c in artifact['checks'] if 'searchRange' in c]
    for gap in artifact.get('unclaimedSpeech', []):
        if gap.get('allowedHeadingOrClosing') or not checks:
            continue
        start, end = gap.get('start'), gap.get('end')
        if start is None or end is None:
            continue
        left = [c for c in checks if c['searchRange'][0] <= start]
        right = [c for c in checks if c['searchRange'][1] >= end]
        if left:
            targets.add(max(left, key=lambda c: c['searchRange'][1])['verse'])
        if right:
            targets.add(min(right, key=lambda c: c['searchRange'][0])['verse'])
    return targets


def correspondence(aligner, reference, transcript):
    error = error_rate(aligner.normalize(reference), aligner.normalize(transcript))
    return error <= (.10 if aligner.locale == 'zh' else .025) or aligner.exact_correspondence(reference, transcript)


def choose_transcript(aligner, reference, candidates):
    acceptable = [text for text in candidates if correspondence(aligner, reference, text)]
    return min(acceptable, key=lambda text: (not aligner.exact_correspondence(reference, text),
               error_rate(aligner.normalize(reference), aligner.normalize(text))), default=None)


def cover_reheard_edges(aligner, cue, check, gaps, bounds):
    """Keep a short consonant/tail in the clip only after full-range proof.

    The acoustic core remains recorded. This is at most 400ms of checked
    edge audio, never interpolation or permission to discard unknown speech.
    """
    result = copy.deepcopy(cue)
    heard = check.get('independentRange')
    if (not check.get('independentlyReheard') or check.get('independentRangeFiltered') or not heard
            or not aligner.exact_correspondence(check['text'], check['independentTranscript'])):
        return result
    for gap in gaps:
        start, end = gap.get('start'), gap.get('end')
        if (start is None or end is None or not 0 <= start <= end
                or not heard[0] <= start <= end <= heard[1]
                or not bounds[0] <= start <= end <= bounds[1]
                or end < cue['start'] or start > cue['end']
                or cue['start'] - start > .4 or end - cue['end'] > .4):
            continue
        result.setdefault('acousticCore', [cue['start'], cue['end']])
        result.update(start=round(min(result['start'], start), 3), end=round(max(result['end'], end), 3))
    return result


def valid_verse(aligner, verse, cue, check, duration):
    if not cue or not check:
        return False
    times = [cue['start'], cue['end'], check['meanAlignmentScore']]
    return (all(math.isfinite(x) for x in times)
            and cue['verse'] == verse['number'] == check['verse']
            and cue['text'] == verse['text'] == check['text']
            and 0 <= cue['start'] < cue['end'] <= round(duration, 3)
            and cue['end'] - cue['start'] >= .35
            and check['meanAlignmentScore'] >= .35
            and 0 < check['wordCount'] == check['timedWordCount']
            and correspondence(aligner, verse['text'], check['independentTranscript']))


def review_artifact(aligner, artifact, receipt, verses, audio):
    text_sha = hashlib.sha256(json.dumps(verses, ensure_ascii=False, sort_keys=True).encode()).hexdigest()
    if recording_entry(receipt, artifact, text_sha)['alignmentStatus'] != 'review-required':
        raise ValueError('Context review requires a matching rejected report and original source')
    reviewed = copy.deepcopy(artifact)
    cues = {cue['verse']: cue for cue in reviewed['cues']}
    checks = {check['verse']: check for check in reviewed['checks']}
    attempted, recovered, unattempted = 0, 0, []
    text_by_number = {verse['number']: verse['text'] for verse in verses}
    for number in sorted(review_targets(reviewed)):
        old = checks.get(number)
        if not old or 'searchRange' not in old:
            previous = max([c['end'] for c in cues.values() if c['verse'] < number] + [0])
            following = min([c['start'] for c in cues.values() if c['verse'] > number] + [reviewed['duration']])
            old = {'verse': number, 'text': text_by_number[number], 'searchRange': [previous, following]}
        window = {'verse': number, 'text': old['text']}
        neighboring_gaps = [gap for gap in reviewed.get('unclaimedSpeech', [])
                            if not gap.get('allowedHeadingOrClosing')
                            and gap.get('start') is not None and gap.get('end') is not None
                            and gap['start'] <= old['searchRange'][1]
                            and gap['end'] >= old['searchRange'][0]]
        changed, seen_bounds = False, set()
        attempts_before = attempted
        for margin in [.25, .5, 1.0]:
            bounds = review_bounds(old, list(cues.values()), reviewed['duration'], margin)
            if bounds is None or bounds in seen_bounds:
                continue
            seen_bounds.add(bounds)
            start, end = bounds
            attempted += 1
            # Neither model receives reference text, prompts, or hints. Accept
            # only a complete transcript of this bounded audio interval.
            candidates = list(aligner.retry_transcripts(audio[round(start * 16000):round(end * 16000)]))
            independent = choose_transcript(aligner, old['text'], candidates)
            if independent is None:
                continue
            cue, check = aligner.verify_range(audio, window, start, end, initial=independent)
            if cue is None:
                continue
            if check['independentTranscript'] == independent:
                check.update(independentlyReheard=True, independentRange=[start, end])
            cue = cover_reheard_edges(aligner, cue, check, neighboring_gaps, bounds)
            cues[number], checks[number] = cue, check
            changed = True
            if all(gap_covered_by_verse(gap, [cue], [check], aligner.exact_correspondence) is not None
                   for gap in neighboring_gaps):
                break
        recovered += changed
        if attempted == attempts_before:
            unattempted.append(number)
    reviewed['cues'] = [cues[n] for n in sorted(cues)]
    reviewed['checks'] = [checks[n] for n in sorted(checks)]
    issues, previous_end = [], 0
    for verse in verses:
        number = verse['number']
        cue, check = cues.get(number), checks.get(number)
        if not valid_verse(aligner, verse, cue, check, reviewed['duration']):
            prefix = 'no-recognized-speech' if check is None else 'text-audio-needs-review'
            issues.append(f'{prefix}:{number}')
        elif cue['start'] < previous_end:
            issues.append(f'invalid-phoneme-boundary:{number}')
        if cue:
            previous_end = cue['end']
    for gap in reviewed.get('unclaimedSpeech', []):
        if gap.get('allowedHeadingOrClosing'):
            continue
        number = gap_covered_by_verse(gap, reviewed['cues'], reviewed['checks'], aligner.exact_correspondence)
        if number is None:
            gap.pop('accountedByVerifiedVerse', None)
            issues.append('unclaimed-narration:' + gap['kind'])
        else:
            gap['accountedByVerifiedVerse'] = number
    reviewed.update(issues=issues, accepted=not issues and len(cues) == len(verses),
                    contextReview={'recipe': CONTEXT_REVIEW_RECIPE, 'attempts': attempted,
                                   'reverifiedVerses': recovered, 'unattemptedVerses': unattempted,
                                   'updatedAt': datetime.now(timezone.utc).isoformat()})
    if reviewed['accepted']:
        reviewed.update(qualityRecipe=CONTEXT_REVIEW_RECIPE,
                        fingerprint=site_fingerprint(receipt['sha256'], text_sha, receipt['locale'],
                                                     CONTEXT_REVIEW_RECIPE, reviewed['recognizer']))
    return reviewed
