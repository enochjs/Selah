"""A human-verified ending cannot discard source speech behind a false ASR clock."""
import copy,hashlib,json,sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))

class EndingSourceTests(unittest.TestCase):
    def fixture(self):
        from quiet_gaps import digest,GAP_POLICY
        b=dict(accepted=False,key='mark:3:en',duration=10.,sourceAudioSha256='a'*64,expectedVerseNumbers=[3],cues=[dict(verse=3,start=6.,end=8.05)],checks=[dict(verse=3,boundaryVerified=True,alignedWords=[dict(word='mother.',start=7.9,end=8.05,score=.9)])],unclaimedSpeech=[dict(kind='trailing',text='Thank you for watching.',start=8.,end=9.5,allowedHeadingOrClosing=False)])
        raw=json.dumps(b);audit=dict(key=b['key'],sourceAudioSha256=b['sourceAudioSha256'],sourceReportSha256=hashlib.sha256(raw.encode()).hexdigest(),sampleCount=160000,vadModelSha256=GAP_POLICY['vadModelSha256'],speechSegments=[[16000,32000],[104000,129600]])
        tail=dict(range=[131200,160000],referenceRange=[96000,131200],referenceRms=.1,frameRms=[.01]*90)
        m=[dict(file='base.json',utf8=raw),dict(file='vad.json',utf8=json.dumps(audit)),dict(file='tail.json',utf8=json.dumps(tail))]
        r=dict(schemaVersion=26,baseEvidenceSha256=digest(b),baseReportFile='base.json',sourceAuditFile='vad.json',tailEvidenceFile='tail.json',approvedBy='user-scripture-ending-background',humanDecision='经文已完整，后面只有音乐，按此修复',sourceAcousticApproval=False,ending=dict(gapIndex=0,gapSha256=digest(b['unclaimedSpeech'][0]),verse=3,cut=8.2),finalCues=[dict(verse=3,start=6.,end=8.2)],evidence=[dict(file=x['file'],sha256=hashlib.sha256(x['utf8'].encode()).hexdigest()) for x in m]);return b,r,m

    def test_original_false_clock_and_all_real_final_voice_remain_preserved(self):
        from reviewed_ending_sources import ending_source_role
        b,r,m=self.fixture();before=copy.deepcopy(b);self.assertEqual(ending_source_role(b,r,m),0);self.assertEqual(b,before)

    def test_ending_cannot_hide_new_voice_truncate_the_last_word_or_change_the_source(self):
        from reviewed_ending_sources import ending_source_role
        for kind in ['voice','cut','decision','source','loud']:
            b,r,m=self.fixture()
            if kind=='cut':r['ending']['cut']=7.99
            if kind=='decision':r['humanDecision']=''
            if kind=='source':m[1]['utf8']+=' '
            if kind in {'voice','loud'}:
                i=1 if kind=='voice' else 2;d=json.loads(m[i]['utf8'])
                if kind=='voice':d['speechSegments'].append([140000,150000])
                else:d['frameRms'][0]=.2
                m[i]['utf8']=json.dumps(d);r['evidence'][i]['sha256']=hashlib.sha256(m[i]['utf8'].encode()).hexdigest()
            with self.assertRaises(ValueError,msg=kind):ending_source_role(b,r,m)
