"""Low-scored short edge words may use complete, source-bound speech spans."""
import copy
import json
import importlib.util
from array import array
from pathlib import Path
import sys
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))

class SpeechSpanTests(unittest.TestCase):
    def fixture(self):
        from boundary_quality import POLICY,verse_boundary
        from alignment_contract import BOUNDARY_REVIEW_RECIPE
        from partial_audio import source_text_sha
        texts=['They came.','He instructed the man to go home.','Go now.']
        ranges=[[(1,1.3),(1.4,1.9)],[(2.5,2.56),(2.6,3.1),(3.2,3.3),(3.4,3.7),(3.8,3.9),(4,4.3),(4.5,5.4)],[(6.5,6.7),(6.8,7.1)]]
        checks=[];cues=[];recognition=[]
        for i,(text,times) in enumerate(zip(texts,ranges),1):
            words=[{'word':w,'start':a,'end':b,'score':.01 if i==2 and j==0 else .9} for j,(w,(a,b)) in enumerate(zip(text.split(),times))]
            raw=[{'word':w['word'],'start':w['start'],'end':w['end'],'probability':.42 if i==2 and j==0 else .95} for j,w in enumerate(words)]
            recognition.append({'words':raw});bounds=[times[0][0]-.3,times[-1][1]+.3]
            signal={'headRms':.001,'tailRms':.001,'verseRms':.1}
            edges,e=verse_boundary(words,bounds,8,'en',reference=text,signal=signal,anchors=[raw[0],raw[-1]])
            checks.append({'verse':i,'text':text,'alignedWords':words,'searchRange':bounds,'boundarySignal':signal,
                           'asrEdgeAnchors':[raw[0],raw[-1]],'boundaryVerified':edges is not None,'boundaryEvidence':e})
            if edges:cues.append({'verse':i,'text':text,'start':edges[0],'end':edges[1]})
        verses=[{'number':i,'text':t} for i,t in enumerate(texts,1)]
        a={'key':'genesis:1:en','qualityRecipe':BOUNDARY_REVIEW_RECIPE,'sourceAudioSha256':'a'*64,
           'textSha256':source_text_sha(verses),'boundarySourceVerses':verses,'expectedVerseNumbers':[1,2,3],
           'duration':8,'accepted':False,'issues':['unreliable-verse-boundary:2'],'verificationScope':'verse-boundaries',
           'boundaryPolicy':POLICY,'checks':checks,'cues':cues,'recognition':recognition,'unclaimedSpeech':[]}
        speech=[[16000,30400],[40000,88000],[104000,113600]];pcm=array('h',[0])*128000
        for left,right in speech:pcm[left:right]=array('h',[3000])*(right-left)
        return a,pcm,speech

    def test_complete_span_passes_without_changing_model_scores_or_recognition(self):
        self.assertIsNotNone(importlib.util.find_spec('speech_span'),'Complete speech spans need a separate verification recipe')
        from speech_span import repair_speech_spans,verified_span_artifact,span_measurements_match
        from boundary_quality import verified_boundary_artifact
        a,pcm,speech=self.fixture();original=copy.deepcopy(a)
        r=repair_speech_spans(a,pcm,speech)
        self.assertTrue(r['accepted']);self.assertTrue(verified_span_artifact(r));self.assertTrue(verified_boundary_artifact(r))
        self.assertTrue(span_measurements_match(r,pcm))
        self.assertEqual(r['checks'][1]['alignedWords'],original['checks'][1]['alignedWords'])
        self.assertEqual(r['recognition'],original['recognition'])
        self.assertEqual(r['checks'][1]['asrEdgeAnchors'],original['checks'][1]['asrEdgeAnchors'])
        self.assertEqual([r['cues'][1]['start'],r['cues'][1]['end']],[2.2,6.0])
        self.assertTrue(verified_span_artifact(json.loads(json.dumps(r))))
        self.assertEqual(a,original)

    def test_missing_phrase_support_ambiguous_speech_and_other_failures_stay_unpublished(self):
        from speech_span import repair_speech_spans
        for change in ['no-word','weak-context','joined-speech','bad-tail','proper-name','numeric']:
            a,pcm,speech=self.fixture()
            if change=='no-word':a['recognition'][1]['words'][0]['word']='They'
            if change=='weak-context':a['recognition'][1]['words'][1]['probability']=.1
            if change=='joined-speech':speech=[[16000,88000],speech[-1]]
            if change=='bad-tail':a['checks'][1]['alignedWords'][-1]['score']=.01
            if change=='proper-name':a['checks'][1]['alignedWords'][0]['word']='Esau'
            if change=='numeric':a['boundarySourceVerses'][1]['text']='He instructed 20 men.'
            self.assertFalse(repair_speech_spans(a,pcm,speech)['accepted'],change)

    def test_changed_clocks_ranges_noise_and_legacy_identity_are_rejected(self):
        from speech_span import repair_speech_spans,verified_span_artifact,span_measurements_match
        from boundary_quality import verified_boundary_artifact
        from alignment_contract import BOUNDARY_REVIEW_RECIPE
        a,pcm,speech=self.fixture();r=repair_speech_spans(a,pcm,speech)
        for change in ['range','clock','missing-proof','source','vad','legacy']:
            x=copy.deepcopy(r)
            if change=='range':x['cues'][1]['start']=2.51
            if change=='clock':x['checks'][1]['alignedWords'][0]['start']=2.7
            if change=='missing-proof':x['checks'][1].pop('speechSpanProof')
            if change=='source':x['sourceAudioSha256']='b'*64
            if change=='vad':x['speechSpanReview']['speechSegments'][0][1]=41000
            if change=='legacy':x['qualityRecipe']=BOUNDARY_REVIEW_RECIPE
            self.assertFalse(verified_boundary_artifact(x),change)
        loud=array('h',pcm);loud[35000:35500]=array('h',[25000])*500
        self.assertFalse(span_measurements_match(r,loud))

    def test_publication_requires_files_matching_the_confirmed_span(self):
        from speech_span import repair_speech_spans
        from alignment_contract import METHOD,BOUNDARY_RECOGNIZER
        from publish_site import recording_entry
        a,pcm,speech=self.fixture();r=repair_speech_spans(a,pcm,speech)
        r.update(method=METHOD,recognizer=BOUNDARY_RECOGNIZER,vttSha256='b'*64,vttFile='b'*64+'.vtt')
        r['verseFiles']=[{'verse':c['verse'],'sourceStart':c['start'],'sourceEnd':c['end'],
            'duration':c['end']-c['start'],'sha256':'c'*64,'path':'/api/audio/resources/'+'c'*64+'.mp3'} for c in r['cues']]
        receipt={'key':r['key'],'locale':'en','sha256':r['sourceAudioSha256'],'duration':8,
                 'path':'/api/audio/resources/'+'a'*64+'.mp3','url':'https://example.com/source.mp3'}
        self.assertEqual(recording_entry(receipt,r,r['textSha256'])['alignmentStatus'],'aligned')
        r['verseFiles'][1]['sourceStart']+=.1
        self.assertEqual(recording_entry(receipt,r,r['textSha256'])['alignmentStatus'],'pending')

if __name__=='__main__':unittest.main()
