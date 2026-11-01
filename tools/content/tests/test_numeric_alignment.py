import copy
import importlib.util
from pathlib import Path
import sys
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))

class NumericAlignmentTests(unittest.TestCase):
    def module(self):
        self.assertIsNotNone(importlib.util.find_spec('numeric_alignment'))
        import numeric_alignment
        return numeric_alignment

    def test_cardinals_expand_before_acoustic_alignment_and_preserve_source_tokens(self):
        m=self.module();text='When Lamech had lived 182 years, he had a son.'
        expanded,groups=m.expansion(text,'en','and')
        self.assertEqual(expanded,'When Lamech had lived one hundred and eighty two years he had a son')
        words=[{'word':w,'start':1+i*.2,'end':1+i*.2+.15,'score':.9} for i,w in enumerate(expanded.split())]
        collapsed=m.collapse_words(words,groups,'and')
        self.assertEqual([w['word'] for w in collapsed],text.split())
        number=collapsed[4]
        self.assertAlmostEqual(number['end']-number['start'],.95)
        self.assertTrue(m.numeric_words_verified(collapsed,text))
        self.assertEqual(text,'When Lamech had lived 182 years, he had a son.')

    def test_thousands_punctuation_and_supported_and_variants(self):
        m=self.module()
        self.assertEqual(m.expansion('men—18,000; 603,550.','en','plain')[0],
                         'men eighteen thousand six hundred three thousand five hundred fifty')
        self.assertEqual(m.expansion('182','en','plain')[0],'one hundred eighty two')
        with self.assertRaises(ValueError):m.expansion('第182节','zh','plain')
        with self.assertRaises(ValueError):m.expansion('1.5','en','plain')
        with self.assertRaises(ValueError):m.expansion('Isa 53:12','en','plain')

    def test_missing_changed_or_fabricated_expanded_evidence_is_rejected(self):
        m=self.module();text='He had 182 sons.'
        expanded,groups=m.expansion(text,'en','plain')
        raw=[{'word':w,'start':1+i*.2,'end':1+i*.2+.15,'score':.9} for i,w in enumerate(expanded.split())]
        good=m.collapse_words(raw,groups,'plain')
        for change in ['missing','wrong-word','range','score','order']:
            x=copy.deepcopy(good);number=x[2]
            if change=='missing':number.pop('numericExpansion')
            if change=='wrong-word':number['numericExpansion']['words'][0]['word']='two'
            if change=='range':number['end']-=.2
            if change=='score':number['score']=1
            if change=='order':number['numericExpansion']['words'][1]['start']=0
            self.assertFalse(m.numeric_words_verified(x,text),change)
        with self.assertRaises(ValueError):m.collapse_words(raw[:-1],groups,'plain')

    def fixture(self):
        m=self.module()
        from alignment_contract import NUMERIC_REVIEW_RECIPE,BOUNDARY_REVIEW_RECIPE
        from boundary_quality import verse_boundary,verified_boundary_artifact,POLICY
        from partial_audio import source_text_sha
        from spoken_text import boundary_text
        source=[{'number':28,'text':'He had 182 sons.'}]
        expanded,groups=m.expansion(source[0]['text'],'en','plain')
        raw=[{'word':w,'start':2+i*.2,'end':2+i*.2+.15,'score':.9} for i,w in enumerate(expanded.split())]
        words=m.collapse_words(raw,groups,'plain');signal={'headRms':.1,'tailRms':.1,'verseRms':.1}
        edges,evidence=verse_boundary(words,[1,5],6,'en',reference=boundary_text(source[0]['text'],'en'),signal=signal)
        a={'key':'genesis:5:en','sourceAudioSha256':'a'*64,'textSha256':source_text_sha(source),
           'qualityRecipe':NUMERIC_REVIEW_RECIPE,'numericBaseRecipe':BOUNDARY_REVIEW_RECIPE,
           'numericAlignmentPolicy':m.NUMERIC_POLICY,'duration':6,'accepted':True,'issues':[],
           'verificationScope':'verse-boundaries','boundaryPolicy':POLICY,'boundarySourceVerses':source,
           'expectedVerseNumbers':[28],'unclaimedSpeech':[],'recognition':[],
           'checks':[{'verse':28,'text':source[0]['text'],'alignedWords':words,'boundaryVerified':True,
                      'searchRange':[1,5],'boundarySignal':signal,'asrEdgeAnchors':[],'boundaryEvidence':evidence}],
           'cues':[{'verse':28,'text':source[0]['text'],'start':edges[0],'end':edges[1]}]}
        return a

    def test_numeric_recipe_checks_evidence_and_canonical_source_before_publication(self):
        from boundary_quality import verified_boundary_artifact
        from alignment_contract import NUMERIC_REVIEW_RECIPE
        a=self.fixture()
        self.assertTrue(verified_boundary_artifact(a))
        for change in ['policy','source','missing','recipe']:
            x=copy.deepcopy(a)
            if change=='policy':x['numericAlignmentPolicy']={}
            if change=='source':x['boundarySourceVerses'][0]['text']='He had 183 sons.'
            if change=='missing':x['checks'][0]['alignedWords'][2].pop('numericExpansion')
            if change=='recipe':x['numericBaseRecipe']=NUMERIC_REVIEW_RECIPE
            self.assertFalse(verified_boundary_artifact(x),change)

    def publication_fixture(self):
        from alignment_contract import METHOD,NUMERIC_REVIEW_RECIPE,BOUNDARY_RECOGNIZER,RECOGNIZERS,site_fingerprint
        from publish_site import recording_entry
        a=self.fixture();cue=a['cues'][0]
        a.update(method=METHOD,recognizer=BOUNDARY_RECOGNIZER,recognizerRevision=RECOGNIZERS[BOUNDARY_RECOGNIZER],
                 fingerprint=site_fingerprint('a'*64,a['textSha256'],'en',NUMERIC_REVIEW_RECIPE,BOUNDARY_RECOGNIZER),
                 vttFile='c'*64+'.vtt',vttSha256='c'*64,
                 verseFiles=[{'verse':28,'path':'/api/audio/resources/'+'b'*64+'.mp3','sha256':'b'*64,
                              'duration':cue['end']-cue['start'],'sourceStart':cue['start'],'sourceEnd':cue['end']}])
        receipt={'key':a['key'],'sha256':'a'*64,'locale':'en','duration':6,'path':'/source.mp3','url':'https://source.test/audio.mp3'}
        return a,receipt

    def test_publisher_requires_exact_numeric_clips_and_ranges(self):
        from publish_site import recording_entry
        a,receipt=self.publication_fixture()
        self.assertEqual(recording_entry(receipt,a,a['textSha256'])['alignmentStatus'],'aligned')
        for change in ['missing','range','extra','alias']:
            x=copy.deepcopy(a)
            if change=='missing':x['verseFiles']=[]
            if change=='range':x['verseFiles'][0]['sourceEnd']-=.2
            if change=='extra':x['verseFiles'].append(copy.deepcopy(x['verseFiles'][0]))
            if change=='alias':x['verseFiles'][0]['coveredVerses']=[28,29]
            self.assertEqual(recording_entry(receipt,x,x['textSha256'])['alignmentStatus'],'pending',change)

    def test_numeric_cache_checks_current_source_and_repairs_materialized_files(self):
        import tempfile,json
        from unittest.mock import patch
        from numeric_review import NumericBoundaryAligner
        a,receipt=self.publication_fixture()
        with tempfile.TemporaryDirectory() as folder:
            engine=object.__new__(NumericBoundaryAligner);engine.snapshot=Path(folder)
            engine.locale='en';(engine.snapshot/'alignment').mkdir()
            path=engine.snapshot/'alignment/genesis__5__en.json';path.write_text(json.dumps(a))
            with patch('numeric_review.SiteAligner.materialize') as materialize, patch('numeric_review.SiteAligner.align_recording',return_value={'fresh':True}) as fresh:
                result=engine.align_recording(receipt,a['boundarySourceVerses'])
                self.assertEqual(result['qualityRecipe'],a['qualityRecipe'])
                materialize.assert_called_once();fresh.assert_not_called()
            for changed_receipt,changed_verses in [({**receipt,'sha256':'d'*64},a['boundarySourceVerses']),
                                                 (receipt,[{'number':28,'text':'He had 183 sons.'}])]:
                with patch('numeric_review.SiteAligner.align_recording',return_value={'fresh':True}) as fresh:
                    self.assertEqual(engine.align_recording(changed_receipt,changed_verses),{'fresh':True})
                    fresh.assert_called_once()

    def test_acoustic_model_receives_spoken_number_words(self):
        import types
        from unittest.mock import patch
        self.assertIsNotNone(importlib.util.find_spec('numeric_review'))
        from numeric_review import NumericBoundaryAligner
        engine=object.__new__(NumericBoundaryAligner)
        engine.model=None;engine.metadata={};engine.device='cpu';engine.locale='en'
        calls=[]
        def align(segments,*args,**kwargs):
            text=segments[0]['text'];calls.append(text)
            return {'segments':[{'words':[{'word':w,'start':1+i*.2,'end':1+i*.2+.15,'score':.9}
                                          for i,w in enumerate(text.split())]}]}
        with patch.dict(sys.modules,{'whisperx.alignment':types.SimpleNamespace(align=align)}):
            result=engine.word_candidates([], 'He had 182 sons.',[0,5])
        self.assertTrue(result)
        self.assertTrue(all(not any(char.isdigit() for char in text) for text in calls))
        self.assertTrue(all(self.module().numeric_words_verified(words,'He had 182 sons.') for words in result))

    def test_number_mean_score_cannot_hide_weak_actual_edge(self):
        m=self.module()
        from boundary_quality import verse_boundary
        for text,index in [('He had 182.',-1),('182 sons lived.',0)]:
            expanded,groups=m.expansion(text,'en','plain')
            raw=[{'word':w,'start':1+i*.2,'end':1+i*.2+.15,'score':.99} for i,w in enumerate(expanded.split())]
            raw[index]['score']=.1
            words=m.collapse_words(raw,groups,'plain')
            cue,evidence=verse_boundary(words,[0,5],6,'en',reference=text,signal={'headRms':.1,'tailRms':.1,'verseRms':.1})
            self.assertIsNone(cue)
            self.assertIn('weak-edge-word',evidence['reasons'])

    def test_model_float_values_are_accepted_but_booleans_are_not(self):
        m=self.module()
        class ModelFloat(float):pass
        _,groups=m.expansion('182','en','plain')
        raw=[{'word':w,'start':ModelFloat(1+i*.2),'end':ModelFloat(1+i*.2+.15),'score':ModelFloat(.9)}
             for i,w in enumerate(groups[0]['words'])]
        self.assertTrue(m.collapse_words(raw,groups,'plain'))
        raw[0]['score']=True
        with self.assertRaises(ValueError):m.collapse_words(raw,groups,'plain')

    def test_unchanged_nonnumeric_evidence_is_rechecked_without_reusing_numeric_times(self):
        from test_boundary_context_review import BoundaryContextTests
        import numeric_review
        self.assertTrue(hasattr(numeric_review,'restore_nonnumeric_boundaries'))
        _,receipt,original,_=BoundaryContextTests().fixture()
        fresh=copy.deepcopy(original)
        fresh['cues']=[c for c in fresh['cues'] if c['verse']!=4]
        fresh['checks'][-1]['boundaryVerified']=False
        fresh['checks'][-1]['alignedWords'][-1]['score']=.1
        fresh['issues'].append('unreliable-verse-boundary:4')
        self.assertEqual(numeric_review.restore_nonnumeric_boundaries(fresh,original,receipt),[4])
        self.assertNotIn('unreliable-verse-boundary:4',fresh['issues'])
        self.assertIn('unreliable-verse-boundary:2',fresh['issues'])
        changed=copy.deepcopy(original);changed['textSha256']='f'*64
        self.assertEqual(numeric_review.restore_nonnumeric_boundaries(fresh,changed,receipt),[])
        fresh=copy.deepcopy(original);fresh['cues']=[c for c in fresh['cues'] if c['verse']!=4]
        old=copy.deepcopy(original);old['checks'][-1].pop('alignedWords')
        self.assertEqual(numeric_review.restore_nonnumeric_boundaries(fresh,old,receipt),[])

if __name__=='__main__':unittest.main()
