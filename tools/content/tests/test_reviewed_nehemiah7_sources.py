"""Repeated NIV table rows retain their true verse IDs and original imported reading text."""
import copy,hashlib,json,sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))

class NehemiahCompletedSourceTests(unittest.TestCase):
    def fixture(self):
        from test_source_omissions import chapter_html,evidence
        from quiet_gaps import digest
        selected=[39,43,44,45,46,57,59,62,63];raw=chapter_html(book='Neh',chapter=7,last=73,missing=())
        for v in selected:raw=raw.replace(f'Spoken verse {v}.</span>',f'Spoken verse {v}.</span><span class="text Neh-7-{v}">Names and count {v}</span>')
        ref=evidence(raw,key='nehemiah:7:en',book='Nehemiah',present=list(range(1,74)),last=73);b=dict(key='nehemiah:7:en',boundarySourceVerses=[dict(number=v,text=f'Spoken verse {v}.') for v in range(1,74)]);m=[dict(file='base.json',utf8=json.dumps(b)),dict(file='ref.json',utf8=json.dumps(ref))];r=dict(baseEvidenceSha256=digest(b),baseReportFile='base.json',referenceFile='ref.json',evidence=[dict(file=x['file'],sha256=hashlib.sha256(x['utf8'].encode()).hexdigest()) for x in m]);return b,r,m

    def test_all_nine_truncated_table_rows_get_only_their_own_verified_same_edition_source_fragments(self):
        try:from reviewed_nehemiah7_sources import nehemiah_completed_refs
        except ImportError:self.fail('The table continuation needs its own source proof rather than truncating real narration')
        b,r,m=self.fixture();before=copy.deepcopy(b);refs=nehemiah_completed_refs(b,r,m);self.assertEqual(b,before);self.assertTrue(refs[38]['text'].endswith('Names and count 39'));self.assertEqual(refs[37],b['boundarySourceVerses'][37])

    def test_another_verse_wrong_edition_or_missing_table_fragment_is_rejected(self):
        try:from reviewed_nehemiah7_sources import nehemiah_completed_refs
        except ImportError:self.fail('The table continuation needs its own source proof rather than truncating real narration')
        for kind in ['chapter','edition','fragment','canonical']:
            b,r,m=self.fixture()
            if kind=='chapter':b['key']='nehemiah:8:en'
            if kind=='canonical':b['boundarySourceVerses'][38]['text']='Other text'
            if kind in {'edition','fragment'}:
                d=json.loads(m[1]['utf8']);d['rawHtml']=d['rawHtml'].replace('data-translation="NIV"','data-translation="KJV"') if kind=='edition' else d['rawHtml'].replace('<span class="text Neh-7-39">Names and count 39</span>','');d['sha256']=hashlib.sha256(d['rawHtml'].encode()).hexdigest();m[1]['utf8']=json.dumps(d);r['evidence'][1]['sha256']=hashlib.sha256(m[1]['utf8'].encode()).hexdigest()
            with self.assertRaises(ValueError,msg=kind):nehemiah_completed_refs(b,r,m)

class NumericOriginalContextTests(unittest.TestCase):
    def test_numeric_wrapper_replays_padding_under_its_original_model_identity(self):
        try:from reviewed_nehemiah7_sources import nehemiah_original_context
        except ImportError:self.fail('Numeric joint padding must replay under the preserved model recipe')
        from alignment_contract import NUMERIC_REVIEW_RECIPE,PADDING_REVIEW_RECIPE,BOUNDARY_RECOGNIZER,site_fingerprint
        from numeric_alignment import NUMERIC_POLICY
        b=dict(key='nehemiah:7:en',sourceAudioSha256='a'*64,textSha256='b'*64,qualityRecipe=NUMERIC_REVIEW_RECIPE,numericBaseRecipe=PADDING_REVIEW_RECIPE,numericAlignmentPolicy=NUMERIC_POLICY,jointAlignments=[dict(id='original')],checks=[dict(verse=1,alignedWords=[dict(word='1',numericExpansion=dict(words=[]))])]);before=copy.deepcopy(b);w=nehemiah_original_context(b)
        self.assertEqual(b,before);self.assertEqual(w['qualityRecipe'],PADDING_REVIEW_RECIPE);self.assertEqual(w['jointAlignments'],b['jointAlignments']);self.assertEqual(w['checks'],b['checks']);self.assertNotIn('numericAlignmentPolicy',w);self.assertEqual(w['fingerprint'],site_fingerprint('a'*64,'b'*64,'en',PADDING_REVIEW_RECIPE,BOUNDARY_RECOGNIZER))
