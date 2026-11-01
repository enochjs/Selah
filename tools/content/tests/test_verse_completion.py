import copy,hashlib
from pathlib import Path
import sys,unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))

class VerseCompletionTests(unittest.TestCase):
    def evidence(self):
        raw='''<div class="passage-col version-NIV" data-translation="NIV"><div class="passage-text">
        <p><span class="text Ezra-2-1"><sup class="versenum">1</sup>The priests:</span></p>
        <table><tr><td><span class="text Ezra-2-1">the descendants of Jedaiah<sup class="crossreference">BAD NOTE</sup></span></td>
        <td><span class="text Ezra-2-1">973</span></td></tr></table>
        <p><span class="text Ezra-2-2">of Immer, 1,052</span></p></div></div>'''
        return {'key':'ezra:2:en','edition':'NIV','url':'https://www.biblegateway.com/passage/?search=Ezra%202&version=NIV',
                'rawHtml':raw,'sha256':hashlib.sha256(raw.encode()).hexdigest(),'fetchedAt':'2026-10-26T11:00:00+08:00'}

    def test_table_continuations_are_joined_by_the_same_canonical_id(self):
        from verse_completion import completion_references
        source=[{'number':1,'text':'The priests:'},{'number':2,'text':'of Immer, 1,052'}];before=copy.deepcopy(source)
        result=completion_references('ezra:2:en',source,self.evidence())
        self.assertEqual(result,[{'number':1,'text':'The priests: the descendants of Jedaiah 973'},source[1]])
        self.assertEqual(source,before)

    def test_only_proven_truncated_heading_is_extended(self):
        from verse_completion import completion_references
        for source in [[{'number':1,'text':'The priests: something else'},{'number':2,'text':'of Immer, 1,052'}],
                       [{'number':1,'text':'The priests'},{'number':2,'text':'of Immer, 1,052'}]]:
            self.assertEqual(completion_references('ezra:2:en',source,self.evidence()),source)
        for change in ['sha','key','edition','foreign']:
            e=self.evidence()
            if change=='sha':e['sha256']='a'*64
            if change=='key':e['key']='ezra:3:en'
            if change=='edition':e['edition']='KJV'
            if change=='foreign':
                e['rawHtml']=e['rawHtml'].replace('Ezra-2-1','Neh-2-1');e['sha256']=hashlib.sha256(e['rawHtml'].encode()).hexdigest()
            with self.assertRaises(ValueError):completion_references('ezra:2:en',[{'number':1,'text':'The priests:'},{'number':2,'text':'of Immer, 1,052'}],e)

    def artifact(self):
        from verse_completion import completion_references
        from numeric_alignment import expansion,collapse_words,NUMERIC_POLICY
        from case_evidence import CASE_POLICY
        from alignment_contract import CASE_REVIEW_RECIPE,PADDING_REVIEW_RECIPE,METHOD,BOUNDARY_RECOGNIZER,site_fingerprint
        from boundary_quality import POLICY,verse_boundary
        from partial_audio import source_text_sha
        source=[{'number':1,'text':'The priests:'},{'number':2,'text':'of Immer, 1,052'}]
        refs=completion_references('ezra:2:en',source,self.evidence());cues=[];checks=[]
        for i,v in enumerate(refs):
            text,groups=expansion(v['text'],'en','plain');start=2+i*7
            expanded=[{'word':w,'start':start+j*.2,'end':start+j*.2+.15,'score':.9} for j,w in enumerate(text.split())]
            words=collapse_words(expanded,groups,'plain');bounds=[start-1,start+6];signal={'headRms':.1,'tailRms':.1,'verseRms':.1}
            edges,ev=verse_boundary(words,bounds,20,'en',reference=v['text'],signal=signal)
            self.assertIsNotNone(edges);cues.append({'verse':v['number'],'text':v['text'],'start':edges[0],'end':edges[1]})
            checks.append({'verse':v['number'],'text':v['text'],'spokenText':v['text'],'alignedWords':words,'searchRange':bounds,
                'boundarySignal':signal,'boundaryEvidence':ev,'boundaryVerified':True,'asrEdgeAnchors':[]})
        sha=source_text_sha(refs)
        a={'key':'ezra:2:en','sourceAudioSha256':'a'*64,'duration':20,'qualityRecipe':CASE_REVIEW_RECIPE,'method':METHOD,
           'recognizer':BOUNDARY_RECOGNIZER,'accepted':True,'issues':[],'textSha256':sha,
           'fingerprint':site_fingerprint('a'*64,sha,'en',CASE_REVIEW_RECIPE,BOUNDARY_RECOGNIZER),
           'boundaryPolicy':POLICY,'verificationScope':'verse-boundaries','boundarySourceVerses':refs,'expectedVerseNumbers':[1,2],
           'cues':cues,'checks':checks,'recognition':[],'unclaimedSpeech':[],
           'caseReviewPolicy':CASE_POLICY,'caseBaseRecipe':PADDING_REVIEW_RECIPE,'caseNumericPolicy':NUMERIC_POLICY}
        return source,a

    def test_full_source_reference_is_verified_while_canonical_text_stays_unchanged(self):
        from verse_completion import wrap_completion
        from boundary_quality import verified_boundary_artifact
        source,base=self.artifact();r=wrap_completion(source,base,self.evidence())
        self.assertTrue(verified_boundary_artifact(r));self.assertEqual(r['boundarySourceVerses'],source)
        self.assertEqual(r['checks'][0]['text'],'The priests:');self.assertEqual(r['cues'][0]['text'],'The priests:')
        self.assertEqual(r['checks'][0]['alignedWords'],base['checks'][0]['alignedWords'])
        for change in ['html','canonical','cue','label']:
            x=copy.deepcopy(r)
            if change=='html':x['referenceCompletionReview']['evidence']['rawHtml']+='changed'
            if change=='canonical':x['boundarySourceVerses'][0]['text']='The musicians:'
            if change=='cue':x['cues'][0]['text']='Changed'
            if change=='label':x['qualityRecipe']=base['qualityRecipe']
            self.assertFalse(verified_boundary_artifact(x),change)

    def test_publication_requires_final_files_and_rejects_legacy_labels(self):
        from verse_completion import wrap_completion
        from publish_site import recording_entry
        source,base=self.artifact();r=wrap_completion(source,base,self.evidence())
        r.update(vttFile='b'*64+'.vtt',vttSha256='b'*64)
        r['verseFiles']=[{'verse':c['verse'],'sourceStart':c['start'],'sourceEnd':c['end'],'duration':c['end']-c['start'],
            'sha256':'c'*64,'path':'/api/audio/resources/'+'c'*64+'.mp3'} for c in r['cues']]
        receipt={'key':r['key'],'locale':'en','sha256':'a'*64,'duration':20,'path':'/source.mp3','url':'https://source.test/original.mp3'}
        self.assertEqual(recording_entry(receipt,r,r['textSha256'])['alignmentStatus'],'aligned')
        r['verseFiles'][0]['sourceEnd']-=.1
        self.assertEqual(recording_entry(receipt,r,r['textSha256'])['alignmentStatus'],'pending')

    def test_table_completion_preserves_independent_gap_ownership_proof(self):
        from array import array
        from gap_edges import repair_gap_edges,gap_edge_measurements_match
        from verse_completion import wrap_completion,completion_witness
        from boundary_quality import verified_boundary_artifact
        source,base=self.artifact();pcm=array('h',[0])*320000;speech=[]
        for cue in base['cues']:
            lo,hi=round(cue['start']*16000),round(cue['end']*16000)
            pcm[lo:hi]=array('h',[5000])*(hi-lo);speech.append([lo,hi])
        base.update(accepted=False,issues=['boundary-unassigned-speech:between-verses'],
          unclaimedSpeech=[{'kind':'between-verses','text':'stretched clock','start':base['cues'][0]['end']-.1,'end':base['cues'][1]['start']+.1}])
        inner=repair_gap_edges(base,pcm,speech)
        self.assertTrue(inner['accepted']);self.assertTrue(gap_edge_measurements_match(inner,pcm))
        r=wrap_completion(source,inner,self.evidence())
        self.assertTrue(verified_boundary_artifact(r));self.assertTrue(gap_edge_measurements_match(completion_witness(r),pcm))
        self.assertEqual(r['unclaimedSpeech'],base['unclaimedSpeech']);self.assertEqual(r['boundarySourceVerses'],source)
        r['sourceGapReview']['parts']=[]
        self.assertFalse(verified_boundary_artifact(r))

if __name__=='__main__':unittest.main()
