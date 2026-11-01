"""Registered source-preserving background ownership for erroneous ASR clocks."""
import hashlib,math
from boundary_quality import finite
from quiet_gaps import GAP_POLICY,digest,rms,same_source_measurements
from reviewed_partial_sources import _material
from numeric_alignment import NUMERIC_POLICY

REVIEWED_BACKGROUND_SOURCE_POLICY={
    'version':'registered-numeric-full-source-background-clock-ownership-v1',
    'numericPolicy':NUMERIC_POLICY,
    'source':'all-original-model-clocks-and-raw-failed-report-retained; full-source-VAD-bound-to-raw-report',
    'background':'exact-original-ASR-range-has-no-source-VAD-speech-and-bounded-original-PCM',
    'maximumRms':.1,'relativeRms':.5,'frameSamples':160,
    'ownership':'complete-original-range-retained-in-one-source-protected-verse; ASR-word-is-diagnostic',
    'clockExceptions':False,'textChanges':False,'discardedSourceSamples':False,
}


def background_gap_owners(base,receipt,materials):
    raw=next(m['utf8'] for m in materials if m['file']==receipt['baseReportFile'])
    if (receipt['schemaVersion']!=21 or digest(base)!=receipt['baseEvidenceSha256']
        or _material(receipt,materials,receipt['baseReportFile'])!=base):raise ValueError('Need the exact original background-clock report')
    audit=_material(receipt,materials,receipt['sourceAuditFile']);proofs=_material(receipt,materials,receipt['backgroundEvidenceFile']);count=round(base['duration']*16000)
    if (audit['key']!=base['key'] or audit['sourceAudioSha256']!=base['sourceAudioSha256']
        or audit['sourceReportSha256']!=hashlib.sha256(raw.encode()).hexdigest() or audit['sampleCount']!=count
        or audit['vadModelSha256']!=GAP_POLICY['vadModelSha256']):raise ValueError('Background VAD must bind the full original source')
    previous=0
    for x,y in audit['speechSegments']:
        if type(x) is not int or type(y) is not int or not previous<=x<y<=count:raise ValueError('Invalid original source VAD')
        previous=y
    owners={};assignments={a['index']:a for a in receipt['gapAssignments']}
    if not proofs:raise ValueError('No registered background-clock proof')
    for p in proofs:
        i=p['index'];g=base['unclaimedSpeech'][i];lo,hi=p['range'];refs=p['referenceRms'];ranges=p['referenceRanges'];frames=p['frameRms'];owner=assignments[i]
        if (type(i) is not int or i in owners or p['ownerVerse']!=owner['ownerVerse'] or p['gapSha256']!=digest(g)
            or owner['gapSha256']!=digest(g) or g['kind']!='between-verses' or g.get('allowedHeadingOrClosing') is not False
            or [lo,hi]!=[round(g['start']*16000),round(g['end']*16000)] or not 0<=lo<hi<=count
            or any(max(lo,x)<min(hi,y) for x,y in audit['speechSegments'])
            or len(refs)!=2 or len(ranges)!=2
            or any(not finite(v) or not 0<v<=1 for v in refs)
            or any(type(x) is not int or type(y) is not int or not 0<=x<y<=count or not any(max(x,a)<min(y,b) for a,b in audit['speechSegments']) for x,y in ranges)
            or len(frames)!=math.ceil((hi-lo)/160) or any(not finite(v) or not 0<=v<=min(.1,min(refs)*.5) for v in frames)):
            raise ValueError('An original background interval contains speech, excessive signal, or changed evidence')
        owners[i]=p['ownerVerse']
    return owners


def background_source_measurements_match(base,receipt,materials,pcm):
    try:
        background_gap_owners(base,receipt,materials)
        if len(pcm)!=round(base['duration']*16000):return False
        for p in _material(receipt,materials,receipt['backgroundEvidenceFile']):
            lo,hi=p['range'];refs=[rms(pcm,*b) for b in p['referenceRanges']];frames=[rms(pcm,i,min(i+160,hi)) for i in range(lo,hi,160)]
            if any(not 0<v<=1 for v in refs) or any(not 0<=v<=min(.1,min(refs)*.5) for v in frames):return False
            if not same_source_measurements({'referenceRms':p['referenceRms'],'frameRms':p['frameRms']},{'referenceRms':refs,'frameRms':frames}):return False
        return True
    except (KeyError,TypeError,ValueError,IndexError,StopIteration):return False
