import copy
import importlib.util
import json
from array import array
from pathlib import Path
import sys
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import test_speech_span

class SpeechContextTests(unittest.TestCase):
    def fixture(self,edge='head'):
        from boundary_quality import verse_boundary
        from partial_audio import source_text_sha
        a,pcm,speech=test_speech_span.SpeechSpanTests().fixture();c=a['checks'][1]
        if edge=='head':
            c['text']=c['text'].replace('He ','When ',1);c['alignedWords'][0]['word']='When';a['recognition'][1]['words'][0]['word']='When';c['asrEdgeAnchors'][0]['word']='When';a['boundarySourceVerses'][1]['text']=c['text'];a['textSha256']=source_text_sha(a['boundarySourceVerses'])
        else:
            c['alignedWords'][0]['score']=.9;c['alignedWords'][-1]['score']=.01
        _,c['boundaryEvidence']=verse_boundary(c['alignedWords'],c['searchRange'],8,'en',reference=c['text'],signal=c['boundarySignal'],anchors=c['asrEdgeAnchors'])
        return a,pcm,speech

    def test_context_and_clear_intervals_support_weak_long_head_or_tail(self):
        self.assertIsNotNone(importlib.util.find_spec('speech_context'),'Context and interval evidence must cover more than short first words')
        from speech_context import repair_context,verified_context_artifact,context_measurements_match
        from boundary_quality import verified_boundary_artifact
        for edge in ['head','tail']:
            a,pcm,speech=self.fixture(edge);before=copy.deepcopy(a);r=repair_context(a,pcm,speech)
            self.assertTrue(r['accepted'],edge);self.assertTrue(verified_boundary_artifact(r));self.assertTrue(context_measurements_match(r,pcm))
            self.assertEqual(r['checks'][1]['alignedWords'],before['checks'][1]['alignedWords'])
            self.assertEqual(r['recognition'],before['recognition']);self.assertEqual(a,before)
            self.assertTrue(verified_context_artifact(json.loads(json.dumps(r))))

    def test_background_without_vad_speech_is_measured_instead_of_treated_as_extra_words(self):
        from speech_context import repair_context,context_measurements_match
        from boundary_quality import verse_boundary
        a,pcm,speech=self.fixture();c=a['checks'][1];c['alignedWords'][0]['score']=.9
        edges,e=verse_boundary(c['alignedWords'],c['searchRange'],8,'en',reference=c['text'],signal=c['boundarySignal'],anchors=c['asrEdgeAnchors']);c.update(boundaryVerified=True,boundaryEvidence=e)
        a['cues'].insert(1,{'verse':2,'text':c['text'],'start':edges[0],'end':edges[1]})
        a['issues']=['boundary-unassigned-speech:between-verses'];a['unclaimedSpeech']=[{'kind':'between-verses','text':'extra','start':2.1,'end':2.3,'allowedHeadingOrClosing':False}]
        for i,v in enumerate(pcm):
            if v==0:pcm[i]=400
        r=repair_context(a,pcm,speech);self.assertTrue(r['accepted']);self.assertTrue(context_measurements_match(r,pcm))
        from quiet_gaps import digest
        from boundary_quality import verified_boundary_artifact
        changed=copy.deepcopy(r);proof=changed['speechContextGapReview'];proof['speechSegments']=speech[1:]
        proof['id']=digest({k:v for k,v in proof.items() if k!='id'})
        self.assertFalse(verified_boundary_artifact(changed),'Gap and verse proofs must use the same full-source VAD clock')
        for change in ['voice','noise']:
            bad=array('h',pcm);vad=copy.deepcopy(speech)
            if change=='voice':vad.insert(1,[33600,36800])
            else:bad[33600:36800]=array('h',[10000])*3200
            self.assertFalse(repair_context(a,bad,vad)['accepted'],change)

    def test_missing_context_joined_speech_and_edited_proofs_are_rejected(self):
        from speech_context import repair_context
        from boundary_quality import verified_boundary_artifact
        a,pcm,speech=self.fixture();r=repair_context(a,pcm,speech)
        for change in ['context','continuous','low-location']:
            x=copy.deepcopy(a);vad=copy.deepcopy(speech)
            if change=='context':x['recognition']=[]
            if change=='continuous':vad=[[16000,88000],vad[-1]]
            if change=='low-location':
                for w in x['checks'][1]['alignedWords']:w['score']=.2
            self.assertFalse(repair_context(x,pcm,vad)['accepted'],change)
        for change in ['range','clock','source','legacy','quiet']:
            x=copy.deepcopy(r)
            if change=='range':x['cues'][1]['end']+=1
            if change=='clock':x['checks'][1]['alignedWords'][1]['start']+=.3
            if change=='source':x['sourceAudioSha256']='b'*64
            if change=='legacy':x['qualityRecipe']=a['qualityRecipe']
            if change=='quiet':x['checks'][1]['speechContextProof']['quietRms'][0][0]=.9
            self.assertFalse(verified_boundary_artifact(x),change)

    def test_existing_numeric_proofs_and_materialized_file_ranges_remain_required(self):
        from speech_context import repair_context
        from numeric_alignment import expansion,collapse_words,NUMERIC_POLICY
        from alignment_contract import NUMERIC_REVIEW_RECIPE,BOUNDARY_REVIEW_RECIPE,METHOD,BOUNDARY_RECOGNIZER
        from partial_audio import source_text_sha
        from boundary_quality import verified_boundary_artifact
        from publish_site import recording_entry
        a,pcm,speech=self.fixture();c=a['checks'][1]
        spoken,groups=expansion('182','en','plain');raw=[{'word':w,'start':2.6+i*.125,'end':2.6+(i+1)*.125,'score':.9} for i,w in enumerate(spoken.split())]
        c['alignedWords'][1]=collapse_words(raw,groups,'plain')[0]
        c['text']=c['text'].replace('instructed','182');a['boundarySourceVerses'][1]['text']=c['text'];a['textSha256']=source_text_sha(a['boundarySourceVerses'])
        a.update(qualityRecipe=NUMERIC_REVIEW_RECIPE,numericBaseRecipe=BOUNDARY_REVIEW_RECIPE,numericAlignmentPolicy=NUMERIC_POLICY)
        r=repair_context(a,pcm,speech);self.assertTrue(r['accepted']);self.assertTrue(verified_boundary_artifact(r))
        bad=copy.deepcopy(r);bad['checks'][1]['alignedWords'][1].pop('numericExpansion');self.assertFalse(verified_boundary_artifact(bad))
        r.update(method=METHOD,recognizer=BOUNDARY_RECOGNIZER,vttSha256='b'*64,vttFile='b'*64+'.vtt')
        r['verseFiles']=[{'verse':c['verse'],'sourceStart':c['start'],'sourceEnd':c['end'],'duration':c['end']-c['start'],
            'sha256':'c'*64,'path':'/api/audio/resources/'+'c'*64+'.mp3'} for c in r['cues']]
        receipt={'key':r['key'],'locale':'en','sha256':'a'*64,'duration':8,'path':'/source.mp3','url':'https://example.com/source.mp3'}
        self.assertEqual(recording_entry(receipt,r,r['textSha256'])['alignmentStatus'],'aligned')
        r['verseFiles'][1]['sourceStart']+=.1
        self.assertEqual(recording_entry(receipt,r,r['textSha256'])['alignmentStatus'],'pending')

    def test_numeric_neighbor_requires_a_strong_actual_spoken_endpoint(self):
        from speech_context import repair_context
        from numeric_alignment import expansion,collapse_words,NUMERIC_POLICY
        from alignment_contract import NUMERIC_REVIEW_RECIPE,BOUNDARY_REVIEW_RECIPE
        from boundary_quality import verse_boundary
        from partial_audio import source_text_sha
        a,pcm,speech=self.fixture();left=a['checks'][0]
        spoken,groups=expansion('182','en','plain')
        raw=[{'word':w,'start':1.4+i*.125,'end':1.4+(i+1)*.125,'score':.4 if i==3 else .95} for i,w in enumerate(spoken.split())]
        left['alignedWords'][-1]=collapse_words(raw,groups,'plain')[0]
        left['text']='They 182';a['boundarySourceVerses'][0]['text']=left['text'];a['cues'][0]['text']=left['text']
        left['asrEdgeAnchors'][-1]['word']='182';a['recognition'][0]['words'][-1]['word']='182'
        edges,e=verse_boundary(left['alignedWords'],left['searchRange'],8,'en',reference=left['text'],signal=left['boundarySignal'],anchors=left['asrEdgeAnchors'])
        self.assertIsNotNone(edges)  # Ordinary anchor-supported evidence remains valid.
        left.update(boundaryVerified=True,boundaryEvidence=e)
        a['textSha256']=source_text_sha(a['boundarySourceVerses'])
        a.update(qualityRecipe=NUMERIC_REVIEW_RECIPE,numericBaseRecipe=BOUNDARY_REVIEW_RECIPE,numericAlignmentPolicy=NUMERIC_POLICY)
        self.assertFalse(repair_context(a,pcm,speech)['accepted'])

if __name__=='__main__':unittest.main()
