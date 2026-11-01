import copy
import importlib.util
import json
from array import array
from pathlib import Path
import sys
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import test_speech_span

class WordPauseTests(unittest.TestCase):
    def fixture(self):
        from boundary_quality import verse_boundary
        from partial_audio import source_text_sha
        a,_,_=test_speech_span.SpeechSpanTests().fixture();c=a['checks'][1];n=a['checks'][2]
        c['alignedWords'][0]['score']=.9;c['alignedWords'][-1].update(word='Egypt.',start=5.25,end=5.4,score=.26)
        c['text']=c['text'].replace('home.','Egypt.');a['boundarySourceVerses'][1]['text']=c['text']
        a['recognition'][1]['words'][-1].update(word='Egypt',start=5.2,end=5.45,probability=.995);c['asrEdgeAnchors'][-1]=copy.deepcopy(a['recognition'][1]['words'][-1]);c['searchRange']=[2.2,5.45]
        for w,(start,end) in zip(n['alignedWords'],[(5.94,6.08),(6.2,6.5)]):w.update(start=start,end=end)
        a['recognition'][2]['words'][0].update(start=5.45,end=6.08);a['recognition'][2]['words'][-1].update(start=6.2,end=6.5)
        n.update(asrEdgeAnchors=copy.deepcopy(a['recognition'][2]['words']),searchRange=[5.45,6.8])
        a['cues']=[]
        for check in a['checks']:
            edges,e=verse_boundary(check['alignedWords'],check['searchRange'],8,'en',reference=check['text'],signal=check['boundarySignal'],anchors=check['asrEdgeAnchors']);check.update(boundaryVerified=edges is not None,boundaryEvidence=e)
            if edges:a['cues'].append({'verse':check['verse'],'text':check['text'],'start':edges[0],'end':edges[1]})
        a['textSha256']=source_text_sha(a['boundarySourceVerses']);pcm=array('h',[0])*128000
        for x,y in [(16000,30400),(40000,87680),(95040,104000)]:pcm[x:y]=array('h',[3000])*(y-x)
        return a,pcm

    def test_local_pause_preserves_weak_tail_and_excludes_it_from_next_verse(self):
        self.assertIsNotNone(importlib.util.find_spec('word_pause'),'Local word clocks and original pause must support a precise shared cut')
        from word_pause import repair_word_pause,word_pause_measurements_match
        from boundary_quality import verified_boundary_artifact
        a,pcm=self.fixture();old=copy.deepcopy(a);r=repair_word_pause(a,2,pcm)
        self.assertTrue(r['accepted']);self.assertTrue(verified_boundary_artifact(r));self.assertTrue(word_pause_measurements_match(r,pcm))
        self.assertEqual(r['cues'][1]['end'],5.54);self.assertEqual(r['cues'][2]['start'],5.54)
        self.assertGreater(r['cues'][1]['end'],5.45);self.assertLess(r['cues'][2]['start'],5.94)
        self.assertEqual(r['recognition'],old['recognition'])
        for before,after in zip(old['checks'],r['checks']):
            self.assertEqual(after['alignedWords'],before['alignedWords']);self.assertEqual(after['asrEdgeAnchors'],before['asrEdgeAnchors'])
        self.assertTrue(verified_boundary_artifact(json.loads(json.dumps(r))));self.assertEqual(a,old)

    def test_unconfirmed_word_unreliable_next_head_and_missing_pause_are_not_accepted(self):
        from word_pause import repair_word_pause
        for change in ['word','low-probability','weak-next','loud-gap','text']:
            a,pcm=self.fixture()
            if change=='word':a['checks'][1]['asrEdgeAnchors'][-1]['word']='other'
            if change=='low-probability':a['checks'][1]['asrEdgeAnchors'][-1]['probability']=.5
            if change=='weak-next':a['checks'][2]['alignedWords'][0]['score']=.1
            if change=='loud-gap':pcm[87680:95040]=array('h',[10000])*(95040-87680)
            if change=='text':a['boundarySourceVerses'][1]['text']='Different source'
            self.assertFalse(repair_word_pause(a,2,pcm)['accepted'],change)

    def test_altered_clip_clocks_or_recipe_cannot_bypass_validation(self):
        from word_pause import repair_word_pause,word_pause_measurements_match
        from boundary_quality import verified_boundary_artifact
        a,pcm=self.fixture();r=repair_word_pause(a,2,pcm)
        for change in ['range','clock','legacy','proof','score']:
            x=copy.deepcopy(r)
            if change=='range':x['cues'][2]['start']-=.2
            if change=='clock':x['checks'][1]['asrEdgeAnchors'][-1]['end']+=.3
            if change=='legacy':x['qualityRecipe']=a['qualityRecipe']
            if change=='proof':x['wordPauseReview']['proofs']=[]
            if change=='score':x['checks'][1]['alignedWords'][-1]['score']=1
            self.assertFalse(verified_boundary_artifact(x),change)
        noisy=array('h',pcm);noisy[88000:90000]=array('h',[10000])*2000
        self.assertFalse(word_pause_measurements_match(r,noisy))

    def test_publication_requires_both_materialized_ranges_to_match(self):
        from word_pause import repair_word_pause
        from alignment_contract import METHOD,BOUNDARY_RECOGNIZER
        from publish_site import recording_entry
        a,pcm=self.fixture();r=repair_word_pause(a,2,pcm)
        r.update(method=METHOD,recognizer=BOUNDARY_RECOGNIZER,vttSha256='b'*64,vttFile='b'*64+'.vtt')
        r['verseFiles']=[{'verse':c['verse'],'sourceStart':c['start'],'sourceEnd':c['end'],'duration':c['end']-c['start'],
            'sha256':'c'*64,'path':'/api/audio/resources/'+'c'*64+'.mp3'} for c in r['cues']]
        receipt={'key':r['key'],'locale':'en','sha256':'a'*64,'duration':8,'path':'/source.mp3','url':'https://example.com/source.mp3'}
        self.assertEqual(recording_entry(receipt,r,r['textSha256'])['alignmentStatus'],'aligned')
        r['verseFiles'][2]['sourceStart']-=.1
        self.assertEqual(recording_entry(receipt,r,r['textSha256'])['alignmentStatus'],'pending')

    def test_local_pause_uses_adjacent_spoken_words_as_its_volume_reference(self):
        from word_pause import repair_word_pause,word_pause_measurements_match
        a,pcm=self.fixture();pcm[87680:95040]=array('h',[550])*(95040-87680)
        r=repair_word_pause(a,2,pcm)
        self.assertTrue(r['accepted']);self.assertTrue(word_pause_measurements_match(r,pcm))

if __name__=='__main__':unittest.main()
