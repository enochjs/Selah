import importlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


class ReviewReportTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.snapshot = self.root / 'snapshot'
        (self.snapshot / 'alignment').mkdir(parents=True)
        self.content = self.root / 'packages/content/data'
        self.content.mkdir(parents=True)
        self.md = self.root / 'report.md'
        self.machine = self.root / 'report.json'
        self.catalog = {
            'genesis:1:en': self.recording('aligned'),
            'genesis:1:zh': self.recording('partial', missingVerses=[
                {'verse': 3, 'reason': 'not-narrated-in-source'}]),
            'genesis:2:en': self.recording('review-required', alignmentIssues=[
                'unreliable-verse-boundary:2', 'unreliable-verse-boundary:4']),
            'genesis:2:zh': self.recording('review-required', alignmentIssues=[
                'boundary-unassigned-speech:between-verses']),
            'genesis:3:en': self.recording('pending'),
        }
        self.books = [{'id': 'genesis', 'en': 'Genesis', 'zh': '创世记', 'chapters': [
            [{'number': 1, 'en': 'One', 'zh': '第一节及第二节'},
             {'number': 2, 'en': 'Two', 'zh': '', 'zhMergedInto': 1},
             {'number': 3, 'en': 'Three', 'zh': '第三节'}],
            [{'number': n, 'en': f'Verse {n}', 'zh': f'第{n}节'} for n in range(1, 5)],
            [{'number': 1, 'en': 'Pending', 'zh': '待处理'}],
        ]}]
        self.write(self.content / 'bible.json', self.books)
        self.write(self.content / 'chapter-audio.json', self.catalog)
        self.write(self.content / 'resource-manifest.json', {
            'sourceSnapshot': 'snapshot', 'alignedRecordings': 1,
            'partialRecordings': 1, 'reviewRecordings': 2, 'pendingRecordings': 1})
        self.artifact('genesis:1:zh', {
            'issues': [], 'checks': [{'verse': 3, 'searchRange': [5, 6]}],
            'missingVerses': [{'verse': 2, 'reason': 'uncertain'}],
            'boundarySourceVerses': [{'number': 1, 'text': '第一节及第二节', 'coveredVerses': [1, 2]}],
        })
        self.artifact('genesis:2:en', {
            'issues': ['unreliable-verse-boundary:2', 'unreliable-verse-boundary:4'],
            'checks': [{'verse': 2, 'text': 'Verse 2', 'searchRange': [3, 5],
                        'boundaryVerified': False, 'independentTranscript': 'Subscribe to my channel | 假象',
                        'boundaryEvidence': {'passed': False, 'acousticCore': [3.2, 4.8], 'reasons': ['weak-head']}}],
        })
        self.artifact('genesis:2:zh', {
            'issues': ['boundary-unassigned-speech:between-verses'],
            'checks': [],
            'cues': [{'verse': 1, 'start': 0, 'end': 2}, {'verse': 3, 'start': 4, 'end': 6}],
            'unclaimedSpeech': [{'kind': 'between-verses', 'start': 2.1, 'end': 3.9,
                                 'text': 'Please subscribe', 'allowedHeadingOrClosing': False}],
        })

    def recording(self, status, **extra):
        return {'alignmentStatus': status, 'path': '/api/audio/resources/' + 'a' * 64 + '.mp3',
                'mediaSha256': 'a' * 64, 'sourceUrl': 'https://source.test/original.mp3',
                'duration': 10, 'segments': [], **extra}

    def write(self, path, data):
        path.write_text(json.dumps(data, ensure_ascii=False), encoding='utf8')

    def artifact(self, key, data):
        data = {'key': key, 'sourceAudioSha256': 'a' * 64, 'textSha256': 'b' * 64,
                'spokenProjection': {'sourceTextSha256': 'c' * 64}, **data}
        self.write(self.snapshot / 'alignment' / (key.replace(':', '__') + '.json'), data)

    def report(self):
        self.assertIsNotNone(importlib.util.find_spec('review_report'))
        module = importlib.import_module('review_report')
        summary = module.generate_report(self.snapshot, self.root, self.md, self.machine)
        return summary, json.loads(self.machine.read_text()), self.md.read_text()

    def test_reports_all_problem_statuses_and_preserves_original_identity(self):
        summary, report, markdown = self.report()
        self.assertEqual({key: summary[key] for key in ['alignedRecordings', 'partialRecordings',
                         'reviewRecordings', 'pendingRecordings', 'problemRecordings', 'missingVerseCount']},
                         {'alignedRecordings': 1, 'partialRecordings': 1, 'reviewRecordings': 2,
                          'pendingRecordings': 1, 'problemRecordings': 4, 'missingVerseCount': 1})
        self.assertTrue(report['generatedAt'].endswith('+08:00'))
        self.assertEqual(len(report['chapters']), 4)
        partial = next(c for c in report['chapters'] if c['key'] == 'genesis:1:zh')
        self.assertEqual(partial['book'], {'id': 'genesis', 'en': 'Genesis', 'zh': '创世记'})
        self.assertEqual(partial['sourceAudioSha256'], 'a' * 64)
        self.assertEqual(partial['textSha256'], 'b' * 64)
        self.assertEqual(partial['alignmentMetadata']['spokenProjection']['sourceTextSha256'], 'c' * 64)
        self.assertEqual(partial['sourceUrl'], 'https://source.test/original.mp3')
        self.assertTrue(Path(partial['sourceAudioPath']).is_absolute())
        self.assertTrue(Path(partial['alignmentReportPath']).is_absolute())
        self.assertIn('部分通过不计入完整通过', markdown)
        self.assertIn('原录音保留，未替换', markdown)
        self.assertIn(f'[原始 MP3](<{partial["sourceAudioPath"]}>)', markdown)

    def test_missing_check_and_pending_artifact_are_not_confirmed_missing(self):
        _, report, _ = self.report()
        review = next(c for c in report['chapters'] if c['key'] == 'genesis:2:en')
        missing_check = next(row for row in review['problems'] if row['verse'] == 4)
        self.assertEqual(missing_check['kind'], 'review')
        self.assertIsNone(missing_check['timeRange'])
        self.assertIn('缺少', missing_check['reason'])
        pending = next(c for c in report['chapters'] if c['status'] == 'pending')
        self.assertFalse(pending['alignmentReportExists'])
        self.assertFalse(any(row['kind'] == 'confirmed-missing' for row in pending['problems']))
        self.assertEqual(next(row for row in review['problems'] if row['verse'] == 2)['timeRange'], [3, 5])

    def test_gap_only_locates_adjacent_verses_and_does_not_claim_asr_as_fact(self):
        _, report, markdown = self.report()
        chapter = next(c for c in report['chapters'] if c['key'] == 'genesis:2:zh')
        gap = next(row for row in chapter['problems'] if row['kind'] == 'gap-review')
        self.assertEqual(gap['nearbyVerses'], [1, 3])
        self.assertIsNone(gap['verse'])
        self.assertEqual(gap['timeRange'], [2.1, 3.9])
        self.assertIn('不能据此认定缺录', gap['reason'])
        self.assertIn('仅为识别诊断', markdown)
        self.assertIn('Subscribe to my channel', markdown)
        self.assertIn('Subscribe to my channel | 假象', json.dumps(report, ensure_ascii=False))
        for chapter in report['chapters']:
            for row in chapter['problems']:
                if chapter['key'] != 'genesis:1:zh':
                    self.assertNotEqual(row['kind'], 'confirmed-missing')

    def test_catalog_missing_metadata_is_the_only_confirmation_and_merged_aliases_survive(self):
        _, report, _ = self.report()
        partial = next(c for c in report['chapters'] if c['status'] == 'partial')
        self.assertEqual([p['verse'] for p in partial['problems'] if p['kind'] == 'confirmed-missing'], [3])
        self.catalog['genesis:1:zh']['alignmentIssues'] = ['unreliable-verse-boundary:1']
        self.write(self.content / 'chapter-audio.json', self.catalog)
        _, report, _ = self.report()
        partial = next(c for c in report['chapters'] if c['status'] == 'partial')
        row = next(p for p in partial['problems'] if p['verse'] == 1)
        self.assertEqual(row['coveredVerses'], [1, 2])
        self.assertEqual(row['kind'], 'review')

    def test_cli_creates_only_requested_reports_without_mutating_inputs(self):
        before = {p: p.read_bytes() for p in self.root.rglob('*.json')}
        self.assertIsNotNone(importlib.util.find_spec('review_report'))
        module = importlib.import_module('review_report')
        result = subprocess.run([sys.executable, module.__file__, '--snapshot', str(self.snapshot),
                                 '--root', str(self.root), '--output-md', str(self.md),
                                 '--output-json', str(self.machine)], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout)['problemRecordings'], 4)
        for path, data in before.items():
            self.assertEqual(path.read_bytes(), data)

    def test_acoustic_core_fallback_and_gap_neighbors_use_merged_check_aliases_without_cues(self):
        self.artifact('genesis:2:zh', {
            'issues': ['boundary-unassigned-speech:between-verses'],
            'checks': [
                {'verse': 1, 'coveredVerses': [1, 2], 'boundaryEvidence': {'acousticCore': [0, 2]}},
                {'verse': 3, 'boundaryEvidence': {'acousticCore': [4, 6]}},
            ],
            'unclaimedSpeech': [{'start': 2.1, 'end': 3.9, 'text': 'ASR only'}],
        })
        self.artifact('genesis:2:en', {
            'issues': ['unreliable-verse-boundary:2'],
            'checks': [{'verse': 2, 'boundaryVerified': False,
                        'boundaryEvidence': {'acousticCore': [3.2, 4.8]}}],
        })
        _, report, _ = self.report()
        gap = next(c for c in report['chapters'] if c['key'] == 'genesis:2:zh')['problems'][0]
        self.assertEqual(gap['nearbyVerses'], [1, 2, 3])
        check = next(c for c in report['chapters'] if c['key'] == 'genesis:2:en')['problems'][0]
        self.assertEqual(check['timeRange'], [3.2, 4.8])
        self.assertEqual(check['timeSource'], 'boundaryEvidence.acousticCore')

    def test_report_destinations_cannot_overwrite_canonical_inputs_or_snapshot_evidence(self):
        module = importlib.import_module('review_report')
        for path in [self.content / 'chapter-audio.json', self.snapshot / 'alignment/genesis__1__zh.json']:
            original = path.read_bytes()
            with self.assertRaises(ValueError):
                module.generate_report(self.snapshot, self.root, path, self.machine)
            self.assertEqual(path.read_bytes(), original)


if __name__ == '__main__':
    unittest.main()
