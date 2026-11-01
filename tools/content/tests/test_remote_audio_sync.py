import sys
import unittest
import hashlib
import tempfile
from unittest.mock import patch
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


class RemoteAudioSyncTests(unittest.TestCase):
    def module(self):
        import importlib.util
        self.assertIsNotNone(importlib.util.find_spec('sync_remote_audio'))
        import sync_remote_audio
        return sync_remote_audio

    def test_only_the_dedicated_temporary_directory_can_be_cleaned(self):
        module = self.module()
        self.assertEqual(module.temporary_root('/home/linkmore/selah-audio-repair-20261024-1w1i6j2y'),
                         '/home/linkmore/selah-audio-repair-20261024-1w1i6j2y')
        for path in ['/home/linkmore', '/', '/home/linkmore/workspace/selah',
                     '/home/linkmore/selah-audio-repair-20261024-../workspace']:
            with self.subTest(path=path), self.assertRaises(ValueError):
                module.temporary_root(path)

    def test_only_content_addressed_verified_media_are_requested(self):
        module = self.module()
        artifact = {'accepted': True, 'sourceAudioSha256': 'a' * 64,
                    'verseFiles': [{'sha256': 'b' * 64}],
                    'vttFile': 'c' * 64 + '.vtt', 'vttSha256': 'c' * 64}
        media, timings = module.required_files([artifact, {'accepted': False}])
        self.assertEqual(media, {'a' * 64 + '.mp3', 'b' * 64 + '.mp3'})
        self.assertEqual(timings, {'c' * 64 + '.vtt'})
        with self.assertRaises(ValueError):
            module.required_files([{**artifact, 'vttFile': '../../private'}])

    def test_unfinished_or_unsynchronized_work_cannot_be_deleted(self):
        module = self.module()
        base = {'status': 'finished', 'alignedRecordings': 2378, 'pendingRecordings': 0,
                'reviewRecordings': 0}
        self.assertTrue(module.cleanup_ready(base, False, 'same', 'same'))
        self.assertFalse(module.cleanup_ready(base, True, 'same', 'same'))
        self.assertFalse(module.cleanup_ready(base, False, 'old', 'new'))
        self.assertFalse(module.cleanup_ready({**base, 'reviewRecordings': 1}, False, 'same', 'same'))

    def test_confirmed_partial_counts_only_when_every_recording_is_resolved_and_synced(self):
        module=self.module()
        state={'status':'finished','recordings':2378,'alignedRecordings':2368,'partialRecordings':10,
               'pendingRecordings':0,'reviewRecordings':0}
        self.assertTrue(module.cleanup_ready(state,False,'same','same'))
        self.assertFalse(module.cleanup_ready({**state,'reviewRecordings':1},False,'same','same'))
        self.assertFalse(module.cleanup_ready({**state,'partialRecordings':9},False,'same','same'))

    def test_corrupt_existing_media_are_copied_again(self):
        module = self.module()
        self.assertTrue(hasattr(module, 'files_to_copy'))
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            sha = hashlib.sha256(b'correct').hexdigest()
            name = sha + '.mp3'
            (root / name).write_bytes(b'partial')
            self.assertEqual(module.files_to_copy(root, {name}), {name})
            (root / name).write_bytes(b'correct')
            self.assertEqual(module.files_to_copy(root, {name}), set())

    def test_republication_must_not_allow_cleanup_if_a_local_report_was_lost(self):
        module = self.module()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            catalog = root / 'packages/content/data/chapter-audio.json'
            catalog.parent.mkdir(parents=True)
            catalog.write_bytes(b'original')
            remote_hash = hashlib.sha256(b'original').hexdigest()
            counts = {'recordings': 2378, 'alignedRecordings': 2378, 'pendingRecordings': 0, 'reviewRecordings': 0}
            state = {'pipeline': {'status': 'finished'}, 'manifest': counts,
                     'alive': False, 'workers': [], 'catalogSha256': remote_hash}
            def republish(snapshot):
                catalog.write_bytes(b'downgraded')
                return {**counts, 'alignedRecordings': 2377, 'pendingRecordings': 1}
            with patch.object(module, 'ROOT', root), patch.object(module, 'CONFIG', root / 'remote-config.json'), \
                    patch.object(module, 'remote_status', return_value=state), \
                    patch.object(module, 'publish', side_effect=republish), patch.object(module, 'remote_python') as remove:
                with self.assertRaises(RuntimeError):
                    module.cleanup({'temporaryRoot': '/home/linkmore/selah-audio-repair-20261024-1w1i6j2y',
                                    'sourceSnapshot': 'site-20261024'})
                remove.assert_not_called()

    def test_independent_review_process_prevents_cleanup_even_when_the_old_pipeline_has_finished(self):
        module=self.module()
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);catalog=root/'packages/content/data/chapter-audio.json';catalog.parent.mkdir(parents=True);catalog.write_bytes(b'catalog')
            sha=hashlib.sha256(catalog.read_bytes()).hexdigest();counts={'recordings':2378,'alignedRecordings':2378,'partialRecordings':0,'pendingRecordings':0,'reviewRecordings':0}
            state={'pipeline':{'status':'finished'},'manifest':counts,'alive':False,'workers':[],'catalogSha256':sha,'diagnostics':{'alive':True,'workers':[]}}
            with patch.object(module,'ROOT',root),patch.object(module,'CONFIG',root/'config.json'),patch.object(module,'remote_status',return_value=state),patch.object(module,'publish',return_value=counts),patch.object(module,'remote_python') as remove:
                with self.assertRaises(RuntimeError):module.cleanup({'temporaryRoot':'/home/linkmore/selah-audio-repair-20261024-1w1i6j2y','sourceSnapshot':'site-20261024'})
                remove.assert_not_called()


if __name__ == '__main__':
    unittest.main()
