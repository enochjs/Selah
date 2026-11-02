"""Bundle static, OFL-licensed reading fonts (requires fonttools and curl).

Run from any directory: python tools/assets/prepare-reading-fonts.py
The Chinese subset must be regenerated when the offline scripture changes.
"""

import base64
import hashlib
import json
from io import BytesIO
from pathlib import Path
import subprocess

from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "apps/app/assets/fonts"
SOURCES = (
    (
        "SelahScriptureSC-Regular.ttf",
        "https://fonts.gstatic.com/s/notoserifsc/v36/"
        "H4cyBXePl9DZ0Xe7gG9cyOj7uK2-n-D2rd4FY7SCqyWv.ttf",
        "a513b97fa1503422d78ee1f40415db736926e2d0d8d99701bdcede8cf6f6058e",
    ),
    (
        "SourceSerif4-Regular.ttf",
        "https://fonts.gstatic.com/s/sourceserif4/v15/"
        "vEFy2_tTDB4M7-auWDN0ahZJW3IX2ih5nk3AucvU7f6OAVIJmeUDygwjihdqrhw.ttf",
        "7cfa2e7f1c516afd9fc4b6e50b98fba5256ec4111965fa4bc0e9627870c358b3",
    ),
    (
        "SelahSansSC-Regular.ttf",
        "https://fonts.gstatic.com/s/notosanssc/v41/"
        "k3kCo84MPvpLmixcA63oeAL7Iqp5IZJF9bmaG9_FnYw.ttf",
        "450625c8d46ab3df97b7904ded955ec2746d17ec76740cb1e91d1ba63a0f89af",
    ),
    (
        "SelahWenKai-Regular.ttf",
        # Pinned v1.530 blob, decoded from GitHub's base64 response.
        "https://api.github.com/repos/lxgw/LxgwWenKai/git/blobs/"
        "7f8f031dc5c6c5ba1913d93c36d4667c1e311cea",
        "2d73eea94ad808999d90c0000c239a84a33b09d4bc6ab6c5b8bbf1eda8a7fc8b",
    ),
)
SUBSET_FAMILIES = {
    "SelahScriptureSC-Regular.ttf": "Selah Scripture SC",
    "SelahSansSC-Regular.ttf": "Selah Sans SC",
    "SelahWenKai-Regular.ttf": "Selah WenKai",
}


def scripture_characters():
    data = json.loads((ROOT / "packages/content/data/bible.json").read_text())
    text = "".join(
        book["zh"] + "".join(
            verse["zh"] for chapter in book["chapters"] for verse in chapter
        )
        for book in data
    )
    return {ord(char) for char in text if not char.isspace()}


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    characters = scripture_characters()
    for filename, url, digest in SOURCES:
        raw = subprocess.run(
            ["curl", "-fLsS", "--max-time", "60", url],
            check=True,
            capture_output=True,
        ).stdout
        if url.startswith("https://api.github.com/"):
            raw = base64.b64decode(json.loads(raw)["content"])
        if hashlib.sha256(raw).hexdigest() != digest:
            raise ValueError(f"Source font checksum mismatch: {filename}")
        font = TTFont(BytesIO(raw), recalcTimestamp=False)
        if filename.startswith("Selah"):
            missing = characters - font.getBestCmap().keys()
            if missing:
                raise ValueError(f"Missing scripture glyphs: {sorted(missing)}")
            options = subset.Options()
            options.recalc_timestamp = False
            options.name_IDs = ["*"]
            options.name_languages = ["*"]
            subsetter = subset.Subsetter(options=options)
            # Include spaces, superscript verse numbers and editorial punctuation.
            subsetter.populate(
                unicodes=characters | set(range(0x20, 0x100))
                | set(range(0x2000, 0x2070)) | set(range(0x3000, 0x3040))
            )
            subsetter.subset(font)
            # Give the modified subset a distinct family name; retain copyright/license.
            family = SUBSET_FAMILIES[filename]
            postscript = filename.removesuffix(".ttf")
            names = {
                1: family, 2: "Regular", 3: postscript,
                4: family + " Regular", 6: postscript, 16: family, 17: "Regular",
            }
            for record in font["name"].names:
                if record.nameID in names:
                    record.string = names[record.nameID].encode(record.getEncoding())
            font.save(OUTPUT / filename)
            if characters - TTFont(OUTPUT / filename).getBestCmap().keys():
                raise ValueError("Subset lost scripture glyphs")
        else:
            (OUTPUT / filename).write_bytes(raw)
        print(f"{filename}: {(OUTPUT / filename).stat().st_size:,} bytes")
    print(f"Verified coverage of {len(characters):,} Chinese scripture characters")


if __name__ == "__main__":
    main()
