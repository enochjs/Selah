"""Legacy publication must not overwrite the shared provider dataset."""
import json
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from publish_alignment import publish


class WorkspacePublicationTests(unittest.TestCase):
    def test_legacy_job_leaves_provider_dataset_unchanged_in_workspace_layout(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            data = root / "packages/content/data"
            data.mkdir(parents=True)
            (root / "storage/alignment").mkdir(parents=True)
            (data / "bible.json").write_text("[]")
            catalog = {"genesis:1:en": {"provider": "ao-bsb"}}
            original = json.dumps(catalog)
            (data / "chapter-audio.json").write_text(original)
            publish([], root=root)
            self.assertEqual((data / "chapter-audio.json").read_text(), original)
