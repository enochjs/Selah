import copy,sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))

class ReadingOrderTests(unittest.TestCase):
    def verses(self):
        return [{'number':12,'text':'所以你们必不得领这会众进我所赐给他们的地去。'},
          {'number':13,'text':'这水名叫米利巴水（米利巴就是争闹的意思），是因以色列人向耶和华争闹，耶和华就在他们面前显为圣。'},
          {'number':14,'text':'摩西从加低斯差遣使者去见以东王。'}]

    def test_source_explanation_can_follow_its_own_verse_body_without_changing_canonical_text(self):
        from reading_order import reading_references
        source=self.verses();before=copy.deepcopy(source);result=reading_references('numbers:20:zh',source)
        self.assertEqual(result[1]['text'],'这水名叫米利巴水，是因以色列人向耶和华争闹，耶和华就在他们面前显为圣。米利巴就是争闹的意思')
        self.assertEqual(result[0],source[0]);self.assertEqual(result[2],source[2]);self.assertEqual(source,before)
        for key in ['numbers:20:en','numbers:21:zh','john:7:en']:
            with self.assertRaises(ValueError):reading_references(key,source)
        source[1]['text']=source[1]['text'].replace('米利巴就是争闹的意思','有古卷无此句')
        with self.assertRaises(ValueError):reading_references('numbers:20:zh',source)

    def artifact(self):
        from reading_order import reading_references
        from alignment_contract import CASE_REVIEW_RECIPE,PADDING_REVIEW_RECIPE,METHOD,BOUNDARY_RECOGNIZER,site_fingerprint
        from case_evidence import CASE_POLICY
        from partial_audio import source_text_sha
        from boundary_quality import POLICY,verse_boundary
        source=self.verses();refs=reading_references('numbers:20:zh',source);cues=[];checks=[]
        for i,v in enumerate(refs):
            text=v['text'];words=[{'word':w,'start':1+i*16+j*.2,'end':1+i*16+j*.2+.18,'score':.95} for j,w in enumerate(text)]
            bounds=[i*16,i*16+15];signal={'headRms':.1,'tailRms':.1,'verseRms':.1};edges,ev=verse_boundary(words,bounds,50,'zh',reference=text,signal=signal);self.assertIsNotNone(edges)
            cues.append({'verse':v['number'],'text':text,'start':edges[0],'end':edges[1]});checks.append({'verse':v['number'],'text':text,'spokenText':text,'alignedWords':words,'searchRange':bounds,'boundarySignal':signal,'boundaryEvidence':ev,'boundaryVerified':True,'asrEdgeAnchors':[]})
        sha=source_text_sha(refs);a={'key':'numbers:20:zh','sourceAudioSha256':'a'*64,'duration':50,'qualityRecipe':CASE_REVIEW_RECIPE,'method':METHOD,'recognizer':BOUNDARY_RECOGNIZER,'accepted':True,'issues':[],'textSha256':sha,'fingerprint':site_fingerprint('a'*64,sha,'zh',CASE_REVIEW_RECIPE,BOUNDARY_RECOGNIZER),'boundaryPolicy':POLICY,'verificationScope':'verse-boundaries','boundarySourceVerses':refs,'expectedVerseNumbers':[12,13,14],'cues':cues,'checks':checks,'recognition':[],'unclaimedSpeech':[],'caseReviewPolicy':CASE_POLICY,'caseBaseRecipe':PADDING_REVIEW_RECIPE}
        return source,a

    def test_full_source_words_and_boundaries_remain_proven_under_the_canonical_text(self):
        from reading_order import wrap_reading_order,reading_order_witness
        from boundary_quality import verified_boundary_artifact
        source,inner=self.artifact();r=wrap_reading_order(source,inner)
        self.assertTrue(verified_boundary_artifact(r));self.assertEqual(r['boundarySourceVerses'],source);self.assertEqual(r['cues'][1]['text'],source[1]['text']);self.assertEqual(reading_order_witness(r)['checks'][1]['alignedWords'],inner['checks'][1]['alignedWords'])
        for change in ['text','words','cue','identity','plan']:
            a=copy.deepcopy(r)
            if change=='text':a['boundarySourceVerses'][1]['text']+='篡改'
            if change=='words':a['checks'][1]['alignedWords'].pop()
            if change=='cue':a['cues'][1]['end']-=.2
            if change=='identity':a['qualityRecipe']=inner['qualityRecipe']
            if change=='plan':a['readingOrderReview']['changedVerses']=[12]
            self.assertFalse(verified_boundary_artifact(a),change)

    def test_publication_requires_new_files_matching_the_complete_reordered_verse(self):
        from reading_order import wrap_reading_order
        from publish_site import recording_entry
        source,inner=self.artifact();r=wrap_reading_order(source,inner);r.update(vttFile='b'*64+'.vtt',vttSha256='b'*64)
        r['verseFiles']=[{'verse':c['verse'],'sourceStart':c['start'],'sourceEnd':c['end'],'duration':c['end']-c['start'],'sha256':'c'*64,'path':'/api/audio/resources/'+'c'*64+'.mp3'} for c in r['cues']]
        receipt={'key':r['key'],'locale':'zh','sha256':'a'*64,'duration':50,'path':'/source.mp3','url':'https://source.test/audio.mp3'}
        self.assertEqual(recording_entry(receipt,r,r['textSha256'])['alignmentStatus'],'aligned');r['verseFiles'][1]['sourceEnd']-=.1;self.assertEqual(recording_entry(receipt,r,r['textSha256'])['alignmentStatus'],'pending')

if __name__=='__main__':unittest.main()
