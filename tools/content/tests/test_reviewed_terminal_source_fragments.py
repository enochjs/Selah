"""A phrase read in the next chapter cannot produce ghost clocks in this one."""
import copy,hashlib,json,sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))

class TerminalSourceFragmentTests(unittest.TestCase):
    def fixture(self):
        from quiet_gaps import digest,GAP_POLICY
        prefix='on the twenty-fourth day of the sixth month.';suffix=' In the second year of King Darius,'
        b=dict(key='haggai:1:en',accepted=False,duration=10.,sourceAudioSha256='a'*64,issues=['unreliable-verse-boundary:15'],boundarySourceVerses=[dict(number=v,text='other' if v<15 else prefix+suffix) for v in range(1,16)])
        raw=json.dumps(b);t=dict(key=b['key'],sourceAudioSha256=b['sourceAudioSha256'],sourceReportSha256=hashlib.sha256(raw.encode()).hexdigest(),canonicalText=prefix+suffix,narratedReference=prefix,missingFragment=suffix,check=dict(verse=15,text=prefix,spokenText=prefix,boundaryVerified=True))
        audit=dict(key=b['key'],sourceAudioSha256=b['sourceAudioSha256'],sourceReportSha256=hashlib.sha256(raw.encode()).hexdigest(),sampleCount=160000,vadModelSha256=GAP_POLICY['vadModelSha256'],speechSegments=[[16000,80000]])
        words=[dict(word=w,start=1.+i*.2,end=1.2+i*.2,probability=.95) for i,w in enumerate(suffix.split())]
        companion=dict(key='haggai:2:en',accepted=True,sourceAudioSha256='b'*64,recognition=[dict(words=words)],cues=[dict(start=3.)])
        m=[dict(file=n,utf8=json.dumps(d)) for n,d in [('base.json',b),('target.json',t),('audit.json',audit),('companion.json',companion)]]
        r=dict(schemaVersion=31,baseEvidenceSha256=digest(b),baseReportFile='base.json',targetModelFile='target.json',sourceAuditFile='audit.json',companionReportFile='companion.json',fragment=dict(verse=15,narratedText=prefix,missingText=suffix),evidence=[dict(file=x['file'],sha256=hashlib.sha256(x['utf8'].encode()).hexdigest()) for x in m]);return b,r,m

    def test_exact_narrated_prefix_and_next_chapter_phrase_are_separate(self):
        try:from reviewed_terminal_source_fragments import terminal_fragment_inputs
        except ImportError:self.fail('Cross-chapter terminal narration needs explicit source proof')
        b,r,m=self.fixture();before=copy.deepcopy(b);refs,missing,c,a=terminal_fragment_inputs(b,r,m);self.assertEqual(b,before);self.assertEqual(refs[-1]['text'],r['fragment']['narratedText']);self.assertEqual(missing,[dict(verse=15,text=r['fragment']['missingText'],reason='not-narrated-in-source')]);self.assertEqual(c['text'],refs[-1]['text'])

    def test_unrelated_suffix_changed_audio_or_unproven_companion_is_rejected(self):
        try:from reviewed_terminal_source_fragments import terminal_fragment_inputs
        except ImportError:self.fail('Cross-chapter terminal narration needs explicit source proof')
        for kind in ['scope','fragment','target','audit','companion','probability']:
            b,r,m=self.fixture()
            if kind=='scope':b['key']='haggai:2:en'
            if kind=='fragment':r['fragment']['missingText']=' Other words'
            if kind in {'target','audit','companion','probability'}:
                i={'target':1,'audit':2,'companion':3,'probability':3}[kind];d=json.loads(m[i]['utf8'])
                if kind=='target':d['sourceReportSha256']='c'*64
                if kind=='audit':d['sourceAudioSha256']='c'*64
                if kind=='companion':d['recognition'][0]['words'][0]['word']='Other'
                if kind=='probability':d['recognition'][0]['words'][0]['probability']=.1
                m[i]['utf8']=json.dumps(d);r['evidence'][i]['sha256']=hashlib.sha256(m[i]['utf8'].encode()).hexdigest()
            with self.assertRaises(ValueError,msg=kind):terminal_fragment_inputs(b,r,m)
