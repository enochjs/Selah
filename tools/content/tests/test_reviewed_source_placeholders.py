"""An imported editorial placeholder must never masquerade as missing NIV text."""
import copy,hashlib,sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))


class SourcePlaceholderTests(unittest.TestCase):
    def fixture(self):
        from test_source_omissions import evidence
        v=[dict(number=i,text='They came.') for i in range(1,16)]
        v[13]['text']='I hope to see you. Peace to you.';v[14]['text']='Note: no this verse in english bible version.'
        html='<div class="passage-col version-NIV" data-translation="NIV"><div class="passage-text">'+''.join('<span class="text 3John-1-'+str(i)+'">'+('I hope to see you.' if i==14 else 'Peace to you.' if i==15 else 'They came.')+'</span>' for i in range(1,16))+'</div></div>'
        e=evidence(html,key='3-john:1:en',book='3%20John',present=list(range(1,16)),last=15)
        return v,e

    def test_actual_niv_last_verse_must_already_be_retained_in_the_previous_imported_row(self):
        from reviewed_source_placeholders import placeholder_reference
        v,e=self.fixture();before=copy.deepcopy(v);refs,missing,mapping=placeholder_reference('3-john:1:en',v,e)
        self.assertEqual(v,before);self.assertEqual([x['number'] for x in refs],list(range(1,15)))
        self.assertEqual(missing,[dict(verse=15,reason='not-narrated-in-source')])
        self.assertEqual(mapping['officialVerses'],[14,15]);self.assertEqual(mapping['narratedImportedVerse'],14)

    def test_a_real_unretained_verse_or_different_editorial_text_cannot_be_skipped(self):
        from reviewed_source_placeholders import placeholder_reference
        for change in ['real-verse','lost-niv15','wrong-key','wrong-edition','changed-http']:
            v,e=self.fixture();key='3-john:1:en'
            if change=='real-verse':v[14]['text']='Peace to you.'
            if change=='lost-niv15':v[13]['text']='I hope to see you.'
            if change=='wrong-key':key='2-john:1:en'
            if change=='wrong-edition':e['edition']='KJV'
            if change=='changed-http':e['rawHtml']=e['rawHtml'].replace('Peace to you.','Another sentence.')
            with self.assertRaises(ValueError,msg=change):placeholder_reference(key,v,e)

if __name__=='__main__':unittest.main()
