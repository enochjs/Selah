import csv
import io
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from import_dictionary import build_dictionary


class DictionaryImportTests(unittest.TestCase):
    def test_includes_scripture_names_and_common_words_with_real_inflections(self):
        rows = [
            dict(word="lead", translation=r"vt. 带领\nn. 铅", phonetic="li:d", tag="cet4", exchange="p:led/d:led/i:leading"),
            dict(word="led", translation="lead的过去式", phonetic="led", exchange="0:lead"),
            dict(word="Abijah", translation="n. 亚比雅", phonetic="", exchange=""),
            dict(word="unrelated", translation="无关的", phonetic="", exchange=""),
        ]
        entries, forms = build_dictionary(rows, {"led", "abijah"})
        self.assertEqual(entries["lead"][0], "vt. 带领\nn. 铅")
        self.assertIn("abijah", entries)
        self.assertNotIn("unrelated", entries)
        self.assertEqual(forms["led"], "lead")
        self.assertEqual(forms["leading"], "lead")

    def test_excludes_empty_translations_and_preserves_existing_headwords(self):
        entries, forms = build_dictionary([
            dict(word="walk", translation="v. 行走", exchange="i:walking", tag="cet4"),
            dict(word="walking", translation="n. 步行", exchange="0:walk"),
            dict(word="broken", translation="", exchange="", tag="cet4"),
        ], {"walking", "broken"})
        self.assertNotIn("broken", entries)
        self.assertEqual(entries["walking"][0], "n. 步行")
        self.assertEqual(forms["walking"], "walk")

