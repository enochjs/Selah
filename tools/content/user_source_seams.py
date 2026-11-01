"""Fixed human acceptance of a nonquiet source seam, with raw clock exceptions.

This identity never calls a continuous voiced seam silent. It preserves the
exact human decision, uncertain source interval, and original model words.
"""
from boundary_quality import finite
from quiet_gaps import rms
from timed_text import normalized

USER_SOURCE_SEAM_POLICY={'version':'registered-user-source-seam-and-clock-exception-v1',
 'base':'registered-truncated-source-window-recovery-v1','scope':'one-explicit-human-accepted-adjacent-natural-seam',
 'source':'nonquiet-pcm-remeasured-without-claiming-voice-free-or-unambiguous-separation',
 'modelException':'exact-original-boundary-word-only; maximum-clock-overlap-200ms; raw-model-unchanged',
 'otherEdges':'independently-reviewed-original-source-quiet-windows',
 'retainedSource':'every-registered-known-source-span-must-remain-in-its-verse',
 'approval':'source-controlled-exact-receipt-sha256-with-human-decision-and-uncertainty'}


USER_PRESERVED_SEAM_POLICY={**USER_SOURCE_SEAM_POLICY,
 'version':'registered-user-source-seam-preserved-word-clocks-v1',
 'scope':'one-explicit-human-accepted-adjacent-natural-seam-with-all-original-word-bodies-retained',
 'modelException':'none; every original model word must fit complete final range and protected core',
 'modelClockExceptionsAllowed':False}


def user_seam_rules(base,receipt,checks,final):
    if (receipt['approvedBy']!='user-natural-seam-tolerance' or receipt['sourceAcousticApproval'] is not False
        or not isinstance(receipt['humanDecision'],str) or not receipt['humanDecision'].strip()):raise ValueError('Need the fixed explicit human source-seam decision')
    seam=receipt['naturalSeam'];left,right,cut=seam['leftVerse'],seam['rightVerse'],seam['cut'];uncertainty=seam['uncertainty'];numbers=base['expectedVerseNumbers']
    if (numbers.index(right)!=numbers.index(left)+1 or not finite(cut) or len(uncertainty)!=2 or not all(finite(t) for t in uncertainty)
        or not 0<uncertainty[1]-uncertainty[0]<=.040000001 or not uncertainty[0]<=cut<=uncertainty[1]
        or final[left]['end']!=cut or final[right]['start']!=cut):raise ValueError('Need one exact adjacent shared natural seam')
    natural=[c for c in receipt['cuts'] if c.get('measurementKind')=='user-natural-seam']
    if (len(natural)!=2 or {(c['verse'],c['side']) for c in natural}!={(left,'tail'),(right,'head')}
        or any(c['window']!=[round(t*16000) for t in uncertainty] for c in natural)
        or any('ownVoice' in c or c.get('measurementKind') not in {None,'user-natural-seam'} for c in receipt['cuts'])):
        raise ValueError('Only the explicitly accepted shared seam may use nonquiet measurements')
    exceptions={}
    for e in receipt['modelClockExceptions']:
        v,i,side=e['verse'],e['wordIndex'],e['side'];words=checks[v]['alignedWords'];lexical=[j for j,w in enumerate(words) if normalized(w.get('word',''))]
        if (v in exceptions or type(i) is not int or i not in lexical or e['originalWord']!=words[i]
            or not ((v==right and side=='head' and i==lexical[0]) or (v==left and side=='tail' and i==lexical[-1]))):raise ValueError('Only an exact original boundary word may have a registered clock exception')
        w=words[i]
        if not all(finite(t) for t in [w['start'],w['end']]) or not w['start']<cut<w['end']:raise ValueError('Registered word does not actually cross the accepted seam')
        overlap=cut-w['start'] if side=='head' else w['end']-cut
        if not 0<overlap<=.2:raise ValueError('Original model clock exception is too large')
        exceptions[v]=e
    if receipt['schemaVersion'] in {8,16,22,43}:
        if exceptions:raise ValueError('Preserved-clock seam cannot authorize a model clock exception')
    elif not exceptions:raise ValueError('This identity requires an explicit original model clock discrepancy')
    spans=receipt['retainedSourceSpans'];seen=set()
    if not spans:raise ValueError('Need fixed known source voice spans')
    for span in spans:
        v=span['verse'];lo,hi=span['range'];signature=(v,lo,hi)
        if (signature in seen or v not in final or not all(finite(t) for t in [lo,hi])
            or not final[v]['start']<=lo<hi<=final[v]['end']):raise ValueError('A registered known source span was discarded')
        seen.add(signature)
    def word_fits(v,w,lo,hi,core=False):
        if lo<=w['start']<w['end']<=hi:return True
        e=exceptions.get(v)
        if e is None or w!=e['originalWord']:return False
        if e['side']=='head':return (cut<=lo<=uncertainty[1] if core else lo==cut) and w['start']<lo<w['end']<=hi
        return (uncertainty[0]<=hi<=cut if core else hi==cut) and lo<=w['start']<hi<w['end']
    return word_fits


def measure_user_source_cut(cut,pcm):
    if cut.get('measurementKind')!='user-natural-seam':
        from reviewed_boundaries import _measure
        return _measure(cut,pcm)
    lo,hi=cut['window'];return {'verse':cut['verse'],'window':cut['window'],
      'referenceRms':[rms(pcm,*bounds) for bounds in cut['referenceRanges']],
      'frameRms':[rms(pcm,i,min(i+160,hi)) for i in range(lo,hi,160)]}
