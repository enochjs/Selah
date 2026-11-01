"""A nonnarrated doxology stays in canonical text with explicit source evidence."""
import copy,hashlib,json,sys,unittest
from pathlib import Path
from array import array
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))


class AbsentFragmentTests(unittest.TestCase):
    def fixture(self):
        prefix='And lead us not into temptation,but deliver us from the evil one.'
        suffix='For Yours is the kingdom and the power and the glory forever. Amen.’'
        verses=[dict(number=i,text='They came.') for i in range(1,35)]
        verses[12]['text']=prefix+suffix
        html='<div class="passage-col version-NIV" data-translation="NIV"><div class="passage-text">'+''.join('<span class="text Matt-6-'+str(i)+'">'+(prefix if i==13 else 'They came.')+'</span>' for i in range(1,35))+'</div></div>'
        evidence=dict(schemaVersion=1,edition='NIV',key='matthew:6:en',bookId='matthew',chapter=6,
            url='https://www.biblegateway.com/passage/?search=Matthew%206&version=NIV',fetchedAt='2026-10-27T10:00:00+00:00',
            rawHtml=html,sha256=hashlib.sha256(html.encode()).hexdigest(),presentVerseNumbers=list(range(1,35)),missingVerseNumbers=[])
        return verses,evidence,dict(verse=13,narratedText=prefix,missingText=suffix)

    def test_official_body_proves_exact_narrated_prefix_without_changing_canonical(self):
        from reviewed_absent_fragments import fragment_reference
        verses,e,part=self.fixture();before=copy.deepcopy(verses)
        refs,missing=fragment_reference('matthew:6:en',verses,e,part)
        self.assertEqual(refs[12]['text'],part['narratedText'])
        self.assertEqual(missing,[dict(verse=13,text=part['missingText'],reason='not-narrated-in-source')])
        self.assertEqual(verses,before)

    def test_cannot_drop_any_narrated_scripture_or_use_a_different_edition(self):
        from reviewed_absent_fragments import fragment_reference
        for change in ['prefix','suffix','verse','html','edition','key']:
            verses,e,part=self.fixture();key='matthew:6:en'
            if change=='prefix':part['narratedText']=part['narratedText'].replace('deliver us','')
            if change=='suffix':part['missingText']='Some other absent sentence'
            if change=='verse':part['verse']=12
            if change=='html':e['rawHtml']=e['rawHtml'].replace('evil one.','evil one. For Yours is the kingdom.')
            if change=='edition':e['edition']='KJV'
            if change=='key':key='matthew:7:en'
            with self.assertRaises(ValueError,msg=change):fragment_reference(key,verses,e,part)

    def test_actual_speech_or_loud_tail_cannot_be_marked_absent(self):
        from reviewed_absent_fragments import measure_absent_tail,absent_tail_valid
        pcm=array('h',[0])*32000;pcm[0:16000]=array('h',[8000])*16000
        proof=measure_absent_tail(pcm,[16000,32000],[0,16000],[[0,16000]])
        self.assertTrue(absent_tail_valid(proof))
        with self.assertRaises(ValueError):measure_absent_tail(pcm,[16000,32000],[0,16000],[[0,16000],[18000,19000]])
        pcm[18000:19000]=array('h',[8000])*1000
        self.assertFalse(absent_tail_valid(measure_absent_tail(pcm,[16000,32000],[0,16000],[[0,16000]])))

    def test_low_continuous_background_music_without_voice_is_retained(self):
        from reviewed_absent_fragments import measure_absent_tail,absent_tail_valid
        pcm=array('h',[2000])*16000+array('h',[650])*16000
        self.assertTrue(absent_tail_valid(measure_absent_tail(pcm,[16000,32000],[0,16000],[[0,16000]])))

if __name__=='__main__':unittest.main()
