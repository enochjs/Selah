"""Narrated numbered NIV headings stay out of actual scripture loops."""
import copy,hashlib,json,sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))

class SayingSourceTests(unittest.TestCase):
    def fixture(self):
        from test_saying_headings import SayingHeadingTests
        from boundary_quality import verse_boundary
        from quiet_gaps import digest,GAP_POLICY
        from numeric_alignment import cardinal
        ref,verses,mapping=SayingHeadingTests().fixture();b=dict(key='proverbs:24:en',duration=350.,sourceAudioSha256='a'*64,boundarySourceVerses=verses,unclaimedSpeech=[]);raw=json.dumps(b);sha=hashlib.sha256(raw.encode()).hexdigest();models=[];headings=[];segments=[];cues=[dict(verse=v,start=v*10.,end=v*10.+5.) for v in range(1,35)];materials=[dict(file='base.json',utf8=raw),dict(file='ref.json',utf8=json.dumps(ref))]
        for n,v in mapping.items():
            text='Saying '+cardinal(n,'plain');lo=v*10.-3.;words=[dict(word=w,start=lo+i*.3,end=lo+i*.3+.2,score=.9) for i,w in enumerate(text.split())];signal=dict(headRms=.001,tailRms=.001,verseRms=.1);edges,e=verse_boundary(words,[lo-.2,lo+1.4],350.,'en',reference=text,signal=signal);check=dict(verse=0,text=text,spokenText=text,alignedWords=words,searchRange=[lo-.2,lo+1.4],boundarySignal=signal,asrEdgeAnchors=[],boundaryVerified=True,boundaryEvidence=e);t=dict(key=b['key'],sourceAudioSha256=b['sourceAudioSha256'],sourceReportSha256=sha,number=n,beforeVerse=v,cue=dict(verse=0,text=text,start=edges[0],end=edges[1]),check=check);name=f'model-{n}.json';materials.append(dict(file=name,utf8=json.dumps(t)));headings.append(dict(number=n,beforeVerse=v,modelFile=name,sourceRange=[lo-.1,lo+1.1],gapIndices=[]));segments.append([round((lo-.05)*16000),round((lo+1.)*16000)])
        audit=dict(key=b['key'],sourceAudioSha256=b['sourceAudioSha256'],sourceReportSha256=sha,sampleCount=5600000,vadModelSha256=GAP_POLICY['vadModelSha256'],speechSegments=segments);materials.append(dict(file='audit.json',utf8=json.dumps(audit)));r=dict(schemaVersion=36,baseEvidenceSha256=digest(b),baseReportFile='base.json',headingReferenceFile='ref.json',sourceAuditFile='audit.json',headings=headings,finalCues=cues,evidence=[dict(file=m['file'],sha256=hashlib.sha256(m['utf8'].encode()).hexdigest()) for m in materials]);return b,r,materials

    def test_all_real_numbered_titles_are_independently_located_outside_verse_outputs(self):
        try:from reviewed_saying_sources import saying_source_roles
        except ImportError:self.fail('Real numbered headings need a source role separate from missing scripture')
        b,r,m=self.fixture();before=copy.deepcopy(b);self.assertEqual(saying_source_roles(b,r,m),set());self.assertEqual(b,before)

    def test_missing_title_changed_model_and_title_voice_in_a_verse_cannot_pass(self):
        try:from reviewed_saying_sources import saying_source_roles
        except ImportError:self.fail('Real numbered headings need a source role separate from missing scripture')
        for kind in ['missing','overlap','model','vad','source','clock']:
            b,r,m=self.fixture()
            if kind=='missing':r['headings'].pop()
            if kind=='overlap':r['finalCues'][0]['start']=7.4
            if kind=='clock':r['headings'][0]['gapIndices']=[0]
            if kind in {'model','source','vad'}:
                index=len(m)-1 if kind=='vad' else 2;d=json.loads(m[index]['utf8'])
                if kind=='model':d['check']['alignedWords'][0]['score']=.01
                if kind=='source':d['sourceReportSha256']='b'*64
                if kind=='vad':d['speechSegments'][0][1]=round(10.1*16000)
                m[index]['utf8']=json.dumps(d);r['evidence'][index]['sha256']=hashlib.sha256(m[index]['utf8'].encode()).hexdigest()
            with self.assertRaises((ValueError,IndexError),msg=kind):saying_source_roles(b,r,m)

class PositiveClockPartitionTests(unittest.TestCase):
    def fixture(self):
        from quiet_gaps import digest
        b=dict(unclaimedSpeech=[dict(text='for',start=6.3,end=7.1)])
        r=dict(clockPartitions=[dict(index=0,ownerVerses=[1,2],splitAt=6.7,gapSha256=digest(b['unclaimedSpeech'][0]))],finalCues=[dict(verse=1,start=1.,end=6.7),dict(verse=2,start=6.7,end=10.)],cuts=[dict(verse=1,side='tail'),dict(verse=2,side='head')]);c={2:dict(text='for though the righteous',alignedWords=[dict(word='for',start=7.,end=7.2,score=.9)])};return b,r,c

    def test_the_entire_raw_positive_clock_is_retained_at_the_quiet_shared_source_boundary(self):
        from reviewed_saying_sources import _partitioned_clocks
        b,r,c=self.fixture();self.assertEqual(_partitioned_clocks(b,r,c),{0})

    def test_dropped_samples_unrelated_text_weak_model_and_unmeasured_edges_are_rejected(self):
        from reviewed_saying_sources import _partitioned_clocks
        for kind in ['lost','word','score','measure','human']:
            b,r,c=self.fixture()
            if kind=='lost':r['finalCues'][1]['start']=6.8
            if kind=='word':c[2]['alignedWords'][0]['word']='other'
            if kind=='score':c[2]['alignedWords'][0]['score']=.2
            if kind=='measure':r['cuts'].pop()
            if kind=='human':r['cuts'][0]['measurementKind']='user-natural-seam'
            with self.assertRaises(ValueError,msg=kind):_partitioned_clocks(b,r,c)

class SayingPublicationIdentityTests(unittest.TestCase):
    def test_the_verified_saying_source_recipe_is_publishable_with_its_own_identity(self):
        from alignment_contract import REVIEWED_SAYING_SOURCE_RECIPE,BOUNDARY_RECIPES,SUPPORTED_RECIPES
        self.assertIn(REVIEWED_SAYING_SOURCE_RECIPE,BOUNDARY_RECIPES)
        self.assertIn(REVIEWED_SAYING_SOURCE_RECIPE,SUPPORTED_RECIPES)
