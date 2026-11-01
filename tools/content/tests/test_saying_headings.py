"""Only visible same-edition numbered headings establish Saying metadata."""
import copy,hashlib,sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from test_source_omissions import chapter_html,evidence

class SayingHeadingTests(unittest.TestCase):
    def fixture(self):
        positions={20:1,21:3,22:5,23:7,24:8,25:10,26:13,27:15,28:17,29:19,30:21}
        raw=chapter_html(book='Prov',chapter=24,last=34,missing=()).replace('<p>','<div>').replace('</p>','</div>')
        for n,v in positions.items():
            marker=f'<span class="text Prov-24-{v}" id='
            heading=f'<h4><span class="text Prov-24-{v}">Saying {n}</span></h4>'
            raw=raw.replace(marker,heading+marker,1)
        e=evidence(raw,key='proverbs:24:en',book='Proverbs',present=list(range(1,35)),last=34);return e,[dict(number=v,text='Original canonical text.') for v in range(1,35)],positions

    def test_visible_numbered_headings_map_to_their_actual_verse_reference(self):
        try:from saying_headings import extract_saying_headings
        except ImportError:self.fail('Numbered musical narration needs independently archived heading metadata')
        e,v,positions=self.fixture();before=copy.deepcopy(e);self.assertEqual(extract_saying_headings(e,'proverbs:24:en',v),positions);self.assertEqual(e,before)

    def test_sidebar_and_hidden_fake_headings_are_not_used(self):
        try:from saying_headings import extract_saying_headings
        except ImportError:self.fail('Numbered musical narration needs independently archived heading metadata')
        e,v,positions=self.fixture();e['rawHtml']=e['rawHtml'].replace('</body>','<h4><span class="text Prov-24-2">Saying 99</span></h4></body>').replace('<h4>','<h4 style="display:none"><span class="text Prov-24-2">Saying 99</span></h4><h4>',1);e['sha256']=hashlib.sha256(e['rawHtml'].encode()).hexdigest();self.assertEqual(extract_saying_headings(e,'proverbs:24:en',v),positions)

    def test_wrong_edition_duplicate_missing_and_cross_chapter_headings_are_rejected(self):
        try:from saying_headings import extract_saying_headings
        except ImportError:self.fail('Numbered musical narration needs independently archived heading metadata')
        for kind in ['edition','duplicate','missing','chapter']:
            e,v,_=self.fixture()
            if kind=='edition':e['rawHtml']=e['rawHtml'].replace('data-translation="NIV"','data-translation="KJV"')
            if kind=='duplicate':e['rawHtml']=e['rawHtml'].replace('<h4>','<h4><span class="text Prov-24-1">Saying 20</span></h4><h4>',1)
            if kind=='missing':e['rawHtml']=e['rawHtml'].replace('Saying 20','Other title')
            if kind=='chapter':e['rawHtml']=e['rawHtml'].replace('class="text Prov-24-1">Saying 20','class="text Prov-23-1">Saying 20')
            e['sha256']=hashlib.sha256(e['rawHtml'].encode()).hexdigest()
            with self.assertRaises(ValueError,msg=kind):extract_saying_headings(e,'proverbs:24:en',v)
