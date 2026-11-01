"""Final listening decisions apply only to their exact source chapter and cuts."""
import copy,sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))

class FinalSourceListeningTests(unittest.TestCase):
    def fixture(self,schema):
        key={41:'nehemiah:7:en',42:'proverbs:23:en',43:'psalms:136:en'}[schema]
        r=dict(schemaVersion=schema,sourceAcousticApproval=False,humanDecision={41:'自然完整，可以采用',42:'完整且不串入标题，可以采用',43:'分界自然、末节完整，之后只有背景声'}[schema])
        if schema==41:r['naturalSeam']=dict(leftVerse=33,rightVerse=34,cut=160.48,uncertainty=[160.46,160.50])
        if schema==42:r['headingListening']=dict(number=9,afterVerse=5,beforeVerse=6,leftEnd=31.55,rightStart=33.70)
        if schema==43:r.update(naturalSeam=dict(leftVerse=11,rightVerse=12,cut=55.93,uncertainty=[55.91,55.95]),humanEnding=dict(verse=26,cut=131.20))
        return dict(key=key),r

    def test_all_three_exact_human_decisions_are_distinct_from_silence_proofs(self):
        try:from reviewed_final_listening import validate_final_listening
        except ImportError:self.fail('Final source listening needs an exact separate verification identity')
        for schema in [41,42,43]:
            b,r=self.fixture(schema);before=copy.deepcopy(r);validate_final_listening(b,r);self.assertEqual(r,before)

    def test_other_chapters_cuts_or_absent_decisions_cannot_reuse_the_listening(self):
        try:from reviewed_final_listening import validate_final_listening
        except ImportError:self.fail('Final source listening needs an exact separate verification identity')
        for schema in [41,42,43]:
            for kind in ['key','decision','cut','silence']:
                b,r=self.fixture(schema)
                if kind=='key':b['key']='other:1:en'
                if kind=='decision':r['humanDecision']=''
                if kind=='silence':r['sourceAcousticApproval']=True
                if kind=='cut':
                    if schema==42:r['headingListening']['rightStart']+=.01
                    else:r['naturalSeam']['cut']+=.01
                with self.assertRaises(ValueError,msg=(schema,kind)):validate_final_listening(b,r)
