import copy
from array import array
from pathlib import Path
import sys,unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))

class GapEdgeTests(unittest.TestCase):
    def fixture(self):
        from test_source_edges import SourceEdgeTests
        a,pcm,speech=SourceEdgeTests().fixture()
        a.update(accepted=False,issues=['boundary-unassigned-speech:between-verses'],
            unclaimedSpeech=[{'kind':'between-verses','text':'a stretched ASR clock','start':1.7,'end':3.2,'allowedHeadingOrClosing':False}])
        return a,pcm,speech

    def test_a_stretched_asr_gap_can_span_two_complete_verses_and_their_voice_free_gap(self):
        from gap_edges import repair_gap_edges,gap_edge_measurements_match
        from boundary_quality import verified_boundary_artifact,boundary_gap_issues
        a,pcm,speech=self.fixture();before=copy.deepcopy(a);r=repair_gap_edges(a,pcm,speech)
        self.assertTrue(r['accepted']);self.assertTrue(verified_boundary_artifact(r));self.assertTrue(gap_edge_measurements_match(r,pcm))
        self.assertEqual(r['unclaimedSpeech'],a['unclaimedSpeech']);self.assertEqual(r['recognition'],a['recognition'])
        self.assertTrue(boundary_gap_issues(r['unclaimedSpeech'],r['cues']))
        self.assertEqual(a,before)

    def test_a_real_unassigned_clause_is_not_hidden_or_marked_as_background(self):
        from gap_edges import repair_gap_edges
        a,pcm,speech=self.fixture();speech.insert(1,[36000,40000]);pcm[36000:40000]=array('h',[5000])*4000
        self.assertEqual(repair_gap_edges(a,pcm,speech),a)

    def test_original_chapter_heading_outside_verse_clips_remains_a_heading(self):
        from gap_edges import repair_gap_edges,gap_edge_measurements_match
        a,pcm,speech=self.fixture()
        a['unclaimedSpeech'].insert(0,{'kind':'leading','text':'Chapter 2','start':0.,'end':.5,'allowedHeadingOrClosing':True})
        speech.insert(0,[0,8000]);pcm[:8000]=array('h',[5000])*8000
        r=repair_gap_edges(a,pcm,speech)
        self.assertTrue(r['accepted']);self.assertTrue(gap_edge_measurements_match(r,pcm))
        self.assertEqual(r['unclaimedSpeech'],a['unclaimedSpeech'])
        self.assertTrue(all(p['gapIndex']==1 for p in r['sourceGapReview']['parts']))

    def test_heading_label_cannot_exclude_speech_between_verses(self):
        from gap_edges import repair_gap_edges
        a,pcm,speech=self.fixture()
        a['unclaimedSpeech'][0].update(kind='leading',allowedHeadingOrClosing=True)
        speech.insert(1,[36000,40000]);pcm[36000:40000]=array('h',[5000])*4000
        self.assertEqual(repair_gap_edges(a,pcm,speech),a)

    def test_unowned_zero_length_asr_clock_cannot_bypass_source_voice_coverage(self):
        from gap_edges import repair_gap_edges
        a,pcm,speech=self.fixture();a['unclaimedSpeech'][0].update(start=2.3,end=2.3)
        speech.insert(1,[36000,40000]);pcm[36000:40000]=array('h',[5000])*4000
        self.assertEqual(repair_gap_edges(a,pcm,speech),a)

    def test_zero_length_clock_inside_a_verified_verse_retains_ownership(self):
        from gap_edges import repair_gap_edges
        a,pcm,speech=self.fixture();a['unclaimedSpeech'].append({'kind':'between-verses','text':'2.','start':1.5,'end':1.5})
        r=repair_gap_edges(a,pcm,speech)
        self.assertTrue(r['accepted'])
        self.assertEqual(next(p['ownerVerse'] for p in r['sourceGapReview']['parts'] if p['gapIndex']==1),1)

    def test_tampered_coverage_and_original_pcm_are_rejected(self):
        from gap_edges import repair_gap_edges,gap_edge_measurements_match
        from boundary_quality import verified_boundary_artifact
        a,pcm,speech=self.fixture();r=repair_gap_edges(a,pcm,speech)
        for change in ['proof','gap','label','cue']:
            x=copy.deepcopy(r)
            if change=='proof':x['sourceGapReview']['parts']=[]
            if change=='gap':x['unclaimedSpeech'][0]['end']+=.1
            if change=='label':x['qualityRecipe']=a['qualityRecipe']
            if change=='cue':x['cues'][0]['end']+=.1
            self.assertFalse(verified_boundary_artifact(x),change)
        p=next(p for p in r['sourceGapReview']['parts'] if p['ownerVerse'] is None)
        start,end=p['range'];pcm[start:end]=array('h',[15000])*(end-start)
        self.assertFalse(gap_edge_measurements_match(r,pcm))

    def test_publication_rechecks_new_clip_inventory(self):
        from gap_edges import repair_gap_edges
        from publish_site import recording_entry
        a,pcm,speech=self.fixture();r=repair_gap_edges(a,pcm,speech)
        r.update(vttFile='b'*64+'.vtt',vttSha256='b'*64)
        r['verseFiles']=[{'verse':c['verse'],'sourceStart':c['start'],'sourceEnd':c['end'],'duration':c['end']-c['start'],
            'sha256':'c'*64,'path':'/api/audio/resources/'+'c'*64+'.mp3'} for c in r['cues']]
        receipt={'key':r['key'],'locale':'en','sha256':'a'*64,'duration':r['duration'],'path':'/source.mp3','url':'https://source.test/original.mp3'}
        self.assertEqual(recording_entry(receipt,r,r['textSha256'])['alignmentStatus'],'aligned')
        r['verseFiles'][0]['sourceEnd']-=.1
        self.assertEqual(recording_entry(receipt,r,r['textSha256'])['alignmentStatus'],'pending')

if __name__=='__main__':unittest.main()
