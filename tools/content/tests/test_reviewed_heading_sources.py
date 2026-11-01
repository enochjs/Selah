"""A user-reviewed title seam must not waive unrelated original failures."""
import copy
import hashlib
import json
import shutil
import tempfile
import wave
from array import array
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


class ReviewedHeadingTests(unittest.TestCase):
    def fixture(self):
        from test_speech_span import SpeechSpanTests
        from alignment_contract import BOUNDARY_RECOGNIZER, GAP_REVIEW_RECIPE, site_fingerprint
        from boundary_quality import verse_boundary
        from quiet_gaps import digest, measure_gaps
        base, pcm, speech = SpeechSpanTests().fixture()
        base['key'] = 'psalms:30:en'
        base['checks'][1]['alignedWords'][0]['score'] = .9
        base['checks'][1]['asrEdgeAnchors'][0]['probability'] = .95
        base['cues'] = []
        for c in base['checks']:
            edges, evidence = verse_boundary(c['alignedWords'], c['searchRange'], 8, 'en',
                reference=c['text'], signal=c['boundarySignal'], anchors=c['asrEdgeAnchors'])
            c.update(boundaryVerified=True, boundaryEvidence=evidence)
            base['cues'].append(dict(verse=c['verse'], text=c['text'], start=edges[0], end=edges[1]))
        model = base['qualityRecipe']
        base.update(qualityRecipe=GAP_REVIEW_RECIPE, issues=['boundary-unassigned-speech:leading'])
        base['fingerprint'] = site_fingerprint(base['sourceAudioSha256'], base['textSha256'], 'en', GAP_REVIEW_RECIPE, BOUNDARY_RECOGNIZER)
        base['gapReview'] = dict(recipe=GAP_REVIEW_RECIPE, sourceFingerprint=site_fingerprint(base['sourceAudioSha256'], base['textSha256'], 'en', model, BOUNDARY_RECOGNIZER))
        base['unclaimedSpeech'] = [dict(kind='leading', text='Of David.', start=.2, end=.96, allowedHeadingOrClosing=False)]
        pcm[3200:15680] = array('h', [3000]) * 12480
        speech = [[3200, 30400], *speech[1:]]
        base['acousticGapReview'] = measure_gaps(base, pcm, speech)
        html = '<div class="passage-col version-NIV" data-translation="NIV"><h4><span class="text Ps-30-1">Of David.</span></h4><span class="text Ps-30-1"><sup class="versenum">1</sup>They came.</span></div>'
        doc = dict(file='psalms-030-030.html', firstChapter=30, lastChapter=30,
            url='https://www.biblegateway.com/passage/?search=Psalm%2030&version=NIV', sha256=hashlib.sha256(html.encode()).hexdigest())
        manifest = json.dumps(dict(version='NIV', book='psalms', documents=[doc]))
        sha = hashlib.sha256(manifest.encode()).hexdigest()
        base['sourceMetadata'] = dict(captionManifestSha256=sha)
        materials = [dict(file='manifest.json', utf8=manifest), dict(file=doc['file'], utf8=html)]
        final = copy.deepcopy(base['cues']); final[0]['start'] = .96
        receipt = dict(schemaVersion=13, weakVerses=[], failureReasons=[], gapAssignments=[],
            finalCues=final, approvedBy='user-natural-seam-tolerance', humanDecision='Accept this natural boundary.',
            sourceAcousticApproval=False, heading=dict(gapIndex=0, gapSha256=digest(base['unclaimedSpeech'][0]),
                caption='Of David.', manifestFile='manifest.json', htmlFile=doc['file'], sourceRange=[.2,.96]),
            naturalSeam=dict(rightVerse=1, cut=.96, uncertainty=[.94,.98]),
            evidence=[dict(file=m['file'], sha256=hashlib.sha256(m['utf8'].encode()).hexdigest()) for m in materials],
            cuts=[dict(verse=1, side='head', before=[base['cues'][0]['start'],base['cues'][0]['end']],
                after=[.96,base['cues'][0]['end']], protectedCore=[1.,1.9], previousVoiceEnd=.94,
                nextVoiceStart=2.5, window=[15040,15680], referenceRanges=[[16000,30400],[40000,88000]], measurementKind='user-natural-seam')])
        return base, receipt, materials, pcm, sha

    def derive(self, base, receipt, materials, sha):
        from reviewed_heading_sources import derive_heading_source_case
        with patch('alignment_contract.PSALM_CAPTION_REFERENCE_SHA256', sha):
            return derive_heading_source_case(base, receipt, materials)

    def test_fixed_title_decision_retains_every_original_fact(self):
        base, receipt, materials, _, sha = self.fixture(); before = copy.deepcopy(base)
        result = self.derive(base, receipt, materials, sha)
        self.assertTrue(result['accepted']); self.assertEqual(result['issues'], [])
        self.assertEqual(base, before)
        self.assertEqual(result['checks'], before['checks'])
        self.assertEqual(result['unclaimedSpeech'], before['unclaimedSpeech'])
        self.assertEqual(result['acousticGapReview'], before['acousticGapReview'])
        self.assertEqual(result['cues'], receipt['finalCues'])

    def test_title_authority_user_decision_and_other_verse_proofs_are_required(self):
        for change in ['decision','caption','foreign-html','gap','extra-gap','other-failure','other-cut','lose-word','original-word','quiet-proof','manifest','seam-window']:
            base, receipt, materials, _, sha = self.fixture()
            if change=='decision': receipt['humanDecision']=''
            if change=='caption': receipt['heading']['caption']='A different title'
            if change=='foreign-html': materials[1]['utf8']=materials[1]['utf8'].replace('version-NIV','version-KJV')
            if change=='gap': receipt['heading']['gapSha256']='0'*64
            if change=='extra-gap': base['unclaimedSpeech'].append(dict(kind='between-verses',text='unknown',start=4,end=5,allowedHeadingOrClosing=False))
            if change=='other-failure': base['issues'].append('unreliable-verse-boundary:2')
            if change=='other-cut': receipt['finalCues'][1]['start']+=.01
            if change=='lose-word': receipt['finalCues'][0]['start']=1.1
            if change=='original-word': base['checks'][1]['alignedWords'][0]['score']=.01
            if change=='quiet-proof': base['acousticGapReview']['proofs'][0]['parts'][0]['frames'][0]=.99
            if change=='manifest': sha='0'*64
            if change=='seam-window': receipt['cuts'][0]['window']=[15040,15520]
            with self.assertRaises((ValueError,KeyError),msg=change): self.derive(base,receipt,materials,sha)

    @unittest.skipUnless(shutil.which('ffmpeg'), 'ffmpeg needed for real output provenance')
    def test_registered_receipt_materializes_and_reverifies_real_source_and_outputs(self):
        from alignment_contract import BOUNDARY_RECOGNIZER, GAP_REVIEW_RECIPE, BOUNDARY_REVIEW_RECIPE, site_fingerprint
        from quiet_gaps import digest, measure_gaps
        from reviewed_weak_boundaries import apply_reviewed_weak_boundaries, verify_reviewed_weak_output_media
        from verse_clips import create_verse_files
        from timed_text import webvtt
        base, receipt, materials, pcm, sha = self.fixture()
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder); source=root/'source.wav'
            with wave.open(str(source),'wb') as f:
                f.setnchannels(1);f.setsampwidth(2);f.setframerate(16000);f.writeframes(pcm.tobytes())
            base['sourceAudioSha256']=hashlib.sha256(source.read_bytes()).hexdigest()
            base['fingerprint']=site_fingerprint(base['sourceAudioSha256'],base['textSha256'],'en',GAP_REVIEW_RECIPE,BOUNDARY_RECOGNIZER)
            base['gapReview']['sourceFingerprint']=site_fingerprint(base['sourceAudioSha256'],base['textSha256'],'en',BOUNDARY_REVIEW_RECIPE,BOUNDARY_RECOGNIZER)
            base['acousticGapReview']=measure_gaps(base,pcm,base['acousticGapReview']['speechSegments'])
            for m in materials:(root/m['file']).write_text(m['utf8'])
            receipt.update({k:base[k] for k in ['key','duration','sourceAudioSha256','textSha256']})
            receipt.update(caseId='heading-test',baseEvidenceSha256=digest(base),usfm='PSA',chapter=30)
            receipt['outputInventory']=create_verse_files(source,[[c['verse'],c['start'],c['end']] for c in receipt['finalCues']],root,root/'clips.json')
            receipt['outputVttSha256']=hashlib.sha256(webvtt('PSA',30,receipt['finalCues']).encode()).hexdigest()
            raw=(json.dumps(receipt)+'\n').encode();(root/'receipt.json').write_bytes(raw)
            import reviewed_boundaries
            with patch('alignment_contract.PSALM_CAPTION_REFERENCE_SHA256',sha), patch.multiple(reviewed_boundaries,
                    CASES_DIR=root,APPROVALS={'heading-test':dict(file='receipt.json',sha256=hashlib.sha256(raw).hexdigest())}):
                a=apply_reviewed_weak_boundaries(base,'heading-test',pcm,root)
                a.update(verseFiles=receipt['outputInventory'],vttSha256=receipt['outputVttSha256'],vttFile=receipt['outputVttSha256']+'.vtt')
                self.assertTrue(verify_reviewed_weak_output_media(a,source))
                self.assertEqual(a['reviewedWeakReview']['baseEvidence'],base)
                damaged=array('h',pcm);damaged[15040]=30000
                from reviewed_weak_boundaries import reviewed_weak_measurements_match
                self.assertFalse(reviewed_weak_measurements_match(a,damaged))
                (root/(a['verseFiles'][0]['sha256']+'.mp3')).write_bytes(b'corrupt')
                self.assertFalse(verify_reviewed_weak_output_media(a,source))


if __name__ == '__main__':
    unittest.main()
