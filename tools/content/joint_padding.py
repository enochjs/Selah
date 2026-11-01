"""Allocate overlapping padding without removing any protected spoken interval."""
import copy
import math
from boundary_quality import POLICY,finite
from timed_text import normalized

PADDING_POLICY={'allocation':'protected-core-midpoint-inward-ms-v1','minimumClipSeconds':.35}


def protected_core(check,duration):
    words=[w for w in check['alignedWords'] if normalized(w.get('word',''))]
    start,end=words[0]['start'],words[-1]['end']
    anchors=check.get('asrEdgeAnchors',[])
    if len(anchors)==2:
        for index in [0,1]:
            a=anchors[index]
            if (all(finite(a.get(k)) for k in ['start','end','probability'])
                    and 0<=a['start']<a['end']<=duration
                    and POLICY['minimumAnchorProbability']<=a['probability']<=1):
                if index==0 and abs(a['start']-start)<=POLICY['maximumAnchorPaddingDistance']:start=min(start,a['start'])
                if index==1 and abs(a['end']-end)<=POLICY['maximumAnchorPaddingDistance']:end=max(end,a['end'])
    return start,end


def allocate_padding(checks,cues,duration):
    try:
        out=copy.deepcopy(cues)
        if len(checks)!=len(cues) or not cues:return None
        cores=[protected_core(check,duration) for check in checks]
        for cue,(start,end),check in zip(out,cores,checks):
            if (cue['verse']!=check['verse'] or not cue['start']<=start<end<=cue['end']):return None
        for index in range(len(out)-1):
            left,right=out[index:index+2];end,start=cores[index][1],cores[index+1][0]
            if end>start:return None
            if left['end']>right['start']:
                lower=max(math.ceil(end*1000)/1000,right['start'])
                upper=min(math.floor(start*1000)/1000,left['end'])
                if lower>upper:return None
                cut=min(upper,max(lower,round((end+start)/2,3)))
                left['end']=right['start']=cut
        if any(c['end']-c['start']<PADDING_POLICY['minimumClipSeconds'] for c in out):return None
        return out
    except (KeyError,TypeError,ValueError,IndexError):return None
