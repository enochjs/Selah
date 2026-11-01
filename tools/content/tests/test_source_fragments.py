import copy,hashlib,sys,unittest
from pathlib import Path
from array import array
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))

class SourceFragmentTests(unittest.TestCase):
    def fixture(self):
        from alignment_contract import CASE_REVIEW_RECIPE,PADDING_REVIEW_RECIPE,METHOD,BOUNDARY_RECOGNIZER,site_fingerprint
        from case_evidence import CASE_POLICY
        from boundary_quality import POLICY,verse_boundary
        from partial_audio import source_text_sha
        body='They replied, “Are you from Galilee, too? Look into it, and you will find that a prophet does not come out of Galilee.”';suffix='Then they all went home'
        canonical=[{'number':i,'text':'They came home.'} for i in range(1,52)]+[{'number':52,'text':body+suffix}];refs=copy.deepcopy(canonical);refs[-1]['text']=body
        raw='<div class="passage-col version-NIV" data-translation="NIV"><div class="passage-text">'+''.join('<p><span class="text John-7-'+str(v['number'])+'">'+v['text']+'</span></p>' for v in refs)+'<p><span class="text John-7-53">Then they all went home,</span></p></div></div>'
        evidence={'key':'john:7:en','edition':'NIV','url':'https://www.biblegateway.com/passage/?search=John%207&version=NIV','rawHtml':raw,'sha256':hashlib.sha256(raw.encode()).hexdigest(),'fetchedAt':'2026-10-26T12:00:00+08:00'}
        cues=[];checks=[];duration=530.;pcm=array('h',[0])*round(duration*16000);speech=[]
        for i,v in enumerate(refs):
            start=1+i*10;words=[{'word':w,'start':start+j*.3,'end':start+j*.3+.24,'score':.95} for j,w in enumerate(v['text'].split())];bounds=[start-.5,start+9.5];signal={'headRms':.1,'tailRms':.1,'verseRms':.1};edges,ev=verse_boundary(words,bounds,duration,'en',reference=v['text'],signal=signal);self.assertIsNotNone(edges,str(ev));cues.append({'verse':v['number'],'text':v['text'],'start':edges[0],'end':edges[1]});checks.append({'verse':v['number'],'text':v['text'],'spokenText':v['text'],'alignedWords':words,'searchRange':bounds,'boundarySignal':signal,'boundaryEvidence':ev,'boundaryVerified':True,'asrEdgeAnchors':[]});lo,hi=round(words[0]['start']*16000),round(words[-1]['end']*16000);speech.append([lo,hi]);pcm[lo:hi]=array('h',[5000])*(hi-lo)
        sha=source_text_sha(refs);a={'key':'john:7:en','sourceAudioSha256':'a'*64,'duration':duration,'qualityRecipe':CASE_REVIEW_RECIPE,'method':METHOD,'recognizer':BOUNDARY_RECOGNIZER,'accepted':True,'issues':[],'textSha256':sha,'fingerprint':site_fingerprint('a'*64,sha,'en',CASE_REVIEW_RECIPE,BOUNDARY_RECOGNIZER),'boundaryPolicy':POLICY,'verificationScope':'verse-boundaries','boundarySourceVerses':refs,'expectedVerseNumbers':list(range(1,53)),'cues':cues,'checks':checks,'recognition':[],'unclaimedSpeech':[],'caseReviewPolicy':CASE_POLICY,'caseBaseRecipe':PADDING_REVIEW_RECIPE}
        return canonical,a,evidence,pcm,speech

    def test_official_verse_ids_prove_imported_terminal_fragment_without_changing_canonical_text(self):
        from source_fragments import fragment_references
        source,inner,e,pcm,speech=self.fixture();before=copy.deepcopy(source);refs,missing=fragment_references('john:7:en',source,e)
        self.assertEqual(refs,inner['boundarySourceVerses']);self.assertEqual(missing,[{'verse':52,'text':'Then they all went home','reason':'not-narrated-in-source'}]);self.assertEqual(source,before)
        e['rawHtml']=e['rawHtml'].replace('John-7-53','John-7-54');e['sha256']=hashlib.sha256(e['rawHtml'].encode()).hexdigest()
        with self.assertRaises(ValueError):fragment_references('john:7:en',source,e)

    def test_partial_verse_keeps_its_complete_actual_audio_and_explicit_missing_text(self):
        from source_fragments import wrap_source_fragments,verified_fragment_artifact,fragment_measurements_match
        source,inner,e,pcm,speech=self.fixture();r=wrap_source_fragments(source,inner,e,pcm,speech)
        self.assertTrue(verified_fragment_artifact(r));self.assertTrue(fragment_measurements_match(r,pcm));self.assertEqual(r['boundarySourceVerses'],source);self.assertEqual(r['cues'][-1]['text'],source[-1]['text']);self.assertEqual(r['checks'][-1]['alignedWords'],inner['checks'][-1]['alignedWords']);self.assertEqual(r['missingFragments'][0]['verse'],52)
        for change in ['label','words','source','missing','cue']:
            a=copy.deepcopy(r)
            if change=='label':a['qualityRecipe']=inner['qualityRecipe']
            if change=='words':a['checks'][-1]['alignedWords'].pop()
            if change=='source':a['sourceFragmentReview']['evidence']['sha256']='c'*64
            if change=='missing':a['missingFragments'][0]['text']='Something else'
            if change=='cue':a['cues'][-1]['end']-=.1
            self.assertFalse(verified_fragment_artifact(a),change)
        pcm[-1000:]=array('h',[30000])*1000;self.assertFalse(fragment_measurements_match(r,pcm))

    def test_actual_extra_voice_in_the_tail_cannot_be_called_missing_narration(self):
        from source_fragments import wrap_source_fragments
        source,inner,e,pcm,speech=self.fixture();speech.append([round((inner['cues'][-1]['end']+1)*16000),round((inner['cues'][-1]['end']+2)*16000)])
        with self.assertRaises(ValueError):wrap_source_fragments(source,inner,e,pcm,speech)

    def test_publication_marks_partial_without_removing_the_real_final_verse(self):
        from source_fragments import wrap_source_fragments
        from publish_site import recording_entry
        source,inner,e,pcm,speech=self.fixture();r=wrap_source_fragments(source,inner,e,pcm,speech);r.update(vttFile='b'*64+'.vtt',vttSha256='b'*64)
        r['verseFiles']=[{'verse':c['verse'],'sourceStart':c['start'],'sourceEnd':c['end'],'duration':c['end']-c['start'],'sha256':'c'*64,'path':'/api/audio/resources/'+'c'*64+'.mp3'} for c in r['cues']]
        receipt={'key':r['key'],'locale':'en','sha256':r['sourceAudioSha256'],'duration':r['duration'],'path':'/source.mp3','url':'https://source.test/audio.mp3'}
        entry=recording_entry(receipt,r,r['textSha256']);self.assertEqual(entry['alignmentStatus'],'partial');self.assertEqual(len(entry['verseFiles']),52);self.assertEqual(entry['missingFragments'],r['missingFragments']);self.assertNotIn('missingVerses',entry)
        r['verseFiles'][-1]['sourceEnd']-=.1;self.assertEqual(recording_entry(receipt,r,r['textSha256'])['alignmentStatus'],'pending')

if __name__=='__main__':unittest.main()
