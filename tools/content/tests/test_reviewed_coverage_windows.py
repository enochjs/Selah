"""Source padding can resolve missing-narration neighbors without waiving text or clocks."""
import copy,sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))

class CoverageWindowTests(unittest.TestCase):
    def fixture(self):
        from test_partial_audio import PartialAudioTests
        b,_=PartialAudioTests().fixture();b.update(accepted=False,issues=['missing-narration-evidence-unconfirmed']);b.pop('missingVerses')
        return b

    def test_original_partial_narrated_model_is_reverified_as_exact_source_roots(self):
        from reviewed_coverage_windows import coverage_model_witness
        from boundary_quality import verified_boundary_artifact
        b=self.fixture();before=copy.deepcopy(b);w=coverage_model_witness(b)
        self.assertEqual([v['number'] for v in w['boundarySourceVerses']],[36,38,40]);self.assertEqual(w['checks'],b['checks']);self.assertEqual(b,before)
        w.update(accepted=True,issues=[]);self.assertTrue(verified_boundary_artifact(w))

    def test_complete_original_joint_model_group_is_retained_and_reverified(self):
        from reviewed_coverage_windows import coverage_model_witness
        from joint_boundaries import joint_proof_id
        b=self.fixture();group=b['checks'][:2]
        for c in group:c['searchRange']=[1,7]
        proof=dict(verses=[36,38],range=[1,7],words=[w for c in group for w in c['alignedWords']],signal=group[0]['boundarySignal'],anchors={'36':[],'38':[]})
        proof['id']=joint_proof_id(b['sourceAudioSha256'],proof);b['jointAlignments']=[proof]
        for c in group:c['jointProofId']=proof['id']
        w=coverage_model_witness(b);self.assertEqual(w['jointAlignments'],b['jointAlignments'])
        b['jointAlignments'][0]['words'][0]['score']=.01
        with self.assertRaises(ValueError):coverage_model_witness(b)

    def test_a_failed_asr_gap_stays_visible_for_the_subsequent_source_ownership_proof(self):
        from reviewed_coverage_windows import coverage_model_witness
        b=self.fixture();g=dict(kind='between-verses',text='good.',start=3.,end=3.2,allowedHeadingOrClosing=False)
        b['unclaimedSpeech']=[g];b['issues'].insert(0,'boundary-unassigned-speech:between-verses')
        w=coverage_model_witness(b);self.assertEqual(w['unclaimedSpeech'],[g]);self.assertEqual(w['issues'],['boundary-unassigned-speech:between-verses'])

    def test_missing_roles_or_weak_actual_verse_cannot_be_waived(self):
        from reviewed_coverage_windows import coverage_model_witness
        for change in ['roles','weak','canonical','cue','projection']:
            b=self.fixture()
            if change=='roles':b['confirmedCoverage']['roles']['missingVerses']=[dict(verse=38,reason='not-narrated-in-source')]
            if change=='weak':b['checks'][0]['alignedWords'][0]['score']=.01
            if change=='canonical':b['boundarySourceVerses'][0]['text']='Another source.'
            if change=='cue':b['cues'][0]['end']-=.1
            if change=='projection':b['spokenProjection']['texts'][0]['reference']='Another source.'
            with self.assertRaises(ValueError,msg=change):coverage_model_witness(b)

if __name__=='__main__':unittest.main()
