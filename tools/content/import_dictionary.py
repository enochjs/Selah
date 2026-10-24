"""Build the mobile offline dictionary from a pinned ECDICT HTTP snapshot.

Keep all Scripture vocabulary and examination / top-30,000 frequency words.
The upstream 770,611-entry technical dictionary is too large for a mobile bundle.
Existing editorial dictionary.json entries are never overwritten.
"""
import argparse
import csv
import hashlib
import json
import re
import shutil
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BLOB = "0e527e22e0e0d22f012b0ed251a8dddd5891773b"
COMMIT = "ab22ad36302cafc6349a050e2b60894855208055"


def clean(value):
    return (value or "").replace(r"\n", "\n").strip()


def build_dictionary(rows, scripture_words):
    rows = {row["word"].lower(): row for row in rows
            if re.fullmatch(r"[A-Za-z]+(?:['-][A-Za-z]+)*", row["word"])
            and re.search(r"[\u3400-\u9fff]", row.get("translation", ""))}
    selected = set(scripture_words) & rows.keys()
    selected.update(word for word, row in rows.items()
                    if row.get("tag") or row.get("oxford") == "1"
                    or 0 < int(row.get("bnc") or 0) <= 30000
                    or 0 < int(row.get("frq") or 0) <= 30000)
    forms = {}
    for word, row in rows.items():
        for part in row.get("exchange", "").split("/"):
            kind, _, form = part.partition(":")
            if kind == "0" and form in rows and form != word:
                forms[word] = form
    # Include the actual lemma for any selected inflected entry.
    selected.update(forms[word] for word in list(selected) if word in forms)
    for word in sorted(selected):
        for part in rows[word].get("exchange", "").split("/"):
            kind, _, form = part.partition(":")
            if kind in {"p", "d", "i", "3", "r", "t", "s"} and re.fullmatch(r"[a-z]+", form):
                forms.setdefault(form, word)
    forms = {word: lemma for word, lemma in forms.items() if lemma in selected and word != lemma}
    entries = {}
    for word in sorted(selected):
        row = rows[word]
        meaning = clean(row["translation"])
        pos = row.get("pos") or ", ".join(dict.fromkeys(re.findall(
            r"(?:^|\n)([a-z]+\.)", meaning)))
        entries[word] = [meaning, clean(row.get("phonetic")), pos]
    return entries, dict(sorted(forms.items()))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--snapshot", type=Path, required=True)
    parser.add_argument("--license", type=Path, required=True)
    parser.add_argument("--output-root", type=Path, default=ROOT / "packages/content/data")
    args = parser.parse_args()
    raw = args.snapshot.read_bytes()
    actual_blob = hashlib.sha1(b"blob " + str(len(raw)).encode() + b"\0" + raw).hexdigest()
    if actual_blob != BLOB:
        raise ValueError("Snapshot does not match the pinned upstream Git blob")
    books = json.loads((args.output_root / "bible.json").read_text())
    words = set()
    for book in books:
        for chapter in book["chapters"]:
            for verse in chapter:
                for token in re.findall(r"[A-Za-z]+(?:['’\-][A-Za-z]+)*", verse["en"]):
                    word = token.lower().replace("’", "'")
                    if word:
                        words.add(word)
                        if word.endswith("'s"):
                            words.add(word[:-2])
    with args.snapshot.open(encoding="utf-8-sig", newline="") as file:
        entries, forms = build_dictionary(csv.DictReader(file), words)
    stamp = datetime.now(timezone.utc).isoformat()
    sha = hashlib.sha256(raw).hexdigest()
    snapshot_path = ROOT / "storage/resources/cache/dictionary" / f"{sha}.csv"
    snapshot_path.parent.mkdir(parents=True, exist_ok=True)
    if args.snapshot.resolve() != snapshot_path.resolve():
        shutil.copyfile(args.snapshot, snapshot_path)
    metadata = dict(
        source="ECDICT", license="MIT", licenseText=args.license.read_text(),
        sourceUrl=f"https://github.com/skywind3000/ECDICT/blob/{COMMIT}/ecdict.csv",
        downloadUrl=f"https://api.github.com/repos/skywind3000/ECDICT/git/blobs/{BLOB}",
        gitBlob=BLOB, sha256=sha, importedAt=stamp,
        selection="All current Scripture words plus examination and top-30,000 BNC / contemporary frequency headwords, including their lemmas",
        entries=len(entries), forms=len(forms), scriptureWords=len(words),
        coveredScriptureWords=sum(word in entries or word in forms for word in words),
    )
    for name, value in {"dictionary-offline.json": entries, "dictionary-forms.json": forms,
                        "dictionary-license.json": metadata}.items():
        target = args.output_root / name
        if target.exists():
            backup = ROOT / "storage/resources/backups/dictionary" / stamp.replace(":", "-")
            backup.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(target, backup / name)
        temporary = target.with_suffix(".tmp")
        temporary.write_text(json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n")
        temporary.replace(target)
    print(json.dumps({k: metadata[k] for k in ("entries", "forms", "scriptureWords", "coveredScriptureWords")}, ensure_ascii=False))


if __name__ == "__main__":
    main()
