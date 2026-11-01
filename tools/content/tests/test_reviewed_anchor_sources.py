"""Interior model confidence cannot veto independently confirmed complete edges."""
import copy,sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))

class AnchoredSourceTests(unittest.TestCase):
    def fixture(self):
        words=[dict(word='They',start=1.3,end=1.5,score=.65),dict(word='help',start=1.6,end=1.8,score=.1),dict(word='him,',start=1.9,end=2.1,score=.65)]
        anchors=[dict(word=' They',start=1.2,end=1.45,probability=.97),dict(word=' him,',start=2.,end=2.2,probability=.96)]
        c=dict(verse=1,alignedWords=words,asrEdgeAnchors=anchors,searchRange=[1.,2.5],boundaryVerified=False)
        b=dict(duration=3.,recognition=[dict(words=copy.deepcopy(anchors))])
        cuts=[dict(verse=1,side=x,ownVoice=[1.2,2.2]) for x in ['head','tail']]
        return b,c,dict(start=1.1,end=2.3),cuts

    def test_mean_only_failure_with_complete_independent_edge_anchors_is_supported(self):
        try:from reviewed_anchor_sources import verify_anchored_mean_boundary
        except ImportError:self.fail('Independent complete-edge source proof is missing')
        b,c,f,cuts=self.fixture();before=copy.deepcopy(c)
        verify_anchored_mean_boundary(b,c,f,cuts,['weak-verse-location'],1.)
        self.assertEqual(c,before)

    def test_no_weak_edge_fake_anchor_missing_body_or_truncated_source_can_pass(self):
        try:from reviewed_anchor_sources import verify_anchored_mean_boundary
        except ImportError:self.fail('Independent complete-edge source proof is missing')
        for kind in ['weak-edge','fake','word','probability','overlap','tail','core','cuts','fraction','reasons','nan','model']:
            b,c,f,cuts=self.fixture();reasons=['weak-verse-location'];fraction=1.
            if kind=='weak-edge':c['alignedWords'][0]['score']=.49
            if kind=='fake':b['recognition']=[]
            if kind=='word':c['asrEdgeAnchors'][0]['word']='Other'
            if kind=='probability':c['asrEdgeAnchors'][0]['probability']=.89
            if kind=='overlap':c['asrEdgeAnchors'][0]['end']=1.25
            if kind=='tail':f['end']=2.15
            if kind=='core':cuts[0]['ownVoice'][0]=1.25
            if kind=='cuts':cuts.pop()
            if kind=='fraction':fraction=.9
            if kind=='reasons':reasons.append('invalid-word-order-or-range')
            if kind=='nan':c['asrEdgeAnchors'][0]['start']=float('nan')
            if kind=='model':f['start']=1.4
            with self.assertRaises(ValueError,msg=kind):verify_anchored_mean_boundary(b,c,f,cuts,reasons,fraction)

    def test_multiple_accepted_seams_keep_every_original_model_clock(self):
        try:from reviewed_anchor_sources import preserved_seam_rules
        except ImportError:self.fail('Exact multiple accepted source seams are not supported yet')
        b=dict(expectedVerseNumbers=[1,2,3,4]);checks={v:dict(alignedWords=[dict(word='word',start=v-.8,end=v-.6)]) for v in [1,2,3,4]}
        final={1:dict(start=0.,end=1.5),2:dict(start=1.5,end=2.5),3:dict(start=2.5,end=3.5),4:dict(start=3.5,end=4.5)}
        cuts=[]
        for l,r,t in [(1,2,1.5),(3,4,3.5)]:
            for v,side in [(l,'tail'),(r,'head')]:cuts.append(dict(verse=v,side=side,measurementKind='user-natural-seam',window=[round((t-.01)*16000),round((t+.01)*16000)]))
        r=dict(approvedBy='user-natural-seam-tolerance',sourceAcousticApproval=False,humanDecision='两处都可接受，按此修复',naturalSeams=[dict(leftVerse=l,rightVerse=r,cut=t,uncertainty=[t-.01,t+.01]) for l,r,t in [(1,2,1.5),(3,4,3.5)]],modelClockExceptions=[],retainedSourceSpans=[dict(verse=1,range=[.2,.4])],cuts=cuts)
        fit=preserved_seam_rules(b,r,checks,final);self.assertTrue(fit(1,checks[1]['alignedWords'][0],0.,1.5));self.assertFalse(fit(1,dict(start=1.4,end=1.6),0.,1.5))
        for kind in ['duplicate','missing','exception','unaccepted']:
            bad=copy.deepcopy(r)
            if kind=='duplicate':bad['naturalSeams'].append(copy.deepcopy(bad['naturalSeams'][0]))
            if kind=='missing':bad['cuts'].pop()
            if kind=='exception':bad['modelClockExceptions']=[dict(verse=1)]
            if kind=='unaccepted':bad['humanDecision']=''
            with self.assertRaises(ValueError,msg=kind):preserved_seam_rules(b,bad,checks,final)
