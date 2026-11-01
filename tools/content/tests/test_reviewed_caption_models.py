"""A complete pinned Psalm caption is distinct from a relocated scripture verse."""
import copy,hashlib,json,sys,unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))

class CaptionModelSourceTests(unittest.TestCase):
    def fixture(self):
        from test_reviewed_heading_sources import ReviewedHeadingTests
        from boundary_quality import verse_boundary
        from quiet_gaps import GAP_POLICY,digest
        b,r,m,pcm,sha=ReviewedHeadingTests().fixture();b['key']='psalms:77:en';b['duration']=8.;r['schemaVersion']=38;r['heading']['sourceRange']=[.19,.99];r['finalCues'][0]['start']=1.;b['boundarySourceVerses']=[dict(number=c['verse'],text=c['text']) for c in b['checks']];raw=json.dumps(b);words=[dict(word='Of',start=.25,end=.45,score=.9),dict(word='David.',start=.5,end=.8,score=.9)];signal=dict(headRms=.001,tailRms=.001,verseRms=.1);edges,e=verse_boundary(words,[.1,.95],8.,'en',reference='Of David.',signal=signal);target=dict(key=b['key'],sourceAudioSha256=b['sourceAudioSha256'],sourceReportSha256=hashlib.sha256(raw.encode()).hexdigest(),cue=dict(verse=0,text='Of David.',start=edges[0],end=edges[1]),check=dict(verse=0,text='Of David.',spokenText='Of David.',searchRange=[.1,.95],alignedWords=words,boundarySignal=signal,boundaryEvidence=e,boundaryVerified=True,asrEdgeAnchors=[]));audit=dict(key=b['key'],sourceAudioSha256=b['sourceAudioSha256'],sourceReportSha256=hashlib.sha256(raw.encode()).hexdigest(),sampleCount=128000,vadModelSha256=GAP_POLICY['vadModelSha256'],speechSegments=[[3200,14400],[16000,30400]]);m+=[dict(file='base.json',utf8=raw),dict(file='model.json',utf8=json.dumps(target)),dict(file='audit.json',utf8=json.dumps(audit))];r.update(baseReportFile='base.json',baseEvidenceSha256=digest(b),captionModelFile='model.json',sourceAuditFile='audit.json');r['heading']['htmlFile']='psalms-077-077.html'
        # Use the existing complete manifest parser with a synthetic pinned document.
        html=m[1]['utf8'].replace('Ps-30-','Ps-77-');doc=dict(file='psalms-077-077.html',firstChapter=77,lastChapter=77,url='https://www.biblegateway.com/passage/?search=Psalm%2077&version=NIV',sha256=hashlib.sha256(html.encode()).hexdigest());manifest=json.dumps(dict(version='NIV',book='psalms',documents=[doc]));sha=hashlib.sha256(manifest.encode()).hexdigest();b['sourceMetadata']['captionManifestSha256']=sha;m[0]['utf8']=manifest;m[1]=dict(file=doc['file'],utf8=html);raw=json.dumps(b);m[2]['utf8']=raw
        for i in [3,4]:
            d=json.loads(m[i]['utf8']);d['sourceReportSha256']=hashlib.sha256(raw.encode()).hexdigest();m[i]['utf8']=json.dumps(d)
        r['baseEvidenceSha256']=digest(b);r['evidence']=[dict(file=x['file'],sha256=hashlib.sha256(x['utf8'].encode()).hexdigest()) for x in m];return b,r,m,sha

    def test_pinned_metadata_and_complete_independent_caption_model_establish_source_role(self):
        try:from reviewed_caption_models import caption_model_role
        except ImportError:self.fail('The relocated first verse must not own its real original caption')
        b,r,m,sha=self.fixture();before=copy.deepcopy(b)
        with patch('alignment_contract.PSALM_CAPTION_REFERENCE_SHA256',sha):self.assertEqual(caption_model_role(b,r,m),0)
        self.assertEqual(b,before)

    def test_a_title_inside_scripture_or_unverified_caption_word_cannot_pass(self):
        try:from reviewed_caption_models import caption_model_role
        except ImportError:self.fail('The relocated first verse must not own its real original caption')
        for kind in ['range','model','source']:
            b,r,m,sha=self.fixture()
            if kind=='range':r['finalCues'][0]['start']=.8
            if kind in {'model','source'}:
                d=json.loads(m[3]['utf8'])
                if kind=='model':d['check']['alignedWords'][0]['score']=.01
                else:d['sourceAudioSha256']='f'*64
                m[3]['utf8']=json.dumps(d);r['evidence'][3]['sha256']=hashlib.sha256(m[3]['utf8'].encode()).hexdigest()
            with patch('alignment_contract.PSALM_CAPTION_REFERENCE_SHA256',sha),self.assertRaises(ValueError,msg=kind):caption_model_role(b,r,m)

class CaptionPaddingOrderTests(unittest.TestCase):
    def test_independent_model_padding_may_overlap_only_for_the_separate_caption_source_proof(self):
        try:from reviewed_source_windows import original_model_order_valid
        except ImportError:self.fail('New independent model padding must be distinct from final playback cuts')
        cues=[dict(start=1.,end=2.6),dict(start=2.4,end=5.)]
        self.assertTrue(original_model_order_valid(cues,6.,38))
        self.assertFalse(original_model_order_valid(cues,6.,10))
        self.assertFalse(original_model_order_valid(list(reversed(cues)),6.,38))
        self.assertFalse(original_model_order_valid([dict(start=1.,end=7.)],6.,38))
