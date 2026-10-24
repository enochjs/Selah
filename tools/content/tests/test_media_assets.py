import hashlib
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from media_assets import file_matches, store_verified


class MediaAssetTests(unittest.TestCase):
    def test_repairs_an_interrupted_or_corrupt_copy_without_trusting_its_name(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source, target = root / 'download.mp3', root / 'media.mp3'
            source.write_bytes(b'complete recording')
            target.write_bytes(b'partial')
            sha = hashlib.sha256(source.read_bytes()).hexdigest()
            self.assertFalse(file_matches(target, sha))
            store_verified(source, target, sha)
            self.assertEqual(source.read_bytes(), target.read_bytes())
            self.assertTrue(file_matches(target, sha))
            target.write_bytes(b'corrupt')
            self.assertFalse(file_matches(target, sha))
            store_verified(source, target, sha)
            self.assertTrue(file_matches(target, sha))
