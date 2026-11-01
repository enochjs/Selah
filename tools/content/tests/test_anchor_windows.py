import copy
import importlib.util
from pathlib import Path
import sys
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))

class AnchorWindowTests(unittest.TestCase):
    def module(self):
        self.assertIsNotNone(importlib.util.find_spec('anchor_windows'))
        import anchor_windows
        return anchor_windows

    def fixture(self):
        left={'verse':7,'text':'To Shur.','alignedWords':[{'word':'To','start':1,'end':1.3,'score':.9},
              {'word':'Shur.','start':1.4,'end':2.25,'score':.9}],
              'boundaryVerified':True,'boundarySignal':{'verseRms':.1},'asrEdgeAnchors':[]}
        right={'verse':8,'text':'And he said.','alignedWords':[{'word':'And','start':2.93,'end':3.01,'score':.9},
               {'word':'he','start':3.05,'end':3.13,'score':.9},{'word':'said.','start':3.2,'end':3.5,'score':.9}],
               'boundaryVerified':True,'boundarySignal':{'verseRms':.1},
               'asrEdgeAnchors':[{'word':' And','start':2.12,'end':2.98,'probability':.9},
                                {'word':' said.','start':3.2,'end':3.5,'probability':.9}]}
        pcm=[6000]*80000;pcm[round(2.6*16000):round(2.68*16000)]=[0]*1280
        return left,right,pcm

    def test_quiet_pause_can_refine_a_coarse_head_without_touching_spoken_words(self):
        m=self.module();left,right,pcm=self.fixture();before=copy.deepcopy(right)
        proof=m.measure_head_refinement(left,right,pcm,'a'*64)
        self.assertIsNotNone(proof)
        right['rawAsrEdgeAnchors']=copy.deepcopy(right['asrEdgeAnchors'])
        right['asrEdgeAnchors'][0]=proof['effectiveAnchor'];right['pauseHeadProof']=proof
        self.assertTrue(m.verified_head_refinement(left,right,'a'*64))
        self.assertEqual(right['alignedWords'],before['alignedWords'])
        self.assertGreater(right['asrEdgeAnchors'][0]['start'],left['alignedWords'][-1]['end'])
        self.assertLess(right['asrEdgeAnchors'][0]['start'],right['alignedWords'][0]['start'])
        for change in ['audio','range','noise','words','anchor']:
            x=copy.deepcopy(right)
            if change=='audio':x['pauseHeadProof']['sourceAudioSha256']='b'*64
            if change=='range':x['pauseHeadProof']['startSample']=0
            if change=='noise':x['pauseHeadProof']['rms'][0]=.1
            if change=='words':x['alignedWords'][0]['score']=.1
            if change=='anchor':x['asrEdgeAnchors'][0]['start']-=.1
            self.assertFalse(m.verified_head_refinement(left,x,'a'*64),change)

    def test_speech_overlap_no_quiet_pause_and_wrong_anchor_are_not_relaxed(self):
        m=self.module()
        for change in ['overlap','noise','weak-tail','anchor-end','wrong-word']:
            left,right,pcm=self.fixture()
            if change=='overlap':left['alignedWords'][-1]['end']=3
            if change=='noise':pcm=[6000]*len(pcm)
            if change=='weak-tail':left['alignedWords'][-1]['score']=.1
            if change=='anchor-end':right['asrEdgeAnchors'][0]['end']=3.4
            if change=='wrong-word':right['asrEdgeAnchors'][0]['word']='then'
            self.assertIsNone(m.measure_head_refinement(left,right,pcm,'a'*64),change)

    def artifact(self):
        m=self.module();left,right,pcm=self.fixture()
        from boundary_quality import verse_boundary,POLICY
        from alignment_contract import ANCHOR_WINDOW_RECIPE
        from joint_boundaries import joint_proof_id
        from partial_audio import source_text_sha
        proof=m.measure_head_refinement(left,right,pcm,'a'*64)
        recognition=[{'words':copy.deepcopy(right['asrEdgeAnchors'])}]
        right['rawAsrEdgeAnchors']=copy.deepcopy(right['asrEdgeAnchors'])
        right['asrEdgeAnchors'][0]=proof['effectiveAnchor'];right['pauseHeadProof']=proof
        cues=[]
        for c in [left,right]:
            c['searchRange']=[.5,4.5]
            reference=m._rms(pcm,8000,64000)
            c['boundarySignal']={'headRms':.1,'tailRms':.1,'verseRms':reference}
            edges,evidence=verse_boundary(c['alignedWords'],c['searchRange'],5,'en',reference=c['text'],
                                          signal=c['boundarySignal'],anchors=c['asrEdgeAnchors'])
            self.assertIsNotNone(edges)
            c['boundaryEvidence']=evidence
            cues.append({'verse':c['verse'],'text':c['text'],'start':edges[0],'end':edges[1]})
        joint={'verses':[7,8],'range':[.5,4.5],'words':left['alignedWords']+right['alignedWords'],
               'signal':left['boundarySignal'],'anchors':{'7':left['asrEdgeAnchors'],'8':right['asrEdgeAnchors']}}
        joint['id']=joint_proof_id('a'*64,joint)
        for c in [left,right]:c['jointProofId']=joint['id']
        source=[{'number':c['verse'],'text':c['text']} for c in [left,right]]
        a={'key':'genesis:16:en','qualityRecipe':ANCHOR_WINDOW_RECIPE,'sourceAudioSha256':'a'*64,'textSha256':source_text_sha(source),
           'duration':5,'accepted':True,'issues':[],'verificationScope':'verse-boundaries','boundaryPolicy':POLICY,
           'boundarySourceVerses':source,'expectedVerseNumbers':[7,8],'recognition':recognition,'unclaimedSpeech':[],
           'checks':[left,right],'cues':cues,'jointAlignments':[joint],'anchorWindowPolicy':m.ANCHOR_WINDOW_POLICY}
        return a,pcm

    def test_complete_source_and_joint_proof_are_still_required(self):
        from boundary_quality import verified_boundary_artifact
        a,_=self.artifact();self.assertTrue(verified_boundary_artifact(a))
        for change in ['source','raw-anchor','joint','policy','no-proof']:
            x=copy.deepcopy(a)
            if change=='source':x['boundarySourceVerses'][0]['text']='Different sentence.'
            if change=='raw-anchor':x['checks'][1]['rawAsrEdgeAnchors'][0]['word']='then'
            if change=='joint':x['jointAlignments']=[]
            if change=='policy':x['anchorWindowPolicy']={}
            if change=='no-proof':x['checks'][1].pop('pauseHeadProof')
            self.assertFalse(verified_boundary_artifact(x),change)

    def test_publication_remeasures_the_original_audio_without_running_models(self):
        from unittest.mock import patch
        m=self.module();a,pcm=self.artifact()
        with patch('media_assets.file_matches',return_value=True),patch('gap_review.decode_pcm',return_value=pcm):
            self.assertTrue(m.verify_anchor_media(a,'/original.mp3'))
        with patch('media_assets.file_matches',return_value=True),patch('gap_review.decode_pcm',return_value=[6000]*len(pcm)):
            self.assertFalse(m.verify_anchor_media(a,'/original.mp3'))

    def test_saved_reference_volume_cannot_relax_the_real_relative_quiet_limit(self):
        from unittest.mock import patch
        m=self.module();a,pcm=self.artifact()
        actual=[100]*len(pcm);proof=a['checks'][1]['pauseHeadProof'];start=proof['startSample']
        actual[start:start+1280]=[200]*1280
        proof['rms']=[200/32768]*4
        self.assertTrue(m.verified_anchor_artifact(a))
        with patch('media_assets.file_matches',return_value=True),patch('gap_review.decode_pcm',return_value=actual):
            self.assertFalse(m.verify_anchor_media(a,'/original.mp3'))

if __name__=='__main__':unittest.main()
