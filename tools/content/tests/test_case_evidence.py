import copy
import json
import importlib.util
from pathlib import Path
import sys
import unittest
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))

class CaseEvidenceTests(unittest.TestCase):
    def test_model_clocks_use_the_same_rounding_before_and_after_json_storage(self):
        from case_boundary_review import PerChapterReviewer
        from numeric_review import NumericBoundaryAligner
        # NumPy scalars use a different half-millisecond tie rule. Keep this
        # reproduction independent of the optional inference dependencies.
        class ModelFloat(float):
            def __add__(self, other):return ModelFloat(float(self)+other)
            def __truediv__(self, other):return ModelFloat(float(self)/other)
            def __round__(self, digits=0):return 210.116 if digits==3 else round(float(self),digits)
        reviewer=object.__new__(PerChapterReviewer);reviewer.locale='en'
        words=[{'word':'end','start':198.42,'end':ModelFloat(210.073),'score':.9},
               {'word':'next','start':ModelFloat(210.16),'end':215.655,'score':.9}]
        with patch.object(NumericBoundaryAligner,'align_words',return_value=words):
            result=reviewer.align_words(None,'end next',[198,216])
        before=round((result[0]['end']+result[1]['start'])/2,3)
        saved=json.loads(json.dumps(result))
        after=round((saved[0]['end']+saved[1]['start'])/2,3)
        self.assertEqual(before,after)
        self.assertEqual(after,210.117)

    def module(self):
        self.assertIsNotNone(importlib.util.find_spec('case_evidence'))
        import case_evidence
        return case_evidence

    def fixture(self):
        shared={'word':' He','start':4.68,'end':4.9,'probability':.96}
        left={'verse':21,'text':'He named it Sitnah.','alignedWords':[{'word':'He','start':2,'end':2.2,'score':.9},
               {'word':'named','start':2.3,'end':2.5,'score':.9},{'word':'it','start':2.6,'end':2.7,'score':.9},
               {'word':'Sitnah.','start':3.5,'end':4.01,'score':.9}],
               'asrEdgeAnchors':[{'word':' He','start':2,'end':2.2,'probability':.9},copy.deepcopy(shared)]}
        right={'verse':22,'text':'He moved on.','alignedWords':[{'word':'He','start':4.7,'end':4.88,'score':.9},
                {'word':'moved','start':4.9,'end':5.2,'score':.9},{'word':'on.','start':5.3,'end':5.5,'score':.9}],
                'asrEdgeAnchors':[copy.deepcopy(shared),{'word':' on.','start':5.3,'end':5.5,'probability':.9}]}
        return left,right

    def test_shared_anchor_can_only_protect_its_matching_source_verse(self):
        m=self.module();left,right=self.fixture();before=copy.deepcopy(left)
        proof=m.exclusive_head_owner(left,right)
        self.assertIsNotNone(proof)
        left['rawAsrEdgeAnchors']=copy.deepcopy(left['asrEdgeAnchors'])
        left['asrEdgeAnchors'][-1]=proof['effectiveAnchor'];left['anchorOwnerProof']=proof
        self.assertTrue(m.verified_owner(left,right))
        self.assertEqual(left['alignedWords'],before['alignedWords'])
        self.assertEqual(left['asrEdgeAnchors'][-1]['probability'],0)
        for change in ['owner','raw','boost','overlap']:
            x,y=copy.deepcopy(left),copy.deepcopy(right)
            if change=='owner':y['text']='They moved on.'
            if change=='raw':x['rawAsrEdgeAnchors'][-1]['end']-=.1
            if change=='boost':x['asrEdgeAnchors'][-1]['probability']=1
            if change=='overlap':x['alignedWords'][-1]['end']=4.8
            self.assertFalse(m.verified_owner(x,y),change)

    def test_ambiguous_or_weak_or_unshared_clocks_are_not_disabled(self):
        m=self.module()
        for change in ['unshared','same-word','weak','late']:
            left,right=self.fixture()
            if change=='unshared':right['asrEdgeAnchors'][0]['start']-=.1
            if change=='same-word':left['text']='He named it he.'
            if change=='weak':right['alignedWords'][0]['score']=.1
            if change=='late':right['alignedWords'][0]['end']=5.3
            self.assertIsNone(m.exclusive_head_owner(left,right),change)

    def artifact(self):
        m=self.module();left,right=self.fixture()
        from alignment_contract import CASE_REVIEW_RECIPE,PADDING_REVIEW_RECIPE
        from boundary_quality import POLICY,verse_boundary
        from joint_boundaries import joint_proof_id
        from partial_audio import source_text_sha
        recognition=[{'words':copy.deepcopy(left['asrEdgeAnchors']+right['asrEdgeAnchors'])}]
        proof=m.exclusive_head_owner(left,right)
        left['caseOriginalAnchors']=copy.deepcopy(left['asrEdgeAnchors'])
        left['asrEdgeAnchors'][-1]=proof['effectiveAnchor'];left['anchorOwnerProof']=proof
        cues=[]
        for check in [left,right]:
            check.update(searchRange=[1,6],boundarySignal={'headRms':.1,'tailRms':.1,'verseRms':.1})
            edges,evidence=verse_boundary(check['alignedWords'],[1,6],7,'en',reference=check['text'],
                                          signal=check['boundarySignal'],anchors=check['asrEdgeAnchors'])
            self.assertIsNotNone(edges)
            check.update(boundaryVerified=True,boundaryEvidence=evidence)
            cues.append({'verse':check['verse'],'text':check['text'],'start':edges[0],'end':edges[1]})
        joint={'verses':[21,22],'range':[1,6],'words':left['alignedWords']+right['alignedWords'],
               'signal':left['boundarySignal'],'anchors':{'21':left['asrEdgeAnchors'],'22':right['asrEdgeAnchors']}}
        joint['id']=joint_proof_id('a'*64,joint)
        for check in [left,right]:check['jointProofId']=joint['id']
        source=[{'number':c['verse'],'text':c['text']} for c in [left,right]]
        return {'key':'genesis:26:en','qualityRecipe':CASE_REVIEW_RECIPE,'caseReviewPolicy':m.CASE_POLICY,
          'caseBaseRecipe':PADDING_REVIEW_RECIPE,'sourceAudioSha256':'a'*64,'textSha256':source_text_sha(source),
          'duration':7,'accepted':True,'issues':[],'verificationScope':'verse-boundaries','boundaryPolicy':POLICY,
          'boundarySourceVerses':source,'expectedVerseNumbers':[21,22],'recognition':recognition,'unclaimedSpeech':[],
          'checks':[left,right],'cues':cues,'jointAlignments':[joint]}

    def test_complete_original_source_and_exclusive_clock_proof_are_required(self):
        from boundary_quality import verified_boundary_artifact
        a=self.artifact();self.assertTrue(verified_boundary_artifact(a))
        for change in ['source','raw','owner','boost','joint','policy']:
            x=copy.deepcopy(a)
            if change=='source':x['boundarySourceVerses'][0]['text']='Something different.'
            if change=='raw':x['checks'][0]['caseOriginalAnchors'][-1]['start']=0
            if change=='owner':x['checks'][0]['anchorOwnerProof']['ownerVerse']=23
            if change=='boost':x['checks'][0]['asrEdgeAnchors'][-1]['probability']=1
            if change=='joint':x['jointAlignments']=[]
            if change=='policy':x['caseReviewPolicy']={}
            self.assertFalse(verified_boundary_artifact(x),change)
        x=copy.deepcopy(a)
        x['checks'][0]['rawAsrEdgeAnchors']=copy.deepcopy(x['checks'][0]['caseOriginalAnchors'])
        x['checks'][0]['caseOriginalAnchors'][-1]=copy.deepcopy(x['checks'][1]['asrEdgeAnchors'][-1])
        self.assertFalse(verified_boundary_artifact(x))

    def test_existing_confirmed_missing_and_numeric_proofs_remain_separately_required(self):
        from alignment_contract import CASE_REVIEW_RECIPE,PARTIAL_REVIEW_RECIPE,PADDING_REVIEW_RECIPE
        from boundary_quality import verified_boundary_artifact
        from test_partial_audio import PartialAudioTests
        from test_numeric_alignment import NumericAlignmentTests
        from numeric_alignment import NUMERIC_POLICY
        m=self.module();a,_=PartialAudioTests().fixture()
        a.update(qualityRecipe=CASE_REVIEW_RECIPE,caseReviewPolicy=m.CASE_POLICY,caseBaseRecipe=PARTIAL_REVIEW_RECIPE)
        self.assertTrue(verified_boundary_artifact(a))
        a['confirmedCoverage']['proofs']=[];self.assertFalse(verified_boundary_artifact(a))
        a=NumericAlignmentTests().fixture();base=a.pop('numericBaseRecipe');a.pop('numericAlignmentPolicy')
        a.update(qualityRecipe=CASE_REVIEW_RECIPE,caseReviewPolicy=m.CASE_POLICY,caseBaseRecipe=PADDING_REVIEW_RECIPE,caseNumericPolicy=NUMERIC_POLICY)
        self.assertTrue(verified_boundary_artifact(a))
        altered=copy.deepcopy(a)
        altered['checks'][0]['spokenText']='He had sons.'
        altered['checks'][0]['alignedWords'][2].pop('numericExpansion')
        self.assertFalse(verified_boundary_artifact(altered))
        a['checks'][0]['alignedWords'][2].pop('numericExpansion')
        self.assertFalse(verified_boundary_artifact(a))

    def test_context_window_cannot_consume_an_existing_chapter_heading(self):
        import case_boundary_review as c
        self.assertTrue(hasattr(c,'bounded_case_window'))
        group=[{'number':1,'text':'Now there was a famine.'},{'number':2,'text':'The Lord appeared.'}]
        checks={1:{'searchRange':[1.16,10.92]},2:{'searchRange':[10.92,19.5]}}
        gaps=[{'kind':'leading','start':0,'end':1.16,'allowedHeadingOrClosing':True}]
        bounds=c.bounded_case_window(group,checks,[],30,gaps)
        self.assertEqual(bounds[0],1.16)

if __name__=='__main__':unittest.main()
