"""Background ASR clocks may move into a clip only with complete source/VAD proof."""
import copy,hashlib,json,sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))

class BackgroundSourceTests(unittest.TestCase):
    def fixture(self):
        from quiet_gaps import digest,GAP_POLICY
        b=dict(key='acts:13:en',duration=10,sourceAudioSha256='a'*64,unclaimedSpeech=[dict(kind='between-verses',text='them.',start=4.,end=4.5,allowedHeadingOrClosing=False)])
        raw=json.dumps(b);audit=dict(key=b['key'],sourceAudioSha256=b['sourceAudioSha256'],sourceReportSha256=hashlib.sha256(raw.encode()).hexdigest(),sampleCount=160000,vadModelSha256=GAP_POLICY['vadModelSha256'],speechSegments=[[16000,48000],[80000,112000]])
        proof=dict(index=0,ownerVerse=12,gapSha256=digest(b['unclaimedSpeech'][0]),range=[64000,72000],referenceRanges=[[16000,48000],[80000,112000]],referenceRms=[.12,.11],frameRms=[.02]*50)
        names=[('base.json',raw),('vad.json',json.dumps(audit)),('background.json',json.dumps([proof]))];materials=[dict(file=n,utf8=v) for n,v in names]
        r=dict(schemaVersion=21,baseEvidenceSha256=digest(b),baseReportFile='base.json',sourceAuditFile='vad.json',backgroundEvidenceFile='background.json',gapAssignments=[dict(index=0,ownerVerse=12,gapSha256=proof['gapSha256'])],evidence=[dict(file=n,sha256=hashlib.sha256(v.encode()).hexdigest()) for n,v in names])
        return b,r,materials

    def test_bounded_background_is_owned_without_rewriting_the_asr_text(self):
        from reviewed_background_sources import background_gap_owners
        b,r,m=self.fixture();before=copy.deepcopy(b);self.assertEqual(background_gap_owners(b,r,m),{0:12});self.assertEqual(b,before)

    def test_speech_or_changed_pcm_proof_cannot_be_called_background(self):
        from reviewed_background_sources import background_gap_owners
        for change in ['speech','loud','range','hash','owner']:
            b,r,m=self.fixture()
            if change=='hash':m[1]['utf8']+=' '
            else:
                index=1 if change=='speech' else 2;d=json.loads(m[index]['utf8'])
                if change=='speech':d['speechSegments']=[[64000,70000]]
                if change=='loud':d[0]['frameRms'][0]=.1
                if change=='range':d[0]['range'][0]+=1
                if change=='owner':d[0]['ownerVerse']=11
                m[index]['utf8']=json.dumps(d);r['evidence'][index]['sha256']=hashlib.sha256(m[index]['utf8'].encode()).hexdigest()
            with self.assertRaises(ValueError,msg=change):background_gap_owners(b,r,m)

if __name__=='__main__':unittest.main()

class BackgroundPublicationTests(unittest.TestCase):
    def test_verified_background_recipe_is_publishable_as_boundary_audio(self):
        from alignment_contract import REVIEWED_BACKGROUND_SOURCE_RECIPE,BOUNDARY_RECIPES,SUPPORTED_RECIPES
        self.assertIn(REVIEWED_BACKGROUND_SOURCE_RECIPE,BOUNDARY_RECIPES)
        self.assertIn(REVIEWED_BACKGROUND_SOURCE_RECIPE,SUPPORTED_RECIPES)
