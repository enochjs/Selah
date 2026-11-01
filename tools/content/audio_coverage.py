"""ML-free, source-bound proofs for confirmed missing narration and verse aliases."""
from copy import deepcopy
import math
import re

from boundary_quality import finite
from quiet_gaps import GAP_POLICY, context_range, digest, reference_ranges, rms
from source_omissions import niv_missing_numbers, validate_niv_evidence

# Keep this proof distinct from text projection and acoustic boundary acceptance.
COVERAGE_POLICY = {
    'version': 'source-narration-coverage-v3',
    'userConfirmation': 'recorded-exact-source-user-attestation-not-a-quiet-proof-v1',
    'vadNeighborEdgeSamples': 512,
    'vadAttribution': 'single-original-segment-crossing-real-neighbor-cue-edge-and-positive-clear-gap-v1',
    'acoustics': dict(GAP_POLICY),
    'english': 'official-niv-section-absence-and-full-source-vad-clear',
    'chinese': 'pinned-parenthetical-source-and-full-source-vad-clear-and-each-frame-quiet',
    'neighbors': 'real-narrated-cues-with-original-pcm-and-vad-speech',
    'aliases': 'literal-see-previous-verse-to-previous-real-source-root',
}
_REASON = 'not-narrated-in-source'
_ZH_BLOCKS = {
    'exodus:16:zh': [[(36, '（俄梅珥乃伊法十分之一）。')]],
    'mark:7:zh': [[(3, '（原来法利赛人，和犹太人，都拘守古人的遗传，若不仔细洗手，就不吃饭。'),
                   (4, '从市上来，若不洗浴，也不吃饭，还有好些别的规矩，他们历代拘守，就是洗杯，罐，铜器，等物）。')],
                  [(16, '有耳可听的就应当听）。')]],
    'mark:15:zh': [[(28, '这就应了经上的话说，他被列在罪犯之中）')]],
    'matthew:18:zh': [[(11, '人子来为要拯救失丧的人）')]],
    'matthew:23:zh': [[(14, '你们这假冒为善的文士和法利赛人有祸了，因为你们侵吞寡妇的家产，假意作很长的祷告，所以要受更重的刑罚）')]],
}
COVERAGE_POLICY['chineseCandidatesSha256'] = digest(_ZH_BLOCKS)
# This is an already-recorded human observation, never a model inference.
# New recordings, translations, source texts or verses require their own evidence.
USER_CONFIRMATIONS = [{
    'key': 'acts:8:en', 'verse': 37,
    'sourceAudioSha256': '36349e66505bea3b2cccc8f16bcb3ebaed4dc7f46e47e582bf5fc144476707e9',
    'textSha256': '7ecfae6716d0cbb2ce6d7675cdf281026e8494436f5011d00daf0d669513fcce',
    'quote': '我看了下37节，确实是没有读；正常播放的时候直接跳过就好了；不影响其他节；相同情况都这么处理',
    'source': 'user-confirmation-in-this-chat', 'date': '2026-10-25',
}]
COVERAGE_POLICY['userConfirmationsSha256'] = digest(USER_CONFIRMATIONS)


def _source(key, verses):
    if not isinstance(key, str) or not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*:[1-9][0-9]*:(?:en|zh)', key):
        raise ValueError('Coverage requires an exact chapter and narration language')
    if not isinstance(verses, list) or not verses:
        raise ValueError('Coverage requires the complete nonempty source verse list')
    previous = 0
    for verse in verses:
        if (not isinstance(verse, dict) or type(verse.get('number')) is not int
                or verse['number'] <= previous or not isinstance(verse.get('text'), str)
                or not verse['text'].strip()):
            raise ValueError('Source verses must be unique, ordered and retain their complete original text')
        previous = verse['number']
    return {verse['number']: verse for verse in verses}


def _literal(text):
    return ''.join(text.split())


def _alias(text):
    return re.fullmatch(r'[（(]见上节[）)]?[。．.!！?？、，,；;：:]*', _literal(text)) is not None


def candidate_roles(key, verses, niv_evidence=None):
    """Return only source-authorized candidates, never infer absence from failed ASR."""
    source = _source(key, verses)
    missing = []
    if key.endswith(':en'):
        canonical = list(range(1, max(source) + 1))
        if validate_niv_evidence(niv_evidence, key, canonical):
            missing = [number for number in niv_missing_numbers(niv_evidence, key, canonical) if number in source]
    else:
        for block in _ZH_BLOCKS.get(key, []):
            if not all(number in source and _literal(source[number]['text']) == _literal(text)
                       for number, text in block):
                continue
            first, literal = block[0]
            if not literal.startswith(('（', '(')):
                previous = source.get(first - 1)
                if not previous or not re.search(r'[（(]有古卷在此有[，,\s]*$', previous['text']):
                    continue
            missing.extend(number for number, _ in block)
    missing = sorted(set(missing))
    aliases, root = [], None
    if key.endswith(':zh'):
        for verse in verses:
            if _alias(verse['text']):
                if root is not None and root not in missing:
                    aliases.append({'verse': verse['number'], 'into': root})
            else:
                root = verse['number']
    return {'key': key, 'sourceTextSha256': digest(verses),
            'missingVerses': [{'verse': number, 'reason': _REASON} for number in missing], 'aliases': aliases}


def _partition(key, verses, roles):
    source = _source(key, verses)
    if (not isinstance(roles, dict) or set(roles) != {'key', 'sourceTextSha256', 'missingVerses', 'aliases'}
            or roles['key'] != key or roles['sourceTextSha256'] != digest(verses)
            or not isinstance(roles['missingVerses'], list) or not isinstance(roles['aliases'], list)):
        raise ValueError('Coverage roles must bind the exact source chapter, language and text')
    missing = []
    for item in roles['missingVerses']:
        if (not isinstance(item, dict) or set(item) != {'verse', 'reason'}
                or type(item['verse']) is not int or item['verse'] not in source or item['reason'] != _REASON):
            raise ValueError('Unknown missing source verse')
        missing.append(item['verse'])
    if missing != sorted(set(missing)):
        raise ValueError('Missing verses must be unique and in source order')
    aliases = {}
    for item in roles['aliases']:
        if (not isinstance(item, dict) or set(item) != {'verse', 'into'}
                or any(type(item[name]) is not int for name in ['verse', 'into'])
                or item['verse'] not in source or item['into'] not in source
                or item['verse'] in missing or item['into'] in missing or item['verse'] in aliases
                or not key.endswith(':zh') or not _alias(source[item['verse']]['text'])):
            raise ValueError('Invalid, conflicting or nonliteral verse alias')
        aliases[item['verse']] = item['into']
    if list(aliases) != sorted(aliases):
        raise ValueError('Verse aliases must retain source order')
    previous_root = None
    roots = []
    for verse in verses:
        number = verse['number']
        if number in aliases:
            if aliases[number] != previous_root or previous_root in missing:
                raise ValueError('An alias must point to the previous real narrated root in the same chapter')
        else:
            if key.endswith(':zh') and _alias(verse['text']):
                raise ValueError('A literal source alias cannot be relabeled as narrated scripture')
            previous_root = number
            if number not in missing:
                roots.append(number)
        if 'coveredVerses' in verse:
            covered = verse['coveredVerses']
            if (not isinstance(covered, list) or any(type(n) is not int or n < 1 for n in covered)
                    or covered != sorted(set(covered)) or number not in covered
                    or any(n in missing for n in covered)):
                raise ValueError('Original merged verse coverage conflicts with the source partition')
            if any(n in source and n != number and aliases.get(n) != number for n in covered):
                raise ValueError('Merged coverage cannot claim a separate narrated source root')
    if not roots:
        raise ValueError('Coverage requires at least one real narrated source verse')
    return source, missing, aliases, roots


def narrated_verses(artifact):
    """Derive alignment input from temporary roles; this alone never authorizes publication."""
    try:
        verses = artifact['boundarySourceVerses']
        source, _, aliases, roots = _partition(artifact['key'], verses, artifact['confirmedCoverage']['roles'])
        result = []
        for number in roots:
            verse = deepcopy(source[number])
            covered = [alias for alias, root in aliases.items() if root == number]
            if covered:
                verse['coveredVerses'] = sorted(set(verse.get('coveredVerses', [number]) + [number] + covered))
            result.append(verse)
        return result
    except (KeyError, TypeError, IndexError) as error:
        raise ValueError('Incomplete source coverage input') from error


def _layout(artifact, roles):
    verses = artifact['boundarySourceVerses']
    source, missing, aliases, roots = _partition(artifact['key'], verses, roles)
    duration = artifact['duration']
    if (not finite(duration) or duration <= 0 or digest(verses) != artifact['textSha256']
            or not isinstance(artifact['sourceAudioSha256'], str)
            or not re.fullmatch(r'[a-f0-9]{64}', artifact['sourceAudioSha256'])
            or not isinstance(artifact['expectedVerseNumbers'], list)
            or any(type(n) is not int for n in artifact['expectedVerseNumbers'])
            or artifact['expectedVerseNumbers'] != list(source)
            or [cue['verse'] for cue in artifact['cues']] != roots
            or [check['verse'] for check in artifact['checks']] != roots
            or any(type(cue['verse']) is not int for cue in artifact['cues'])
            or any(type(check['verse']) is not int for check in artifact['checks'])):
        raise ValueError('Coverage must retain full source identity and exactly the narrated cue/check roots')
    previous = 0
    for cue in artifact['cues']:
        if (not finite(cue['start']) or not finite(cue['end'])
                or not previous <= cue['start'] < cue['end'] <= duration):
            raise ValueError('Narrated cue ranges are invalid or overlapping')
        previous = cue['end']
    return source, missing, aliases, roots


def _blocks(artifact, roles):
    source, missing, aliases, _ = _layout(artifact, roles)
    order, cues = list(source), {cue['verse']: cue for cue in artifact['cues']}
    blocks, index = [], 0
    while index < len(order):
        if order[index] not in missing:
            index += 1
            continue
        start = index
        while index < len(order) and order[index] in missing:
            index += 1
        before, after = start - 1, index
        while before >= 0 and order[before] in aliases:
            before -= 1
        while after < len(order) and order[after] in aliases:
            after += 1
        left = cues.get(order[before]) if before >= 0 else None
        right = cues.get(order[after]) if after < len(order) else None
        if (before >= 0 and left is None) or (after < len(order) and right is None):
            raise ValueError('Missing blocks require real narrated neighboring cues, not another missing block')
        lower, upper = (left['end'] if left else 0), (right['start'] if right else artifact['duration'])
        if lower > upper:
            raise ValueError('Missing block neighboring cues overlap')
        neighbors = [cue for cue in [left, right] if cue is not None]
        if not neighbors:
            raise ValueError('Missing coverage needs a real original narration reference')
        count = round(artifact['duration'] * GAP_POLICY['sampleRate'])
        bounds = [min(count, math.floor(lower * GAP_POLICY['sampleRate'])),
                  min(count, math.ceil(upper * GAP_POLICY['sampleRate']))]
        refs = reference_ranges({'start': lower, 'end': upper}, neighbors)
        blocks.append({'verses': order[start:index], 'samples': bounds, 'references': refs})
    return blocks


def _sample_range(bounds, count, empty=False):
    return (isinstance(bounds, list) and len(bounds) == 2
            and all(type(n) is int for n in bounds)
            and 0 <= bounds[0] <= bounds[1] <= count
            and (empty or bounds[0] < bounds[1]))


def _speech_valid(speech, count):
    if not isinstance(speech, list) or not speech:
        return False
    previous = 0
    for part in speech:
        if (not isinstance(part, list) or len(part) != 2 or any(type(x) is not int for x in part)
                or not previous <= part[0] < part[1] <= count):
            return False
        previous = part[1]
    return True


def _speech_attribution(artifact, block, speech, count):
    """Attribute only one original crossing segment per real neighboring cue edge.

    Never trim or replace the full VAD result. A segment touching both cues,
    an isolated gap segment, or attribution consuming the complete gap fails.
    The full original sample/context ranges still receive every RMS frame.
    """
    if not _speech_valid(speech, count):
        return None
    start, end = block['samples']
    a, b = context_range(block['samples'], count)
    left = next((cue for cue in reversed(artifact['cues']) if cue['verse'] < block['verses'][0]), None)
    right = next((cue for cue in artifact['cues'] if cue['verse'] > block['verses'][-1]), None)
    rate = GAP_POLICY['sampleRate']
    left_range = [round(left['start'] * rate), round(left['end'] * rate)] if left else None
    right_range = [round(right['start'] * rate), round(right['end'] * rate)] if right else None
    attributed, owners = [], set()
    remaining = [start, end]
    limit = COVERAGE_POLICY['vadNeighborEdgeSamples']
    for index, segment in enumerate(speech):
        x, y = segment
        if max(a, x) >= min(b, y):
            continue
        overlap = [max(start, x), min(end, y)]
        if overlap[0] >= overlap[1] or overlap[1] - overlap[0] > limit:
            return None
        touches_left = left_range is not None and max(left_range[0], x) < min(left_range[1], y)
        touches_right = right_range is not None and max(right_range[0], x) < min(right_range[1], y)
        if touches_left and touches_right:
            return None
        at_left = (touches_left and x < left_range[1] < y and overlap[0] == start)
        at_right = (touches_right and x < right_range[0] < y and overlap[1] == end)
        if at_left == at_right:
            return None
        side, cue = ('left', left) if at_left else ('right', right)
        if side in owners:
            return None
        owners.add(side)
        attributed.append({'segmentIndex': index, 'verse': cue['verse'], 'samples': overlap})
        if at_left:
            remaining[0] = overlap[1]
        else:
            remaining[1] = overlap[0]
    if attributed and remaining[0] >= remaining[1]:
        return None
    if any(max(remaining[0], x) < min(remaining[1], y) for x, y in speech):
        return None
    return attributed, remaining


def _user_confirmation(artifact, block, niv_evidence):
    """Reuse only a recorded exact-source human attestation with official NIV support."""
    if not artifact['key'].endswith(':en'):
        return None
    for confirmation in USER_CONFIRMATIONS:
        if (confirmation['key'] == artifact['key'] and block['verses'] == [confirmation['verse']]
                and confirmation['sourceAudioSha256'] == artifact['sourceAudioSha256']
                and confirmation['textSha256'] == artifact['textSha256']):
            canonical = list(range(1, max(v['number'] for v in artifact['boundarySourceVerses']) + 1))
            if (validate_niv_evidence(niv_evidence, artifact['key'], canonical)
                    and confirmation['verse'] in niv_missing_numbers(niv_evidence, artifact['key'], canonical)):
                return deepcopy(confirmation)
    return None


def _unattributed_segments(block, speech, count):
    a, b = context_range(block['samples'], count)
    return [{'segmentIndex': index, 'samples': [max(a, x), min(b, y)]}
            for index, (x, y) in enumerate(speech) if max(a, x) < min(b, y)]


def measure_coverage(artifact, pcm_s16, speech_segments, roles, niv_evidence=None):
    """Measure original full-source PCM; policy failures remain visible for review."""
    blocks = _blocks(artifact, roles)
    count = len(pcm_s16)
    if count != round(artifact['duration'] * GAP_POLICY['sampleRate']) or count < GAP_POLICY['contextSamples']:
        raise ValueError('Coverage PCM must decode the complete original source duration')
    proofs = []
    for block in blocks:
        a, b = context_range(block['samples'], count)
        refs = [{**ref, 'rms': rms(pcm_s16, *ref['samples'])} for ref in block['references']]
        frames = [rms(pcm_s16, i, min(i + GAP_POLICY['frameSamples'], b))
                  for i in range(a, b, GAP_POLICY['hopSamples'])]
        attribution = _speech_attribution(artifact, block, speech_segments, count)
        edges, remaining = attribution if attribution is not None else ([], list(block['samples']))
        confirmation = _user_confirmation(artifact, block, niv_evidence)
        unattributed = (_unattributed_segments(block, speech_segments, count)
                        if attribution is None and _speech_valid(speech_segments, count) else [])
        proofs.append({**block, 'references': refs, 'context': [a, b], 'frames': frames,
                       'attributedSpeechEdges': edges, 'remainingGapSamples': remaining,
                       'unattributedSpeechSegments': unattributed, 'userConfirmation': confirmation})
    review = {'policy': deepcopy(COVERAGE_POLICY), 'key': artifact['key'],
              'sourceAudioSha256': artifact['sourceAudioSha256'], 'textSha256': artifact['textSha256'],
              'cueSha256': digest(artifact['cues']), 'roles': deepcopy(roles),
              'nivEvidence': deepcopy(niv_evidence), 'sampleCount': count,
              'speechSegments': deepcopy(speech_segments), 'proofs': proofs}
    review['id'] = digest(review)
    return review


def verified_coverage(artifact):
    """Check structure/source authority and stored acoustic policy; media must also be remeasured."""
    try:
        review = artifact['confirmedCoverage']
        roles = review['roles']
        _, missing, _, _ = _layout(artifact, roles)
        count = round(artifact['duration'] * GAP_POLICY['sampleRate'])
        if (review['policy'] != COVERAGE_POLICY or review['key'] != artifact['key']
                or review['sourceAudioSha256'] != artifact['sourceAudioSha256']
                or review['textSha256'] != artifact['textSha256']
                or review['cueSha256'] != digest(artifact['cues']) or type(review['sampleCount']) is not int
                or review['sampleCount'] != count or count < GAP_POLICY['contextSamples']
                or review['id'] != digest({k: v for k, v in review.items() if k != 'id'})
                or not _speech_valid(review['speechSegments'], count)):
            return False
        candidates = candidate_roles(artifact['key'], artifact['boundarySourceVerses'], review['nivEvidence'])
        if (any(item not in candidates['missingVerses'] for item in roles['missingVerses'])
                or any(item not in candidates['aliases'] for item in roles['aliases'])
                or (artifact['key'].endswith(':zh') and review['nivEvidence'] is not None)):
            return False
        blocks = _blocks(artifact, roles)
        if len(blocks) != len(review['proofs']):
            return False
        covered = []
        for expected, proof in zip(blocks, review['proofs']):
            a, b = context_range(expected['samples'], count)
            attribution = _speech_attribution(artifact, expected, review['speechSegments'], count)
            confirmation = _user_confirmation(artifact, expected, review['nivEvidence'])
            if attribution is None:
                if confirmation is None:
                    return False
                # Human-confirmed absence is deliberately not labeled VAD clear.
                edges, remaining = [], list(expected['samples'])
                unattributed = _unattributed_segments(expected, review['speechSegments'], count)
            else:
                edges, remaining = attribution
                unattributed = []
            if (set(proof) != {'verses', 'samples', 'references', 'context', 'frames',
                              'attributedSpeechEdges', 'remainingGapSamples',
                              'unattributedSpeechSegments', 'userConfirmation'}
                    or not isinstance(proof['verses'], list) or any(type(n) is not int for n in proof['verses'])
                    or proof['verses'] != expected['verses'] or proof['samples'] != expected['samples']
                    or not _sample_range(proof['samples'], count, empty=True)
                    or not _sample_range(proof['context'], count)
                    or proof['context'] != [a, b] or b - a < GAP_POLICY['contextSamples']
                    or len(proof['references']) != len(expected['references'])
                    or not proof['references'] or not isinstance(proof['frames'], list)
                    or len(proof['frames']) != len(range(a, b, GAP_POLICY['hopSamples']))
                    or not proof['frames']
                    or proof['attributedSpeechEdges'] != edges or proof['remainingGapSamples'] != remaining
                    or proof['userConfirmation'] != confirmation
                    or (confirmation is not None
                        and any(type(proof['userConfirmation'][name]) is not type(value)
                                for name, value in confirmation.items()))
                    or proof['unattributedSpeechSegments'] != unattributed
                    or any(not isinstance(segment, dict) or set(segment) != {'segmentIndex', 'samples'}
                           or type(segment['segmentIndex']) is not int
                           or not _sample_range(segment['samples'], count)
                           for segment in proof['unattributedSpeechSegments'])
                    or not _sample_range(proof['remainingGapSamples'], count, empty=True)
                    or any(not isinstance(edge, dict) or set(edge) != {'segmentIndex', 'verse', 'samples'}
                           or type(edge['segmentIndex']) is not int or type(edge['verse']) is not int
                           or not _sample_range(edge['samples'], count)
                           for edge in proof['attributedSpeechEdges'])):
                return False
            covered.extend(proof['verses'])
            for ref, saved in zip(expected['references'], proof['references']):
                left, right = ref['samples']
                if (set(saved) != {'verse', 'samples', 'rms'}
                        or {k: v for k, v in saved.items() if k != 'rms'} != ref
                        or type(saved['verse']) is not int or not _sample_range(saved['samples'], count)
                        or not 0 <= left < right <= count or not finite(saved['rms']) or not 0 < saved['rms'] <= 1
                        or not any(max(left, x) < min(right, y) for x, y in review['speechSegments'])):
                    return False
            limit = (min(GAP_POLICY['maximumRms'], min(ref['rms'] for ref in proof['references']) * GAP_POLICY['relativeRms'])
                     if artifact['key'].endswith(':zh') else 1)
            if any(not finite(value) or not 0 <= value <= limit for value in proof['frames']):
                return False
        return covered == missing
    except (KeyError, ValueError, TypeError, IndexError, OverflowError, AttributeError):
        return False


def coverage_media_matches(artifact, pcm_s16):
    """Remeasure hash-verified original PCM; tolerate one s16 unit only in RMS values."""
    try:
        saved = artifact['confirmedCoverage']
        measured = measure_coverage(artifact, pcm_s16, saved['speechSegments'], saved['roles'], saved['nivEvidence'])
        if not (verified_coverage(artifact) and verified_coverage({**artifact, 'confirmedCoverage': measured})):
            return False
        def close(left, right, key=None):
            if isinstance(left, dict) and isinstance(right, dict):
                return left.keys() == right.keys() and all(close(left[name], right[name], name) for name in left if name != 'id')
            if isinstance(left, list) and isinstance(right, list):
                return len(left) == len(right) and all(close(a, b, key) for a, b in zip(left, right))
            if key in {'frames', 'rms'} and finite(left) and finite(right):
                return abs(left - right) <= 1 / 32768
            return left == right
        return close(saved, measured)
    except (KeyError, ValueError, TypeError, IndexError, OverflowError, AttributeError):
        return False
