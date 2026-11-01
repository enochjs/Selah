"""Pure partitioning and provenance checks for joint acoustic verse alignment."""
import hashlib
import json
import math

from boundary_quality import finite, verse_boundary
from spoken_text import boundary_text
from timed_text import normalized

JOINT_CONTEXT = {'paddingSeconds': .75, 'maximumSeconds': 60, 'maximumVerses': 3,
                 'partition': 'complete-canonical-word-sequence-v1',
                 'adoption': 'whole-disjoint-groups-no-new-unassigned-speech-v2',
                 'outerBounds': 'final-verified-cue-edges-v1',
                 'timingPrecision': 'inward-ms-v1', 'gapOrder': 'canonical-verse-order-v1'}


def split_joint_words(words, verses, locale):
    lexical = [word for word in words if normalized(word.get('word', ''))]
    targets = [normalized(boundary_text(verse['text'], locale)) for verse in verses]
    if (not all(targets) or ''.join(normalized(w['word']) for w in lexical) != ''.join(targets)):
        raise ValueError('Joint output must retain the complete canonical spoken word sequence')
    result, cursor = {}, 0
    for verse, target in zip(verses, targets):
        part, size = [], 0
        while cursor < len(lexical) and size < len(target):
            word = lexical[cursor]
            part.append(word)
            size += len(normalized(word['word']))
            cursor += 1
        if size != len(target):
            raise ValueError('A model word crosses a canonical verse boundary')
        result[verse['number']] = part
    return result


def context_groups(index, count):
    raw = [(index, min(count-1,index+1)), (max(0,index-1),index),
           (max(0,index-1),min(count-1,index+1))]
    if index == 0:
        raw.append((0,min(count-1,2)))
    if index == count-1:
        raw.append((max(0,index-2),index))
    result = []
    for a,b in raw:
        if 0 <= a < b < count and (a,b) not in result:
            result.append((a,b))
    return result


def joint_window(group, checks, cues, duration):
    previous = max([c['end'] for c in cues if c['verse'] < group[0]['number']] + [0])
    following = min([c['start'] for c in cues if c['verse'] > group[-1]['number']] + [duration])
    spans = [checks.get(v['number'], {}).get('searchRange') for v in group]
    if all(span and len(span)==2 and all(finite(x) for x in span) for span in spans):
        start = max(previous, min(span[0] for span in spans)-JOINT_CONTEXT['paddingSeconds'])
        end = min(following, max(span[1] for span in spans)+JOINT_CONTEXT['paddingSeconds'])
    else:
        start, end = previous, following
    if all(finite(x) for x in [start,end]):
        # Cues use milliseconds. Round the search window inward so rounding a
        # final cue can never extend beyond the source or a verified neighbour.
        start, end = math.ceil(start*1000)/1000, math.floor(end*1000)/1000
    return [start,end] if (all(finite(x) for x in [start,end,duration])
                          and 0 <= start < end <= duration
                          and end-start <= JOINT_CONTEXT['maximumSeconds']) else None


def expand_context_group(first, last, verses, checks, proofs, maximum_verses=3):
    """A later repair must reverify every member of an overlapping old group."""
    positions = {v['number']:i for i,v in enumerate(verses)}
    lookup = {p['id']:p for p in proofs}
    while True:
        before = (first,last)
        for verse in verses[first:last+1]:
            proof = lookup.get(checks.get(verse['number'],{}).get('jointProofId'))
            if proof:
                indexes = [positions[n] for n in proof['verses']]
                first,last = min(first,min(indexes)),max(last,max(indexes))
        if last-first+1 > maximum_verses:
            return None
        if (first,last) == before:
            return first,last


def joint_proof_id(source_sha, proof):
    payload = {k:v for k,v in proof.items() if k != 'id'}
    return hashlib.sha256(json.dumps([source_sha,payload],ensure_ascii=False,sort_keys=True).encode()).hexdigest()


def verified_joint_proofs(artifact, maximum_verses=3):
    """Every adopted verse must come from a complete, jointly verified group."""
    try:
        verses = artifact['boundarySourceVerses']
        expected = [v['number'] for v in verses]
        lookup = {v['number']:v for v in verses}
        locale = artifact['key'].rsplit(':',1)[-1]
        recognized = [w for segment in artifact.get('recognition',[]) for w in segment.get('words',[])]
        assignments = {}
        seen = set()
        checks = {c['verse']:c for c in artifact['checks']}
        for proof in artifact.get('jointAlignments',[]):
            identifier = proof['id']
            if identifier in seen or identifier != joint_proof_id(artifact['sourceAudioSha256'],proof):
                return False
            seen.add(identifier)
            numbers, bounds = proof['verses'],proof['range']
            if not 2 <= len(numbers) <= maximum_verses:
                return False
            first = expected.index(numbers[0])
            if expected[first:first+len(numbers)] != numbers:
                return False
            if any(checks.get(n,{}).get('jointProofId') != identifier for n in numbers):
                return False
            if (not all(finite(x) for x in bounds) or len(bounds)!=2
                    or not 0 <= bounds[0] < bounds[1] <= artifact['duration']
                    or bounds[1]-bounds[0] > JOINT_CONTEXT['maximumSeconds']):
                return False
            previous = max([c['end'] for c in artifact.get('cues',[]) if c['verse'] < numbers[0]]+[0])
            following = min([c['start'] for c in artifact.get('cues',[]) if c['verse'] > numbers[-1]]+[artifact['duration']])
            if bounds[0] < previous-.001 or bounds[1] > following+.001:
                return False
            group = [lookup[n] for n in numbers]
            parts = split_joint_words(proof['words'],group,locale)
            allocation=proof.get('paddingAllocation')
            if allocation is not None:
                from alignment_contract import PADDING_REVIEW_RECIPE,GAP_REVIEW_RECIPE
                from joint_padding import PADDING_POLICY,allocate_padding
                if allocation!=PADDING_POLICY or artifact.get('qualityRecipe') not in {PADDING_REVIEW_RECIPE,GAP_REVIEW_RECIPE}:return False
            raw_cues=[];raw_checks=[]
            previous = bounds[0]
            for verse in group:
                number = verse['number'];anchors = proof['anchors'].get(str(number),[])
                if anchors and (len(anchors)!=2 or any(a not in recognized for a in anchors)):
                    return False
                edges,_ = verse_boundary(parts[number],bounds,artifact['duration'],locale,
                    reference=boundary_text(verse['text'],locale),signal=proof['signal'],anchors=anchors)
                if edges is None or (allocation is None and edges[0] < previous):
                    return False
                previous = edges[1]
                raw_cues.append({'verse':number,'start':edges[0],'end':edges[1]})
                raw_checks.append({'verse':number,'alignedWords':parts[number],'asrEdgeAnchors':anchors})
                assignments[(identifier,number)] = (parts[number],bounds,proof['signal'],anchors,None)
            if allocation is not None:
                adjusted=allocate_padding(raw_checks,raw_cues,artifact['duration'])
                if adjusted is None:return False
                spans={str(c['verse']):[c['start'],c['end']] for c in adjusted}
                if proof.get('clipRanges')!=spans:return False
                for c in adjusted:
                    key=(identifier,c['verse'])
                    assignments[key]=(*assignments[key][:4],spans[str(c['verse'])])
        adopted = 0
        for check in artifact['checks']:
            identifier = check.get('jointProofId')
            if not identifier:
                if check.get('jointClipRange') is not None:return False
                continue
            assigned = assignments.get((identifier,check['verse']))
            if assigned is None or assigned != (check['alignedWords'],check['searchRange'],
                                                check['boundarySignal'],check.get('asrEdgeAnchors',[]),check.get('jointClipRange')):
                return False
            adopted += 1
        return adopted > 0
    except (KeyError,TypeError,ValueError,IndexError):
        return False
