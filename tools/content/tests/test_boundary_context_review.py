import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


class BoundaryContextTests(unittest.TestCase):
    def module(self):
        self.assertIsNotNone(importlib.util.find_spec('boundary_context_review'))
        import boundary_context_review
        return boundary_context_review

    def fixture(self, fail=False, multiple=False):
        from alignment_contract import (METHOD, BOUNDARY_REVIEW_RECIPE, BOUNDARY_CONTEXT_RECIPE,
                                        BOUNDARY_RECOGNIZER, RECOGNIZERS, site_fingerprint)
        from boundary_quality import POLICY, verse_boundary
        from joint_boundaries import joint_proof_id
        verses = [{'number':n, 'text':text} for n,text in enumerate(
            (['God is good.','He is kind.','We are glad.','You are loved.']
             + (['God is good.','He is kind.'] if multiple else [])),1)]
        duration=2*len(verses)+2
        sha = hashlib.sha256(json.dumps(verses,ensure_ascii=False,sort_keys=True).encode()).hexdigest()
        receipt = {'key':'genesis:1:en','locale':'en','chapter':1,'sha256':'a'*64,
                   'url':'https://source.test/one.mp3','path':'/api/audio/resources/'+'a'*64+'.mp3','duration':duration}
        def check_for(verse,bounds,weak=False):
            number=verse['number'];start=2*number-1
            words=[{'word':word,'start':start+i*.3,'end':start+i*.3+.2,'score':.1 if weak and i==2 else .9}
                   for i,word in enumerate(verse['text'].split())]
            signal={'headRms':.1,'tailRms':.1,'verseRms':.1}
            edges,proof=verse_boundary(words,bounds,duration,'en',reference=verse['text'],signal=signal)
            check={'verse':number,'text':verse['text'],'alignedWords':words,'searchRange':bounds,
                   'boundarySignal':signal,'asrEdgeAnchors':[],'boundaryVerified':edges is not None,
                   'boundaryEvidence':proof}
            cue={'verse':number,'text':verse['text'],'start':edges[0],'end':edges[1]} if edges else None
            return cue,check
        cues=[];checks=[]
        for verse in verses:
            n=verse['number'];cue,check=check_for(verse,[2*n-1.5,2*n+(.15 if multiple and n==3 else .2)],weak=n in ({2,4} if multiple else {2}))
            checks.append(check)
            if cue:cues.append(cue)
        artifact={'schemaVersion':1,'method':METHOD,'key':receipt['key'],'sourceAudioSha256':'a'*64,
                  'textSha256':sha,'qualityRecipe':BOUNDARY_REVIEW_RECIPE,'recognizer':BOUNDARY_RECOGNIZER,
                  'recognizerRevision':RECOGNIZERS[BOUNDARY_RECOGNIZER],
                  'fingerprint':site_fingerprint('a'*64,sha,'en',BOUNDARY_REVIEW_RECIPE,BOUNDARY_RECOGNIZER),
                  'duration':duration,'accepted':False,'issues':['unreliable-verse-boundary:2'],
                  'verificationScope':'verse-boundaries','boundaryPolicy':dict(POLICY),
                  'expectedVerseNumbers':[v['number'] for v in verses],'boundarySourceVerses':verses,
                  'checks':checks,'cues':cues,'recognition':[],'unclaimedSpeech':[]}
        class Engine:
            locale='en'
            recipe=BOUNDARY_CONTEXT_RECIPE
            recognizer_name=BOUNDARY_RECOGNIZER
            recognizer_revision=RECOGNIZERS[BOUNDARY_RECOGNIZER]
            def align_group(self,audio,group,bounds,old_checks,source_sha):
                out_cues=[];out_checks=[]
                for verse in group:
                    cue,check=check_for(verse,bounds,weak=fail and verse['number']==2)
                    if multiple and verse['number']==3:
                        for word in check['alignedWords']:
                            word['start']-=.2;word['end']-=.2
                        edges,evidence=verse_boundary(check['alignedWords'],bounds,duration,'en',
                            reference=verse['text'],signal=check['boundarySignal'])
                        check['boundaryEvidence']=evidence
                        cue.update(start=edges[0],end=edges[1])
                    out_checks.append(check)
                    if cue:out_cues.append(cue)
                if len(out_cues)!=len(group):return None,out_checks,None
                proof={'verses':[v['number'] for v in group],'range':bounds,
                       'words':[w for c in out_checks for w in c['alignedWords']],
                       'signal':out_checks[0]['boundarySignal'],
                       'anchors':{str(c['verse']):[] for c in out_checks}}
                proof['id']=joint_proof_id(source_sha,proof)
                for check in out_checks:check['jointProofId']=proof['id']
                return out_cues,out_checks,proof
        return verses,receipt,artifact,Engine()

    def test_joint_review_recovers_failed_edge_and_preserves_outer_verified_verses(self):
        m=self.module();verses,receipt,original,engine=self.fixture();before=copy.deepcopy(original)
        result=m.review_joint_artifact(engine,original,receipt,verses,[])
        self.assertTrue(result['accepted'])
        self.assertEqual(result['issues'],[])
        self.assertEqual(original,before)
        for number in [1,4]:
            self.assertEqual(next(c for c in result['cues'] if c['verse']==number),
                             next(c for c in original['cues'] if c['verse']==number))
        from boundary_quality import verified_boundary_artifact
        self.assertTrue(verified_boundary_artifact(result))

    def test_later_group_uses_the_updated_outer_cue_from_an_earlier_group(self):
        m=self.module();verses,receipt,original,engine=self.fixture(multiple=True)
        result=m.review_joint_artifact(engine,original,receipt,verses,[])
        self.assertTrue(result['accepted'])
        self.assertEqual([p['verses'] for p in result['jointAlignments']],[[2,3],[4,5]])
        from boundary_quality import verified_boundary_artifact
        self.assertTrue(verified_boundary_artifact(result))

    def test_group_is_not_partially_committed_when_one_member_is_unreliable(self):
        m=self.module();verses,receipt,original,engine=self.fixture(fail=True)
        result=m.review_joint_artifact(engine,original,receipt,verses,[])
        self.assertFalse(result['accepted'])
        self.assertEqual(result['cues'],original['cues'])
        self.assertEqual(result['jointAlignments'],[])
        self.assertIn('unreliable-verse-boundary:2',result['issues'])

    def test_joint_proof_tampering_or_missing_partition_is_not_published(self):
        m=self.module();verses,receipt,original,engine=self.fixture()
        result=m.review_joint_artifact(engine,original,receipt,verses,[])
        from boundary_quality import verified_boundary_artifact
        for change in ['raw-times','adopted-partition','missing-proof']:
            altered=copy.deepcopy(result)
            if change=='raw-times':altered['jointAlignments'][0]['words'][0]['start']+=.2
            if change=='adopted-partition':
                adopted=next(c for c in altered['checks'] if c.get('jointProofId'))
                adopted['alignedWords']=adopted['alignedWords'][1:]
            if change=='missing-proof':altered['jointAlignments']=[]
            self.assertFalse(verified_boundary_artifact(altered))

    def test_publisher_requires_every_joint_member_and_verified_outer_window_limits(self):
        m=self.module();verses,receipt,original,engine=self.fixture()
        result=m.review_joint_artifact(engine,original,receipt,verses,[])
        from boundary_quality import verified_boundary_artifact
        from joint_boundaries import joint_proof_id
        partial=copy.deepcopy(result)
        adopted=[c for c in partial['checks'] if c.get('jointProofId')]
        adopted[-1].pop('jointProofId')
        self.assertFalse(verified_boundary_artifact(partial))
        wide=copy.deepcopy(result);proof=wide['jointAlignments'][0]
        old_id=proof['id'];proof['range']=[0,10]
        proof['id']=joint_proof_id(wide['sourceAudioSha256'],proof)
        for check in wide['checks']:
            if check.get('jointProofId')==old_id:
                check['jointProofId']=proof['id'];check['searchRange']=[0,10]
        self.assertFalse(verified_boundary_artifact(wide))

    def test_gap_review_is_independent_of_candidate_cue_insertion_order(self):
        m=self.module();verses,receipt,original,engine=self.fixture()
        result=m.review_joint_artifact(engine,original,receipt,verses,[])
        by_number={c['verse']:c for c in result['cues']}
        cues={n:by_number[n] for n in [1,4,2,3]}
        checks={c['verse']:c for c in original['checks']}
        gaps=[{'start':6.1,'end':6.2,'kind':'interior'}]
        self.assertTrue(m.gap_keys(gaps,list(cues.values())))
        self.assertIn(3,m.review_targets(verses,cues,checks,gaps))

    def test_previous_joint_recipe_remains_publishable_after_window_precision_fix(self):
        m=self.module();verses,receipt,original,engine=self.fixture()
        result=m.review_joint_artifact(engine,original,receipt,verses,[])
        from alignment_contract import PREVIOUS_BOUNDARY_CONTEXT_RECIPE, site_fingerprint
        from publish_site import recording_entry
        recipe=PREVIOUS_BOUNDARY_CONTEXT_RECIPE
        result.update(qualityRecipe=recipe,verseFiles=[],vttFile='proof.vtt',vttSha256='b'*64,
            fingerprint=site_fingerprint(receipt['sha256'],result['textSha256'],'en',recipe,
                                         engine.recognizer_name))
        result['boundaryContextReview']['recipe']=recipe
        self.assertEqual(recording_entry(receipt,result,result['textSha256'])['alignmentStatus'],'aligned')
        result['jointAlignments']=[]
        for check in result['checks']:check.pop('jointProofId',None)
        self.assertNotEqual(recording_entry(receipt,result,result['textSha256'])['alignmentStatus'],'aligned')

    def test_changed_source_audio_cannot_reuse_joint_context_evidence(self):
        m=self.module();verses,receipt,original,engine=self.fixture()
        original['sourceAudioSha256']='b'*64
        with self.assertRaises(ValueError):m.review_joint_artifact(engine,original,receipt,verses,[])


if __name__ == '__main__':
    unittest.main()
