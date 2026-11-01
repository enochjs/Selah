"""Create a read-only listening checklist from published status and alignment evidence."""
import argparse
from collections import Counter
from datetime import datetime
import hashlib
import json
import math
from pathlib import Path
import re
import tempfile
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[2]
STATUS_LABELS = {'aligned': '完整通过', 'partial': '部分通过',
                 'review-required': '待复核', 'pending': '待处理'}
ASR_NOTICE = '仅为识别诊断，不能据此认定录音内容、漏读或缺录；请试听原录音。'


def _read(path):
    return json.loads(path.read_text(encoding='utf8'))


def _sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _range(value):
    if (isinstance(value, (list, tuple)) and len(value) == 2
            and all(isinstance(n, (int, float)) and not isinstance(n, bool)
                    and math.isfinite(n) for n in value)
            and 0 <= value[0] <= value[1]):
        return list(value)
    return None


def _aliases(number, recording, artifact, verses, locale, chapter):
    covered = {number}
    for item in [*recording.get('verseFiles', []), *artifact.get('checks', []),
                 *artifact.get('boundarySourceVerses', [])]:
        if item.get('verse', item.get('number')) == number:
            covered.update(item.get('coveredVerses', []))
    for verse in verses:
        merged = verse.get(locale + 'MergedInto')
        if merged == number or (isinstance(merged, dict)
                                and merged.get('verse') == number and merged.get('chapter') == chapter):
            covered.add(verse['number'])
    return sorted(covered)


def _reason(codes, check):
    if any(code.startswith('unreliable-verse-boundary') for code in codes):
        reason = '经节起止声学边界尚未可靠确认，需试听首尾是否完整及有无串入相邻经节。'
    elif any('mismatch' in code or 'correspondence' in code for code in codes):
        reason = '识别结果与参考文本的对应关系待核对；识别差异不等于录音缺漏。'
    else:
        reason = '自动核对尚未通过，具体原因需结合原始 issue codes 和原录音复核。'
    if check is None:
        reason += ' 缺少该经节的 check 明细，不能推定缺录或编造时间。'
    return reason


def _diagnostics(check, artifact, time_range):
    result = []
    if check and check.get('independentTranscript'):
        result.append({'origin': 'check.independentTranscript',
                       'text': check['independentTranscript'], 'notice': ASR_NOTICE})
    if time_range:
        for segment in artifact.get('recognition', []):
            span = _range([segment.get('start'), segment.get('end')])
            if span and span[0] <= time_range[1] and span[1] >= time_range[0]:
                result.append({'origin': 'recognition', 'segment': segment,
                               'text': segment.get('text', ''), 'notice': ASR_NOTICE})
    return result


def _verse_problem(number, kind, codes, recording, artifact, verses, locale, chapter):
    check = next((c for c in artifact.get('checks', []) if c.get('verse') == number), None)
    acoustic = _range((check or {}).get('boundaryEvidence', {}).get('acousticCore'))
    search = _range((check or {}).get('searchRange'))
    time_range = search or acoustic
    reason = ('已确认原录音未朗读本节（以发布目录 missingVerses 明确标注为准）。'
              if kind == 'confirmed-missing' else _reason(codes, check))
    return {'verse': number, 'coveredVerses': _aliases(number, recording, artifact, verses, locale, chapter),
            'kind': kind, 'issueCodes': codes, 'reason': reason, 'timeRange': time_range,
            'timeSource': 'check.searchRange' if search else 'boundaryEvidence.acousticCore' if acoustic else None,
            'acousticCore': acoustic, 'check': check,
            'referenceText': next((v.get(locale, '') for v in verses if v['number'] == number), ''),
            'asrDiagnostics': _diagnostics(check, artifact, time_range)}


def _nearby(gap_range, recording, artifact, verses, locale, chapter):
    if gap_range is None:
        return []
    cues = [(cue, _range([cue.get('start'), cue.get('end')])) for cue in artifact.get('cues', [])]
    cues = [(cue, span) for cue, span in cues if span is not None]
    if not cues:
        cues = [(check, _range(check.get('boundaryEvidence', {}).get('acousticCore'))
                 or _range(check.get('searchRange'))) for check in artifact.get('checks', [])]
        cues = [(cue, span) for cue, span in cues if span is not None]
    overlapping = [cue for cue, span in cues if span[0] <= gap_range[1] and span[1] >= gap_range[0]]
    before = [(cue, span) for cue, span in cues if span[1] <= gap_range[0]]
    after = [(cue, span) for cue, span in cues if span[0] >= gap_range[1]]
    adjacent = [*overlapping]
    if before:
        adjacent.append(max(before, key=lambda pair: pair[1][1])[0])
    if after:
        adjacent.append(min(after, key=lambda pair: pair[1][0])[0])
    return sorted({n for cue in adjacent for n in _aliases(cue['verse'], recording, artifact, verses, locale, chapter)})


def _problems(recording, artifact, verses, locale, chapter, codes):
    confirmed = {item['verse'] for item in recording.get('missingVerses', [])
                 if item.get('reason') == 'not-narrated-in-source'}
    by_verse = {}
    for code in codes:
        match = re.search(r':(\d+)$', code)
        if match:
            by_verse.setdefault(int(match[1]), []).append(code)
    for check in artifact.get('checks', []):
        if check.get('boundaryVerified') is False or check.get('boundaryEvidence', {}).get('passed') is False:
            by_verse.setdefault(check['verse'], [])
    result = [_verse_problem(number, 'confirmed-missing' if number in confirmed else 'review',
                             by_verse.get(number, []), recording, artifact, verses, locale, chapter)
              for number in sorted(confirmed | by_verse.keys())]
    gap_codes = [code for code in codes if 'unassigned' in code or 'gap' in code]
    if gap_codes:
        for gap in artifact.get('unclaimedSpeech', []):
            if gap.get('allowedHeadingOrClosing'):
                continue
            span = _range([gap.get('start'), gap.get('end')])
            result.append({'verse': None, 'kind': 'gap-review', 'issueCodes': gap_codes,
                           'nearbyVerses': _nearby(span, recording, artifact, verses, locale, chapter),
                           'timeRange': span, 'timeSource': 'unclaimedSpeech.start/end' if span else None,
                           'reason': '未归属间隙的声学/识别证据待核对；邻近经节仅用于定位，不能据此认定缺录。',
                           'gap': gap, 'asrDiagnostics': [
                               {'origin': 'unclaimedSpeech', 'text': gap.get('text', ''), 'notice': ASR_NOTICE},
                               *_diagnostics(None, artifact, span)]})
    verse_codes = {code for row in result for code in row['issueCodes']}
    unassigned = [code for code in codes if code not in verse_codes]
    if unassigned or not result:
        result.append({'verse': None, 'kind': 'pending' if recording.get('alignmentStatus') == 'pending' else 'review',
                       'issueCodes': unassigned, 'timeRange': None, 'timeSource': None,
                       'reason': ('尚无可用于定位的核对明细，待处理；不能推定缺录。'
                                  if not artifact else '章节级问题待核对，尚不能可靠定位到具体经节。'),
                       'asrDiagnostics': []})
    return result


def _escape(value):
    return str(value).replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;').replace('|', '\\|').replace('\n', '<br>')


def _time(value):
    if value is None:
        return '未确定'
    def stamp(seconds):
        return f'{int(seconds // 60):02d}:{seconds % 60:06.3f}'
    return f'{stamp(value[0])}–{stamp(value[1])}'


def _markdown(report):
    summary = report['summary']
    lines = ['# 逐节播放复核清单', '', f'生成时间：{report["generatedAt"]}（北京时间）', '',
             f'完整通过 **{summary["alignedRecordings"]}** 章；部分通过 **{summary["partialRecordings"]}** 章；'
             f'待复核 **{summary["reviewRecordings"]}** 章；待处理 **{summary["pendingRecordings"]}** 章。', '',
             f'本清单列出全部 {summary["problemRecordings"]} 个部分通过、待复核和待处理录音；'
             f'明确缺录共 {summary["missingVerseCount"]} 节。部分通过不计入完整通过。', '',
             '原录音保留，未替换。部分通过章节的其余已核对经节可继续逐节播放；问题留待人工查看与后续处理。', '',
             '待复核表示自动切分尚未确认，不代表原录音读错或漏读。', '',
             f'ASR 文本{ASR_NOTICE} “待确认”“缺少 check”或间隙异常均不等于确认缺录。', '',
             f'快照：`{report["snapshot"]}`。时间范围用于试听定位，不是新发布的经节边界。', '']
    for entry in report['chapters']:
        label = STATUS_LABELS[entry['status']]
        lines.extend([f'## {entry["book"]["zh"]} / {entry["book"]["en"]} 第 {entry["chapter"]} 章 · '
                      f'{"中文" if entry["locale"] == "zh" else "英文"} · {label}', '',
                      f'完整 key：`{entry["key"]}`', '',
                      f'[原始 MP3](<{entry["sourceAudioPath"]}>) · '
                      f'[alignment 报告](<{entry["alignmentReportPath"]}>)'
                      + ('' if entry['alignmentReportExists'] else '（文件尚不存在）'), '',
                      f'来源 URL：[{entry["sourceUrl"]}](<{entry["sourceUrl"]}>)' if entry['sourceUrl'] else '来源 URL：未提供', '',
                      f'原音 SHA-256：`{entry["sourceAudioSha256"] or "未提供"}`  ',
                      f'原文 SHA-256：`{entry["textSha256"] or "未提供"}`', '',
                      '原始 issue codes：' + ('、'.join(f'`{_escape(code)}`' for code in entry['issueCodes']) or '无'), '',
                      '| 经节 / 邻近定位 | 时间范围 | 保守说明 | 原始 issue codes |',
                      '| --- | --- | --- | --- |'])
        for problem in entry['problems']:
            verse = ('、'.join(map(str, problem['coveredVerses'])) if problem.get('verse') is not None
                     else '邻近 ' + '、'.join(map(str, problem['nearbyVerses'])) if problem.get('nearbyVerses') else '章级 / 未定位')
            lines.append(f'| {verse} | {_time(problem["timeRange"])} | {_escape(problem["reason"])} | '
                         + '<br>'.join(_escape(code) for code in problem['issueCodes']) + ' |')
        diagnostics = list(dict.fromkeys(d['text'] for p in entry['problems'] for d in p.get('asrDiagnostics', []) if d.get('text')))
        if diagnostics:
            lines.extend(['', 'ASR 片段（仅为识别诊断，不能当作录音事实；完整明细见 JSON）：', ''])
            lines.extend(f'- {_escape(text[:240])}{"…" if len(text) > 240 else ""}' for text in diagnostics)
        lines.append('')
    return '\n'.join(lines)


def _write(path, text):
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(mode='w', encoding='utf8', dir=path.parent, delete=False) as handle:
        temporary = Path(handle.name)
        handle.write(text)
    try:
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)


def generate_report(snapshot, root, markdown_path, json_path):
    """Write two review artifacts without changing content, recordings, or alignment files."""
    snapshot, root = Path(snapshot).resolve(), Path(root).resolve()
    markdown_path, json_path = Path(markdown_path).resolve(), Path(json_path).resolve()
    content = root / 'packages/content/data'
    if markdown_path == json_path or any(path.is_relative_to(content) or path.is_relative_to(snapshot)
                                         for path in [markdown_path, json_path]):
        raise ValueError('Report destinations must be distinct and outside source content and snapshot directories')
    catalog = _read(content / 'chapter-audio.json')
    manifest = _read(content / 'resource-manifest.json')
    books = {book['id']: book for book in _read(content / 'bible.json')}
    counts = Counter(recording.get('alignmentStatus', 'pending') for recording in catalog.values())
    summary = {'recordings': len(catalog), 'alignedRecordings': counts['aligned'],
               'partialRecordings': counts['partial'], 'reviewRecordings': counts['review-required'],
               'pendingRecordings': counts['pending'],
               'problemRecordings': counts['partial'] + counts['review-required'] + counts['pending'],
               'missingVerseCount': sum(item.get('reason') == 'not-narrated-in-source'
                                        for recording in catalog.values() for item in recording.get('missingVerses', []))}
    chapters = []
    for key, recording in catalog.items():
        status = recording.get('alignmentStatus', 'pending')
        if status not in {'partial', 'review-required', 'pending'}:
            continue
        book_id, chapter_value, locale = key.split(':')
        chapter = int(chapter_value)
        book = books[book_id]
        verses = book['chapters'][chapter - 1]
        artifact_path = snapshot / 'alignment' / (key.replace(':', '__') + '.json')
        artifact = _read(artifact_path) if artifact_path.is_file() else {}
        codes = list(dict.fromkeys([*recording.get('alignmentIssues', []), *artifact.get('issues', [])]))
        source_sha = recording.get('mediaSha256') or artifact.get('sourceAudioSha256')
        if not source_sha:
            match = re.search(r'/([a-f0-9]{64})\.mp3$', recording.get('originalPath', recording.get('path', '')))
            source_sha = match[1] if match else None
        source_path = root / 'storage/resources/media' / (source_sha + '.mp3' if source_sha else 'UNKNOWN-SOURCE.mp3')
        chapters.append({'key': key, 'book': {name: book[name] for name in ['id', 'en', 'zh']},
                         'chapter': chapter, 'locale': locale, 'status': status,
                         'sourceAudioPath': str(source_path), 'sourceAudioExists': source_path.is_file(),
                         'sourceAudioSha256': source_sha,
                         'textSha256': recording.get('alignment', {}).get('textSha256') or artifact.get('textSha256'),
                         'sourceUrl': recording.get('sourceUrl') or artifact.get('sourceUrl'),
                         'alignmentReportPath': str(artifact_path), 'alignmentReportExists': artifact_path.is_file(),
                         'alignmentReportSha256': _sha(artifact_path) if artifact_path.is_file() else None,
                         'issueCodes': codes, 'catalogRecording': recording,
                         'alignmentMetadata': {k: v for k, v in artifact.items()
                                               if k not in {'checks', 'recognition', 'cues', 'unclaimedSpeech'}},
                         'problems': _problems(recording, artifact, verses, locale, chapter, codes)})
    report = {'version': 1, 'generatedAt': datetime.now(ZoneInfo('Asia/Shanghai')).isoformat(timespec='seconds'),
              'snapshot': str(snapshot), 'summary': summary, 'publishedManifest': manifest,
              'inputSha256': {name: _sha(content / name) for name in ['chapter-audio.json', 'resource-manifest.json', 'bible.json']},
              'asrNotice': ASR_NOTICE, 'chapters': chapters}
    _write(markdown_path, _markdown(report))
    _write(json_path, json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    return summary


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--snapshot', required=True, type=Path)
    parser.add_argument('--root', default=ROOT, type=Path)
    parser.add_argument('--output-md', required=True, type=Path)
    parser.add_argument('--output-json', required=True, type=Path)
    args = parser.parse_args()
    print(json.dumps(generate_report(args.snapshot, args.root, args.output_md, args.output_json), ensure_ascii=False))
