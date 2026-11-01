import copy
from pathlib import Path
import sys
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))

class PartialAudioTests(unittest.TestCase):
    def fixture(self,alias=False):
        from test_audio_coverage import AudioCoverageTests
        from audio_coverage import candidate_roles,narrated_verses,measure_coverage
        from alignment_contract import METHOD,PARTIAL_REVIEW_RECIPE,BOUNDARY_RECOGNIZER,RECOGNIZERS,site_fingerprint
        from boundary_quality import POLICY,verse_boundary
        from spoken_projection import projection_for
        from partial_audio import source_text_sha
        from timed_text import normalized
        key='deuteronomy:13:zh' if alias else 'acts:8:en';locale=key.split(':')[-1]
        source=([{'number':12,'text':'神就是爱。'},{'number':13,'text':'（见上节'},
                 {'number':17,'text':'神帮助我。'},{'number':18,'text':'（见上节'}] if alias else
                [{'number':n,'text':'God is good.'} for n in [36,37,38,40]])
        niv=None if alias else AudioCoverageTests().niv();roles=candidate_roles(key,source,niv)
        roots=narrated_verses({'key':key,'boundarySourceVerses':source,'confirmedCoverage':{'roles':roles}})
        sha=source_text_sha(source);pcm=[0]*192000;cues=[];checks=[];speech=[];files=[]
        for index,verse in enumerate(roots):
            start=2+index*3;tokens=list(normalized(verse['text'])) if alias else verse['text'].split()
            words=[{'word':word,'start':start+i*.3,'end':start+i*.3+.2,'score':.9} for i,word in enumerate(tokens)]
            bounds=[start-1,start+2];signal={'headRms':.1,'tailRms':.1,'verseRms':.1}
            edges,evidence=verse_boundary(words,bounds,12,locale,reference=verse['text'],signal=signal)
            self.assertIsNotNone(edges)
            cues.append({'verse':verse['number'],'text':verse['text'],'start':edges[0],'end':edges[1]})
            checks.append({'verse':verse['number'],'text':verse['text'],'alignedWords':words,
                           'searchRange':bounds,'boundarySignal':signal,'boundaryVerified':True,'asrEdgeAnchors':[],'boundaryEvidence':evidence})
            a,b=round(edges[0]*16000),round(edges[1]*16000);pcm[a:b]=[8000]*(b-a);speech.append([a+160,b-160])
            files.append({'verse':verse['number'],'sha256':'b'*64,'path':'/api/audio/resources/'+'b'*64+'.mp3','duration':edges[1]-edges[0],'sourceStart':edges[0],'sourceEnd':edges[1],
                          **({'coveredVerses':verse['coveredVerses']} if verse.get('coveredVerses') else {})})
        artifact={'method':METHOD,'key':key,'sourceAudioSha256':'a'*64,'textSha256':sha,'duration':12,
                  'accepted':True,'issues':[],'qualityRecipe':PARTIAL_REVIEW_RECIPE,
                  'recognizer':BOUNDARY_RECOGNIZER,'recognizerRevision':RECOGNIZERS[BOUNDARY_RECOGNIZER],
                  'fingerprint':site_fingerprint('a'*64,sha,locale,PARTIAL_REVIEW_RECIPE,BOUNDARY_RECOGNIZER),
                  'verificationScope':'verse-boundaries','boundaryPolicy':dict(POLICY),'boundarySourceVerses':source,
                  'expectedVerseNumbers':[v['number'] for v in source],'cues':cues,'checks':checks,'unclaimedSpeech':[],
                  'spokenProjection':projection_for(key,source),'missingVerses':roles['missingVerses'],
                  'verseFiles':files,'vttFile':'c'*64+'.vtt','vttSha256':'c'*64}
        artifact['confirmedCoverage']=measure_coverage(artifact,pcm,speech,roles,niv)
        receipt={'key':key,'sha256':'a'*64,'locale':locale,'url':'https://original.test/audio.mp3','duration':12,'path':'/source.mp3'}
        return artifact,receipt

    def test_confirmed_missing_is_partial_and_never_fabricates_a_verse_file(self):
        from boundary_quality import verified_boundary_artifact
        from publish_site import recording_entry
        artifact,receipt=self.fixture()
        self.assertTrue(verified_boundary_artifact(artifact))
        result=recording_entry(receipt,artifact,artifact['textSha256'])
        self.assertEqual(result['alignmentStatus'],'partial')
        self.assertEqual(result['missingVerses'],[{'verse':37,'reason':'not-narrated-in-source'}])
        self.assertEqual([v['verse'] for v in result['verseFiles']],[36,38,40])

    def test_partial_can_retain_a_complete_source_bound_joint_group(self):
        from boundary_quality import verified_boundary_artifact
        from joint_boundaries import joint_proof_id
        artifact,_=self.fixture();checks=artifact['checks'][:2]
        for check in checks:check['searchRange']=[1,7]
        proof={'verses':[36,38],'range':[1,7],'words':[w for c in checks for w in c['alignedWords']],
               'signal':checks[0]['boundarySignal'],'anchors':{'36':[],'38':[]}}
        proof['id']=joint_proof_id(artifact['sourceAudioSha256'],proof)
        artifact['jointAlignments']=[proof]
        for check in checks:check['jointProofId']=proof['id']
        self.assertTrue(verified_boundary_artifact(artifact))
        changed=copy.deepcopy(artifact);changed['jointAlignments']=[]
        self.assertFalse(verified_boundary_artifact(changed))

    def test_a_failed_new_window_can_keep_a_complete_previous_verified_group(self):
        from audio_coverage import narrated_verses
        from partial_audio import CoverageBoundaryAligner
        from joint_boundaries import joint_proof_id
        original,receipt=self.fixture();group=original['checks'][:2]
        for check in group:check['searchRange']=[1,7]
        proof={'verses':[36,38],'range':[1,7],'words':[w for c in group for w in c['alignedWords']],
               'signal':group[0]['boundarySignal'],'anchors':{'36':[],'38':[]}}
        proof['id']=joint_proof_id(original['sourceAudioSha256'],proof)
        original['jointAlignments']=[proof]
        for check in group:check['jointProofId']=proof['id']
        fresh=copy.deepcopy(original);fresh['accepted']=False;fresh['issues']=['unreliable-verse-boundary:38']
        fresh['cues']=[c for c in fresh['cues'] if c['verse']!=38]
        next(c for c in fresh['checks'] if c['verse']==38)['boundaryVerified']=False
        fresh.pop('jointAlignments')
        for check in fresh['checks']:check.pop('jointProofId',None)
        engine=object.__new__(CoverageBoundaryAligner);engine.locale='en';engine._original=original
        engine.restore_verified_boundaries(fresh,receipt,narrated_verses(original))
        self.assertEqual(fresh['cues'],original['cues'])
        self.assertEqual(fresh['jointAlignments'],original['jointAlignments'])
        self.assertEqual(fresh['issues'],[])
        damaged=copy.deepcopy(fresh);damaged['sourceAudioSha256']='b'*64
        damaged['cues']=[c for c in damaged['cues'] if c['verse']!=38]
        # Receipt mismatch and recognizer identity cannot borrow source measurements.
        engine._original={**original,'sourceAudioSha256':'b'*64}
        engine.restore_verified_boundaries(damaged,receipt,narrated_verses(original))
        self.assertNotIn(38,[c['verse'] for c in damaged['cues']])

    def test_partial_publication_requires_exact_files_aliases_and_source_ranges(self):
        from publish_site import recording_entry
        artifact,receipt=self.fixture()
        for change in ['missing-file','extra-missing-clip','alias','range','duration','duplicate']:
            x=copy.deepcopy(artifact)
            if change=='missing-file':x['verseFiles'].pop()
            if change=='extra-missing-clip':x['verseFiles'].append({**x['verseFiles'][0],'verse':37})
            if change=='alias':x['verseFiles'][0]['coveredVerses']=[36,37]
            if change=='range':x['verseFiles'][0]['sourceEnd']-=.1
            if change=='duration':x['verseFiles'][0]['duration']-=.1
            if change=='duplicate':x['verseFiles'].append(copy.deepcopy(x['verseFiles'][0]))
            self.assertEqual(recording_entry(receipt,x,x['textSha256'])['alignmentStatus'],'pending',change)

    def test_unproven_missing_weak_remaining_edges_or_changed_original_text_are_rejected(self):
        from boundary_quality import verified_boundary_artifact
        artifact,_=self.fixture()
        for change in ['proof','weak-edge','source','missing','cue']:
            x=copy.deepcopy(artifact)
            if change=='proof':x['confirmedCoverage']['proofs']=[]
            if change=='weak-edge':x['checks'][0]['alignedWords'][0]['score']=.1
            if change=='source':x['boundarySourceVerses'][1]['text']='Changed missing verse.'
            if change=='missing':x['missingVerses']=[]
            if change=='cue':x['cues'].pop()
            self.assertFalse(verified_boundary_artifact(x),change)

    def test_source_see_previous_alias_remains_aligned_and_is_not_called_missing(self):
        from boundary_quality import verified_boundary_artifact
        from publish_site import recording_entry
        artifact,receipt=self.fixture(alias=True)
        self.assertTrue(verified_boundary_artifact(artifact))
        result=recording_entry(receipt,artifact,artifact['textSha256'])
        self.assertEqual(result['alignmentStatus'],'aligned')
        self.assertNotIn('missingVerses',result)
        self.assertEqual(result['verseFiles'][0]['coveredVerses'],[12,13])

if __name__=='__main__':unittest.main()
