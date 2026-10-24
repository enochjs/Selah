# 内容工具

运行中的 App 和 Server 不依赖 Python。经文及播放索引的唯一发布位置为 `packages/content/data/`；音频、WebVTT、原始下载和核对数据位于 `storage/resources/`。

## 当前站点资源

从 https://chineseandenglishbible.com/ 获取当前 NIV / 和合本书卷，以及站点实际使用的 BibleGateway 英文 MP3 和 WordProject 普通话 MP3。`download_site.py` 不使用旧目录，所有 HTTP 收据及原文写入新快照。`site_resources.py` 将来源节号映射到稳定书卷 ID，保留省略与合并经节。下载和正式媒体均校验 SHA-256，损坏文件通过临时文件原子替换恢复。

`align_site.py` 使用独立 Whisper 识别，再用 WhisperX 对参考文本做词级声学对齐。检查完整朗读覆盖、句间多余语音、措辞及置信度，不使用字数估算，也不读取旧 `.timing.json` 或 `storage/alignment/`。匹配的章节生成 USFM cue ID 的 WebVTT 和经节独立 MP3；未通过检查的章节仅整章播放。句子分词使用按当前英文原文训练的 NLTK Punkt；它只分同一经节内的句子，不决定经节时长。

模型环境为 Python 3.11：

```bash
uv venv --python 3.11 tools/content/.venv-align
uv pip install --python tools/content/.venv-align/bin/python -r tools/content/requirements-alignment.txt
uv pip install --python tools/content/.venv-align/bin/python --no-deps -r tools/content/requirements-site.txt
```

需要 FFmpeg / ffprobe。WhisperX 只使用音素对齐模块，不安装或运行说话人分离服务。首次准备模型（公开模型，无需 API Key）：

```python
from huggingface_hub import snapshot_download
snapshot_download('Systran/faster-whisper-small', revision='536b0662742c02347bc0e980a01041f333bce120')
snapshot_download('facebook/wav2vec2-base-960h', revision='22aad52d435eb6dbaf354bdad9b0da84ce7d6156')
snapshot_download('jonatasgrosman/wav2vec2-large-xlsr-53-chinese-zh-cn', revision='99ccb2737be22b8bb50dcfcc39ad4d567fb90cfd')
```

在模型环境执行这段 Python 后，批处理使用离线、固定 revision 的模型。运行：

```bash
npm run resources:import
npm run resources:align
npm run resources:align -- --locale en --keys psalms:23:en
npm run check:content
npm run test:resources
tools/content/.venv-align/bin/python -m unittest discover -s tools/content/tests -p 'test_*.py'
```

需要指定或恢复某个快照时：

```bash
python3 tools/content/site_pipeline.py --snapshot storage/resources/cache/site-20261024
```

完整下载完成后才发布新书卷和整章媒体。两个语言工作进程分别核对，一个发布进程逐批更新；发布锁覆盖读取与写入，避免旧索引覆盖新结果。每次换数据集备份原索引；每份对齐绑定源 MP3、规范化前的原文及处理配方。缓存命中时仍修复缺失或损坏的经节 MP3、WebVTT。发布前验证实际媒体哈希，进度记录在快照内。`finished` 表示所有工作已处理，并不表示全部通过核对；通过、待处理、待复核分别计数。

## 历史工具

`resources:import:providers` 可显式导入旧 BSB / 合成中文资源；`resources:import:legacy` 及 `alignment:*` 仅供历史数据维护。它们不得覆盖当前站点资源集。旧项目与 `storage/alignment/` 的历史材料保持原样。
