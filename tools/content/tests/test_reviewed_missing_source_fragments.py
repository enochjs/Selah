"""A confirmed unspoken clause stays visible without fabricated clocks."""
import copy,hashlib,json,sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))

class MissingSourceFragmentTests(unittest.TestCase):
    def fixture(self):
        from quiet_gaps import digest
        prefix='耶和华的默示应验在哈得拉地，大马色';suffix='（世人和以色列各支派的眼目都仰望耶和华）。'
        b=dict(key='zechariah:9:zh',accepted=False,sourceAudioSha256='a'*64,boundarySourceVerses=[dict(number=1,text=prefix+suffix),dict(number=2,text='和靠近的哈马。')],checks=[dict(verse=1,asrEdgeAnchors=[])],issues=['unreliable-verse-boundary:1']);raw=json.dumps(b,ensure_ascii=False)
        t=dict(key=b['key'],sourceAudioSha256=b['sourceAudioSha256'],sourceReportSha256=hashlib.sha256(raw.encode()).hexdigest(),canonicalText=prefix+suffix,narratedReference=prefix,missingFragment=suffix,check=dict(verse=1,text=prefix,spokenText=prefix,asrEdgeAnchors=[]))
        m=[dict(file='base.json',utf8=raw),dict(file='target.json',utf8=json.dumps(t,ensure_ascii=False))]
        r=dict(schemaVersion=30,baseEvidenceSha256=digest(b),baseReportFile='base.json',targetModelFile='target.json',approvedBy='user-confirmed-unspoken-fragment',humanDecision='分界可接受，标注括号文字未朗读',sourceAcousticApproval=False,fragment=dict(verse=1,narratedText=prefix,missingText=suffix),evidence=[dict(file=x['file'],sha256=hashlib.sha256(x['utf8'].encode()).hexdigest()) for x in m]);return b,r,m

    def test_exact_confirmed_clause_retains_canonical_and_separate_narrated_reference(self):
        try:from reviewed_missing_source_fragments import confirmed_fragment_inputs
        except ImportError:self.fail('A source-confirmed unspoken clause needs a separate proof identity')
        b,r,m=self.fixture();before=copy.deepcopy(b);refs,missing,t=confirmed_fragment_inputs(b,r,m)
        self.assertEqual(b,before);self.assertEqual(refs[0]['text'],r['fragment']['narratedText']);self.assertEqual(missing,[dict(verse=1,text=r['fragment']['missingText'],reason='not-narrated-in-source')]);self.assertEqual(t['text'],refs[0]['text'])

    def test_other_text_source_or_unconfirmed_omission_cannot_be_hidden(self):
        try:from reviewed_missing_source_fragments import confirmed_fragment_inputs
        except ImportError:self.fail('A source-confirmed unspoken clause needs a separate proof identity')
        for kind in ['scope','clause','decision','target','source','base']:
            b,r,m=self.fixture()
            if kind=='scope':b['key']='zechariah:8:zh'
            if kind=='clause':r['fragment']['missingText']='（另一段文字）。'
            if kind=='decision':r['humanDecision']=''
            if kind=='base':b['boundarySourceVerses'][1]['text']='被改动'
            if kind in {'target','source'}:
                t=json.loads(m[1]['utf8'])
                if kind=='target':t['check']['text']='别的经文'
                else:t['sourceReportSha256']='b'*64
                m[1]['utf8']=json.dumps(t,ensure_ascii=False);r['evidence'][1]['sha256']=hashlib.sha256(m[1]['utf8'].encode()).hexdigest()
            with self.assertRaises(ValueError,msg=kind):confirmed_fragment_inputs(b,r,m)
