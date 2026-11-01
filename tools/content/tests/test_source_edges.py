import copy,json
from array import array
from pathlib import Path
import sys,unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))

class SourceEdgeTests(unittest.TestCase):
    def fixture(self):
        from test_boundary_context_review import BoundaryContextTests
        from boundary_context_review import review_joint_artifact
        from alignment_contract import CASE_REVIEW_RECIPE,PADDING_REVIEW_RECIPE,site_fingerprint,BOUNDARY_RECOGNIZER
        from case_evidence import CASE_POLICY
        verses,receipt,original,engine=BoundaryContextTests().fixture()
        a=review_joint_artifact(engine,original,receipt,verses,[])
        a.update(qualityRecipe=CASE_REVIEW_RECIPE,caseReviewPolicy=CASE_POLICY,caseBaseRecipe=PADDING_REVIEW_RECIPE)
        a['fingerprint']=site_fingerprint(a['sourceAudioSha256'],a['textSha256'],'en',CASE_REVIEW_RECIPE,BOUNDARY_RECOGNIZER)
        pcm=array('h',[0])*round(a['duration']*16000);speech=[]
        for index in range(4):
            start=round((1+2*index-.10)*16000);end=round((1+2*index+1.12)*16000);speech.append([start,end]);pcm[start:end]=array('h',[5000])*(end-start)
        return a,pcm,speech

    def test_actual_voice_edges_extend_short_padding_without_changing_words(self):
        from source_edges import repair_source_edges,source_edge_measurements_match
        from boundary_quality import verified_boundary_artifact
        a,pcm,speech=self.fixture();before=copy.deepcopy(a);r=repair_source_edges(a,pcm,speech)
        self.assertTrue(verified_boundary_artifact(r));self.assertTrue(source_edge_measurements_match(r,pcm))
        self.assertGreater(r['cues'][0]['end'],speech[0][1]/16000)
        self.assertLess(r['cues'][1]['start'],speech[1][0]/16000)
        self.assertLessEqual(r['cues'][0]['end'],r['cues'][1]['start'])
        self.assertEqual(r['recognition'],a['recognition']);self.assertEqual(r['checks'],a['checks']);self.assertEqual(a,before)
        self.assertTrue(verified_boundary_artifact(json.loads(json.dumps(r))))

    def test_continuous_vad_can_use_an_independent_word_clock_and_actual_low_energy_gap(self):
        from source_edges import repair_source_edges
        from alignment_contract import site_fingerprint,CASE_REVIEW_RECIPE,BOUNDARY_RECOGNIZER
        from boundary_quality import verse_boundary
        a,pcm,speech=self.fixture();a.pop('jointAlignments',None);a['recognition']=[]
        for c in a['checks']:
            c.pop('jointProofId',None);c.pop('jointClipRange',None)
            c['searchRange']=[c['alignedWords'][0]['start']-.5,c['alignedWords'][-1]['end']+.5]
            clocks=[{k:w[k] for k in ['word','start','end']}|{'probability':.99} for w in [c['alignedWords'][0],c['alignedWords'][-1]]]
            c['asrEdgeAnchors']=clocks;a['recognition'].append({'words':clocks})
            edges,ev=verse_boundary(c['alignedWords'],c['searchRange'],a['duration'],'en',reference=c['text'],signal=c['boundarySignal'],anchors=clocks)
            c['boundaryEvidence']=ev
            cue=next(x for x in a['cues'] if x['verse']==c['verse']);cue.update(start=edges[0],end=edges[1])
        speech[0][1]=speech[1][1];speech.pop(1)
        r=repair_source_edges(a,pcm,speech)
        self.assertTrue(any(p['verse']==1 and p['side']=='tail' and p['kind']=='independent-word-local-pause' for p in r['sourceEdgeReview']['proofs']))
        self.assertGreater(r['cues'][0]['end'],2.12)
        self.assertLess(r['cues'][0]['end'],r['checks'][1]['alignedWords'][0]['start']-.15)

    def test_low_probability_coarse_head_needs_a_stable_later_phrase(self):
        from source_edges import _expected_local
        def word(text,start,end,score=.9):return {'word':text,'start':start,'end':end,'score':score}
        words=[word('one',3,3.1),word('a',3.2,3.3,.3),word('year',4,4.2),word('old',4.3,4.5),word('for',4.6,4.8)]
        tail={'word':'incense','start':1.3,'end':1.65,'probability':.99}
        head={'word':'one','start':1.65,'end':3.08,'probability':.01}
        phrase=[{'word':w['word'],'start':w['start'],'end':w['end'],'probability':.99} for w in words[2:]]
        a={'sourceAudioSha256':'a'*64,'duration':6,'recognition':[{'words':[tail,head,{'word':'a','start':3.2,'end':3.3,'probability':.9},*phrase]}],
           'checks':[{'verse':1,'alignedWords':[word('incense',1.3,1.7)],'asrEdgeAnchors':[tail,tail],'searchRange':[1,2],
                      'boundaryEvidence':{'meanAlignmentScore':.9}},
                     {'verse':2,'alignedWords':words,'asrEdgeAnchors':[head,phrase[-1]],'searchRange':[2.5,5],
                      'boundaryEvidence':{'meanAlignmentScore':.8}}],
           'cues':[{'verse':1,'start':1.1,'end':1.8},{'verse':2,'start':2.94,'end':4.9}]}
        proof=_expected_local(a,[],1,'tail');self.assertEqual(proof['nextContextClocks'],phrase)
        head_proof=_expected_local(a,[],2,'head')
        self.assertEqual(head_proof['neighborVerse'],1)
        self.assertEqual(head_proof['baseRange'],[2.94,4.9])
        stale=copy.deepcopy(a);stale['checks'][0]['alignedWords'][0]['score']=.7
        with self.assertRaises(ValueError):_expected_local(stale,[],1,'tail')
        distant=copy.deepcopy(a);distant['duration']=12
        for w in distant['checks'][1]['alignedWords'][2:]:w['start']+=4;w['end']+=4
        for w in distant['recognition'][0]['words'][-3:]:w['start']+=4;w['end']+=4
        with self.assertRaises(ValueError):_expected_local(distant,[],1,'tail')
        a['recognition'][0]['words'][-1]['start']+=.4
        with self.assertRaises(ValueError):_expected_local(a,[],1,'tail')

    def test_publication_rechecks_final_clip_ranges_and_preserved_case_proof(self):
        from source_edges import repair_source_edges
        from publish_site import recording_entry
        a,pcm,speech=self.fixture();r=repair_source_edges(a,pcm,speech)
        r.update(vttFile='b'*64+'.vtt',vttSha256='b'*64)
        r['verseFiles']=[{'verse':c['verse'],'sourceStart':c['start'],'sourceEnd':c['end'],'duration':c['end']-c['start'],
            'sha256':'c'*64,'path':'/api/audio/resources/'+'c'*64+'.mp3'} for c in r['cues']]
        receipt={'key':r['key'],'locale':'en','sha256':'a'*64,'duration':r['duration'],'path':'/source.mp3','url':'https://example.test/source.mp3'}
        self.assertEqual(recording_entry(receipt,r,r['textSha256'])['alignmentStatus'],'aligned')
        r['verseFiles'][0]['sourceEnd']-=.1
        self.assertEqual(recording_entry(receipt,r,r['textSha256'])['alignmentStatus'],'pending')

    def test_no_range_can_be_extended_into_a_neighbor_or_without_original_pcm_gap(self):
        from source_edges import repair_source_edges
        a,pcm,speech=self.fixture();pcm[:]=array('h',[15000])*len(pcm)
        self.assertEqual(repair_source_edges(a,pcm,speech),a)
        a,pcm,speech=self.fixture();speech[0][1]=speech[1][1];speech.pop(1)
        r=repair_source_edges(a,pcm,speech);self.assertEqual(r['cues'][0],a['cues'][0])

    def test_proof_edits_missing_base_and_changed_pcm_are_rejected(self):
        from source_edges import repair_source_edges,source_edge_measurements_match
        from boundary_quality import verified_boundary_artifact
        a,pcm,speech=self.fixture();r=repair_source_edges(a,pcm,speech)
        for edit in ['cue','proof','base','legacy','vad']:
            x=copy.deepcopy(r)
            if edit=='cue':x['cues'][0]['end']+=.1
            if edit=='proof':x['sourceEdgeReview']['proofs']=[]
            if edit=='base':x['sourceEdgeReview']['originalCues'][0]['end']+=.1
            if edit=='legacy':x['qualityRecipe']=a['qualityRecipe']
            if edit=='vad':x['sourceEdgeReview']['speechSegments'][0][1]+=160
            self.assertFalse(verified_boundary_artifact(x),edit)
        p=r['sourceEdgeReview']['proofs'][0];start=p['startSample'];pcm[start:start+1280]=array('h',[15000])*1280
        self.assertFalse(source_edge_measurements_match(r,pcm))

if __name__=='__main__':unittest.main()
