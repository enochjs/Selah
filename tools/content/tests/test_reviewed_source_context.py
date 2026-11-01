"""A previous passage recorded at chapter start keeps its own source identity."""
import copy
import hashlib
import json
import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))


class SourceContextTests(unittest.TestCase):
    def fixture(self):
        from test_speech_span import SpeechSpanTests
        from alignment_contract import BOUNDARY_RECOGNIZER,site_fingerprint
        from quiet_gaps import digest
        b,_,_=SpeechSpanTests().fixture();b['key']='john:8:en'
        b['fingerprint']=site_fingerprint(b['sourceAudioSha256'],b['textSha256'],'en',b['qualityRecipe'],BOUNDARY_RECOGNIZER)
        b['unclaimedSpeech']=[dict(kind='leading',text='Then they all went home,',start=.2,end=.6,allowedHeadingOrClosing=False)]
        raw=json.dumps(b)
        html='<div class="passage-col version-NIV" data-translation="NIV"><div class="passage-text">'+''.join('<span class="text John-7-'+str(i)+'">'+('Then they all went home,' if i==53 else 'They came.')+'</span>' for i in range(1,54))+'</div></div>'
        ref=dict(key='john:7:en',edition='NIV',url='https://www.biblegateway.com/passage/?search=John%207&version=NIV',fetchedAt='2026-10-27T09:00:00+00:00',rawHtml=html,sha256=hashlib.sha256(html.encode()).hexdigest())
        from quiet_gaps import GAP_POLICY
        audit=dict(key=b['key'],sourceAudioSha256=b['sourceAudioSha256'],sourceReportSha256=hashlib.sha256(raw.encode()).hexdigest(),sampleCount=128000,vadModelSha256=GAP_POLICY['vadModelSha256'],speechSegments=[[3200,10000],[16000,30400],[40000,88000],[104000,113600]])
        materials=[dict(file='base.json',utf8=raw),dict(file='ref.json',utf8=json.dumps(ref)),dict(file='audit.json',utf8=json.dumps(audit))]
        r=dict(schemaVersion=14,baseEvidenceSha256=digest(b),baseReportFile='base.json',contextReferenceFile='ref.json',contextAuditFile='audit.json',sourceContext=dict(gapIndex=0,gapSha256=digest(b['unclaimedSpeech'][0]),referenceKey='john:7:en',sourceVerse=53,text='Then they all went home,',sourceRange=[.2,.66]),evidence=[dict(file=x['file'],sha256=hashlib.sha256(x['utf8'].encode()).hexdigest()) for x in materials])
        return b,r,materials

    def test_exact_previous_passage_is_proven_without_relabeling_it_as_a_heading(self):
        from reviewed_source_context import source_context_rule
        b,r,m=self.fixture();before=copy.deepcopy(b);i,context=source_context_rule(b,r,m)
        self.assertEqual(i,0);self.assertEqual(context['referenceKey'],'john:7:en');self.assertEqual(context['sourceVerse'],53)
        self.assertEqual(b,before);self.assertFalse(b['unclaimedSpeech'][0]['allowedHeadingOrClosing'])

    def test_other_passage_changed_source_or_voice_outside_context_is_rejected(self):
        from reviewed_source_context import source_context_rule
        for change in ['text','reference','index','range','html','source','base','missing-vad']:
            b,r,m=self.fixture()
            if change=='text':r['sourceContext']['text']='Something else'
            if change=='reference':r['sourceContext']['sourceVerse']=52
            if change=='index':r['sourceContext']['gapIndex']=1
            if change=='range':r['sourceContext']['sourceRange'][1]=.59
            if change=='html':m[1]['utf8']=m[1]['utf8'].replace('NIV','KJV')
            if change=='source':b['sourceAudioSha256']='b'*64
            if change=='base':m[0]['utf8']='{}'
            if change=='missing-vad':
                d=json.loads(m[2]['utf8']);d.pop('vadModelSha256');m[2]['utf8']=json.dumps(d)
                r['evidence'][2]['sha256']=hashlib.sha256(m[2]['utf8'].encode()).hexdigest()
            with self.assertRaises((ValueError,IndexError,KeyError),msg=change):source_context_rule(b,r,m)

    def test_manuscript_notice_is_kept_as_reference_metadata(self):
        from reviewed_source_context import source_context_rule
        b,r,m=self.fixture();d=json.loads(m[1]['utf8'])
        d['rawHtml']=d['rawHtml'].replace('<span class="text John-7-53">','<span class="text John-7-53">[The earliest manuscripts do not have this passage.]</span><span class="text John-7-53">')
        d['sha256']=hashlib.sha256(d['rawHtml'].encode()).hexdigest();m[1]['utf8']=json.dumps(d)
        r['evidence'][1]['sha256']=hashlib.sha256(m[1]['utf8'].encode()).hexdigest()
        _,context=source_context_rule(b,r,m)
        self.assertEqual(context['text'],'Then they all went home,')

if __name__=='__main__':unittest.main()
