import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


class AudioCoverageTests(unittest.TestCase):
    def module(self):
        self.assertIsNotNone(importlib.util.find_spec('audio_coverage'))
        import audio_coverage
        return audio_coverage

    def niv(self):
        from quiet_gaps import digest
        html = ('<div class="passage-col version-NIV" data-translation="NIV">'
                '<div class="passage-text"><p>' + ''.join(
                    f'<span class="text Acts-8-{n}">Verse {n}.</span>'
                    for n in range(1, 41) if n != 37)
                + '</p><div class="footnotes"><span class="text Acts-8-37">Footnote only.</span>'
                '</div></div></div>')
        return {'schemaVersion': 1, 'edition': 'NIV', 'key': 'acts:8:en', 'bookId': 'acts', 'chapter': 8,
                'url': 'https://www.biblegateway.com/passage/?search=Acts%208&version=NIV',
                'rawHtml': html, 'sha256': hashlib.sha256(html.encode()).hexdigest(),
                'fetchedAt': '2026-10-25T00:00:00+00:00',
                'presentVerseNumbers': [n for n in range(1, 41) if n != 37], 'missingVerseNumbers': [37]}

    def fixture(self, english=False):
        m = self.module()
        from quiet_gaps import digest
        if english:
            key = 'acts:8:en'
            source = [{'number': n, 'text': f'Original source verse {n}.'} for n in [36, 37, 38, 40]]
            cues = [{'verse': 36, 'start': .1, 'end': .5},
                    {'verse': 38, 'start': .8, 'end': 1.2}, {'verse': 40, 'start': 1.3, 'end': 1.45}]
            niv = self.niv()
        else:
            key = 'exodus:16:zh'
            source = [{'number': 35, 'text': '以色列人吃吗哪四十年。'},
                      {'number': 36, 'text': '（俄梅珥乃伊法十分之一）。'}]
            cues = [{'verse': 35, 'start': .1, 'end': .5}]
            niv = None
        duration = 1.5
        artifact = {'key': key, 'duration': duration, 'sourceAudioSha256': 'a' * 64,
                    'boundarySourceVerses': source, 'textSha256': digest(source),
                    'expectedVerseNumbers': [v['number'] for v in source], 'cues': cues,
                    'checks': [{'verse': cue['verse']} for cue in cues]}
        roles = m.candidate_roles(key, source, niv)
        pcm = [0] * round(duration * 16000)
        speech = []
        for cue in cues:
            left, right = round(cue['start'] * 16000), round(cue['end'] * 16000)
            pcm[left:right] = [8000] * (right - left)
            speech.append([left + 160, right - 160])
        return artifact, pcm, speech, roles, niv

    def measured(self, english=False):
        m = self.module()
        artifact, pcm, speech, roles, niv = self.fixture(english)
        artifact['confirmedCoverage'] = m.measure_coverage(artifact, pcm, speech, roles, niv)
        return artifact, pcm

    def rehash(self, review):
        from quiet_gaps import digest
        review['id'] = digest({k: v for k, v in review.items() if k != 'id'})

    def test_niv_candidates_are_exact_english_nonempty_source_intersection(self):
        m = self.module()
        a, _, _, roles, niv = self.fixture(True)
        self.assertEqual(roles['missingVerses'], [{'verse': 37, 'reason': 'not-narrated-in-source'}])
        self.assertEqual(m.candidate_roles(a['key'], a['boundarySourceVerses'])['missingVerses'], [])
        no37 = [v for v in a['boundarySourceVerses'] if v['number'] != 37]
        self.assertEqual(m.candidate_roles(a['key'], no37, niv)['missingVerses'], [])
        changed = {**niv, 'key': 'acts:9:en'}
        self.assertEqual(m.candidate_roles(a['key'], a['boundarySourceVerses'], changed)['missingVerses'], [])
        self.assertEqual(m.candidate_roles('acts:8:zh', a['boundarySourceVerses'], niv)['missingVerses'], [])

    def test_chinese_candidates_require_pinned_literal_blocks_and_their_source_parentheses(self):
        m = self.module()
        cases = [
            ('mark:7:zh', [(2, '前节。'), (3, '（原来法利赛人，和犹太人，都拘守古人的遗传，若不仔细洗手，就不吃饭。'),
                           (4, '从市上来，若不洗浴，也不吃饭，还有好些别的规矩，他们历代拘守，就是洗杯，罐，铜器，等物）。')], [3, 4]),
            ('mark:7:zh', [(15, '惟有从里面出来的，乃能污秽人。（有古卷在此有，'), (16, '有耳可听的就应当听）。')], [16]),
            ('mark:15:zh', [(27, '一个在右边，一个在左边。（有古卷在此有'), (28, '这就应了经上的话说，他被列在罪犯之中）')], [28]),
            ('matthew:18:zh', [(10, '常见我天父的面。（有古卷在此有'), (11, '人子来为要拯救失丧的人）')], [11]),
            ('matthew:23:zh', [(13, '正要进去的人，你们也不容他们进去。（有古卷在此有'),
                              (14, '你们这假冒为善的文士和法利赛人有祸了，因为你们侵吞寡妇的家产，假意作很长的祷告，所以要受更重的刑罚）')], [14]),
        ]
        for key, texts, expected in cases:
            source = [{'number': number, 'text': text} for number, text in texts]
            self.assertEqual([v['verse'] for v in m.candidate_roles(key, source)['missingVerses']], expected)
            modified = copy.deepcopy(source)
            modified[-1]['text'] = '其他正文（不可删掉）。'
            self.assertEqual(m.candidate_roles(key, modified)['missingVerses'], [])
            if expected not in ([3, 4],):
                modified = copy.deepcopy(source)
                modified[0]['text'] = '前节未包含古卷注记。'
                self.assertEqual(m.candidate_roles(key, modified)['missingVerses'], [])

    def test_narrated_input_can_be_derived_before_acoustic_proof_and_keeps_full_source_immutable(self):
        m = self.module()
        source = [{'number': 21, 'text': '真实正文。'}, {'number': 22, 'text': '（见上节）'},
                  {'number': 23, 'text': '（见上节'}, {'number': 24, 'text': '下一节正文。'}]
        before = copy.deepcopy(source)
        roles = m.candidate_roles('numbers:1:zh', source)
        self.assertEqual(roles['aliases'], [{'verse': 22, 'into': 21}, {'verse': 23, 'into': 21}])
        a = {'key': 'numbers:1:zh', 'boundarySourceVerses': source, 'confirmedCoverage': {'roles': roles}}
        self.assertEqual(m.narrated_verses(a), [{**source[0], 'coveredVerses': [21, 22, 23]}, source[-1]])
        self.assertEqual(source, before)
        self.assertFalse(m.verified_coverage(a))
        a['key'] = 'numbers:1:en'
        with self.assertRaises(ValueError): m.narrated_verses(a)

    def test_real_quiet_chinese_missing_block_has_complete_sample_proof(self):
        m = self.module()
        a, pcm = self.measured()
        self.assertTrue(m.verified_coverage(a))
        self.assertTrue(m.coverage_media_matches(a, pcm))
        proof = a['confirmedCoverage']['proofs'][0]
        self.assertEqual(proof['verses'], [36])
        self.assertEqual(proof['samples'], [8000, 24000])
        self.assertEqual(len(proof['frames']), 200)
        self.assertEqual([v['number'] for v in m.narrated_verses(a)], [35])

    def test_niv_absence_allows_background_music_but_never_vad_speech(self):
        m = self.module()
        a, pcm, speech, roles, niv = self.fixture(True)
        pcm[8000:12800] = [1500] * 4800
        a['confirmedCoverage'] = m.measure_coverage(a, pcm, speech, roles, niv)
        self.assertTrue(m.verified_coverage(a))
        self.assertTrue(m.coverage_media_matches(a, pcm))
        self.assertGreater(a['confirmedCoverage']['proofs'][0]['frames'][0], .01)
        a['confirmedCoverage'] = m.measure_coverage(a, pcm, [[1600, 7900], [8500, 9000], [13000, 19000], [21000, 23000]], roles, niv)
        self.assertFalse(m.verified_coverage(a))

    def test_all_original_speech_is_retained_and_empty_or_gap_overlapping_speech_is_rejected(self):
        m = self.module()
        a, pcm, speech, roles, niv = self.fixture()
        proof = m.measure_coverage(a, pcm, speech, roles, niv)
        self.assertEqual(proof['speechSegments'], speech)
        a['confirmedCoverage'] = m.measure_coverage(a, pcm, [], roles, niv)
        self.assertFalse(m.verified_coverage(a))
        a['confirmedCoverage'] = m.measure_coverage(a, pcm, [[1600, 7900], [9000, 9200]], roles, niv)
        self.assertFalse(m.verified_coverage(a))

    def test_missing_proof_frames_source_binding_and_forged_rms_are_rejected(self):
        m = self.module()
        a, pcm = self.measured()
        for change in ['proof', 'frames', 'frame-count', 'samples', 'reference', 'source-sha', 'text-sha', 'cue', 'source', 'key']:
            altered = copy.deepcopy(a)
            review = altered['confirmedCoverage']
            if change == 'proof': review['proofs'] = []
            if change == 'frames': review['proofs'][0]['frames'] = []
            if change == 'frame-count': review['proofs'][0]['frames'].pop()
            if change == 'samples': review['proofs'][0]['samples'][0] += 1
            if change == 'reference': review['proofs'][0]['references'][0]['rms'] = 1
            if change == 'source-sha': altered['sourceAudioSha256'] = 'b' * 64
            if change == 'text-sha': altered['textSha256'] = 'b' * 64
            if change == 'cue': altered['cues'][0]['end'] -= .01
            if change == 'source': altered.pop('boundarySourceVerses')
            if change == 'key': altered['key'] = 'exodus:16:en'
            self.rehash(review)
            if change == 'reference':
                self.assertFalse(m.coverage_media_matches(altered, pcm))
            else:
                self.assertFalse(m.verified_coverage(altered), change)
        loud = list(pcm)
        loud[10000:10160] = [8000] * 160
        self.assertFalse(m.coverage_media_matches(a, loud))
        forged = copy.deepcopy(a)
        forged['confirmedCoverage']['proofs'][0]['frames'][0] = .005
        self.rehash(forged['confirmedCoverage'])
        self.assertFalse(m.coverage_media_matches(forged, pcm))

    def test_chinese_quiet_policy_catches_a_short_burst_and_relative_neighbor_threshold(self):
        m = self.module()
        a, pcm, speech, roles, niv = self.fixture()
        pcm[10000] = 20000
        a['confirmedCoverage'] = m.measure_coverage(a, pcm, speech, roles, niv)
        self.assertFalse(m.verified_coverage(a))
        a, pcm, speech, roles, niv = self.fixture()
        pcm[1600:8000] = [500] * 6400
        pcm[10000:10160] = [200] * 160
        a['confirmedCoverage'] = m.measure_coverage(a, pcm, speech, roles, niv)
        self.assertFalse(m.verified_coverage(a))

    def test_zero_width_or_short_missing_interval_requires_actual_context(self):
        m = self.module()
        a, pcm, speech, roles, niv = self.fixture(True)
        a['cues'][0]['end'] = .65
        a['cues'][1]['start'] = .65
        pcm[8000:12800] = [0] * 4800
        speech = [[1800, 7500], [13500, 18800], [21000, 23000]]
        a['confirmedCoverage'] = m.measure_coverage(a, pcm, speech, roles, niv)
        self.assertTrue(m.verified_coverage(a))
        proof = a['confirmedCoverage']['proofs'][0]
        self.assertEqual(proof['samples'], [10400, 10400])
        self.assertEqual(proof['context'][1] - proof['context'][0], 320)
        self.assertEqual(len(proof['frames']), 4)
        a['confirmedCoverage'] = m.measure_coverage(a, pcm, sorted(speech + [[10300, 10350]]), roles, niv)
        self.assertFalse(m.verified_coverage(a))

    def test_unknown_missing_conflicting_alias_or_missing_narrated_roots_cannot_form_coverage(self):
        m = self.module()
        a, pcm, speech, roles, niv = self.fixture()
        for kind in ['unknown', 'alias-overlap', 'uncued', 'check', 'expected']:
            changed = copy.deepcopy(a)
            r = copy.deepcopy(roles)
            if kind == 'unknown': r['missingVerses'] = [{'verse': 35, 'reason': 'not-narrated-in-source'}]
            if kind == 'alias-overlap': r['aliases'] = [{'verse': 36, 'into': 35}]
            if kind == 'uncued': changed['cues'] = []
            if kind == 'check': changed['checks'] = []
            if kind == 'expected': changed['expectedVerseNumbers'] = [35]
            try:
                changed['confirmedCoverage'] = m.measure_coverage(changed, pcm, speech, r, niv)
            except ValueError:
                continue
            self.assertFalse(m.verified_coverage(changed), kind)
        a.pop('confirmedCoverage', None)
        self.assertFalse(m.verified_coverage(a))

    def test_one_s16_unit_tolerance_does_not_relax_independent_quiet_policy(self):
        m = self.module()
        a, pcm = self.measured()
        varied = list(pcm)
        varied[2000] += 1
        self.assertTrue(m.coverage_media_matches(a, varied))
        varied[10000:10200] = [1000] * 200
        self.assertFalse(m.coverage_media_matches(a, varied))

    def human_confirmed_acts_fixture(self):
        m = self.module()
        from quiet_gaps import digest
        bible = json.loads((Path(__file__).resolve().parents[3] / 'packages/content/data/bible.json').read_text())
        chapter = next(book for book in bible if book['id'] == 'acts')['chapters'][7]
        source = [{'number': verse['number'], 'text': verse['en']} for verse in chapter if verse['en'].strip()]
        self.assertEqual(digest(source), '7ecfae6716d0cbb2ce6d7675cdf281026e8494436f5011d00daf0d669513fcce')
        cues = [{'verse': n, 'start': (n-1)*5+.1, 'end': n*5-1} for n in range(1,36)]
        cues += [{'verse':36,'start':260,'end':4216640/16000},
                 {'verse':38,'start':4219200/16000,'end':264.2},
                 {'verse':39,'start':264.3,'end':264.7}, {'verse':40,'start':264.8,'end':265.2}]
        a = {'key':'acts:8:en', 'sourceAudioSha256':'36349e66505bea3b2cccc8f16bcb3ebaed4dc7f46e47e582bf5fc144476707e9',
             'textSha256':digest(source), 'boundarySourceVerses':source, 'expectedVerseNumbers':list(range(1,41)),
             'duration':266, 'cues':cues, 'checks':[{'verse':cue['verse']} for cue in cues]}
        pcm = [0]*round(a['duration']*16000)
        speech = []
        for cue in cues:
            start,end = round(cue['start']*16000),round(cue['end']*16000)
            pcm[start:end] = [8000]*(end-start)
            if cue['verse'] not in [36,38]: speech.append([start+160,end-160])
        pcm[4216640:4219200] = [8000]*2560
        speech.append([4171776,4220416])
        speech.sort()
        niv = self.niv()
        roles = m.candidate_roles(a['key'], source, niv)
        return a,pcm,speech,roles,niv

    def test_exact_recorded_user_confirmation_can_accept_acts37_without_claiming_vad_quiet(self):
        m = self.module()
        from quiet_gaps import digest
        a,pcm,speech,roles,niv = self.human_confirmed_acts_fixture()
        before = copy.deepcopy(a['cues'])
        a['confirmedCoverage'] = m.measure_coverage(a,pcm,speech,roles,niv)
        self.assertTrue(m.verified_coverage(a))
        self.assertTrue(m.coverage_media_matches(a,pcm))
        proof = a['confirmedCoverage']['proofs'][0]
        self.assertEqual(proof['userConfirmation'], m.USER_CONFIRMATIONS[0])
        self.assertEqual(proof['userConfirmation']['source'], 'user-confirmation-in-this-chat')
        self.assertEqual(proof['userConfirmation']['date'], '2026-10-25')
        self.assertEqual(proof['userConfirmation']['quote'], '我看了下37节，确实是没有读；正常播放的时候直接跳过就好了；不影响其他节；相同情况都这么处理')
        self.assertEqual(proof['attributedSpeechEdges'], [])
        self.assertEqual(proof['unattributedSpeechSegments'], [{'segmentIndex':35,'samples':[4216640,4219200]}])
        self.assertEqual(proof['remainingGapSamples'], [4216640,4219200])
        self.assertGreater(min(proof['frames']), .01)
        self.assertEqual(a['confirmedCoverage']['speechSegments'],speech)
        self.assertEqual(a['cues'],before)
        self.assertEqual(m.COVERAGE_POLICY['userConfirmationsSha256'], digest(m.USER_CONFIRMATIONS))

    def test_user_confirmation_cannot_transfer_to_other_sources_or_replace_required_identity(self):
        m = self.module()
        from quiet_gaps import digest
        a,pcm,speech,roles,niv = self.human_confirmed_acts_fixture()
        a['confirmedCoverage'] = m.measure_coverage(a,pcm,speech,roles,niv)
        self.assertTrue(m.verified_coverage(a))
        for kind in ['audio','text','key','verse','verse-type','quote','date','source','empty-vad','niv','fake-niv','unattributed','remove-confirmation']:
            bad = copy.deepcopy(a)
            review = bad['confirmedCoverage']
            proof = review['proofs'][0]
            if kind == 'audio': bad['sourceAudioSha256'] = review['sourceAudioSha256'] = 'b'*64
            if kind == 'text':
                bad['boundarySourceVerses'][0]['text'] += ' changed'
                bad['textSha256'] = review['textSha256'] = digest(bad['boundarySourceVerses'])
                review['roles']['sourceTextSha256'] = bad['textSha256']
            if kind == 'key': bad['key'] = review['key'] = review['roles']['key'] = 'acts:8:zh'
            if kind == 'verse': proof['userConfirmation']['verse'] = 36
            if kind == 'verse-type': proof['userConfirmation']['verse'] = 37.0
            if kind == 'quote': proof['userConfirmation']['quote'] += ' changed'
            if kind == 'date': proof['userConfirmation']['date'] = '2026-10-24'
            if kind == 'source': proof['userConfirmation']['source'] = 'model-uncertainty'
            if kind == 'empty-vad': review['speechSegments'] = []
            if kind == 'niv': review['nivEvidence'] = None
            if kind == 'fake-niv': review['nivEvidence']['edition'] = 'KJV'
            if kind == 'unattributed': proof['unattributedSpeechSegments'] = []
            if kind == 'remove-confirmation': proof['userConfirmation'] = None
            self.rehash(review)
            self.assertFalse(m.verified_coverage(bad),kind)
        a['sourceAudioSha256'] = 'b'*64
        a['confirmedCoverage'] = m.measure_coverage(a,pcm,speech,roles,niv)
        self.assertIsNone(a['confirmedCoverage']['proofs'][0]['userConfirmation'])
        self.assertFalse(m.verified_coverage(a))

    def test_one_original_vad_segment_may_attribute_512_samples_to_the_real_previous_cue(self):
        m = self.module()
        a, pcm, speech, roles, niv = self.fixture(True)
        # Romans 16 has the same 512-sample Silero frame overhang after verse 23.
        speech[0][1] = 8512
        before = copy.deepcopy(a['cues'])
        a['confirmedCoverage'] = m.measure_coverage(a, pcm, speech, roles, niv)
        self.assertTrue(m.verified_coverage(a))
        self.assertTrue(m.coverage_media_matches(a, pcm))
        proof = a['confirmedCoverage']['proofs'][0]
        self.assertEqual(proof['attributedSpeechEdges'], [{'segmentIndex': 0, 'verse': 36, 'samples': [8000, 8512]}])
        self.assertEqual(proof['remainingGapSamples'], [8512, 12800])
        self.assertEqual(a['confirmedCoverage']['speechSegments'], speech)
        self.assertEqual(a['cues'], before)
        self.assertEqual(proof['samples'], [8000, 12800])
        self.assertEqual(proof['context'], [8000, 12800])
        self.assertEqual(len(proof['frames']), 60)

    def test_next_cue_can_own_one_contiguous_original_vad_head_frame(self):
        m = self.module()
        a, pcm, speech, roles, niv = self.fixture(True)
        speech[1][0] = 12288
        a['confirmedCoverage'] = m.measure_coverage(a, pcm, speech, roles, niv)
        self.assertTrue(m.verified_coverage(a))
        proof = a['confirmedCoverage']['proofs'][0]
        self.assertEqual(proof['attributedSpeechEdges'], [{'segmentIndex': 1, 'verse': 38, 'samples': [12288, 12800]}])
        self.assertEqual(proof['remainingGapSamples'], [8000, 12288])

    def test_vad_edge_attribution_rejects_513_isolated_multiple_or_bridging_segments(self):
        m = self.module()
        cases = [
            [[1760,8513],[12960,19040],[20960,23040]],
            [[1760,7840],[8000,8100],[12960,19040],[20960,23040]],
            [[1760,7840],[9000,9100],[12960,19040],[20960,23040]],
            [[1760,8200],[8300,8400],[12960,19040],[20960,23040]],
            [[1760,8050],[8050,8120],[12960,19040],[20960,23040]],
            [[1760,13000],[20960,23040]],
        ]
        for speech in cases:
            a, pcm, _, roles, niv = self.fixture(True)
            a['confirmedCoverage'] = m.measure_coverage(a, pcm, speech, roles, niv)
            self.assertFalse(m.verified_coverage(a), speech)
        for speech in [[[1760,19040],[20960,23040]],
                       [[1760,8160],[8160,19040],[20960,23040]]]:
            a, pcm, _, roles, niv = self.fixture(True)
            a['cues'][1]['start'] = .52
            a['confirmedCoverage'] = m.measure_coverage(a, pcm, speech, roles, niv)
            self.assertFalse(m.verified_coverage(a), speech)

    def test_both_original_cue_edges_can_be_owned_only_while_a_clear_gap_remains(self):
        m = self.module()
        a, pcm, speech, roles, niv = self.fixture(True)
        speech[0][1] = 8512
        speech[1][0] = 12288
        a['confirmedCoverage'] = m.measure_coverage(a, pcm, speech, roles, niv)
        self.assertTrue(m.verified_coverage(a))
        self.assertEqual(a['confirmedCoverage']['proofs'][0]['remainingGapSamples'], [8512,12288])
        self.assertEqual(len(a['confirmedCoverage']['proofs'][0]['attributedSpeechEdges']), 2)

    def test_vad_attribution_fields_are_rebuilt_from_original_segments_and_cues(self):
        m = self.module()
        a, pcm, speech, roles, niv = self.fixture(True)
        speech[0][1] = 8512
        a['confirmedCoverage'] = m.measure_coverage(a, pcm, speech, roles, niv)
        self.assertTrue(m.verified_coverage(a))
        for change in ['index','verse','range','remove','clear-range']:
            bad = copy.deepcopy(a)
            proof = bad['confirmedCoverage']['proofs'][0]
            if change == 'index': proof['attributedSpeechEdges'][0]['segmentIndex'] = 1
            if change == 'verse': proof['attributedSpeechEdges'][0]['verse'] = 38
            if change == 'range': proof['attributedSpeechEdges'][0]['samples'][1] -= 1
            if change == 'remove': proof['attributedSpeechEdges'] = []
            if change == 'clear-range': proof['remainingGapSamples'][0] = 8000
            self.rehash(bad['confirmedCoverage'])
            self.assertFalse(m.verified_coverage(bad), change)
            self.assertFalse(m.coverage_media_matches(bad, pcm), change)

    def test_chinese_frames_still_measure_and_reject_loud_audio_in_an_attributed_edge(self):
        m = self.module()
        a, pcm, speech, roles, niv = self.fixture()
        speech[0][1] = 8512
        pcm[8000:8512] = [8000]*512
        a['confirmedCoverage'] = m.measure_coverage(a, pcm, speech, roles, niv)
        proof = a['confirmedCoverage']['proofs'][0]
        self.assertEqual(proof['attributedSpeechEdges'][0]['samples'], [8000,8512])
        self.assertGreater(proof['frames'][0], .01)
        self.assertFalse(m.verified_coverage(a))

    def test_policy_recipe_binds_the_exact_chinese_candidate_source_table(self):
        m = self.module()
        from quiet_gaps import digest
        self.assertEqual(m.COVERAGE_POLICY['chineseCandidatesSha256'], digest(m._ZH_BLOCKS))

    def test_fractional_duration_tail_never_claims_samples_beyond_actual_pcm(self):
        m = self.module()
        a, pcm, speech, roles, niv = self.fixture()
        a['duration'] = 1.50001
        a['confirmedCoverage'] = m.measure_coverage(a, pcm, speech, roles, niv)
        self.assertTrue(m.verified_coverage(a))
        self.assertEqual(a['confirmedCoverage']['proofs'][0]['samples'][-1], len(pcm))
        self.assertEqual(a['confirmedCoverage']['proofs'][0]['context'][-1], len(pcm))

    def test_source_merged_coverage_cannot_simultaneously_claim_a_missing_verse(self):
        m = self.module()
        from quiet_gaps import digest
        a, pcm, speech, roles, niv = self.fixture()
        a['boundarySourceVerses'][0]['coveredVerses'] = [35, 36]
        a['textSha256'] = digest(a['boundarySourceVerses'])
        roles = m.candidate_roles(a['key'], a['boundarySourceVerses'])
        try:
            a['confirmedCoverage'] = m.measure_coverage(a, pcm, speech, roles)
        except ValueError:
            return
        self.assertFalse(m.verified_coverage(a))

    def test_literal_see_previous_aliases_cannot_instead_be_claimed_as_narrated_roots(self):
        m = self.module()
        source = [{'number': 1, 'text': '真实正文。'}, {'number': 2, 'text': '（见上节）'}]
        roles = m.candidate_roles('deuteronomy:13:zh', source)
        roles['aliases'] = []
        with self.assertRaises(ValueError):
            m.narrated_verses({'key': 'deuteronomy:13:zh', 'boundarySourceVerses': source,
                              'confirmedCoverage': {'roles': roles}})

    def test_merged_alias_only_coverage_keeps_single_real_cue_and_does_not_need_an_absence_gap(self):
        m = self.module()
        from quiet_gaps import digest
        source = [{'number': 1, 'text': '真实正文。'}, {'number': 2, 'text': '（见上节）'}]
        a = {'key': 'deuteronomy:13:zh', 'sourceAudioSha256': 'a'*64, 'textSha256': digest(source),
             'boundarySourceVerses': source, 'expectedVerseNumbers': [1,2], 'duration': 1,
             'cues': [{'verse': 1, 'start': .1, 'end': .5}], 'checks': [{'verse': 1}]}
        pcm = [0]*16000
        pcm[1600:8000] = [8000]*6400
        a['confirmedCoverage'] = m.measure_coverage(a, pcm, [[1800,7800]], m.candidate_roles(a['key'], source))
        self.assertTrue(m.verified_coverage(a))
        self.assertTrue(m.coverage_media_matches(a, pcm))
        self.assertEqual(m.narrated_verses(a), [{'number': 1, 'text': '真实正文。', 'coveredVerses': [1,2]}])
        for alias in [{'verse': 2, 'into': 2}, {'verse': 2, 'into': 3}, {'verse': 2, 'into': 0}]:
            bad = copy.deepcopy(a)
            bad['confirmedCoverage']['roles']['aliases'] = [alias]
            self.rehash(bad['confirmedCoverage'])
            self.assertFalse(m.verified_coverage(bad))

    def test_leading_missing_block_measures_from_actual_source_start(self):
        m = self.module()
        from quiet_gaps import digest
        a, pcm, speech, roles, niv = self.fixture(True)
        a['boundarySourceVerses'] = a['boundarySourceVerses'][1:]
        a['expectedVerseNumbers'] = [37,38,40]
        a['textSha256'] = digest(a['boundarySourceVerses'])
        a['cues'] = a['cues'][1:]
        a['checks'] = a['checks'][1:]
        roles = m.candidate_roles(a['key'], a['boundarySourceVerses'], niv)
        a['confirmedCoverage'] = m.measure_coverage(a, pcm, speech[1:], roles, niv)
        self.assertTrue(m.verified_coverage(a))
        self.assertEqual(a['confirmedCoverage']['proofs'][0]['samples'], [0,12800])
        self.assertEqual(len(a['confirmedCoverage']['proofs'][0]['references']), 1)

    def test_pcm_tolerance_never_approves_a_fresh_measurement_over_the_quiet_threshold(self):
        m = self.module()
        a, pcm, speech, roles, niv = self.fixture()
        pcm[8000:] = [327] * (len(pcm)-8000)
        a['confirmedCoverage'] = m.measure_coverage(a, pcm, speech, roles)
        self.assertTrue(m.verified_coverage(a))
        varied = list(pcm)
        varied[8000:] = [328] * (len(pcm)-8000)
        self.assertFalse(m.coverage_media_matches(a, varied))

    def test_consecutive_missing_verses_share_one_real_narrated_neighbor_interval(self):
        m = self.module()
        from quiet_gaps import digest
        key = 'mark:7:zh'
        source = [{'number': 2, 'text': '真实前节。'},
                  {'number': 3, 'text': '（原来法利赛人，和犹太人，都拘守古人的遗传，若不仔细洗手，就不吃饭。'},
                  {'number': 4, 'text': '从市上来，若不洗浴，也不吃饭，还有好些别的规矩，他们历代拘守，就是洗杯，罐，铜器，等物）。'},
                  {'number': 5, 'text': '真实后节。'}]
        a = {'key': key, 'sourceAudioSha256': 'a'*64, 'textSha256': digest(source),
             'boundarySourceVerses': source, 'expectedVerseNumbers': [2,3,4,5], 'duration': 1.5,
             'cues': [{'verse': 2, 'start': .1, 'end': .5}, {'verse': 5, 'start': .8, 'end': 1.2}],
             'checks': [{'verse': 2}, {'verse': 5}]}
        pcm = [0] * 24000
        pcm[1600:8000] = [8000]*6400
        pcm[12800:19200] = [8000]*6400
        a['confirmedCoverage'] = m.measure_coverage(a, pcm, [[1800,7800],[13000,19000]], m.candidate_roles(key, source))
        self.assertTrue(m.verified_coverage(a))
        self.assertEqual(len(a['confirmedCoverage']['proofs']), 1)
        self.assertEqual(a['confirmedCoverage']['proofs'][0]['verses'], [3,4])
        self.assertEqual([v['verse'] for v in a['confirmedCoverage']['proofs'][0]['references']], [2,5])


if __name__ == '__main__':
    unittest.main()
