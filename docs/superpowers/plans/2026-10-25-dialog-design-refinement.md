# Selah 弹框与底部面板专项修改计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让每个弹框围绕单一任务组织内容，减少无效留白，固定必要操作，保护编辑内容，并统一手机、桌面与键盘行为。

**Architecture:** 沿用 shared/ui.tsx 的 Dialog 与现有动画设施，将面板高度、滚动归属、底部安全区和可关闭状态分开表达。各业务功能自行定义内容层级和提交规则，不引入新的弹框框架，不将业务状态放入公共组件。

**Tech Stack:** Expo 58、React Native 0.88、TypeScript strict、Expo Router、Zustand、Vitest；使用现有依赖。

## 范围与依据

这是《2026-10-25-app-design-refinement.md》的补充计划。原页面精修任务继续保留；公共 Dialog、弹框字号／热区和相关验证以本专项为准，避免重复修改。

本轮仅制定计划，不修改 App 实现。排查覆盖源码中全部 14 处 Dialog 调用，其中 ChapterPicker 同时包含书卷和章节两种内容视图。WordSources 的来源／授权为内联展开，不计作额外 Modal。

证据分为三种：

- 用户截图：手机书卷选择器；可见大标题区、大面积等高卡片和较低的信息密度。截图经过显示缩放，不把截图像素直接当作逻辑尺寸。
- 源码确认：公共头部 padding22＋关闭按钮38，约82高；书卷卡片固定68高、上下各4间距；scrollable=false 会强制 height82%；其余内容结构见下表。
- 运行验证：在当前 1280×720 Web 预览打开书卷和经文搜索；搜索“平安”得到40+条结果后滚动，确认搜索框和计数随结果滚出可视区。移动键盘、原生安全区、读屏与长列表性能尚未实测。

## 全局约束

- Node.js 22.13+；npm workspaces；实现仅在 apps/app，保留根 package-lock.json，不新增依赖。
- 修改 Expo／React Native API 前读取 Expo 58 版本文档；不依据旧版 API 经验实现键盘和 Modal 行为。
- 保留现有配色、字体、品牌、4个一级入口和词汇二级导航；不新增弹框中的营销或装饰区。
- 保留经文／录音来源、授权、词典归属、旧例句与学习资料，不改变下载完整性标准和业务算法。
- 手机书卷保持三列、宽屏四列、完整书名可两行；不增加手机书卷搜索、副标题或章数；桌面保留搜索与详细列表。
- 保留当前书卷／章自动定位、最多6章最近访问和准确经节／节内偏移恢复。
- 保留背景和面板独立动画、减少动态效果适配、onDismiss 后衔接下一个弹框；不同时叠两个业务 Modal。
- 全局播放器不因面板开关而重建或中断；连续朗读仍使用整章录音。
- 阅读外观、界面和主读语言统一进入设置页；桌面现有阅读设置弹框的整合按任务2明确处理，不误判为不可达代码。
- 不通过缩小必要字号、禁用字体缩放、隐藏关闭或裁剪完整书名来提高密度。
- 执行前核对工作区与原页面计划是否已有成果；增量修改，不回退其他工作的未提交变更。

## 全量清单与问题

| 编号 | 弹框／面板与来源                         | 当前问题                                                                           | 目标结构                                                       |
| ---- | ---------------------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| D01  | 阅读书卷／章节，ChapterPicker.tsx:59     | 公共大头部＋固定82%高度；书卷68高；章视图另占一行返回；最近访问进一步挤压列表      | 紧凑固定头部／分组／最近访问＋独立滚动网格；章视图返回并入头部 |
| D02  | 阅读更多，ReaderScreen.tsx:784           | 仅3项动作却继承较重头部；底部使用固定28补偿                                        | 内容自适应的短动作面板；保留关闭完成后跳转                     |
| D03  | 桌面阅读设置，ReaderScreen.tsx:836       | 桌面:465确有入口；对照、字号、行距与设置页重复                                     | 桌面入口直接进入 /settings，移除重复弹框；保留阅读位置         |
| D04  | 经文搜索，Shell.tsx:487                  | 搜索框、提示和结果一起滚动；结果数量改变面板高度；未启用键盘避让；无明确0结果恢复  | 固定输入与状态，结果区独立滚动，手机高面板／桌面居中           |
| D05  | 收藏经文，Shell.tsx:547                  | 长经文全部展开导致列表失衡；空态无去阅读动作；条目缺少角色                         | 空态短面板／有内容高列表；引用＋正文预览＋数量                 |
| D06  | 查词／笔记，WordDialog.tsx:106           | 长词、发音和关闭挤同一行；笔记与来源同级且很淡；已有笔记隐藏；关闭丢未保存修改     | 词头／发音元信息／释义／原句／笔记／来源分层，保留固定保存区   |
| D07  | 添加单词，VocabularyScreen.tsx:484       | 缺键盘提交和避让；CTA在正文；添加到查词同时切两个Modal状态                         | 短表单＋固定查词按钮；关闭完成后打开释义；返回保留本次输入     |
| D08  | 删除单词，VocabularyScreen.tsx:531       | 只有绿色确认动作，缺显式取消                                                       | 紧凑对象确认＋取消／危险色移除                                 |
| D09  | 每日回顾目标，ReviewScreen.tsx:650       | 点选立即写store，底部按钮只关闭却像确认；Pill缺radio选择语义                       | 本地草稿＋等宽单选＋取消／保存；只有保存提交                   |
| D10  | 播放控制，AudioControlsDialog.tsx:95     | 播放摘要、定位、下载、倍速、循环、音量和全队列堆在同一滚动区；倍速／队列入口无差别 | 固定摘要，设置／队列两分区；入口直达对应分区                   |
| D11  | 移除诗歌，MusicScreen.tsx:525            | 只有绿色移除按钮；异步无busy防重复；错误在全局toast                                | 紧凑取消／移除、提交中状态、局部错误与重试                     |
| D12  | 下载书卷选择，OfflineAudioScreen.tsx:753 | 66卷按不等宽按钮堆叠；准备提示在列表末尾；准备中关闭按钮仍显得可用                 | 固定分组＋等宽网格；所选项附近和固定状态区显示准备进度         |
| D13  | 下载确认，OfflineAudioScreen.tsx:791     | 范围、总量、本次量、空间、网络、错误和按钮全在同一滚动区；busy时关闭静默失效       | 对象摘要／突出本次量／空间网络／局部错误＋固定取消／主操作     |
| D14  | 删除书卷音频，OfflineAudioScreen.tsx:912 | 文案和危险色正确，但动作在滚动尾部；busy关闭静默失效                               | 保留影响说明，固定取消／删除，明确执行中状态                   |

上述行号是制定计划时的定位点，执行时按组件名重新核对。下载选择到确认是已有阶段切换，不认定为已经同时叠层；添加单词切换的动画竞态需运行验证。

## 方案与尺寸约定

采用“统一容器规则＋按任务组织内容”。只统一圆角和内边距不足以解决目标误提交、笔记丢失和队列入口问题；为每个业务重建一套 Modal 则会重复安全区与键盘逻辑。

- 普通头部以56–60逻辑高度为基准，左右20、44×44关闭热区；长标题与系统大字允许增高，不能硬裁剪。查词自定义头部允许两行。
- 内容区水平20、垂直16；操作区与正文分离，主按钮至少44高。必要功能文案13–14、辅助文字至少12，采用原页面计划中的合格对比度。
- `heightMode: "content" | "large"` 与 scrollable 独立。content 按内容收缩并设上限；large 才占较高视口。默认 content，逐个迁移长列表为 large，不因 scrollable=false 强制撑高。
- 手机长列表使用底部面板，最大约可用高度90%；桌面居中最大约85%。计算时扣除顶部安全区和键盘影响；不使用固定屏幕高度取代实际可用区域。
- 只有一个垂直滚动所有者。搜索、章节、队列的筛选区固定，内容独立滚动；不在默认 Dialog ScrollView 中再嵌套竖向列表。
- Dialog 统一负责底部安全区：有footer时由footer外壳承接，无footer时由内容外壳承接。移除调用方的重复insets／SafeAreaView补偿。
- `dismissible?: boolean` 默认true；false时关闭按钮明确禁用并提供提交状态，遮罩和系统返回保持同一策略，不能出现看似可点但无反馈的X。
- 选择类点选后立即进入下一步；表单类仅“保存／确认”提交；危险操作必须显式取消与说明影响。每个面板只突出一个主要动作。

## 任务1：公共容器先修正尺寸、固定区和关闭语义（P0）

**修改：** `apps/app/src/shared/ui.tsx`、`apps/app/src/shared/use-dialog-motion.ts`（仅在关闭生命周期确需修正时）、`apps/app/src/shared/web.css`（焦点适配需要时）。

**测试：** 扩展 `apps/app/test/dialog-layers.test.ts`、`dialog-motion.test.ts`；新增 `apps/app/test/dialog-layout.test.ts`。

- [x] 先补回归：非滚动短内容不会被撑到82%；header／footer不在正文滚动区；dismissible=false不会调用关闭回调且关闭控件有禁用语义。
- [x] 给Dialog加入heightMode和dismissible，保留既有presentation、header、footer、keyboardAware、onDismiss接口。自定义header须遵守同一关闭策略。
- [x] 将头部压缩到基准尺寸，关闭和遮罩使用界面语言标签；公开标题具有可识别的弹框标题语义。
- [x] 统一安全区所有权，先列出ChapterPicker与WordDialog的现有补偿，再成对迁移，避免底部双留白或Home Indicator遮挡。
- [ ] 调整键盘避让：iOS验证padding；Android验证当前窗口resize行为；Web验证视觉视口。不能仅因已传keyboardAware就声称跨端完成。
- [ ] 保留动画退出后onDismiss；打开时焦点进入面板、Web Tab不进入背景、关闭后焦点回到触发入口；系统返回与Escape按同一关闭规则处理。

**定向命令：** `npm test --workspace @selah/app -- test/dialog-layers.test.ts test/dialog-motion.test.ts test/dialog-layout.test.ts`。

**验收：** 短确认自然收缩；长列表不挤掉header／footer；安全区只处理一次；关闭行为可见且一致。几何、焦点与键盘效果必须另外运行核验，静态测试不能代替。

## 任务2：书卷／章节与阅读动作面板（P0）

**修改：** `apps/app/src/features/reader/ChapterPicker.tsx`、`apps/app/src/features/reader/ReaderScreen.tsx`。

**测试：** 新增 `apps/app/test/chapter-picker-layout.test.ts`；保留并扩展 `recent-readings.test.ts`、`reader-header.test.ts`、`reader-navigation.test.ts`。

- [x] 书卷视图使用large面板，紧凑头部下面固定旧约／新约栏；最近访问压成一条带简短标签的横向栏，最多6项仍完整可达。
- [x] 手机三列、宽屏四列保持不变；书卷格由固定68改为minHeight52–56、间距6–8，完整书名14、行高20，可两行并随大字增高。优先使用更轻的底色和边框层级，当前书卷保持清晰选中。
- [x] 保留当前书卷自动定位，在压缩网格后重新按实际onLayout计算，不能用旧行高猜滚动偏移。
- [x] 章视图把“返回书卷”并入标题行：左返回、中央完整书名、右关闭；一章书卷采用content高度，诗篇150章采用large与独立滚动。中间数量的卷按实际内容自然增高到上限，不统一撑满。
- [x] 章号按钮保持至少44×44，当前章自动定位；8px耳机小图标不承担主要选择信息，装饰提示不抢章号。
- [x] “更多”保留搜索／收藏／设置三条动作，使用content高度及统一安全区；保留先关闭完成再执行action。
- [x] 桌面“阅读设置”入口改为齿轮与“设置”，flush保存阅读位置后导航/settings，移除typeOpen旧弹框和对应交互阻断状态；移动入口规则保持一致。

**验收：** 同视口比当前68高网格多显示至少一整行书卷，完整书名不裁剪；一章书卷不出现高空白面板；诗篇当前章、最近访问经节及节内偏移仍准确；桌面调整外观后可返回原阅读位置。

## 任务3：搜索与收藏变成可持续浏览的列表（P1）

**修改：** `apps/app/src/shared/Shell.tsx`；为保持Shell职责清晰，将弹框UI分别提取为 `apps/app/src/features/reader/ScriptureSearchDialog.tsx` 与 `SavedVersesDialog.tsx`。Shell继续持有开关和现有导航回调；新组件不创建全局状态。

**测试：** 新增 `apps/app/test/scripture-search-dialog.test.ts`、`saved-verses-dialog.test.ts`。

**接口：** 两个组件共同消费visible、onClose、onOpenVerse(bookId:string, chapter:number, verse:number):void；搜索组件内部持有query，收藏组件消费现有书签store；关闭并重开搜索可保留本会话关键词，不新增持久化。

- [x] 搜索标题改为“搜索经文”；手机bottom／large，桌面center／large；输入框、清空、输入门槛提示／结果计数放固定区，结果独立滚动。
- [x] 维持至少2字符和最多40条的现有查询规则；保留40+含义，不能伪称精确总数。0结果显示“没有匹配的经文，试试其他关键词”，提供清空。
- [ ] 输入autoFocus并启用键盘避让；结果区允许键盘开启时直接点击，不能首点只收键盘。结果保持引用＋两行预览，点击关闭并跳到准确经节。
- [x] 收藏标题显示数量；空态使用content高度、说明和“去读经”；有数据使用large列表，每项引用＋最多三行预览，点击进入完整经文。
- [x] 补收藏条目角色和跳转标签；不增加收藏删除、搜索或批量管理等本轮不需要的功能。

**验收：** 滚到搜索结果末尾后输入和计数仍固定；0／1／40+结果与0／1／100收藏均布局合理；键盘、焦点恢复和原文定位通过运行验证。

## 任务4：查词、笔记与添加单词（P0）

**修改：** `apps/app/src/features/vocabulary/WordDialog.tsx`、`WordDefinition.tsx`、`WordSources.tsx`、`VocabularyScreen.tsx`。

**测试：** 扩展 `apps/app/test/word-dialog.test.ts`、`pronunciation.test.ts`；新增 `apps/app/test/add-word-dialog.test.ts`。

- [x] 查词头部第一行是词头和关闭，第二行是音标／词性／原形及发音；词头允许换行，不先缩到70%适配。主体依次释义→原句→个人笔记→来源。
- [x] 保留现有固定保存区、词典重试、旧释义保护、完整原句展开与授权可达性；已有笔记默认显示两行预览，再提供编辑，来源放次级区，不与笔记争抢同一行。
- [x] 展开原句／更多释义／来源与授权入口使用至少44高热区与13以上功能文字；说明外链与内联展开的区别。
- [x] close统一经过noteChanged判断：没有修改直接关闭；有修改在同一面板内显示“继续编辑／放弃修改／保存并关闭”。未收藏单词的第三项明确为“加入生词本并关闭”，避免暗中收藏。遮罩、X、返回和Escape走同一路径。
- [x] “继续编辑”不丢输入；“放弃”不写store；保存沿用现有save且成功后关闭。对新旧单词、空笔记和仅空白变化分别覆盖，不新增自动保存。
- [x] 添加单词表单手机使用content底部面板，桌面紧凑居中，开启键盘避让；“查看释义”固定底部，键盘returnKeyType及onSubmitEditing触发同一提交函数。
- [x] 添加到查词沿用两个独立内容组件，但先完成添加面板退出，再打开WordDialog；查词来源为手动输入时提供“返回输入”，同样等待退出完成再返回。一个时刻只展示一个业务Modal。
- [x] 取消添加保留本次会话输入，成功收藏后清空；从阅读点词打开的查词不显示“返回输入”。不更改已有生词例句和笔记。

**验收：** 长词、长释义、授权展开、笔记键盘开启时保存始终可达；有修改的退出不丢稿；切换词条不串稿；添加／返回输入无双层遮罩与焦点闪跳。

## 任务5：播放控制按入口直达目标（P1）

**修改：** `apps/app/src/features/audio/AudioControlsDialog.tsx`、`PlayerBar.tsx`。

**测试：** 新增 `apps/app/test/audio-controls-dialog.test.ts`；保留 `audio-session.test.ts`、`scripture-audio.test.ts`、`now-playing-navigation.test.ts`。

**接口：** 在现有props上新增 `initialSection?: "settings" | "queue"`，默认settings；PlayerBar倍速传settings、队列传queue。保留context、onLocate、onPlay，不改AudioProvider或领域播放模型。

- [x] 手机bottom／large、桌面center／large；头部固定当前曲目摘要和基本播放，下面固定“播放设置／播放队列”分段入口，只有所选分区内容滚动。
- [x] 设置区按倍速→循环→音量排列；定位内容和下载本章收成简短辅助动作，仅在有对应内容时显示，不用两块大按钮隔断主要设置。
- [x] 点倍速直接显示设置区和当前倍速；点队列直接显示队列，首次打开定位当前项；关闭后重新打开按此次入口选择，不能沿用上一次错误分区。
- [x] 保留空队列、整章不提供单句循环、诗歌单曲／列表循环、context尚未播放的提示。选择队列项仍执行原播放动作，不因浏览分段更改队列或开播。

**验收：** 150项队列不把设置或播放摘要挤走；当前项可定位；开关／切分区不中断播放器；倍速、循环和暂停行为保持现有语义。

## 任务6：下载选择与确认（P1）

**修改：** `apps/app/src/features/downloads/OfflineAudioScreen.tsx`。若文件体积影响职责阅读，将三个弹框分别移入同features/downloads下的 `DownloadBookDialog.tsx`、`DownloadConfirmDialog.tsx`、`DeleteBookAudioDialog.tsx`，状态与I/O编排仍留在Screen／Provider。

**测试：** 新增 `apps/app/test/download-dialogs.test.ts`；保留 `download-manager.test.ts`、`offline-catalog.test.ts`、`offline-storage.test.ts`、`offline-storage-web.test.ts`。

- [x] 下载选卷采用与阅读一致的固定分组与等宽网格，但仅复用视觉样式，不复用带阅读导航的ChapterPicker；手机3列、宽屏4列，书名完整。
- [x] prepare期间在固定状态区显示“正在准备《书名》下载信息”；选中项和关闭控件明确禁用，preparing传dismissible=false，错误后恢复可操作并就地显示重试；不在列表尾部孤立放spinner。
- [x] 下载确认依次展示范围＋语言、本次需下载的大数值、完整音频总量／可用空间、Wi-Fi选项和费用提示；所有必要真实信息保留。
- [x] 将取消与“开始下载／保存到离线音频”放footer，正文独立滚动；空间不足给原因并禁用确认，未知可用空间明确未知，0B不显示虚假网络下载。
- [x] busy期间显示“正在添加…”、禁用提交与关闭；完成关闭，失败在同一面板恢复可重试。点击关闭不能仍显示可用按钮却静默忽略。
- [x] 保留下载选卷成功后再进入确认的两阶段语义，同时等待前一个面板关闭完成再打开后一个，错误与并发结果不能打开过期候选。

**验收：** 小屏与长范围名称下CTA始终可达；仅Wi-Fi选择正确传给enqueue；重复点击不重复排队；重试、0B、空间不足状态清楚，下载行为不变。

## 任务7：危险操作与每日目标（P0）

**修改：** `apps/app/src/features/vocabulary/VocabularyScreen.tsx`、`apps/app/src/features/review/ReviewScreen.tsx`、`apps/app/src/features/audio/MusicScreen.tsx`、`apps/app/src/features/downloads/OfflineAudioScreen.tsx`。

**测试：** 新增 `apps/app/test/confirmation-dialogs.test.ts`、`review-goal-dialog.test.ts`；保留 `review-queue.test.ts`、`vocabulary-notes.test.ts`。

- [x] 删除单词、移除诗歌、删除书卷音频统一为content紧凑确认：对象名、实际影响、取消／保留与危险色确认；操作放footer，不要求先滚到底。
- [x] 先核对既有removeWord实际删除范围，再准确描述词汇／回顾影响；不承诺代码没有提供的撤销能力。保留原始音乐文件不受影响、删除音频保留学习资料的真实说明。
- [x] 诗歌移除加入局部busy和error，单次提交仅执行一次deleteAudio；成功才移除本地收藏，失败留在框内重试。保留当前曲目必要的暂停处理，错误不冒充已移除。
- [x] 所有异步删除中禁用关闭并显示进度，失败恢复操作；同步删除无需伪造加载动画。
- [x] 每日目标打开时复制当前dailyGoal到本地draft；5／10／15／20／30采用带“词／天”的单选网格。标题“每日回顾目标”，说明一行。
- [x] 点选只更新draft；“保存计划”一次setDailyGoal后关闭，“取消”／遮罩／X／返回均不提交。下一次打开从当前store重新初始化，不沿用上一次放弃值。

**验收：** 取消不写任何数据；危险动作颜色与描述一致；异步失败可恢复；目标保存前不改变队列与首页统计，保存后更新准确。

## 任务8：统一验证与与页面计划衔接

- [x] 先定向运行各任务新增／修改的回归，确认缺陷测试在修复前可复现；样式不以源码字符串或常量快照代替用户行为验证。
- [x] 运行客户端完整检查与构建：

```bash
npm run typecheck --workspace @selah/app
npm run lint --workspace @selah/app
npm test --workspace @selah/app
npm run build:app
```

- [x] 按仓库要求运行 `npm run verify` 和 `npm run build:server`；记录实际结果，区分已有失败和本轮引入的问题。
- [ ] 建立14项面板验收矩阵：320×568、393×852、1280×720／900；中文／英文；默认／系统大字；有／无底部安全区；键盘展开／收起。
- [ ] 重点组合：英文长书名、诗篇150章、6条最近访问、长单词、长释义和笔记、来源授权展开、40+搜索结果、100收藏、150项队列、长下载范围与失败状态。
- [ ] 对每项验证标题／关闭可达、固定区不滚走、正文仅一处竖向滚动、按钮至少44、关闭策略、错误恢复、读屏标题和选中语义。Web验证Tab／Shift+Tab／Escape与焦点恢复；Android验证返回键与键盘优先关闭；iOS验证安全区与键盘。
- [x] 使用测试隔离学习资料验证删除和未保存笔记；不以用户真实词汇、诗歌、书签或下载作破坏性验证。
- [x] 保存书卷、章节、搜索滚动、查词编辑、播放队列和下载确认的同视口截图到docs/screenshots；没有可靠旧图时只提供修改后图，不伪造对照。用户截图仅作本轮审查输入，不复制其系统临时路径到代码。
- [ ] 回归首页续读、阅读手势、跨页全局播放和下载恢复，确保弹框开关不改变阅读位置或重建音源。原页面精修计划的最终检查与此处合并执行。

**完成标准：** 全部14项有处理结果与验收记录；静态／Web／原生证据分开陈述；无法执行的真机检查明确列为未验证，不宣称已通过。

## 推荐执行顺序

公共容器（任务1）→书卷与阅读（任务2）→笔记与添加（任务4）→确认与目标（任务7）→搜索收藏（任务3）→播放（任务5）→下载（任务6）→统一验收（任务8）。

公共容器与书卷完成后先检查手机截图，再批量迁移其余面板。原页面计划中的字号／热区基础可先做；涉及Dialog的变更按本计划集中完成，避免两边反复修改公共容器。

> 执行状态（2026-10-25）：实现与自动检查已交付；完整结果、14项弹框覆盖和未验证项见 [验收记录](../../app-design-refinement-validation.md)。未勾选的运行组合保留为设备／扩展验收项，不代表实现未完成。
