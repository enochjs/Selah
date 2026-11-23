import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "import_english_lessons.py"


class EnglishLessonsImportTest(unittest.TestCase):
    def test_rejects_missing_referenced_video_without_replacing_catalog(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "lessons"
            source.mkdir()
            (source / "2026-11-22-lost-keys.md").write_text(
                "# Day 1 · I Lost My Key\n\n"
                "[播放](2026-11-22-lost-keys-v3.mp4)\n",
                encoding="utf-8",
            )
            publish = root / "media" / "english-lessons"
            publish.mkdir(parents=True)
            catalog = publish / "catalog.json"
            catalog.write_text('{"version":1,"lessons":[]}', encoding="utf-8")
            result = subprocess.run(
                [sys.executable, str(SCRIPT), str(source), "--media-root", str(publish.parent)],
                capture_output=True,
                text=True,
                check=False,
            )
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("missing video: 2026-11-22-lost-keys-v3.mp4", result.stderr)
            self.assertEqual(catalog.read_text(encoding="utf-8"), '{"version":1,"lessons":[]}')

    @unittest.skipUnless(shutil.which("ffmpeg") and shutil.which("ffprobe"), "FFmpeg is unavailable")
    def test_rejects_truncated_video_with_valid_stream_metadata(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "lessons"
            source.mkdir()
            video = source / "2026-11-22-lost-keys.mp4"
            subprocess.run(
                [
                    "ffmpeg", "-v", "error", "-f", "lavfi", "-i", "testsrc2=s=64x64:r=10",
                    "-f", "lavfi", "-i", "sine", "-t", "5", "-c:v", "libx264",
                    "-c:a", "aac", "-movflags", "+faststart", str(video),
                ],
                check=True,
                capture_output=True,
            )
            video.write_bytes(video.read_bytes()[: video.stat().st_size // 2])
            (source / "2026-11-22-lost-keys.md").write_text(
                """# Day 1 · I Lost My Key
阶段 1

[播放](2026-11-22-lost-keys.mp4)

## 课程章节

| 时间 | 学习任务 |
| --- | --- |
| 0:00 | Listen |
| 0:01 | Shadow |
| 0:02 | Retell |
| 0:03 | Transfer |

## 课后回顾

| 重点句 | 用途 |
| --- | --- |
| I lost my key! | 说明问题 |
| I just had it. | 提供线索 |
| You should check. | 提建议 |

说说你丢了什么。

情境和同期对白取自 VOA Learning English，原片选段为 00:00–00:30。 [原片](https://learningenglish.voanews.com/example)
""",
                encoding="utf-8",
            )
            result = subprocess.run(
                [sys.executable, str(SCRIPT), str(source), "--media-root", str(root / "media")],
                capture_output=True,
                text=True,
                check=False,
            )
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("video decode failed", result.stderr)
            self.assertFalse((root / "media/english-lessons/catalog.json").exists())


if __name__ == "__main__":
    unittest.main()
