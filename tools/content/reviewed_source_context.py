"""Retain the source identity of John 7:53 narrated before John 8:1."""
import copy
import hashlib
import json
from datetime import datetime

from boundary_quality import finite
from quiet_gaps import GAP_POLICY,digest
from reviewed_source_windows import REVIEWED_WINDOW_POLICY,derive_source_window_case
from timed_text import normalized
from verse_completion import _Fragments

REVIEWED_CONTEXT_POLICY={
    'version':'registered-previous-passage-source-preamble-v1',
    'scope':'john:8:en; original-NIV-John7:53-before-imported-John8:1',
    'sourcePolicy':REVIEWED_WINDOW_POLICY,
    'reference':'fixed-full-original-NIV-HTTP-snapshot-and-exact-official-verse-ID',
    'audio':'original-chapter-preserved; source-preamble-is-not-a-heading-or-verse1',
    'voice':'complete-original-source-VAD-bound-to-byte-identical-rejected-base',
    'originalFacts':'original-unassigned-clock-and-false-heading-flag-retained',
    'outputs':'only-real-imported-verses-with-exact-reviewed-source-ranges',
}


def source_context_rule(base,receipt,materials):
    if receipt['schemaVersion']!=14 or base['key']!='john:8:en':
        raise ValueError('Unsupported original source context')
    if not materials or len({m['file'] for m in materials})!=len(materials):
        raise ValueError('Need distinct fixed original source materials')
    actual={m['file']:m['utf8'] for m in materials};approved={m['file']:m['sha256'] for m in receipt['evidence']}
    def read(name):
        raw=actual[name]
        if hashlib.sha256(raw.encode()).hexdigest()!=approved[name]:raise ValueError('Original context source material changed')
        return raw
    raw=read(receipt['baseReportFile'])
    if json.loads(raw)!=base or digest(base)!=receipt['baseEvidenceSha256']:
        raise ValueError('The complete original rejected context proof changed')
    ref=json.loads(read(receipt['contextReferenceFile']))
    if (ref['key']!='john:7:en' or ref['edition']!='NIV'
            or ref['url']!='https://www.biblegateway.com/passage/?search=John%207&version=NIV'
            or datetime.fromisoformat(ref['fetchedAt']).tzinfo is None
            or hashlib.sha256(ref['rawHtml'].encode()).hexdigest()!=ref['sha256']):
        raise ValueError('Wrong original NIV source reference')
    parser=_Fragments('John',7);parser.feed(ref['rawHtml']);parser.result(list(range(1,54)))
    ctx=receipt['sourceContext'];i=ctx['gapIndex'];gaps=base['unclaimedSpeech']
    if type(i) is not int or not 0<=i<len(gaps):raise ValueError('Missing original context clock')
    # NIV may put its manuscript notice in a separate span with this same ID.
    # Select the exact scripture fragment; retain the full original HTML above.
    parts=[p for p in parser.fragments.get(53,[]) if normalized(p)=='thentheyallwenthome']
    if len(parts)!=1:raise ValueError('Need the one exact official previous-verse scripture fragment')
    gap=gaps[i];text=parts[0];lo,hi=ctx['sourceRange']
    if (ctx['referenceKey']!='john:7:en' or ctx['sourceVerse']!=53
            or normalized(text)!='thentheyallwenthome' or normalized(ctx['text'])!=normalized(text)
            or normalized(gap['text'])!=normalized(text) or ctx['gapSha256']!=digest(gap)
            or gap['kind']!='leading' or gap.get('allowedHeadingOrClosing') is not False
            or not all(finite(t) for t in [lo,hi])
            or not 0<=lo<=gap['start']<gap['end']<=hi<=base['cues'][0]['start']
            or any(j!=i and g['start']<hi and lo<g['end'] for j,g in enumerate(gaps))):
        raise ValueError('Only the exact leading previous-passage audio may receive context ownership')
    audit=json.loads(read(receipt['contextAuditFile']));count=round(base['duration']*16000)
    if (audit['key']!=base['key'] or audit['sourceAudioSha256']!=base['sourceAudioSha256']
            or audit['sourceReportSha256']!=hashlib.sha256(raw.encode()).hexdigest()
            or audit['sampleCount']!=count or audit['vadModelSha256']!=GAP_POLICY['vadModelSha256']):
        raise ValueError('Context VAD is not from the complete unchanged original source')
    previous=0;overlap=[]
    for x,y in audit['speechSegments']:
        if type(x) is not int or type(y) is not int or not previous<=x<y<=count:raise ValueError('Invalid original source speech order')
        previous=y
        if max(x,gap['start']*16000)<min(y,gap['end']*16000):overlap.append((x,y))
    if not overlap or any(not lo*16000<=x<y<=hi*16000 for x,y in overlap):
        raise ValueError('A complete context voice interval was lost or crosses verse1')
    return i,dict(referenceKey='john:7:en',sourceVerse=53,text=text,sourceStart=lo,sourceEnd=hi)


def derive_context_source_case(base,receipt,materials):
    index,context=source_context_rule(base,receipt,materials)
    witness=copy.deepcopy(base);witness['unclaimedSpeech']=[g for i,g in enumerate(base['unclaimedSpeech']) if i!=index]
    inner=copy.deepcopy(receipt);inner['schemaVersion']=4
    if any(a['index']==index for a in inner['gapAssignments']):raise ValueError('Previous passage cannot be assigned to an imported verse')
    for a in inner['gapAssignments']:
        if a['index']>index:a['index']-=1
    result=derive_source_window_case(witness,inner,materials)
    result['unclaimedSpeech']=copy.deepcopy(base['unclaimedSpeech'])
    result['narratedSourceContext']=[context]
    return result
