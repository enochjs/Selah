#!/usr/bin/env python3
"""Verify/restore the reviewed Commons photo collection and write Expo's static map.

Requires Pillow. Uses the retained Commons metadata snapshot (no random-photo API).
Only absent/corrupt assets are downloaded. JPEG re-encoding/resizing is the only
transformation. Each derivative retains its original CC/public-domain license;
CC BY-SA derivatives remain share-alike. A hash change requires explicit review
and a new catalog revision, rather than silently replacing a published asset.
Monthly additions should use the authenticated daily-scripture administration UI.
"""
import hashlib
import io
import json
import pathlib
import urllib.request
from PIL import Image, ImageOps

ROOT = pathlib.Path(__file__).resolve().parents[2]
DATA = ROOT / "packages/content/data"


def main():
    catalog = json.loads((DATA / "daily-verses.json").read_text())
    snapshot = json.loads((DATA / "daily-verse-image-sources.json").read_text())
    sources = {
        page["imageinfo"][0]["descriptionurl"]: page["imageinfo"][0]
        for page in snapshot["query"]["pages"].values()
        if page.get("imageinfo")
    }
    # Explicit, evidence-backed display-name overrides prevent Artist HTML usage
    # instructions from leaking into attribution. Original HTML stays in snapshot.
    overrides = json.loads((DATA / "daily-verse-author-overrides.json").read_text())
    for image in catalog["images"]:
        override = overrides.get(image["sourceUrl"])
        if override and image["author"] != override["author"]:
            raise ValueError("Display attribution disagrees with reviewed source identity: " + image["sourceUrl"])

        target = DATA / "daily-verse-images" / image["file"]
        if target.exists() and hashlib.sha256(target.read_bytes()).hexdigest() == image["sha256"]:
            continue
        source = sources[image["sourceUrl"]]
        request = urllib.request.Request(
            source.get("thumburl", source["url"]),
            headers={"User-Agent": "SelahDailyScripture/1.0 (attributed landscape collection)"},
        )
        with urllib.request.urlopen(request, timeout=60) as response:
            photo = ImageOps.exif_transpose(Image.open(io.BytesIO(response.read()))).convert("RGB")
        photo.thumbnail((1200, 1200))
        output = io.BytesIO()
        photo.save(output, "JPEG", quality=83, optimize=True)
        content = output.getvalue()
        if hashlib.sha256(content).hexdigest() != image["sha256"]:
            raise ValueError("Source/encoder changed; review required: " + image["sourceUrl"])
        target.write_bytes(content)
    lines = ["// Generated from the reviewed catalog by tools/assets/prepare-daily-verse-images.py.",
             "export const bundledDailyVerseImages: Record<string, number> = {"]
    for image in catalog["images"]:
        lines.append('  "' + image["id"] + '": require("@selah/content/daily-verse-images/' + image["file"] + '"),')
    lines.append("};")
    (ROOT / "apps/app/src/data/daily-verse-images.ts").write_text("\n".join(lines) + "\n")
    print("Verified", len(catalog["images"]), "reviewed photographs; wrote static image map")


if __name__ == "__main__":
    main()
