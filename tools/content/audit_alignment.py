"""Independent Whisper checks of CTC-rejected verses; never rewrites Bible text.

This report distinguishes a weak acoustic alignment from a different spoken text.
Whisper output is diagnostic evidence, not an authoritative Bible translation.
"""
import argparse
import json
from pathlib import Path
import re
from align_audio import ROOT, acoustic_text, atomic_json
from forced_alignment import SCHEMA_VERSION, character_error_rate


def audit(args):
    from faster_whisper import WhisperModel
    paths = sorted((ROOT/'storage/alignment/chapters').glob('*.json'))
    model = None
    completed = 0
    for path in paths:
        artifact = json.loads(path.read_text())
        if artifact.get('schemaVersion') != SCHEMA_VERSION or (artifact['quality']['accepted'] and not args.include_accepted):
            continue
        if args.keys and artifact['key'] not in args.keys.split(','):
            continue
        segments = artifact.get('segments', [])
        media = artifact.get('mediaPath', '').rsplit('/', 1)[-1]
        audio = ROOT/'storage/alignment/media'/media
        if not segments or not media or not audio.is_file(): continue
        output = ROOT/'storage/alignment/audits'/path.name
        previous = json.loads(output.read_text()) if output.is_file() else None
        if previous and previous.get('fingerprint') == artifact['fingerprint'] and (not args.all_verses or len(previous['checks']) == len(segments)): continue
        if model is None:
            model = WhisperModel('small', device='cpu', compute_type='int8', cpu_threads=4, local_files_only=True)
        numbers = {int(m.group(1)) for reason in artifact['quality']['reasons'] if (m := re.search(r':(\d+)$', reason))}
        if args.all_verses: numbers = {s['verse'] for s in segments}
        checks = []
        locale = artifact['key'].rsplit(':', 1)[-1]
        for i, segment in enumerate(segments):
            if segment['verse'] not in numbers: continue
            start = max(segments[i-1]['end'] if i else 0, segment['start']-.75)
            end = min(segments[i+1]['start'] if i+1 < len(segments) else artifact['duration'], segment['end']+1)
            recognized, info = model.transcribe(str(audio), language=locale,
                                                clip_timestamps=f'{start},{end}', word_timestamps=True,
                                                condition_on_previous_text=False, beam_size=5,
                                                temperature=0, vad_filter=False)
            transcript = list(recognized)
            text = ''.join(s.text for s in transcript).strip()
            cer = character_error_rate(acoustic_text(segment['text'], locale), acoustic_text(text, locale))
            checks.append({'verse':segment['verse'], 'start':start, 'end':end,
                           'printedText':segment['text'], 'independentTranscript':text,
                           'normalizedErrorRate':round(cer, 4),
                           'words':[{'text':w.word,'start':w.start,'end':w.end,'probability':w.probability} for s in transcript for w in (s.words or [])]})
        report = {'key':artifact['key'],'fingerprint':artifact['fingerprint'],
                  'recognizer':'Systran/faster-whisper-small',
                  'policy':'Diagnostic only; preserve canonical reading text and do not accept conflicting audio automatically.',
                  'checks':checks,'unclaimedSpeech':artifact.get('unclaimedSpeech',[])}
        atomic_json(output, report)
        print(json.dumps(report,ensure_ascii=False),flush=True)
        completed += 1
        if args.limit and completed >= args.limit: break


if __name__ == '__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--keys',help='Optional comma-separated book:chapter:locale references')
    parser.add_argument('--limit',type=int)
    parser.add_argument('--include-accepted',action='store_true')
    parser.add_argument('--all-verses',action='store_true')
    audit(parser.parse_args())
