import copy,sys,unittest
from pathlib import Path
from array import array
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))

class ContextPaddingTests(unittest.TestCase):
    def fixture(self):
        from test_clock_edges import ClockEdgeTests
        from boundary_quality import verse_boundary
        a,pcm,speech,d=ClockEdgeTests().fixture();c=a['checks'][1];c['alignedWords'][0]['score']=.95
        edges,ev=verse_boundary(c['alignedWords'],c['searchRange'],a['duration'],'en',reference=c['text'],signal=c['boundarySignal'],anchors=c['asrEdgeAnchors']);self.assertIsNotNone(edges);c.update(boundaryEvidence=ev,boundaryVerified=True);a['cues'].insert(1,{'verse':2,'text':c['text'],'start':edges[0],'end':edges[1]});a.update(accepted=True,issues=[])
        pcm[30400:40000]=array('h',[1000])*9600;speech[1][0]=36800;pcm[36800:40000]=array('h',[5000])*3200
        return a,pcm,speech,d

    def test_preserves_real_head_voice_instead_of_rejecting_the_gap_for_background(self):
        from context_padding import repair_context_padding,context_padding_measurements_match
        from boundary_quality import verified_boundary_artifact
        a,pcm,speech,d=self.fixture();before=copy.deepcopy(a);r=repair_context_padding(a,pcm,speech,d,[2]);self.assertTrue(r['accepted']);self.assertIn('contextPaddingReview',r);self.assertTrue(verified_boundary_artifact(r));self.assertTrue(context_padding_measurements_match(r,pcm));self.assertLess(r['cues'][1]['start'],2.3);self.assertEqual(r['recognition'],a['recognition']);self.assertEqual(r['checks'],a['checks']);self.assertEqual(a,before)

    def test_cannot_extend_into_intervening_voice_or_without_independent_head(self):
        from context_padding import repair_context_padding
        for change in ['extra-voice','missing-word','weak-independent','wrong-model','joint','early-word']:
            a,pcm,speech,d=self.fixture()
            if change=='extra-voice':speech.insert(1,[33000,35000])
            if change=='missing-word':d['windows'][0]['segments'][1]['words'][0]['word']='She'
            if change=='weak-independent':d['windows'][0]['segments'][1]['words'][0]['probability']=.1
            if change=='wrong-model':d['modelSha256']='c'*64
            if change=='joint':a['checks'][1]['jointProofId']='other'
            if change=='early-word':d['windows'][0]['segments'][1]['words'][0].update(start=2.18,end=2.24)
            self.assertEqual(repair_context_padding(a,pcm,speech,d,[2]),a,change)

    def test_changed_cut_identity_and_original_pcm_are_rejected(self):
        from context_padding import repair_context_padding,context_padding_measurements_match
        from boundary_quality import verified_boundary_artifact
        a,pcm,speech,d=self.fixture();r=repair_context_padding(a,pcm,speech,d,[2])
        for change in ['cut','baseline','proof','identity']:
            x=copy.deepcopy(r)
            if change=='cut':x['cues'][1]['start']+=.1
            if change=='baseline':x['contextPaddingReview']['originalCues'][1]['start']+=.1
            if change=='proof':x['contextPaddingReview']['proofs']=[]
            if change=='identity':x['qualityRecipe']=a['qualityRecipe']
            self.assertFalse(verified_boundary_artifact(x),change)
        lo,hi=r['contextPaddingReview']['proofs'][0]['window'];pcm[lo:hi]=array('h',[30000])*(hi-lo);self.assertFalse(context_padding_measurements_match(r,pcm))

    def test_publication_requires_files_for_the_extended_original_source_range(self):
        from context_padding import repair_context_padding
        from alignment_contract import METHOD,BOUNDARY_RECOGNIZER
        from publish_site import recording_entry
        a,pcm,speech,d=self.fixture();r=repair_context_padding(a,pcm,speech,d,[2]);r.update(method=METHOD,recognizer=BOUNDARY_RECOGNIZER,vttFile='b'*64+'.vtt',vttSha256='b'*64)
        r['verseFiles']=[{'verse':c['verse'],'sourceStart':c['start'],'sourceEnd':c['end'],'duration':c['end']-c['start'],'sha256':'c'*64,'path':'/api/audio/resources/'+'c'*64+'.mp3'} for c in r['cues']]
        receipt={'key':r['key'],'locale':'en','sha256':r['sourceAudioSha256'],'duration':r['duration'],'path':'/source.mp3','url':'https://source.test/audio.mp3'}
        self.assertEqual(recording_entry(receipt,r,r['textSha256'])['alignmentStatus'],'aligned');r['verseFiles'][1]['sourceStart']+=.1;self.assertEqual(recording_entry(receipt,r,r['textSha256'])['alignmentStatus'],'pending')

class CompleteHeadPaddingTests(unittest.TestCase):
    def fixture(self):
        a,pcm,speech,d=ContextPaddingTests().fixture()
        d['windows'][0]['segments'][1]['words'][0].update(start=2.05,end=2.7)
        speech.insert(1,[33600,34880])
        pcm[33600:34880]=array('h',[7000])*1280
        return a,pcm,speech,d

    def repair(self,*args):
        import context_padding
        # The legacy fallback makes absence of the new behavior a failed
        # source-preservation assertion, rather than an import error.
        repair=getattr(context_padding,'repair_complete_head_padding',context_padding.repair_context_padding)
        return repair(*args)

    def test_keeps_every_possible_first_word_event_without_changing_legacy_proofs(self):
        from context_padding import repair_context_padding,context_padding_measurements_match
        from boundary_quality import verified_boundary_artifact
        from alignment_contract import CONTEXT_PADDING_RECIPE
        self.assertEqual(CONTEXT_PADDING_RECIPE,'acoustic-source-context-padding-v31-f5f5b8eb2034')
        a,pcm,speech,d=self.fixture();before=copy.deepcopy(a)
        self.assertEqual(repair_context_padding(a,pcm,speech,d,[2]),a)
        r=self.repair(a,pcm,speech,d,[2])
        self.assertIn('contextPaddingReview',r)
        self.assertNotEqual(r['qualityRecipe'],CONTEXT_PADDING_RECIPE)
        self.assertTrue(verified_boundary_artifact(r))
        self.assertTrue(context_padding_measurements_match(r,pcm))
        self.assertLess(r['cues'][1]['start'],2.1)
        self.assertGreaterEqual(r['cues'][1]['start'],r['cues'][0]['end'])
        self.assertEqual(r['cues'][1]['end'],a['cues'][1]['end'])
        self.assertEqual(r['recognition'],a['recognition'])
        self.assertEqual(r['checks'],a['checks'])
        self.assertEqual(a,before)

    def test_rejects_missing_independent_words_and_source_voice_outside_the_supported_head(self):
        for change in ['weak-word','different-word','too-long','overlaps-neighbor','unassigned-voice','missing-context','early-end']:
            a,pcm,speech,d=self.fixture();head=d['windows'][0]['segments'][1]['words'][0]
            if change=='weak-word':head['probability']=.8999
            if change=='different-word':head['word']='She'
            if change=='too-long':head['start']=1.89
            if change=='overlaps-neighbor':head.update(start=1.85,end=2.55)
            if change=='unassigned-voice':speech.insert(1,[31840,32320])
            if change=='early-end':head['end']=2.24
            if change=='missing-context':
                for w in d['windows'][0]['segments'][1]['words'][1:]:w['probability']=.1
            self.assertEqual(self.repair(a,pcm,speech,d,[2]),a,change)

    def test_complete_head_can_use_a_later_precise_independent_phrase(self):
        from context_padding import CONTEXT_PADDING_POLICY,COMPLETE_HEAD_PADDING_POLICY
        from clock_edges import _interior
        names=['alpha','bravo','charlie','delta','echo','foxtrot','golf','hotel','india','juliet','kilo','lima']
        words=[{'word':name,'start':i*.5,'end':i*.5+.3,'score':.95} for i,name in enumerate(names)]
        raw=[{**word,'probability':.99 if i>=9 else .1} for i,word in enumerate(words)]
        with self.assertRaises(ValueError):_interior(raw,words,.9,CONTEXT_PADDING_POLICY['contextPolicy'])
        try:proof=_interior(raw,words,.9,COMPLETE_HEAD_PADDING_POLICY['contextPolicy'])
        except ValueError:proof=None
        self.assertIsNotNone(proof,'The complete-head proof must retain precisely timed later context')
        self.assertEqual(proof['offset'],9)

    def test_coarse_prefix_touching_previous_voice_cannot_discard_a_possible_first_sound(self):
        a,pcm,speech,d=self.fixture()
        d['windows'][0]['segments'][1]['words'][0].update(start=1.95,end=2.6)
        speech[0][1]=32000
        pcm[31200:32000]=array('h',[7000])*800
        r=self.repair(a,pcm,speech,d,[2])
        self.assertEqual(r,a)

    def test_cannot_relabel_new_head_evidence_as_legacy_or_drop_the_earlier_source_voice(self):
        from boundary_quality import verified_boundary_artifact
        from alignment_contract import CONTEXT_PADDING_RECIPE
        a,pcm,speech,d=self.fixture();r=self.repair(a,pcm,speech,d,[2]);self.assertIn('contextPaddingReview',r)
        for change in ['legacy-label','cut','speech','policy']:
            x=copy.deepcopy(r)
            if change=='legacy-label':x['qualityRecipe']=CONTEXT_PADDING_RECIPE
            if change=='cut':x['cues'][1]['start']=2.25
            if change=='speech':x['contextPaddingReview']['speechSegments'].pop(1)
            if change=='policy':x['contextPaddingReview']['policy']['maximumExtension']=2
            self.assertFalse(verified_boundary_artifact(x),change)

    def test_publication_requires_clips_matching_the_complete_source_head(self):
        from alignment_contract import METHOD,BOUNDARY_RECOGNIZER
        from publish_site import recording_entry
        a,pcm,speech,d=self.fixture();r=self.repair(a,pcm,speech,d,[2]);self.assertIn('contextPaddingReview',r)
        r.update(method=METHOD,recognizer=BOUNDARY_RECOGNIZER,vttFile='b'*64+'.vtt',vttSha256='b'*64)
        r['verseFiles']=[{'verse':c['verse'],'sourceStart':c['start'],'sourceEnd':c['end'],'duration':c['end']-c['start'],'sha256':'c'*64,'path':'/api/audio/resources/'+'c'*64+'.mp3'} for c in r['cues']]
        receipt={'key':r['key'],'locale':'en','sha256':r['sourceAudioSha256'],'duration':r['duration'],'path':'/source.mp3','url':'https://source.test/audio.mp3'}
        self.assertEqual(recording_entry(receipt,r,r['textSha256'])['alignmentStatus'],'aligned')
        r['verseFiles'][1]['sourceStart']=2.44
        self.assertEqual(recording_entry(receipt,r,r['textSha256'])['alignmentStatus'],'pending')

if __name__=='__main__':unittest.main()
