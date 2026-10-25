import os
import sys
import tempfile
import unittest
import json
import contextlib
import io
from unittest.mock import patch
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import site_pipeline
import align_site


class SitePipelineTests(unittest.TestCase):
    def test_source_review_only_processes_failures_not_yet_checked_by_current_recipe(self):
        from alignment_contract import QUALITY_RECIPE, CONTEXT_REVIEW_RECIPE, SOURCE_REVIEW_RECIPE
        with tempfile.TemporaryDirectory() as directory:
            snapshot = Path(directory)
            for name in ['recordings', 'alignment']:
                (snapshot / name).mkdir()
            (snapshot / 'bible.json').write_text(json.dumps([{'id': 'genesis', 'chapters':
                [[{'number': 1, 'en': 'God is good.', 'zh': ''}]] * 4}]))
            for chapter in range(1, 5):
                key = f'genesis:{chapter}:en'
                filename = key.replace(':', '__') + '.json'
                (snapshot / 'recordings' / filename).write_text(json.dumps(
                    {'key': key, 'locale': 'en', 'chapter': chapter}))
                (snapshot / 'alignment' / filename).write_text(json.dumps(
                    {'key': key, 'accepted': chapter == 1, 'issues': ['text-audio-needs-review:1'],
                     'qualityRecipe': SOURCE_REVIEW_RECIPE if chapter == 4 else
                                      QUALITY_RECIPE if chapter == 3 else CONTEXT_REVIEW_RECIPE}))
            seen = []
            class Aligner:
                def __init__(self, locale, path, source_review):
                    self.source_review = source_review
                def align_recording(self, receipt, verses, **options):
                    seen.append((receipt['key'], self.source_review, options['source_review']))
                    return {'accepted': False, 'issues': ['text-audio-needs-review:1']}
            with patch.object(align_site, 'SiteAligner', Aligner), contextlib.redirect_stdout(io.StringIO()):
                align_site.run(snapshot, 'en', source_review=True)
            self.assertEqual(seen, [('genesis:2:en', True, True), ('genesis:3:en', True, True)])

    def test_shards_cover_all_recordings_once_even_when_priority_order_changes(self):
        self.assertTrue(hasattr(align_site, 'recording_shard'))
        keys = [f'genesis:{chapter}:en' for chapter in range(1, 51)]
        groups = [[key for key in keys if align_site.recording_shard(key, 3) == shard] for shard in range(3)]
        self.assertEqual(sorted(key for group in groups for key in group), sorted(keys))
        for key in reversed(keys):
            self.assertEqual(sum(key in group for group in groups), 1)
            self.assertIn(key, groups[align_site.recording_shard(key, 3)])

    def test_workers_have_bounded_thread_pools(self):
        self.assertTrue(hasattr(site_pipeline, 'worker_environment'))
        environment = site_pipeline.worker_environment(3)
        for name in ['SELAH_ALIGNMENT_THREADS', 'OMP_NUM_THREADS', 'MKL_NUM_THREADS', 'OPENBLAS_NUM_THREADS']:
            self.assertEqual(environment[name], '3')

    def test_rechecking_an_existing_report_triggers_incremental_publication(self):
        self.assertTrue(hasattr(site_pipeline, 'alignment_revision'),
                        'Publication must notice replaced reports, not just new filenames')
        with tempfile.TemporaryDirectory() as directory:
            snapshot = Path(directory)
            (snapshot / 'alignment').mkdir()
            report = snapshot / 'alignment' / 'genesis__1__en.json'
            report.write_text('{"accepted":false}')
            before = site_pipeline.alignment_revision(snapshot)
            report.write_text('{"accepted":true}')
            os.utime(report, ns=(report.stat().st_atime_ns, report.stat().st_mtime_ns + 1_000_000))
            self.assertNotEqual(site_pipeline.alignment_revision(snapshot), before)


if __name__ == '__main__':
    unittest.main()
