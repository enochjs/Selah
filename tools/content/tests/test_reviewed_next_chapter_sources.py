"""A chapter introduction read in the following source must keep its true location."""
import hashlib,json,sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))

class NextChapterSourceTests(unittest.TestCase):
    def fixture(self):
        from test_reviewed_terminal_source_fragments import TerminalSourceFragmentTests
        from quiet_gaps import digest
        b,r,m=TerminalSourceFragmentTests().fixture();prefix='And Jeremiah remained in the courtyard of the guard until the day Jerusalem was captured.';suffix=' This is how Jerusalem was taken:'
        b.update(key='jeremiah:38:en',issues=['unreliable-verse-boundary:28'],boundarySourceVerses=[dict(number=v,text='other' if v<28 else prefix+suffix) for v in range(1,29)]);raw=json.dumps(b);sha=hashlib.sha256(raw.encode()).hexdigest();target=json.loads(m[1]['utf8']);target.update(key=b['key'],sourceReportSha256=sha,canonicalText=prefix+suffix,narratedReference=prefix,missingFragment=suffix);target['check'].update(verse=28,text=prefix,spokenText=prefix);audit=json.loads(m[2]['utf8']);audit.update(key=b['key'],sourceReportSha256=sha);other=json.loads(m[3]['utf8']);other['key']='jeremiah:39:en';other['recognition'][0]['words']=[dict(word=w,start=1.+i*.2,end=1.2+i*.2,probability=.95) for i,w in enumerate(suffix.split())]
        for item,doc in zip(m,[b,target,audit,other]):item['utf8']=json.dumps(doc)
        r.update(schemaVersion=35,baseEvidenceSha256=digest(b),fragment=dict(verse=28,narratedText=prefix,missingText=suffix),evidence=[dict(file=x['file'],sha256=hashlib.sha256(x['utf8'].encode()).hexdigest()) for x in m]);return b,r,m

    def test_exact_introduction_is_present_before_the_next_chapter_verse_one(self):
        try:from reviewed_next_chapter_sources import next_chapter_fragment_inputs
        except ImportError:self.fail('The displaced Jeremiah introduction needs a distinct source identity')
        b,r,m=self.fixture();refs,missing,c,a=next_chapter_fragment_inputs(b,r,m);self.assertEqual(refs[-1]['text'],r['fragment']['narratedText']);self.assertEqual(missing,[dict(verse=28,text=r['fragment']['missingText'],reason='not-narrated-in-source')])

    def test_wrong_companion_or_uncertain_recognition_cannot_prove_the_introduction(self):
        try:from reviewed_next_chapter_sources import next_chapter_fragment_inputs
        except ImportError:self.fail('The displaced Jeremiah introduction needs a distinct source identity')
        for kind in ['chapter','word','probability']:
            b,r,m=self.fixture();other=json.loads(m[3]['utf8'])
            if kind=='chapter':other['key']='jeremiah:40:en'
            if kind=='word':other['recognition'][0]['words'][0]['word']='Other'
            if kind=='probability':other['recognition'][0]['words'][0]['probability']=.84
            m[3]['utf8']=json.dumps(other);r['evidence'][3]['sha256']=hashlib.sha256(m[3]['utf8'].encode()).hexdigest()
            with self.assertRaises(ValueError,msg=kind):next_chapter_fragment_inputs(b,r,m)
