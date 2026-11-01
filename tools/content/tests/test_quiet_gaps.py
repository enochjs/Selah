import copy
import importlib.util
from pathlib import Path
import sys
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))

class QuietGapTests(unittest.TestCase):
    def module(self):
        self.assertIsNotNone(importlib.util.find_spec('quiet_gaps'))
        import quiet_gaps
        return quiet_gaps

    def fixture(self):
        cues=[{'verse':1,'start':.1,'end':.5},{'verse':2,'start':.8,'end':1.2}]
        artifact={'sourceAudioSha256':'a'*64,'duration':1.5,'cues':cues,
                  'unclaimedSpeech':[{'kind':'between-verses','text':'hallucination','start':.45,'end':.85}]}
        pcm=[0]*24000
        pcm[1600:8000]=[8000]*6400;pcm[12800:19200]=[8000]*6400
        return artifact,pcm

    def test_subtracts_every_cue_and_expands_fractional_gap_samples_outward(self):
        m=self.module();a,pcm=self.fixture()
        self.assertEqual(m.uncovered_samples(a['unclaimedSpeech'][0],a['cues'],len(pcm)),[[8000,12800]])
        self.assertEqual(m.uncovered_samples({'start':.60001,'end':.60009},[],len(pcm)),[[9600,9602]])

    def test_quiet_proof_preserves_original_gap_and_cue_data(self):
        m=self.module();a,pcm=self.fixture();before=copy.deepcopy(a)
        review=m.measure_gaps(a,pcm,[])
        a['acousticGapReview']=review
        self.assertTrue(m.verified_quiet_gaps(a))
        self.assertTrue(m.measurements_match(a,pcm))
        self.assertEqual(a['cues'],before['cues']);self.assertEqual(a['unclaimedSpeech'],before['unclaimedSpeech'])

    def test_a_short_loud_burst_or_speech_cannot_hide_in_a_quiet_average(self):
        m=self.module();a,pcm=self.fixture()
        pcm[12799]=20000
        a['acousticGapReview']=m.measure_gaps(a,pcm,[])
        self.assertFalse(m.verified_quiet_gaps(a))
        a,pcm=self.fixture();a['acousticGapReview']=m.measure_gaps(a,pcm,[[9000,9200]])
        self.assertFalse(m.verified_quiet_gaps(a))

    def test_zero_duration_gap_requires_real_context_instead_of_empty_frames(self):
        m=self.module();a,pcm=self.fixture();a['unclaimedSpeech'][0].update(start=.6,end=.6)
        a['acousticGapReview']=m.measure_gaps(a,pcm,[])
        self.assertTrue(m.verified_quiet_gaps(a))
        pcm[9600]=20000
        a['acousticGapReview']=m.measure_gaps(a,pcm,[])
        self.assertFalse(m.verified_quiet_gaps(a))

    def test_changed_cues_gaps_missing_frames_or_forged_measurements_are_rejected(self):
        m=self.module();a,pcm=self.fixture();a['acousticGapReview']=m.measure_gaps(a,pcm,[])
        for change in ['cue','gap','frames','range','source','reference']:
            x=copy.deepcopy(a)
            if change=='cue':x['cues'][0]['end']+=.02
            if change=='gap':x['unclaimedSpeech'][0]['end']+=.02
            if change=='frames':x['acousticGapReview']['proofs'][0]['parts'][0]['frames']=[]
            if change=='range':x['acousticGapReview']['proofs'][0]['parts'][0]['samples'][0]+=1
            if change=='source':x['sourceAudioSha256']='b'*64
            if change=='reference':x['acousticGapReview']['proofs'][0]['references'][0]['rms']=1
            self.assertFalse(m.verified_quiet_gaps(x))
        changed=list(pcm);changed[9000]=20000
        self.assertFalse(m.measurements_match(a,changed))

    def test_one_pcm_unit_decoder_variation_is_allowed_only_when_recomputed_frames_are_quiet(self):
        m=self.module();a,pcm=self.fixture();a['acousticGapReview']=m.measure_gaps(a,pcm,[])
        varied=list(pcm);varied[2000]+=1
        self.assertTrue(m.measurements_match(a,varied))
        varied[9000:9200]=[8000]*200
        self.assertFalse(m.measurements_match(a,varied))

    def test_publication_recomputes_measurements_from_hash_verified_original_media(self):
        import hashlib,shutil,tempfile,wave
        from array import array
        if not shutil.which('ffmpeg'):self.skipTest('ffmpeg unavailable')
        m=self.module();a,pcm=self.fixture()
        # A forged quiet proof must fail even when its self-contained hash is recomputed.
        a['acousticGapReview']=m.measure_gaps(a,pcm,[])
        pcm[9000:9200]=[8000]*200
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'original.wav'
            with wave.open(str(path),'wb') as out:
                out.setparams((1,2,16000,0,'NONE','not compressed'))
                out.writeframes(array('h',pcm).tobytes())
            a['sourceAudioSha256']=hashlib.sha256(path.read_bytes()).hexdigest()
            review=a['acousticGapReview'];review['sourceAudioSha256']=a['sourceAudioSha256']
            review['id']=m.digest({k:v for k,v in review.items() if k!='id'})
            self.assertTrue(m.verified_quiet_gaps(a))
            from gap_review import verify_gap_media
            self.assertFalse(verify_gap_media(a,path))

if __name__=='__main__':unittest.main()
