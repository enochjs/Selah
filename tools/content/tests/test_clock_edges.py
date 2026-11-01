import copy,sys,unittest
from pathlib import Path
from array import array
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))

class ClockEdgeTests(unittest.TestCase):
    def fixture(self):
        from test_speech_span import SpeechSpanTests
        from alignment_contract import FULL_MODEL,FULL_REVISION,FULL_MODEL_SHA256
        a,pcm,speech=SpeechSpanTests().fixture()
        for w in a['checks'][1]['alignedWords'][1:]:w['score']=.99
        from alignment_contract import site_fingerprint,BOUNDARY_RECOGNIZER
        a['fingerprint']=site_fingerprint(a['sourceAudioSha256'],a['textSha256'],'en',a['qualityRecipe'],BOUNDARY_RECOGNIZER)
        # Both independent recognizers identify the entire short first phrase.
        for seg in a['recognition']:
            for w in seg['words']:w['probability']=.99
        diagnostic={'sourceAudioSha256':a['sourceAudioSha256'],'model':FULL_MODEL,'revision':FULL_REVISION,'modelSha256':FULL_MODEL_SHA256,
          'windows':[{'range':[0,8],'segments':copy.deepcopy(a['recognition'])}]}
        # Loud background between verses must not be mistaken for voiced words.
        pcm[30400:40000]=array('h',[2500])*9600
        pcm[88000:104000]=array('h',[2500])*16000
        return a,pcm,speech,diagnostic

    def test_two_independent_clocks_and_source_voice_gaps_protect_the_weak_head(self):
        from clock_edges import repair_clock_edges,clock_edge_measurements_match
        from boundary_quality import verified_boundary_artifact
        a,pcm,speech,d=self.fixture();original=copy.deepcopy(a)
        r=repair_clock_edges(a,pcm,speech,d)
        self.assertTrue(r['accepted']);self.assertTrue(verified_boundary_artifact(r));self.assertTrue(clock_edge_measurements_match(r,pcm))
        self.assertLess(r['cues'][1]['start'],a['checks'][1]['alignedWords'][0]['start'])
        self.assertGreater(r['cues'][1]['end'],speech[1][1]/16000)
        self.assertEqual(r['cues'][0]['end'],r['cues'][1]['start'])
        self.assertEqual(r['checks'][1]['alignedWords'],a['checks'][1]['alignedWords']);self.assertEqual(r['recognition'],a['recognition']);self.assertEqual(a,original)

    def test_missing_word_weak_clocks_extra_speech_and_bad_models_remain_rejected(self):
        from clock_edges import repair_clock_edges
        for change in ['head','tail','phrase','model','audio','vad','neighbor','other-failure']:
            a,pcm,speech,d=self.fixture()
            if change=='head':d['windows'][0]['segments'][1]['words'][0]['word']='They'
            if change=='tail':d['windows'][0]['segments'][1]['words'][-1]['probability']=.1
            if change=='phrase':a['recognition'][1]['words'][1]['probability']=.1
            if change=='model':d['modelSha256']='f'*64
            if change=='audio':d['sourceAudioSha256']='f'*64
            if change=='vad':speech.insert(1,[32000,35000])
            if change=='neighbor':a['checks'][0]['alignedWords'][-1]['score']=.1
            if change=='other-failure':a['checks'][1]['alignedWords'][1]['end']=7
            self.assertEqual(repair_clock_edges(a,pcm,speech,d),a,change)

    def test_modified_clips_pcm_evidence_and_legacy_label_fail_closed(self):
        from clock_edges import repair_clock_edges,clock_edge_measurements_match
        from boundary_quality import verified_boundary_artifact
        a,pcm,speech,d=self.fixture();r=repair_clock_edges(a,pcm,speech,d)
        for change in ['clip','proof','clock','source','label']:
            x=copy.deepcopy(r)
            if change=='clip':x['cues'][1]['start']+=.1
            if change=='proof':x['clockEdgeReview']['proofs']=[]
            if change=='clock':x['clockEdgeReview']['independentRecognition']['windows'][0]['segments'][1]['words'][0]['end']+=1
            if change=='source':x['sourceAudioSha256']='c'*64
            if change=='label':x['qualityRecipe']=a['qualityRecipe']
            self.assertFalse(verified_boundary_artifact(x),change)
        proof=r['clockEdgeReview']['proofs'][0];lo,hi=proof['windows'][0];pcm[lo:hi]=array('h',[30000])*(hi-lo)
        self.assertFalse(clock_edge_measurements_match(r,pcm))

    def test_publication_requires_matching_new_clip_files(self):
        from clock_edges import repair_clock_edges
        from alignment_contract import METHOD,BOUNDARY_RECOGNIZER
        from publish_site import recording_entry
        a,pcm,speech,d=self.fixture();r=repair_clock_edges(a,pcm,speech,d)
        r.update(method=METHOD,recognizer=BOUNDARY_RECOGNIZER,vttSha256='b'*64,vttFile='b'*64+'.vtt')
        r['verseFiles']=[{'verse':c['verse'],'sourceStart':c['start'],'sourceEnd':c['end'],'duration':c['end']-c['start'],
           'sha256':'c'*64,'path':'/api/audio/resources/'+'c'*64+'.mp3'} for c in r['cues']]
        receipt={'key':r['key'],'locale':'en','sha256':r['sourceAudioSha256'],'duration':8,'path':'/source.mp3','url':'https://source.test/audio.mp3'}
        self.assertEqual(recording_entry(receipt,r,r['textSha256'])['alignmentStatus'],'aligned')
        r['verseFiles'][1]['sourceEnd']-=.1
        self.assertEqual(recording_entry(receipt,r,r['textSha256'])['alignmentStatus'],'pending')

    def test_original_cue_cannot_be_forged_to_bypass_an_untouched_head(self):
        from clock_edges import repair_clock_edges
        a,pcm,speech,d=self.fixture();a['cues'][0]['start']=1.6
        self.assertEqual(repair_clock_edges(a,pcm,speech,d),a)

    def test_shared_cut_does_not_override_a_previously_verified_joint_group(self):
        from clock_edges import repair_clock_edges
        a,pcm,speech,d=self.fixture();a['checks'][0]['jointProofId']='other-group'
        self.assertEqual(repair_clock_edges(a,pcm,speech,d),a)

    def test_independent_head_and_both_interior_phrases_can_replace_an_unreliable_original_head_clock(self):
        from clock_edges import repair_clock_edges,repair_phrase_clock_edges,clock_edge_measurements_match
        from boundary_quality import verified_boundary_artifact
        a,pcm,speech,d=self.fixture();original=copy.deepcopy(a)
        a['recognition'][1]['words'][0].update(probability=.003,start=1.9)
        before=copy.deepcopy(a)
        self.assertEqual(repair_clock_edges(a,pcm,speech,d),a)
        r=repair_phrase_clock_edges(a,pcm,speech,d)
        self.assertTrue(r['accepted']);self.assertTrue(verified_boundary_artifact(r));self.assertTrue(clock_edge_measurements_match(r,pcm))
        self.assertEqual(r['recognition'],a['recognition']);self.assertEqual(a,before)
        d['windows'][0]['segments'][1]['words'][0]['word']='She'
        self.assertEqual(repair_phrase_clock_edges(a,pcm,speech,d),a)

    def test_interior_phrase_cannot_hide_a_missing_head_or_neighbor_speech(self):
        from clock_edges import repair_phrase_clock_edges
        for change in ['weak-independent-head','no-context','joined-source','head-too-long']:
            a,pcm,speech,d=self.fixture();a['recognition'][1]['words'][0]['probability']=.003
            if change=='weak-independent-head':d['windows'][0]['segments'][1]['words'][0]['probability']=.2
            if change=='no-context':
                for w in a['recognition'][1]['words'][1:]:w['probability']=.1
            if change=='joined-source':speech[0][1]=speech[1][1];speech.pop(1)
            if change=='head-too-long':d['windows'][0]['segments'][1]['words'][0]['start']=1.5
            self.assertEqual(repair_phrase_clock_edges(a,pcm,speech,d),a,change)

if __name__=='__main__':unittest.main()
