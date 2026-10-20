import unittest
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from import_resources import normalize_verses

class CanonicalResourceTests(unittest.TestCase):
    def test_duplicate_paragraphs_are_not_dropped(self):
        self.assertEqual(normalize_verses([{'number':1,'text':'God is light.'},{'number':1,'text':'God is love.'}]), [{'number':1,'text':'God is light.\nGod is love.'}])

    def test_canonical_id_takes_precedence_over_incorrect_number(self):
        self.assertEqual(normalize_verses([{'id':'NUM.1.45','number':33,'text':'All Israelites were counted.'}])[0]['number'],45)

    def test_omitted_verse_numbers_remain_explicit(self):
        self.assertEqual(normalize_verses([{'id':'JHN.5.4','number':4,'text':''}]),[{'number':4,'text':''}])

if __name__ == '__main__': unittest.main()
