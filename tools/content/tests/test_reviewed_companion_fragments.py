"""A displaced Hosea clause requires actual source models in both chapters."""
import copy,hashlib,json,sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))

class CompanionFragmentTests(unittest.TestCase):
    def fixture(self):
        from quiet_gaps import digest,GAP_POLICY
        from boundary_quality import verse_boundary
        prefix='“Also for you, Judah, a harvest is appointed.';suffix=' “Whenever I would restore the fortunes of my people,'
        b=dict(key='hosea:6:en',accepted=False,duration=10.,sourceAudioSha256='a'*64,issues=['unreliable-verse-boundary:11'],checks=[dict(verse=11,asrEdgeAnchors=[])],boundarySourceVerses=[dict(number=v,text='other' if v<11 else prefix+suffix) for v in range(1,12)]);raw=json.dumps(b)
        t=dict(key=b['key'],sourceAudioSha256=b['sourceAudioSha256'],sourceReportSha256=hashlib.sha256(raw.encode()).hexdigest(),canonicalText=prefix+suffix,narratedReference=prefix,missingFragment=suffix,check=dict(verse=11,text=prefix,spokenText=prefix,boundaryVerified=True,asrEdgeAnchors=[]))
        audit=dict(key=b['key'],sourceAudioSha256=b['sourceAudioSha256'],sourceReportSha256=hashlib.sha256(raw.encode()).hexdigest(),sampleCount=160000,vadModelSha256=GAP_POLICY['vadModelSha256'],speechSegments=[[16000,80000]])
        text='Whenever I would restore the fortunes of my people,';words=[dict(word=w,start=1.1+i*.4,end=1.35+i*.4,score=.9) for i,w in enumerate(text.split())];recognized=[dict(word=w['word'],start=w['start'],end=w['end'],probability=.2 if i==0 else .95) for i,w in enumerate(words)];other=dict(key='hosea:7:en',accepted=True,duration=10.,sourceAudioSha256='b'*64,recognition=[dict(words=recognized)],cues=[dict(start=5.)]);other_raw=json.dumps(other)
        signal=dict(headRms=.001,tailRms=.001,verseRms=.1);_,e=verse_boundary(words,[.8,4.8],10.,'en',reference=text,signal=signal);model=dict(key=other['key'],sourceAudioSha256=other['sourceAudioSha256'],sourceReportSha256=hashlib.sha256(other_raw.encode()).hexdigest(),check=dict(verse=0,text=text,spokenText=text,alignedWords=words,searchRange=[.8,4.8],boundarySignal=signal,asrEdgeAnchors=[],boundaryVerified=True,boundaryEvidence=e))
        m=[dict(file=n,utf8=json.dumps(d)) for n,d in [('base.json',b),('target.json',t),('audit.json',audit),('companion.json',other),('companion-model.json',model)]]
        r=dict(schemaVersion=34,approvedBy='user-confirmed-companion-source-clause',humanDecision='候选完整，后面只有音乐，按此修复',sourceAcousticApproval=False,baseEvidenceSha256=digest(b),baseReportFile='base.json',targetModelFile='target.json',sourceAuditFile='audit.json',companionReportFile='companion.json',companionModelFile='companion-model.json',fragment=dict(verse=11,narratedText=prefix,missingText=suffix),evidence=[dict(file=x['file'],sha256=hashlib.sha256(x['utf8'].encode()).hexdigest()) for x in m]);return b,r,m

    def test_low_asr_spelling_confidence_does_not_veto_complete_independent_companion_ctc(self):
        try:from reviewed_companion_fragments import companion_fragment_inputs
        except ImportError:self.fail('Both chapter source models must establish the displaced clause')
        b,r,m=self.fixture();before=copy.deepcopy(b);refs,missing,c,a=companion_fragment_inputs(b,r,m);self.assertEqual(b,before);self.assertEqual(refs[-1]['text'],r['fragment']['narratedText']);self.assertEqual(missing,[dict(verse=11,text=r['fragment']['missingText'],reason='not-narrated-in-source')])

    def test_false_companion_words_changed_source_and_weak_ctc_do_not_prove_a_displaced_clause(self):
        try:from reviewed_companion_fragments import companion_fragment_inputs
        except ImportError:self.fail('Both chapter source models must establish the displaced clause')
        for kind in ['weak','source','late','recognition','fragment']:
            b,r,m=self.fixture()
            if kind=='fragment':r['fragment']['missingText']=' Other words'
            else:
                i=3 if kind=='recognition' else 4;d=json.loads(m[i]['utf8'])
                if kind=='weak':d['check']['alignedWords'][0]['score']=.1
                if kind=='source':d['sourceReportSha256']='c'*64
                if kind=='late':d['check']['alignedWords'][-1]['end']=5.1
                if kind=='recognition':d['recognition'][0]['words'][0]['word']='Other'
                m[i]['utf8']=json.dumps(d);r['evidence'][i]['sha256']=hashlib.sha256(m[i]['utf8'].encode()).hexdigest()
            with self.assertRaises(ValueError,msg=kind):companion_fragment_inputs(b,r,m)

    def test_nonquiet_source_tail_requires_explicit_user_decision(self):
        from reviewed_companion_fragments import companion_fragment_inputs
        b,r,m=self.fixture();r['humanDecision']=''
        with self.assertRaises(ValueError):companion_fragment_inputs(b,r,m)
