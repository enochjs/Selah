"""Numbered heading and a zero-duration ASR clock keep distinct source roles."""
import copy,hashlib,json,sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))

class NumberedSourceTests(unittest.TestCase):
    def fixture(self):
        from quiet_gaps import GAP_POLICY,digest
        b=dict(key='john:21:en',duration=10.,sourceAudioSha256='a'*64,unclaimedSpeech=[dict(kind='leading',text='21.',start=2.,end=2.52,allowedHeadingOrClosing=True),dict(kind='between-verses',text='22.',start=5.,end=5.,allowedHeadingOrClosing=False)])
        raw=json.dumps(b);audit=dict(key=b['key'],sourceAudioSha256=b['sourceAudioSha256'],sourceReportSha256=hashlib.sha256(raw.encode()).hexdigest(),sampleCount=160000,vadModelSha256=GAP_POLICY['vadModelSha256'],speechSegments=[[8000,24000],[40000,70000],[88000,140000]])
        r=dict(schemaVersion=22,baseEvidenceSha256=digest(b),baseReportFile='base.json',sourceAuditFile='vad.json',sourceHeading=dict(index=0,gapSha256=digest(b['unclaimedSpeech'][0]),sourceRange=[.4,1.6]),zeroClock=dict(index=1,gapSha256=digest(b['unclaimedSpeech'][1])),naturalSeam=dict(leftVerse=2,rightVerse=3,cut=5.,uncertainty=[4.98,5.02]),finalCues=[dict(verse=1,start=2.3,end=4.),dict(verse=2,start=4.,end=5.),dict(verse=3,start=5.,end=9.)])
        m=[dict(file='base.json',utf8=raw),dict(file='vad.json',utf8=json.dumps(audit))];r['evidence']=[dict(file=x['file'],sha256=hashlib.sha256(x['utf8'].encode()).hexdigest()) for x in m]
        return b,r,m

    def test_original_heading_clock_and_zero_point_are_preserved_and_source_bound(self):
        from reviewed_numbered_sources import numbered_source_roles
        b,r,m=self.fixture();before=copy.deepcopy(b);self.assertEqual(numbered_source_roles(b,r,m),{0,1});self.assertEqual(b,before)

    def test_real_scripture_or_nonzero_source_range_cannot_be_dismissed_as_an_ordinal(self):
        from reviewed_numbered_sources import numbered_source_roles
        for kind in ['title-text','zero-range','voice-overlaps','wrong-source']:
            b,r,m=self.fixture()
            if kind=='title-text':b['unclaimedSpeech'][0]['text']='Afterward';r['sourceHeading']['gapSha256']='x'
            if kind=='zero-range':b['unclaimedSpeech'][1]['end']=5.1
            if kind=='voice-overlaps':r['sourceHeading']['sourceRange']=[.4,2.6]
            if kind=='wrong-source':m[1]['utf8']+=' '
            with self.assertRaises(ValueError,msg=kind):numbered_source_roles(b,r,m)
