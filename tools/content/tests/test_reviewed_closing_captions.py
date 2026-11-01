"""Actual musical closing narration is distinct from the final scripture verse."""
import copy,hashlib,json,sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))

class ClosingCaptionTests(unittest.TestCase):
    def fixture(self):
        from quiet_gaps import digest,GAP_POLICY
        from boundary_quality import verse_boundary
        caption='For the director of music. On my stringed instruments.'
        b=dict(key='habakkuk:3:en',duration=20.,sourceAudioSha256='a'*64,checks=[dict(verse=19,alignedWords=[dict(word='heights.',start=6.5,end=7.9)])],cues=[dict(verse=19,start=6.,end=8.)],unclaimedSpeech=[dict(kind='trailing',text=caption.lower(),start=7.9,end=13.9,allowedHeadingOrClosing=False)])
        raw=json.dumps(b);words=[dict(word=w,start=10.1+i*.4,end=10.35+i*.4,score=.9) for i,w in enumerate(caption.split())];signal=dict(headRms=.001,tailRms=.001,verseRms=.1);_,e=verse_boundary(words,[9.5,14.5],20.,'en',reference=caption,signal=signal)
        t=dict(key=b['key'],sourceAudioSha256=b['sourceAudioSha256'],sourceReportSha256=hashlib.sha256(raw.encode()).hexdigest(),check=dict(verse=0,text=caption,spokenText=caption,alignedWords=words,searchRange=[9.5,14.5],boundarySignal=signal,asrEdgeAnchors=[],boundaryVerified=True,boundaryEvidence=e))
        a=dict(key=b['key'],sourceAudioSha256=b['sourceAudioSha256'],sourceReportSha256=hashlib.sha256(raw.encode()).hexdigest(),sampleCount=320000,vadModelSha256=GAP_POLICY['vadModelSha256'],speechSegments=[[96000,128000],[160000,190400],[192000,224000]])
        m=[dict(file=n,utf8=json.dumps(d)) for n,d in [('base.json',b),('target.json',t),('audit.json',a)]]
        r=dict(schemaVersion=33,baseEvidenceSha256=digest(b),baseReportFile='base.json',captionModelFile='target.json',sourceAuditFile='audit.json',closingCaption=dict(index=0,gapSha256=digest(b['unclaimedSpeech'][0]),sourceRange=[9.9,14.2],afterVerse=19),finalCues=[dict(verse=19,start=6.,end=8.2)],evidence=[dict(file=x['file'],sha256=hashlib.sha256(x['utf8'].encode()).hexdigest()) for x in m]);return b,r,m

    def test_full_scripture_and_all_actual_closing_voice_have_separate_source_roles(self):
        try:from reviewed_closing_captions import closing_caption_role
        except ImportError:self.fail('A real musical caption cannot be treated as missing verse speech')
        b,r,m=self.fixture();before=copy.deepcopy(b);self.assertEqual(closing_caption_role(b,r,m),0);self.assertEqual(b,before)

    def test_wrong_caption_unproven_model_extra_voice_and_cut_scripture_cannot_pass(self):
        try:from reviewed_closing_captions import closing_caption_role
        except ImportError:self.fail('A real musical caption cannot be treated as missing verse speech')
        for kind in ['body','range','source','model','extra','scope']:
            b,r,m=self.fixture()
            if kind=='body':r['finalCues'][-1]['end']=7.8
            if kind=='range':r['closingCaption']['sourceRange'][1]=13.4
            if kind=='scope':b['key']='habakkuk:2:en'
            if kind in {'source','model','extra'}:
                i=2 if kind=='extra' else 1;d=json.loads(m[i]['utf8'])
                if kind=='extra':d['speechSegments'].append([240000,256000])
                if kind=='source':d['sourceReportSha256']='b'*64
                if kind=='model':d['check']['alignedWords'][0]['score']=.01
                m[i]['utf8']=json.dumps(d);r['evidence'][i]['sha256']=hashlib.sha256(m[i]['utf8'].encode()).hexdigest()
            with self.assertRaises(ValueError,msg=kind):closing_caption_role(b,r,m)
