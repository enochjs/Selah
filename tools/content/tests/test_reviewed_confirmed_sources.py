"""Human acceptance of a voiced shared seam cannot waive unrelated source facts."""
import copy,sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))

class ConfirmedSourceTests(unittest.TestCase):
    def fixture(self):
        from test_partial_audio import PartialAudioTests
        from audio_coverage import candidate_roles
        b,_=PartialAudioTests().fixture();b.update(accepted=False,issues=['missing-narration-evidence-unconfirmed']);b.pop('missingVerses');b['cues'][0]['end']=5.;b['cues'][1]['start']=5.
        r=dict(approvedBy='user-natural-seam-and-source-absence',sourceAcousticApproval=False,humanDecision='自然分界可接受，跳过未朗读第37节',userConfirmedMissingVerses=[37],naturalSeam=dict(leftVerse=36,rightVerse=38,cut=5.,uncertainty=[4.99,5.01]),cuts=[],weakVerses=[],failureReasons=[],gapAssignments=[],finalCues=copy.deepcopy(b['cues']))
        return b,r

    def test_user_accepted_shared_source_seam_retains_all_real_word_bodies(self):
        from reviewed_confirmed_sources import confirmed_absence_seam
        b,r=self.fixture();before=copy.deepcopy(b);missing=confirmed_absence_seam(b,r)
        self.assertEqual(missing,[dict(verse=37,reason='not-narrated-in-source')]);self.assertEqual(b,before)

    def test_attestation_cannot_hide_another_verse_change_cuts_or_lose_real_words(self):
        from reviewed_confirmed_sources import confirmed_absence_seam
        for change in ['not-human','wrong-missing','moved-seam','changed-cue','lost-word','wide-window']:
            b,r=self.fixture()
            if change=='not-human':r['humanDecision']=''
            if change=='wrong-missing':r['userConfirmedMissingVerses']=[38]
            if change=='moved-seam':r['naturalSeam']['cut']=5.1
            if change=='changed-cue':r['finalCues'][0]['end']=4.9
            if change=='lost-word':b['checks'][0]['alignedWords'][-1]['end']=5.1
            if change=='wide-window':r['naturalSeam']['uncertainty']=[4.9,5.1]
            with self.assertRaises(ValueError,msg=change):confirmed_absence_seam(b,r)

if __name__=='__main__':unittest.main()

class DecoderMeasurementTests(unittest.TestCase):
    def test_one_pcm_unit_measurement_variance_is_accepted_but_geometry_and_large_changes_are_not(self):
        from quiet_gaps import same_source_measurements
        a=dict(id='old',frames=[.1,.2],rms=.3,samples=[1,2],range=[1.,2.])
        b={**a,'id':'new','frames':[.1000001,.2000001],'rms':.3000001}
        self.assertTrue(same_source_measurements(a,b))
        for bad in [{**b,'frames':[.1,.201]},{**b,'samples':[1,3]},{**b,'range':[1.,2.0000001]}]:
            self.assertFalse(same_source_measurements(a,bad))

class ConfirmedSourceGapTests(ConfirmedSourceTests):
    def gap_fixture(self):
        b,r=self.fixture();b['cues'][0]['end']=4.9;r['finalCues']=copy.deepcopy(b['cues']);r.pop('naturalSeam');r.update(schemaVersion=23,approvedBy='user-natural-gap-and-source-absence',sourceGap=dict(leftVerse=36,rightVerse=38,range=[4.9,5.]));return b,r

    def test_human_accepted_existing_gap_preserves_both_complete_real_verses(self):
        from reviewed_confirmed_sources import confirmed_absence_gap
        b,r=self.gap_fixture();self.assertEqual(confirmed_absence_gap(b,r),[dict(verse=37,reason='not-narrated-in-source')])

    def test_gap_attestation_does_not_authorize_cut_changes_or_unretained_words(self):
        from reviewed_confirmed_sources import confirmed_absence_gap
        for kind in ['range','cue','word','source']:
            b,r=self.gap_fixture()
            if kind=='range':r['sourceGap']['range'][0]=4.8
            if kind=='cue':r['finalCues'][0]['end']=4.8
            if kind=='word':b['checks'][0]['alignedWords'][-1]['end']=4.95
            if kind=='source':r['userConfirmedMissingVerses']=[38]
            with self.assertRaises(ValueError,msg=kind):confirmed_absence_gap(b,r)
