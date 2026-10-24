import os
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import site_pipeline
import align_site


class SitePipelineTests(unittest.TestCase):
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
