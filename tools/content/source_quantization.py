"""Registered original-PCM quantization-floor evidence for phantom ASR gaps.

This is not a general low-volume or no-VAD shortcut. Every sample of a wide
guard must match fixed source evidence and remain at the s16 quantization floor.
"""
import base64,hashlib,json,sys
from array import array
from boundary_quality import finite
from quiet_gaps import digest,rms

QUANTIZATION_POLICY={'version':'registered-source-quantization-floor-gap-v1','sampleRate':16000,
 'maximumPeakLsb':4,'maximumRmsLsb':1,'decoderToleranceLsb':1,
 'minimumGuardSamples':6400,'leadingGuardSamples':3200,'trailingGuardSamples':1600,
 'proof':'fixed-complete-s16le-window-and-byte-sha; every-source-sample-rechecked',
 'scope':'registered-original-unclaimed-clock-only; all-other-gaps-strictly-owned',
 'originalFacts':'ASR-text-clock-and-false-flag-unchanged; never-fake-heading-or-verse-owner'}


def quantization_rules(base,receipt,materials):
    entries=receipt['sourceSilences']
    if not entries or not materials or len({m['file'] for m in materials})!=len(materials):raise ValueError('Need complete registered source quantization-floor evidence')
    data={m['file']:m['utf8'] for m in materials};approved={m['file']:m['sha256'] for m in receipt['evidence']};rules={};count=round(base['duration']*16000);p=QUANTIZATION_POLICY
    for e in entries:
        i=e['gapIndex'];lo,hi=e['windowSamples']
        if (type(i) is not int or not 0<=i<len(base['unclaimedSpeech']) or i in rules
            or type(lo) is not int or type(hi) is not int or not 0<=lo<hi<=count or hi-lo<p['minimumGuardSamples']):raise ValueError('Invalid or too short quantization-floor guard')
        gap=base['unclaimedSpeech'][i]
        if (e['gapSha256']!=digest(gap) or gap.get('allowedHeadingOrClosing') is not False
            or not all(finite(t) for t in [gap['start'],gap['end']]) or not 0<=gap['start']<=gap['end']<=base['duration']):raise ValueError('Wrong original unclaimed source clock')
        start,end=round(gap['start']*16000),round(gap['end']*16000)
        if lo>start-min(p['leadingGuardSamples'],start) or hi<end+min(p['trailingGuardSamples'],count-end):raise ValueError('Guard does not cover the entire original clock and surrounding source context')
        text=data[e['evidenceFile']]
        if hashlib.sha256(text.encode()).hexdigest()!=approved[e['evidenceFile']]:raise ValueError('Quantization-floor source evidence changed')
        doc=json.loads(text);raw=base64.b64decode(doc['pcmS16LeBase64'],validate=True);samples=array('h');samples.frombytes(raw)
        if sys.byteorder!='little':samples.byteswap()
        if (doc['key']!=base['key'] or doc['sourceAudioSha256']!=base['sourceAudioSha256'] or doc['format']!='s16le' or doc['sampleRate']!=16000
            or doc['sampleRange']!=[lo,hi] or doc['sampleCount']!=hi-lo or len(samples)!=hi-lo
            or doc['pcmSha256']!=hashlib.sha256(raw).hexdigest()):raise ValueError('Wrong original PCM witness identity')
        peak=max(abs(v) for v in samples);volume=rms(samples,0,len(samples));nonzero=sum(v!=0 for v in samples)
        if (type(doc['peakLsb']) is not int or doc['peakLsb']!=peak or peak>p['maximumPeakLsb']
            or not finite(doc['rms']) or abs(doc['rms']-volume)>1e-12 or volume>p['maximumRmsLsb']/32768
            or type(doc['nonzeroSamples']) is not int or doc['nonzeroSamples']!=nonzero):raise ValueError('Witness is not at the registered quantization floor')
        rules[i]={'window':[lo,hi],'samples':samples}
    return rules


def quantization_floor_matches(base,receipt,pcm,materials):
    try:
        rules=quantization_rules(base,receipt,materials);p=QUANTIZATION_POLICY
        if len(pcm)!=round(base['duration']*16000):return False
        for rule in rules.values():
            lo,hi=rule['window'];actual=pcm[lo:hi]
            if (max(abs(v) for v in actual)>p['maximumPeakLsb']
                or rms(actual,0,len(actual))>p['maximumRmsLsb']/32768
                or any(abs(a-b)>p['decoderToleranceLsb'] for a,b in zip(actual,rule['samples']))):return False
        return True
    except (KeyError,TypeError,ValueError,IndexError):return False
