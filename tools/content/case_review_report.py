"""Create the per-chapter result ledger and concrete listening notes after a bounded review."""
import argparse
from collections import Counter
from datetime import datetime
import hashlib
import json
from pathlib import Path
from zoneinfo import ZoneInfo

from site_resources import write_json

ROOT=Path(__file__).resolve().parents[2]
NOTES={
 'no-ordered-asr-location':'整章有序匹配仍未找到该节可靠位置，没有生成切点。',
 'unreliable-verse-boundary':'经节的开始或结束位置尚未可靠确认，具体位置见下表。',
 'weak-edge-word':'句首或句尾的自动声学定位置信度不足，尚不能确认完整切点。',
 'weak-verse-location':'自动对齐位置仍不稳定，需试听候选范围确认。',
 'edge-at-search-limit':'候选发声位置仍贴近搜索窗口，不能排除切掉首尾。',
 'invalid-word-order-or-range':'模型词语时间顺序不可靠，未采用这些切点。',
 'independent-edge-outside-range':'独立时间戳与声学窗口仍有冲突。',
 'boundary-unassigned-speech':'经节间或章首尾仍有未确认归属的片段，不能据此断定漏读。',
 'coverage-neighbor-or-boundary-unverified':'缺录/合并经节与相邻声音的覆盖关系仍未通过完整验证。',
 'unconfirmed-source-coverage':'缺录或合并的证据尚未闭合，未自动跳过。',
 'complete-source-proof-not-confirmed':'候选切点未形成完整一致的全章证明，保留原发布状态。',
 'invalid-search-range-or-empty-verse':'未能找到可靠的完整经节定位。',
 'missing-coverage-not-confirmed':'该经节属于缺录候选，尚未确认缺录；需试听前一节末尾至后一节开头，当前未自动跳过。',
}


def clock(value):
    if not isinstance(value,(int,float)):return '未确定'
    minutes=int(value)//60;seconds=value-minutes*60
    return f'{minutes:02d}:{seconds:06.3f}'


def span(bounds):
    return f'{clock(bounds[0])}–{clock(bounds[1])}' if bounds and len(bounds)==2 else '未确定'


def description(codes):
    values=[]
    for code in codes:
        note=NOTES.get(code.split(':')[0],code)
        if note not in values:values.append(note)
    return '；'.join(values) or '本轮自动方法仍不能可靠确认切点，需人工试听。'


def listening_positions(row):
    positions=list(row.get('verseDetails') or row.get('reviewPositions',[]))
    cues=row.get('candidateCues',[])
    for item in (row.get('candidateCoverageRoles') or {}).get('missingVerses',[]):
        number=item['verse']
        if any(p['verse']==number for p in positions):continue
        before=[c for c in cues if c['verse']<number];after=[c for c in cues if c['verse']>number]
        left=max(before,key=lambda c:c['verse']) if before else None
        right=min(after,key=lambda c:c['verse']) if after else None
        bounds=[left['end'],right['start']] if left and right else None
        positions.append({'verse':number,'searchRange':bounds,'reasons':['missing-coverage-not-confirmed']})
    return positions


def generate(snapshot,selection_path,output_md,output_json,root=ROOT):
    snapshot=Path(snapshot).resolve();root=Path(root).resolve();selection=json.loads(Path(selection_path).read_text())
    catalog=json.loads((root/'packages/content/data/chapter-audio.json').read_text())
    manifest=json.loads((root/'packages/content/data/resource-manifest.json').read_text())
    if manifest['sourceSnapshot']!=selection['sourceSnapshot']:raise ValueError('Current source snapshot changed')
    books={b['id']:b for b in json.loads((root/'packages/content/data/bible.json').read_text())}
    expected={r['key']:r for r in selection['records']};rows=[]
    for key in selection['keys']:
        path=snapshot/'case-review'/(key.replace(':','__')+'.json')
        if not path.exists():raise ValueError('Missing individual result: '+key)
        row=json.loads(path.read_text())
        if row['sourceAudioSha256']!=expected[key]['sourceAudioSha256'] or row['textSha256']!=expected[key]['textSha256']:
            raise ValueError('Chapter source changed: '+key)
        if row['outcome']=='fixed' and catalog[key]['alignmentStatus'] not in {'aligned','partial'}:
            raise ValueError('A generated candidate was not actually published: '+key)
        if row['outcome'] not in {'fixed','manual-review','execution-error'}:raise ValueError('Unknown review outcome')
        row.update(publishedStatus=catalog[key]['alignmentStatus'],notes=description(row.get('remainingIssues',[])),
          originalAudioPath=str(root/'storage/resources/media'/(row['sourceAudioSha256']+'.mp3')),
          resultPath=str(path),originalIssues=expected[key]['originalIssues'])
        row['listeningPositions']=listening_positions(row)
        rows.append(row)
    counts=Counter(row['outcome'] for row in rows)
    unresolved=[row for row in rows if row['outcome']!='fixed']
    report={'generatedAt':datetime.now(ZoneInfo('Asia/Shanghai')).isoformat(timespec='seconds'),
      'sourceSnapshot':selection['sourceSnapshot'],'selected':len(selection['keys']),'reviewed':len(rows),
      'fixed':counts['fixed'],'manualReview':counts['manual-review'],'executionErrors':counts['execution-error'],
      'baselinePlayable':selection['baselinePlayable'],'publishedPlayable':manifest['verseFileRecordings'],
      'publishedManifest':manifest,'records':unresolved}
    latest=Counter(row['individualRound2']['outcome'] for row in rows if row.get('individualRound2'))
    report['latestIndividualRound']={'reviewed':sum(latest.values()),'fixed':latest['fixed'],
        'manualReview':latest['manual-review'],'executionErrors':latest['execution-error']}
    lines=['# 逐章音频处理记录','',f'北京时间：{report["generatedAt"]}','',
      f'已逐章检查 **{len(rows)}/{len(selection["keys"])}** 份；恢复逐节播放 **{counts["fixed"]}** 份；'
      f'留下人工复核备注 **{counts["manual-review"]}** 份；执行错误 **{counts["execution-error"]}** 份。','',
      '原录音、原文和旧报告保留。待复核表示自动方法尚未确认切点，不表示录音读错或漏读。',
      '下方仅列出待复核或执行异常的章节，已恢复章节不再列入问题清单。',
      '下方时间是候选试听位置，不是已发布切点；识别文字只能用于诊断。','']
    for row in unresolved:
        book,chapter,locale=row['key'].split(':');label={'fixed':'已恢复','manual-review':'需人工复核','execution-error':'执行异常'}[row['outcome']]
        lines.extend([f'## {books[book]["zh"]} {chapter}章 · {"英文" if locale=="en" else "中文"} · {label}','',
           f'`{row["key"]}` · [原录音](<{row["originalAudioPath"]}>) · [逐次尝试记录](<{row["resultPath"]}>)',''])
        latest_review=row.get('orderedRelocalizationReview') or row.get('individualRound2',{})
        if latest_review.get('note'):
            lines.extend(['最新逐项复核：'+latest_review['note'],''])
        if row['outcome']=='execution-error':lines.extend(['执行未完成，不能当作录音无法修复：`'+row.get('error','unknown').replace('`',"'")+'`','']);continue
        lines.extend([row['notes'],'',f'本轮记录 {len(row.get("attempts",[]))} 次尝试。原始未通过标记：`'+', '.join(row['originalIssues'])+'`','',
                      '| 经节/片段 | 候选试听范围 | 尚待确认的原因 |','| --- | --- | --- |'])
        positions=row['listeningPositions']
        for item in positions:
            lines.append(f'| {item["verse"]} | {span(item.get("acousticCore") or item.get("searchRange"))} | {description(item.get("reasons",[]))} |')
        for gap in row.get('unassignedIntervals',[]):
            lines.append(f'| {gap.get("kind","未归属片段")} | {span([gap.get("start"),gap.get("end")])} | 未确认归属，需试听；不能据此认定漏读。 |')
        if not positions and not row.get('unassignedIntervals'):lines.append('| 全章证明 | 见逐次尝试记录 | '+row['notes']+' |')
        if row.get('contextReview',{}).get('note'):
            lines.extend(['','最新区间复核：'+row['contextReview']['note']])
        lines.append('')
    Path(output_md).parent.mkdir(parents=True,exist_ok=True);Path(output_md).write_text('\n'.join(lines),encoding='utf8')
    write_json(Path(output_json),report)
    return {k:v for k,v in report.items() if k not in {'records','publishedManifest'}}


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--snapshot',type=Path,required=True);p.add_argument('--selection',type=Path,required=True)
    p.add_argument('--output-md',type=Path,required=True);p.add_argument('--output-json',type=Path,required=True)
    args=p.parse_args();print(json.dumps(generate(args.snapshot,args.selection,args.output_md,args.output_json),ensure_ascii=False))
