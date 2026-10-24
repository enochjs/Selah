"""Word-time correspondence and interoperable WebVTT subtitle export."""
from difflib import SequenceMatcher
import html
import math
import re
import unicodedata


def normalized(text):
    return ''.join(c for c in unicodedata.normalize('NFKC', text).casefold() if c.isalnum())


def error_rate(reference, hypothesis):
    previous = list(range(len(hypothesis) + 1))
    for i, left in enumerate(reference, 1):
        current = [i]
        for j, right in enumerate(hypothesis, 1):
            current.append(min(previous[j] + 1, current[j - 1] + 1,
                               previous[j - 1] + (left != right)))
        previous = current
    return previous[-1] / max(1, len(reference))


def recognition_windows(verses, words, normalize=normalized):
    texts = [normalize(verse['text']) for verse in verses]
    reference = ''.join(texts)
    hypothesis, owners = '', []
    for index, word in enumerate(words):
        token = normalize(word['word'])
        hypothesis += token
        owners.extend([index] * len(token))
    mapping = {}
    for block in SequenceMatcher(None, reference, hypothesis, autojunk=False).get_matching_blocks():
        mapping.update({block.a + i: block.b + i for i in range(block.size)})
    results, offset = [], 0
    for verse, text in zip(verses, texts):
        positions = [mapping[i] for i in range(offset, offset + len(text)) if i in mapping]
        if positions:
            first, last = owners[min(positions)], owners[max(positions)]
            recognized = ''.join(w['word'] for w in words[first:last + 1])
            result = {'verse': verse['number'], 'text': verse['text'], 'start': words[first]['start'],
                      'end': words[last]['end'], 'recognized': recognized,
                      'firstWord': first, 'lastWord': last,
                      'errorRate': error_rate(text, normalize(recognized))}
        else:
            result = {'verse': verse['number'], 'text': verse['text'], 'start': None,
                      'end': None, 'recognized': '', 'errorRate': 1.0}
        results.append(result)
        offset += len(text)
    return results


def narration_gaps(windows, words):
    """Account for the complete recognized narration, including unmatched clauses."""
    ranges = []
    timed = [w for w in windows if w['start'] is not None]
    if not timed:
        return [{'kind': 'unmatched-recording', 'text': ' '.join(w['word'].strip() for w in words)}]
    ranges.append(('leading', 0, timed[0]['firstWord']))
    for left, right in zip(timed, timed[1:]):
        ranges.append(('between-verses', left['lastWord'] + 1, right['firstWord']))
    ranges.append(('trailing', timed[-1]['lastWord'] + 1, len(words)))
    results = []
    for kind, start, end in ranges:
        if start < end:
            text = ' '.join(w['word'].strip() for w in words[start:end])
            if normalized(text):
                results.append({'kind': kind, 'text': text, 'start': words[start]['start'],
                                'end': words[end - 1]['end']})
    return results


def timestamp(seconds):
    milliseconds = round(seconds * 1000)
    hours, milliseconds = divmod(milliseconds, 3600000)
    minutes, milliseconds = divmod(milliseconds, 60000)
    seconds, milliseconds = divmod(milliseconds, 1000)
    return f'{hours:02d}:{minutes:02d}:{seconds:02d}.{milliseconds:03d}'


def webvtt(usfm, chapter, cues):
    if not re.fullmatch('[A-Z0-9]{3}', usfm) or chapter < 1:
        raise ValueError('Invalid canonical reference')
    lines, previous_end, seen = ['WEBVTT', ''], 0, set()
    for cue in cues:
        start, end, number = cue['start'], cue['end'], cue['verse']
        if (not all(math.isfinite(t) for t in [start, end])
                or not 0 <= previous_end <= start < end or number in seen):
            raise ValueError('Invalid or overlapping WebVTT cue')
        seen.add(number)
        lines.extend([f'{usfm}.{chapter}.{number}', f'{timestamp(start)} --> {timestamp(end)}',
                      html.escape(cue['text']), ''])
        previous_end = end
    return '\n'.join(lines) + '\n'
