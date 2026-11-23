"""Publish English lesson MP4s and their companion Markdown to the Selah media root."""

import argparse
import fcntl
import hashlib
import json
import math
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
from datetime import date
from urllib.parse import urlsplit


ROOT = Path(__file__).resolve().parents[2]
LESSON_ID = re.compile(r"\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*")


def table_rows(section):
    return [
        [cell.strip() for cell in line.strip().strip("|").split("|")]
        for line in section.splitlines()
        if line.strip().startswith("|")
    ][2:]


def read_lesson(markdown):
    text = markdown.read_text(encoding="utf-8")
    if not LESSON_ID.fullmatch(markdown.stem):
        raise ValueError("expected a YYYY-MM-DD-topic filename")
    date.fromisoformat(markdown.stem[:10])
    heading = re.search(r"^# (?:Day \d+ · )?(.+)$", text, re.M)
    link = re.search(r"\]\(([a-z0-9-]+\.mp4)\)", text)
    if not heading or not link:
        raise ValueError("missing title or local MP4 link")
    video = markdown.parent / link[1]
    if not video.is_file():
        raise ValueError(f"missing video: {video.name}")

    stage = re.search(r"阶段\s*([1-3])\b", text)
    chapters_text = re.search(r"^## 课程章节\s*(.*?)^## 课后回顾\s*", text, re.M | re.S)
    review = re.search(r"^## 课后回顾\s*(.*)", text, re.M | re.S)
    if not (stage and chapters_text and review):
        raise ValueError("missing stage, 课程章节 or 课后回顾")

    chapters = []
    for timestamp, prompt in table_rows(chapters_text[1]):
        match = re.fullmatch(r"(\d+):([0-5]\d)", timestamp)
        if not match or not prompt:
            raise ValueError(f"invalid chapter: {timestamp}")
        chapters.append({
            "start": int(match[1]) * 60 + int(match[2]),
            "prompt": prompt,
        })
    starts = [chapter["start"] for chapter in chapters]
    if len(starts) != 4 or starts[0] != 0 or starts != sorted(set(starts)):
        raise ValueError("expected four increasing chapter times starting at 0:00")

    phrases = [
        {"text": phrase.replace("**", ""), "purpose": purpose}
        for phrase, purpose in table_rows(review[1])
    ]
    if not 3 <= len(phrases) <= 5 or not all(all(item.values()) for item in phrases):
        raise ValueError("expected 3–5 lesson phrases and their uses")

    paragraphs = [
        line.strip() for line in review[1].splitlines()
        if line.strip() and not line.strip().startswith("|")
    ]
    source_line = next((line for line in paragraphs if "原片选段" in line), "")
    credit = re.search(r"取自 (.+?)，", source_line)
    excerpt = re.search(r"原片选段为 (\S+?)。", source_line)
    source_link = re.search(r"\]\((https://[^\s)]+)\)", source_line)
    practice = "\n".join(line.replace("**", "") for line in paragraphs if line != source_line)
    if not (credit and excerpt and source_link and urlsplit(source_link[1]).hostname and practice):
        raise ValueError("missing original video attribution, excerpt or practice prompt")

    return {
        "id": markdown.stem,
        "date": markdown.stem[:10],
        "title": heading[1].strip(),
        "stage": int(stage[1]),
        "chapters": chapters,
        "phrases": phrases,
        "practice": practice,
        "source": {"credit": credit[1], "excerpt": excerpt[1], "url": source_link[1]},
    }, video


def media_duration(file):
    result = subprocess.run(
        [
            "ffprobe", "-v", "error", "-show_entries",
            "format=format_name,duration:stream=codec_type,codec_name",
            "-of", "json", str(file),
        ],
        check=True,
        capture_output=True,
        text=True,
        timeout=30,
    )
    probe = json.loads(result.stdout)
    streams = {(item["codec_type"], item["codec_name"]) for item in probe["streams"]}
    if not {("video", "h264"), ("audio", "aac")} <= streams:
        raise ValueError("expected an H.264 video track and an AAC audio track")
    if "mp4" not in probe["format"]["format_name"].split(","):
        raise ValueError("expected an MP4 container")
    duration = float(probe["format"]["duration"])
    if not math.isfinite(duration) or duration <= 0:
        raise ValueError("invalid video duration")
    return duration


def validate_decoding(file, duration):
    result = subprocess.run(
        [
            "ffmpeg", "-v", "error", "-xerror", "-i", str(file),
            "-map", "0:v:0", "-map", "0:a:0", "-f", "null", "-",
        ],
        capture_output=True,
        text=True,
        timeout=max(30, min(1800, duration * 2)),
    )
    if result.returncode:
        raise ValueError(f"video decode failed: {result.stderr.strip()}")


def file_digest(file):
    with file.open("rb") as handle:
        return hashlib.file_digest(handle, "sha256").hexdigest()


def publish(source, media_root):
    markdown_files = sorted(source.glob("*.md"))
    if not markdown_files:
        raise ValueError(f"no course Markdown files in {source}")
    published = media_root / "english-lessons"
    published.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=published) as directory:
        staging = Path(directory)
        incoming = []
        for markdown in markdown_files:
            try:
                lesson, video = read_lesson(markdown)
                staged = staging / f"{markdown.stem}.mp4"
                shutil.copyfile(video, staged)
                duration = media_duration(staged)
                if lesson["chapters"][-1]["start"] >= duration:
                    raise ValueError("chapter jumps outside the video")
                validate_decoding(staged, duration)
                lesson.update(duration=round(duration, 3), sha256=file_digest(staged))
                incoming.append((lesson, staged))
            except (ValueError, KeyError, subprocess.SubprocessError) as error:
                raise ValueError(f"{markdown.name}: {error}") from error

        catalog = published / "catalog.json"
        with (published / ".import.lock").open("a") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX)
            previous = json.loads(catalog.read_text(encoding="utf-8")) if catalog.exists() else {
                "version": 1, "lessons": [],
            }
            if previous.get("version") != 1 or not isinstance(previous.get("lessons"), list):
                raise ValueError("invalid existing English lesson catalog")
            lessons = {item["id"]: item for item in previous["lessons"]}
            for item, staged in incoming:
                target = published / f'{item["sha256"]}.mp4'
                if not target.is_file() or file_digest(target) != item["sha256"]:
                    staged.chmod(0o644)
                    os.replace(staged, target)
                lessons[item["id"]] = item
            payload = {
                "version": 1,
                "lessons": sorted(lessons.values(), key=lambda item: (item["date"], item["id"]), reverse=True),
            }
            updated = staging / "catalog.json"
            updated.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            updated.chmod(0o644)
            os.replace(updated, catalog)
    print(f"Imported {len(incoming)} lesson(s); {len(lessons)} available in {catalog}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument(
        "--media-root", type=Path,
        default=ROOT / os.environ.get("MEDIA_ROOT", "storage/resources/media"),
    )
    args = parser.parse_args()
    try:
        publish(args.source, args.media_root)
    except (OSError, ValueError, KeyError) as error:
        parser.exit(1, f"{error}\n")


if __name__ == "__main__":
    main()
