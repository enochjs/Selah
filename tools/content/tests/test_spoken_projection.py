import importlib.util
from pathlib import Path
import sys
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))

class SpokenProjectionTests(unittest.TestCase):
    def module(self):
        self.assertIsNotNone(importlib.util.find_spec('spoken_projection'))
        import spoken_projection
        return spoken_projection

    def test_nested_psalm_heading_is_metadata_while_scripture_parentheses_remain(self):
        m=self.module()
        self.assertEqual(m.project_text('psalms:120:zh',1,'（上行（或作登阶。下同）之诗。）我在急难中求告耶和华。'),'我在急难中求告耶和华。')
        self.assertEqual(m.project_text('exodus:16:zh',36,'（俄梅珥乃伊法十分之一）。'),'（俄梅珥乃伊法十分之一）。')
        # Keep spoken explanations; the separately source-attested Mark15:22 gloss
        # is covered by the exact-context boundary regression.
        body='西门（就是亚力山大和鲁孚的父亲）'
        self.assertEqual(m.project_text('mark:15:zh',21,body),body)

    def test_only_attested_editorial_note_in_the_exact_source_verse_is_removed(self):
        m=self.module()
        text='因为神的国就在你们心里。心里或作中间'
        self.assertEqual(m.project_text('luke:17:zh',21,text),'因为神的国就在你们心里。')
        self.assertEqual(m.project_text('luke:17:zh',22,text),text)
        self.assertEqual(m.project_text('luke:17:en',21,text),text)

    def test_projection_is_deterministically_bound_to_original_reading_text(self):
        m=self.module();verses=[{'number':1,'text':'（称谢诗。）普天下当向耶和华欢呼。'}]
        meta=m.projection_for('psalms:100:zh',verses)
        self.assertEqual(meta['texts'][0]['reference'],'普天下当向耶和华欢呼。')
        self.assertNotEqual(meta,m.projection_for('psalms:100:zh',[{'number':1,'text':'改变的原文'}]))

    def test_publisher_checks_projected_words_but_keeps_full_canonical_text_sha(self):
        import copy,hashlib,json
        m=self.module()
        from alignment_contract import PROJECTION_REVIEW_RECIPE
        from boundary_quality import POLICY,verse_boundary,verified_boundary_artifact
        from timed_text import normalized
        text='因为神的国就在你们心里。心里或作中间';key='luke:17:zh'
        verses=[{'number':21,'text':text}];reference=m.project_text(key,21,text)
        words=[{'word':char,'start':2+i*.15,'end':2+i*.15+.1,'score':.9} for i,char in enumerate(normalized(reference))]
        signal={'headRms':.1,'tailRms':.1,'verseRms':.1}
        edges,evidence=verse_boundary(words,[1,6],10,'zh',reference=reference,signal=signal)
        self.assertIsNotNone(edges)
        artifact={'key':key,'sourceAudioSha256':'a'*64,'duration':10,'accepted':True,'issues':[],
            'verificationScope':'verse-boundaries','boundaryPolicy':dict(POLICY),
            'qualityRecipe':PROJECTION_REVIEW_RECIPE,'boundarySourceVerses':verses,'expectedVerseNumbers':[21],
            'textSha256':hashlib.sha256(json.dumps(verses,ensure_ascii=False,sort_keys=True).encode()).hexdigest(),
            'spokenProjection':m.projection_for(key,verses),'unclaimedSpeech':[],
            'cues':[{'verse':21,'text':text,'start':edges[0],'end':edges[1]}],
            'checks':[{'verse':21,'text':text,'alignedWords':words,'searchRange':[1,6],
                       'boundarySignal':signal,'asrEdgeAnchors':[],'boundaryVerified':True,'boundaryEvidence':evidence}]}
        self.assertTrue(verified_boundary_artifact(artifact))
        changed=copy.deepcopy(artifact);changed['spokenProjection']['texts'][0]['reference']='神'
        self.assertFalse(verified_boundary_artifact(changed))
        changed=copy.deepcopy(artifact);changed.pop('spokenProjection')
        self.assertFalse(verified_boundary_artifact(changed))
        self.assertEqual(artifact['cues'][0]['text'],text)

if __name__=='__main__':unittest.main()
