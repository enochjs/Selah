import json
from pathlib import Path
import sys
import tempfile
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from case_review_report import generate

class CaseReviewReportTests(unittest.TestCase):
    def fixture(self,folder):
        root=Path(folder);data=root/'packages/content/data';data.mkdir(parents=True)
        snapshot=root/'storage/resources/cache/site-test';(snapshot/'case-review').mkdir(parents=True)
        catalog={'genesis:1:en':{'alignmentStatus':'aligned'},'genesis:1:zh':{'alignmentStatus':'review-required'}}
        (data/'chapter-audio.json').write_text(json.dumps(catalog))
        (data/'resource-manifest.json').write_text(json.dumps({'sourceSnapshot':'site-test','verseFileRecordings':1}))
        (data/'bible.json').write_text(json.dumps([{'id':'genesis','zh':'创世记'}]))
        rows=[]
        for locale,outcome in [('en','fixed'),('zh','manual-review')]:
            key='genesis:1:'+locale
            row={'key':key,'sourceAudioSha256':'a'*64,'textSha256':'b'*64,'outcome':outcome,
                 'remainingIssues':[] if outcome=='fixed' else ['unreliable-verse-boundary:3'],
                 'attempts':[{'reason':'weak-or-truncated-acoustic-edge'}],
                 'reviewPositions':[{'verse':3,'searchRange':[12,15],'reasons':['weak-edge-word']}]}
            (snapshot/'case-review'/('genesis__1__'+locale+'.json')).write_text(json.dumps(row))
            rows.append({'key':key,'sourceAudioSha256':'a'*64,'textSha256':'b'*64,'originalIssues':['unreliable-verse-boundary:3']})
        selection=root/'selection.json';selection.write_text(json.dumps({'sourceSnapshot':'site-test','baselinePlayable':0,
            'keys':[r['key'] for r in rows],'records':rows}))
        return root,snapshot,selection

    def test_each_unresolved_chapter_keeps_a_specific_listening_note(self):
        with tempfile.TemporaryDirectory() as folder:
            root,snapshot,selection=self.fixture(folder)
            summary=generate(snapshot,selection,root/'notes.md',root/'notes.json',root)
            self.assertEqual((summary['reviewed'],summary['fixed'],summary['manualReview']),(2,1,1))
            text=(root/'notes.md').read_text()
            self.assertIn('00:12.000–00:15.000',text)
            self.assertIn('置信度不足',text)
            self.assertIn('不表示录音读错或漏读',text)
            self.assertIn('genesis:1:zh',text)

    def test_problem_list_omits_recovered_entries_but_retains_audit_files(self):
        with tempfile.TemporaryDirectory() as folder:
            root,snapshot,selection=self.fixture(folder)
            before=(snapshot/'case-review/genesis__1__en.json').read_bytes()
            generate(snapshot,selection,root/'notes.md',root/'notes.json',root)
            text=(root/'notes.md').read_text()
            report=json.loads((root/'notes.json').read_text())
            self.assertNotIn('## 创世记 1章 · 英文 · 已恢复',text)
            self.assertIn('## 创世记 1章 · 中文 · 需人工复核',text)
            self.assertEqual([r['key'] for r in report['records']],['genesis:1:zh'])
            self.assertEqual(report['fixed'],1)
            self.assertEqual((snapshot/'case-review/genesis__1__en.json').read_bytes(),before)

    def test_incomplete_or_unpublished_results_cannot_be_reported_as_complete(self):
        for change in ['missing','unpublished','source']:
            with self.subTest(change=change),tempfile.TemporaryDirectory() as folder:
                root,snapshot,selection=self.fixture(folder)
                path=snapshot/'case-review/genesis__1__en.json'
                if change=='missing':path.unlink()
                if change=='unpublished':
                    data=root/'packages/content/data/chapter-audio.json';a=json.loads(data.read_text())
                    a['genesis:1:en']['alignmentStatus']='review-required';data.write_text(json.dumps(a))
                if change=='source':
                    a=json.loads(path.read_text());a['textSha256']='c'*64;path.write_text(json.dumps(a))
                with self.assertRaises(ValueError):generate(snapshot,selection,root/'notes.md',root/'notes.json',root)

    def test_later_whole_chapter_review_note_replaces_the_old_summary(self):
        with tempfile.TemporaryDirectory() as folder:
            root,snapshot,selection=self.fixture(folder)
            path=snapshot/'case-review/genesis__1__zh.json';row=json.loads(path.read_text())
            row['individualRound2']={'outcome':'manual-review','note':'旧摘要'}
            row['orderedRelocalizationReview']={'outcome':'manual-review','note':'新定位仍有第13节未找到，未发布。'}
            path.write_text(json.dumps(row))
            generate(snapshot,selection,root/'notes.md',root/'notes.json',root)
            text=(root/'notes.md').read_text();self.assertIn('新定位仍有第13节未找到',text);self.assertNotIn('旧摘要',text)

    def test_unconfirmed_missing_verse_gets_its_neighbor_listening_range(self):
        with tempfile.TemporaryDirectory() as folder:
            root,snapshot,selection=self.fixture(folder)
            path=snapshot/'case-review/genesis__1__zh.json';row=json.loads(path.read_text())
            row.update(reviewPositions=[],remainingIssues=['unconfirmed-source-coverage'],
                candidateCoverageRoles={'missingVerses':[{'verse':3,'reason':'not-narrated-in-source'}]},
                candidateCues=[{'verse':2,'start':10,'end':15.2},{'verse':4,'start':16.1,'end':20}])
            path.write_text(json.dumps(row))
            generate(snapshot,selection,root/'notes.md',root/'notes.json',root)
            text=(root/'notes.md').read_text()
            self.assertIn('00:15.200–00:16.100',text)
            self.assertIn('尚未确认缺录',text)

    def test_latest_individual_round_notes_and_counts_are_visible(self):
        with tempfile.TemporaryDirectory() as folder:
            root,snapshot,selection=self.fixture(folder)
            for locale in ['en','zh']:
                path=snapshot/'case-review'/('genesis__1__'+locale+'.json')
                row=json.loads(path.read_text())
                row['individualRound2']={'outcome':row['outcome'],'note':'重新按相邻经节限定窗口；仍需试听第3节句尾。',
                    'attempts':[{'reason':'fresh-window-edge-unconfirmed'}]}
                path.write_text(json.dumps(row))
            result=generate(snapshot,selection,root/'notes.md',root/'notes.json',root)
            text=(root/'notes.md').read_text()
            self.assertEqual(result['latestIndividualRound'],{'reviewed':2,'fixed':1,'manualReview':1,'executionErrors':0})
            self.assertEqual(text.count('仍需试听第3节句尾'),1)
            self.assertIn('最新逐项复核',text)

if __name__=='__main__':unittest.main()
