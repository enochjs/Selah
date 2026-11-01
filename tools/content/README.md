# 内容工具

运行中的 App 和 Server 不依赖 Python。经文及播放索引的唯一发布位置为 `packages/content/data/`；音频、WebVTT、原始下载和核对数据位于 `storage/resources/`。

## 当前站点资源

从 https://chineseandenglishbible.com/ 获取当前 NIV / 和合本书卷，以及站点实际使用的 BibleGateway 英文 MP3 和 WordProject 普通话 MP3。`download_site.py` 不使用旧目录，所有 HTTP 收据及原文写入新快照。`site_resources.py` 将来源节号映射到稳定书卷 ID，保留省略与合并经节。下载和正式媒体均校验 SHA-256，损坏文件通过临时文件原子替换恢复。

当前逐节播放以经节定位和首尾声学边界为准：`--boundary-review` 复用同一音频SHA的Whisper词时间作为粗定位，用WhisperX重新核对经节声学位置、首尾词与切点，ASR错字、人名拼写和少量措辞差异只作诊断。不能缺头、截尾、串节；整节没有对应朗读、首尾证据弱或经节间有未归属语音仍待复核。发布 USFM cue ID 的WebVTT和独立经节MP3，边界不确定时只整章播放；不使用字数估时或旧 `.timing.json` / `storage/alignment/`。历史严格音文模式仍可显式使用并保留其结果与身份。句子分词使用按当前英文原文训练的 NLTK Punkt；它只分同一经节内的句子，不决定经节时长。

用户2026-10-25确认的边界标准通过独立v11策略指纹发布，备份位于 `alignment-before-boundary-review/`。新报告必须保存完整规范化朗读词序（内部词可无时间，首尾词不可缺失）；纯标点不充当首尾。首尾时间贴近搜索窗口时，需要绝对及相对RMS都达标的静音，或独立ASR词时间与声学边界相互支持。高置信ASR边缘用于保护词头词尾，最终cue必须完整覆盖所采用的边缘；越出搜索窗口时需扩展重对齐，不能截断后放行。publisher重算词序、完整经文SHA、边界、覆盖和时序，不能只凭“通过”标签发布。原文、原录音和旧核对报告不变，不能声称新结果通过了逐字音文核对。

在专用远端目录运行：

```bash
python tools/content/site_pipeline.py --resume-current --boundary-review --jobs-per-locale 4 --threads-per-worker 4
```

当前逐节播放以经节定位和首尾声学边界可靠为准，ASR错字、人名拼写或少量用词差异仅作诊断。`--boundary-review` 生成独立v11身份，保留原录音、原文和 `alignment-before-boundary-review/` 备份；publisher复验完整原文SHA、实际发音首尾、单调时序及未归属语音。

`--boundary-context-review` 仅修复仍未通过的边界报告：将相邻2–3节联合做声学对齐，再按完整经文词序分回原经节，时间来自模型而非字数比例。窗口不越过外侧已验证经节且不超过60秒。整组必须通过同一v11边界门槛、不能产生新的未归属语音；保存完整联合模型输出及分区证据，由publisher复验。v12采用独立指纹，兼容已发布v11结果，旧报告保存在 `alignment-before-joint-boundary-review/`。只在专用远端运行推理：

```bash
python tools/content/site_pipeline.py --resume-current --boundary-context-review --jobs-per-locale 8 --threads-per-worker 2
```

`--acoustic-gap-review` 仅处理全部经节边界已通过、仅残留ASR间隙问题的报告。v13保留原经文、边界和未归属语音记录，对扣除经节范围后的全部残片逐帧测量，并要求全章Silero VAD无语音重叠；零时长及短残片至少核验20ms上下文。发布时从SHA核对后的原录音重新计算PCM测量，不在本机运行VAD或识别模型。旧报告保存在 `alignment-before-acoustic-gap-review/`，原v11/v12通过结果继续有效：

```bash
python tools/content/site_pipeline.py --resume-current --acoustic-gap-review --jobs-per-locale 4 --threads-per-worker 2
```

`--padding-boundary-review` 使用独立v14身份解决相邻经节留白相交的问题：仅在原声学核及合格ASR向外保护互不冲突时，在原留白交集内分配毫秒边界，只向内裁剪，不截断保护区间。publisher从原联合对齐词时间重新分配并核对整组及全章边界；旧v11/v12时间规则不变，旧报告保存在 `alignment-before-joint-padding-review/`。

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

Apple Silicon 可安装 Metal 加速的独立 Whisper large-v3-turbo 识别器，对 small 模型疑似错读的人名、地名和短句进行交叉复核（仍使用上述 WhisperX 模型核对边界）：

```bash
uv pip install --python tools/content/.venv-align/bin/python -r tools/content/requirements-mlx.txt
tools/content/.venv-align/bin/python -c "from huggingface_hub import snapshot_download; snapshot_download('mlx-community/whisper-large-v3-turbo', revision='a4aaeec0636e6fef84abdcbe3544cb2bf7e9f6fb')"
```

识别不提供经文提示词；报告保存实际识别器、模型 revision 和核对配方指纹。缺少可选依赖或模型时继续使用 small。新配方会重新核对已有失败报告，已核对的旧版结果在复核期间继续可用。中文保留录音中朗读的括号说明，仅移除编辑性异文注；章节播报必须匹配当前章号与出现的书卷名，不能包含正文。诗篇题注仅接受当前章来源中明确记载的对应文本。重写旧报告后也会触发增量发布。

全库处理优先复核仅被标题拦截的完整声学报告；通过同样的独立音文和边界检查后，直接补齐 MP3/WebVTT。这个快路径不接受缺节、低置信度、遗漏朗读说明、指纹不匹配或额外正文。其余章节重新对齐；已有当前快照的独立 ASR 证据可以复用，不能复用旧项目时间轴。

核对配方 v6 识别当前章的阿拉伯数字、英文数词和罗马数字播报；书卷名识别有疑问时，对完整标题音频独立复听。英文同音拼写仅使用固定 CMUdict 1.1.3 验证：词数、逐词完整读音集合和重音必须相同，未知人名不做模糊匹配；原字符误差率仍保留，另记 `phoneticVerified`。疑似漏词时，在相邻经节之间扩大搜索范围，再做声学对齐和无经文提示的独立复听，不能凭参考文本强行填补识别结果。未归属语音只有完全位于一个已核对的经节中、且覆盖整段疑点的独立复听与正文逐词精确同音时，才可记为该节已核对的内容；零时长识别和疑似字幕不会直接忽略。

远端多核机器可使用 `--jobs-per-locale 5 --threads-per-worker 2`：中英文各五个进程，每个进程两个计算线程。按稳定经章标识分片，不因优先级变化重复或漏掉章节；每个分片独立记录状态，再由唯一发布进程汇总。CPU 环境可额外准备固定 revision 的 `mobiuslabsgmbh/faster-whisper-large-v3-turbo`，用于疑似错词的独立交叉识别。模型、依赖、缓存和日志应集中在独立临时目录中；NLTK 缓存及其祖先目录不能允许其他账号写入。

首轮结束后，可在远端运行 `tools/content/.venv-align/bin/python tools/content/site_pipeline.py --resume-current --review-rejected --jobs-per-locale 5 --threads-per-worker 2`。第二轮仅处理尚未做过本轮复核的拒绝报告，保留原报告到 `alignment-before-context-review/`；只重听有疑点的经节及相邻边界，不重新扫描已经通过的章节。每次重听都无参考提示，仍须通过原音文和声学阈值。声学核心与识别疑点部分相交时，仅在覆盖整个疑点的完整独立重听与正文严格对应后，允许补回最多400毫秒的已核对句首/句尾，另存 `acousticCore`。独立的额外语音、真实文字差异或无法覆盖的边界继续待复核。

第三轮使用 `--source-review`，保留第二轮报告到 `alignment-before-source-review/`。它只重新检查尚未经过当前配方的拒绝报告；独立重听启用保守VAD，声学对齐仍处理原音频。明确的异文、交叉引用和编辑说明不作为必须朗读的正文，其他括注（例如“他们是作预兆的”）保留。原经文、配音和快照不替换。英文诗篇题注补证来自原配音提供方 BibleGateway 的同版 NIV 页面：`source_metadata.py` 下载原始HTML及HTTP回执到 `caption-references/niv/`，配方固定清单与每份HTTP文件的SHA-256；只读取正文第一节前的完整题注，排除脚注、诗集分卷标记及经节正文。缺少或篡改补证时拒绝启动第三轮，不能用识别结果自行构造参考题注。

v9仅增加5条已在原录音中核实未朗读的完整释义注，并要求匹配原文前缀：亚比央（又名亚比雅）、濠沟（海指尼罗河）、拿八（就是愚顽的意思）、女子的声音（女子就是指民的意思）、挪的亚扪（埃及尊大之神）。阅读正文不变，仍须重新完成独立识别、声学边界和全部语音覆盖验证；不能泛删“又名”“意思”类括注，跨节括注或整节未朗读也不在此规则中。新报告使用不同指纹，已核实的正式v8报告仍有效。

英文难例可显式使用 `site_pipeline.py --resume-current --deep-review --locale en`。仅选择尚未经过v10的拒绝报告，原已通过报告不重算；保留 `alignment-before-deep-review/` 备份。增加独立的完整版 `Systran/faster-whisper-large-v3`，固定revision `edaa852ec7e145841d8ffdb056a99866b5f0a478`，启动前核实官方 `model.bin` SHA-256 `69f74147e3334731bc3a76048724833325d2ec74642fb52620eda87352e3d4f1`（[官方模型文件](https://huggingface.co/Systran/faster-whisper-large-v3/blob/main/model.bin)）。三个识别器的固定版本共同进入指纹；完整版始终无提示、无VAD，仍须原有声学和完整覆盖核对。模型必须预先在独立的远端计算目录下载、核验，不能为重试在用户本机启动推理。升级v9/v10前须让旧发布协调进程退出，核实worker和pipeline锁已释放，再用新版支持集发布，避免旧进程将新报告判为pending。

VAD结果仅用于候选识别，不提供整段覆盖证明。完整覆盖重听按模型顺序在首个精确匹配处停止，省去后续重复推理；若均不匹配，仍保留全部失败候选。标题和未归属语音必须另做无VAD的完整独立重听，才可由标题或经节覆盖；过滤后的检查标记 `independentRangeFiltered`，不能用原始范围冒充完整重听。普通运行与第三轮使用不同配方指纹，修补前的试验性v8报告不能发布或复用。

迁移状态保存在不提交 Git 的 `storage/resources/remote-audio-repair.json`。本机只需运行 `python3 tools/content/sync_remote_audio.py status` 或 `sync`，进行状态读取、按哈希补传 MP3/WebVTT、报告备份和严格发布校验，不加载音频模型。损坏或中断传输的同名文件会重新传输。`cleanup` 仅在全库通过、远端进程已结束、回传索引一致且再次校验本机媒体后，持锁删除有归属标记的指定临时目录；不能删除未完成任务或其他目录。

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

## 离线英汉词典

`packages/content/data/dictionary.json` 保留后台发布的专门释义，查词时优先使用。`dictionary-offline.json` 和 `dictionary-forms.json` 是 ECDICT 的移动端离线子集，包含当前经文中上游已收录的词，以及考试词汇、BNC／当代词频前 30,000 的词和相关原形；不把 77 万条技术词条全部装进客户端。授权全文、固定上游提交、Git blob 和原始 CSV 的 SHA-256 保存在 `dictionary-license.json`，App 查词弹窗可查看授权。

导入工具只写这三个独立文件，不覆盖后台发布词典、经文或用户资料。使用下载的完整 CSV 与上游 MIT LICENSE 运行：

```bash
python3 tools/content/import_dictionary.py --snapshot /path/to/ecdict.csv --license /path/to/LICENSE
```

工具拒绝与固定 Git blob 不一致的快照，保存原始 CSV 到 `storage/resources/cache/dictionary/`，覆盖离线产物前备份到 `storage/resources/backups/dictionary/`。上游下载 URL 记录在授权文件中；GitHub blob API 响应的 `content` 需先从 Base64 解码为 CSV。更新上游版本时同步核对授权及工具中的固定版本。

离线缺词时，App 只向 `dictionaryapi.dev` 发送选中的英文单词，不发送经文、笔记或收藏。补查结果明确标为英文释义，保留词条及录音的来源／授权，单独缓存最多 200 条、有效期 30 天。无结果和网络错误可以重试，收藏不要求填写释义；既有空释义在再次查询或揭晓复习卡时自动补齐。单词发音采用词条提供的录音或设备英语语音合成，合成朗读有明确标识；设备需要可用的英语语音，iOS 静音模式可能影响朗读。新增 `expo-speech` 后，已有原生安装包需重新构建以包含模块。

## 历史工具

`resources:import:providers` 可显式导入旧 BSB / 合成中文资源；`resources:import:legacy` 及 `alignment:*` 仅供历史数据维护。它们不得覆盖当前站点资源集。旧项目与 `storage/alignment/` 的历史材料保持原样。
