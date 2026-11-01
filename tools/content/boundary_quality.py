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
    # A displayed numeral can span several spoken words. Its average score
    # cannot replace the confidence of the actual first/last spoken word.
    if words[0].get('numericExpansion'):
        head=min(head,words[0]['numericExpansion']['words'][0]['score'])
    if words[-1].get('numericExpansion'):
        tail=min(tail,words[-1]['numericExpansion']['words'][-1]['score'])
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


def verified_boundary_artifact(artifact, maximum_joint_verses=3, boundary_ranges=None):
    """Publication rechecks edge evidence; a recipe label alone is insufficient."""
    try:
        from alignment_contract import REVIEWED_SOURCE_RECIPES,REVIEWED_WEAK_RECIPES
        if artifact.get('qualityRecipe') in REVIEWED_WEAK_RECIPES:
            from reviewed_weak_boundaries import verified_reviewed_weak_artifact
            return verified_reviewed_weak_artifact(artifact)
        if 'reviewedWeakReview' in artifact:return False
        if artifact.get('qualityRecipe') in REVIEWED_SOURCE_RECIPES:
            from reviewed_boundaries import verified_reviewed_artifact
            return verified_reviewed_artifact(artifact)
        if 'reviewedSourceReview' in artifact:return False
        from alignment_contract import CONTEXT_PADDING_RECIPES
        if artifact.get('qualityRecipe') in CONTEXT_PADDING_RECIPES:
            from context_padding import verified_context_padding_artifact
            return verified_context_padding_artifact(artifact)
        if 'contextPaddingReview' in artifact:return False
        from alignment_contract import FRAGMENT_RECIPE
        if artifact.get('qualityRecipe')==FRAGMENT_RECIPE:
            from source_fragments import verified_fragment_artifact
            return verified_fragment_artifact(artifact)
        if 'sourceFragmentReview' in artifact or 'missingFragments' in artifact:return False
        from alignment_contract import READING_ORDER_RECIPE
        if artifact.get('qualityRecipe')==READING_ORDER_RECIPE:
            from reading_order import verified_reading_order_artifact
            return verified_reading_order_artifact(artifact)
        if 'readingOrderReview' in artifact:return False
        from alignment_contract import CLOCK_EDGE_RECIPE,PHRASE_EDGE_RECIPE
        if artifact.get('qualityRecipe') in {CLOCK_EDGE_RECIPE,PHRASE_EDGE_RECIPE}:
            from clock_edges import verified_clock_edge_artifact
            return verified_clock_edge_artifact(artifact)
        if 'clockEdgeReview' in artifact:return False
        from alignment_contract import GAP_EDGE_RECIPE
        if artifact.get('qualityRecipe')==GAP_EDGE_RECIPE:
            from gap_edges import verified_gap_edge_artifact
            return verified_gap_edge_artifact(artifact)
        from alignment_contract import COMPLETION_RECIPE
        if artifact.get('qualityRecipe')==COMPLETION_RECIPE:
            from verse_completion import verified_completion_artifact
            return verified_completion_artifact(artifact)
        if 'referenceCompletionReview' in artifact:return False
        if 'sourceGapReview' in artifact:return False
        from alignment_contract import SOURCE_EDGE_RECIPE
        if artifact.get('qualityRecipe')==SOURCE_EDGE_RECIPE:
            from source_edges import verified_source_edge_artifact
            return verified_source_edge_artifact(artifact)
        if 'sourceEdgeReview' in artifact:return False
        from alignment_contract import PARTIAL_REVIEW_RECIPE,NUMERIC_REVIEW_RECIPE,ANCHOR_WINDOW_RECIPE,CASE_REVIEW_RECIPE,SPEECH_SPAN_RECIPE,SPEECH_CONTEXT_RECIPE,WORD_PAUSE_RECIPE,INDIVIDUAL_REVIEW_RECIPE
        if artifact.get('qualityRecipe')==INDIVIDUAL_REVIEW_RECIPE:
            from individual_boundaries import verified_individual_artifact
            return verified_individual_artifact(artifact)
        if 'individualBoundaryReview' in artifact or 'individualGapReview' in artifact:return False
        if artifact.get('qualityRecipe')==WORD_PAUSE_RECIPE:
            from word_pause import verified_word_pause_artifact
            return verified_word_pause_artifact(artifact)
        if 'wordPauseReview' in artifact:return False
        if artifact.get('qualityRecipe')==SPEECH_CONTEXT_RECIPE:
            from speech_context import verified_context_artifact
            return verified_context_artifact(artifact)
        if 'speechContextReview' in artifact or 'speechContextBaseRecipe' in artifact or 'speechContextGapReview' in artifact:return False
        if any('speechContextProof' in c for c in artifact.get('checks',[])) and boundary_ranges is None:return False
        if artifact.get('qualityRecipe')==SPEECH_SPAN_RECIPE:
            from speech_span import verified_span_artifact
            return verified_span_artifact(artifact)
        if 'speechSpanReview' in artifact or 'speechSpanBaseRecipe' in artifact:return False
        if any('speechSpanProof' in c for c in artifact.get('checks',[])) and boundary_ranges is None:return False
        if artifact.get('qualityRecipe')==CASE_REVIEW_RECIPE:
            from case_evidence import verified_case_artifact
            return verified_case_artifact(artifact)
        if 'caseReviewPolicy' in artifact or 'caseBaseRecipe' in artifact:return False
        if artifact.get('qualityRecipe')==ANCHOR_WINDOW_RECIPE:
            from anchor_windows import verified_anchor_artifact
            return verified_anchor_artifact(artifact)
        if 'anchorWindowPolicy' in artifact:return False
        if artifact.get('qualityRecipe')==NUMERIC_REVIEW_RECIPE:
            from numeric_alignment import verified_numeric_artifact
            return verified_numeric_artifact(artifact)
        if 'numericAlignmentPolicy' in artifact or 'numericBaseRecipe' in artifact:return False
        if artifact.get('qualityRecipe')==PARTIAL_REVIEW_RECIPE:
            from partial_audio import verified_partial_boundary_artifact
            return verified_partial_boundary_artifact(artifact)
        if artifact.get('confirmedCoverage') is not None or artifact.get('missingVerses'):
            return False
        if (artifact.get('verificationScope') != 'verse-boundaries' or artifact.get('boundaryPolicy') != POLICY
                or not artifact.get('accepted') or artifact.get('issues')):
            return False
        expected = artifact['expectedVerseNumbers']
        verses = artifact['boundarySourceVerses']
        text_sha = hashlib.sha256(json.dumps(verses, ensure_ascii=False, sort_keys=True).encode()).hexdigest()
        if text_sha != artifact['textSha256'] or [v['number'] for v in verses] != expected:
            return False
        from alignment_contract import PROJECTION_REVIEW_RECIPE
        projected=artifact.get('qualityRecipe')==PROJECTION_REVIEW_RECIPE
        if projected or artifact.get('spokenProjection') is not None:
            from spoken_projection import projection_matches
            if not projected or not projection_matches(artifact):return False
            if (artifact.get('jointAlignments') or artifact.get('acousticGapReview') is not None
                    or any(c.get('jointProofId') or c.get('jointClipRange') is not None for c in artifact['checks'])):
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
                                             reference=(next(t['reference'] for t in artifact['spokenProjection']['texts'] if t['verse']==verse['number'])
                                                        if projected else boundary_text(verse['text'], artifact['key'].rsplit(':', 1)[-1])),
                                             signal=check.get('boundarySignal'), anchors=anchors)
            if boundary_ranges and check['verse'] in boundary_ranges:
                if edges is None and evidence['reasons']!=['weak-edge-word']:return False
                edges=boundary_ranges[check['verse']]
            if edges is not None and check.get('jointClipRange') is not None:
                from alignment_contract import PADDING_REVIEW_RECIPE,GAP_REVIEW_RECIPE
                if artifact.get('qualityRecipe') not in {PADDING_REVIEW_RECIPE,GAP_REVIEW_RECIPE}:return False
                from joint_padding import protected_core
                head,tail=protected_core(check,artifact['duration'])
                start,end=check['jointClipRange']
                if not edges[0]<=start<=head<tail<=end<=edges[1] or end-start<.35:return False
                edges=check['jointClipRange']
            if (edges is None or not check.get('boundaryVerified') or check['text'] != cue['text']
                    or check['text'] != verse['text']
                    or cue['start'] != edges[0] or cue['end'] != edges[1]
                    or not previous <= cue['start'] < cue['end'] <= artifact['duration']):
                return False
            previous = cue['end']
        if artifact.get('jointAlignments') or any(c.get('jointProofId') or c.get('jointClipRange') is not None for c in checks):
            from joint_boundaries import verified_joint_proofs
            if not verified_joint_proofs(artifact, maximum_verses=maximum_joint_verses):
                return False
        from alignment_contract import GAP_REVIEW_RECIPE
        if artifact.get('qualityRecipe') == GAP_REVIEW_RECIPE:
            from quiet_gaps import verified_quiet_gaps
            return verified_quiet_gaps(artifact)
        if artifact.get('acousticGapReview') is not None:
            return False
        return not boundary_gap_issues(artifact['unclaimedSpeech'], cues)
    except (KeyError, TypeError, ValueError, IndexError, ZeroDivisionError):
        return False
