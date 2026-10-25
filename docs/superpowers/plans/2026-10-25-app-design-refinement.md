# Selah App 页面设计精修实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 保留 Selah 安静、温和的视觉风格，提高手机上的可读性、操作准确性和阅读／听读／词汇回顾效率。

**Architecture:** 沿用现有按功能组织的客户端架构。公共文字、颜色与控件规则集中在 shared；页面布局和状态文案留在各自 features 中。首批不增加持久化字段；阅读预览复用经文仓储和既有阅读偏好，不挂载播放器或完整阅读页。

**Tech Stack:** npm workspaces、TypeScript strict、Expo 58、React Native 0.88、Expo Router、Zustand、Vitest；不新增依赖。

## 全局约束

- Node.js 22.13+；包管理使用 npm，根目录保留一份 package-lock.json。
- 修改 Expo／React Native API 前阅读 `https://docs.expo.dev/versions/v58.0.0/` 对应文档；其他主题按 `https://docs.expo.dev/llms.txt` 查找。
- 应用实现仅放在 apps/app；不导入 Server 源码，不改经文、录音、授权信息和既有学习数据格式。
- 保留米白底、绿色主色、小芽品牌、Lora 英文经文字体、DM Sans 界面字体和现有照片；不增加图片或字体资源。
- 一级导航固定为首页、圣经、聆听、词汇；生词本和回顾继续共享词汇入口。
- 保留固定阅读栏、书卷／章节选择、横向切章和最近访问规则；不增加章末操作栏。
- 完整底部播放器仅在 /music 显示；页面切换、布局调整不得重建播放器或改变播放队列。
- 连续播放仍使用整章原音频；不改变单句循环、语言切换和暂停进度规则。
- 继续阅读保留实际可见经节和节内偏移；全局播放不能修改阅读位置。
- 当前工作区已有阅读、下载等未提交修改；执行前重新核对差异，在当前成果上增量修改，不覆盖或回退已有工作。
- 本轮用户最新请求是“制定修改计划”：本文件为待执行计划，不代表已修改界面或已通过验证。

## 范围与方案选择

采用“公共规则修正 + 页面局部重排”。只改颜色字号收益有限；全局视觉重做又会丢掉已有品牌一致性。本方案先解决可见问题，不改信息架构和业务算法。

首批包含：辅助文字与功能字号、点击区域、Web 焦点、首页续读前置、聆听经文前置、词汇统计压缩、回顾评分可达性、文案和空态、设置阅读预览。

夜间主题列为后续独立批次：它需要全局颜色接入和偏好迁移，不能只反转阅读正文背景。其边界与验收要求见文末。

## 验收基准

| 项目       | 目标                                                                                             |
| ---------- | ------------------------------------------------------------------------------------------------ |
| 小号文字   | 正常、可用状态下与实际底色对比至少 4.5:1；大号文字至少 3:1；禁用态单独检查                       |
| 功能字号   | 按钮／筛选／输入／状态文字以 13–14 为主，底栏和辅助标签至少 12；装饰文字可例外但不能承载必要信息 |
| 触控       | 独立操作区域至少 44×44；相邻区域不重叠；不能只用扩大 hitSlop 掩盖过密布局                        |
| 首页       | 393×852 默认字号下，续读按钮无需滚动即可完整看到；续读卡先于独立风景卡                           |
| 聆听       | 经文入口先于诗歌风景卡；同视口可看到第一项经文的播放操作                                         |
| 词汇       | 393×852 默认字号下，首个词条名称和释义无需滚动可见                                               |
| 回顾       | 揭晓后四个评分按钮位于滚动内容外，完整可见且不被底栏遮挡；长释义仍可滚动                         |
| 小屏与大字 | 320×568、系统大字号下不横向溢出、不裁剪功能文字、不隐藏关键操作；不强求首屏容纳所有说明          |
| 桌面       | 1280×900 下保留侧栏、合理内容宽度和键盘可达性                                                    |

尺寸指 Web CSS 像素／原生逻辑尺寸。视口目标是执行时验收标准，尚未在真机确认。

## 任务 1：文字、颜色与焦点基础

**修改：** `apps/app/src/shared/theme.ts`、`apps/app/src/shared/ui.tsx`、`apps/app/src/shared/web.css`、`apps/app/src/shared/Shell.tsx`、`apps/app/src/features/reader/VerseText.tsx`；受影响页面的小号内联样式在任务 3–6 中同步处理。

**接口：** 保留既有 colors／fonts／images 导出。新增 `typeScale`，键为 `caption:12`、`label:13`、`body:14`；新增 `colors.secondaryText` 用于对照正文，避免继续硬编码浅灰绿。

- [ ] 记录当前各页面默认字号截图，分别标出可用、选中、禁用文字，避免把禁用态误当普通辅助文字。
- [ ] 将 `colors.muted` 调深为 `#666D60`；新增 `secondaryText: "#697360"`。保留品牌绿和装饰金色，但小号金色文字改用经对比度验证的深色文字，不直接把装饰色当文字色。
- [ ] Txt 默认正文仍为 14；按钮标签从 12／13 统一到 13／14，Eyebrow 至少 12；底栏标签从 9 提到 12。使用公共字号值替换本轮涉及页面中的重复小号数值。
- [ ] VerseText 对照正文改用 secondaryText；主读字号、对照比例与用户行距保持既有规则，不全局强行放大经文。
- [ ] 回顾四种评分的文字分别使用深红、深棕、深绿、深蓝；浅色底继续保留，逐对计算对比度后确定最终值。
- [ ] 修正 Web 输入焦点规则：保留 `:focus-visible`，移除无条件 `input { outline: none; }`，或限定为 `input:focus:not(:focus-visible)`；键盘聚焦输入框必须可见。
- [ ] 在 320／393 宽、中英文下检查日期、导航、搜索和分段选项换行；不得关闭字体缩放来满足布局。

**验证：** 按 WCAG 相对亮度公式计算实际文字／底色组合；照片叠字另外检查最亮背景区域。Web 使用 Tab 访问搜索、筛选、设置和弹窗控件。样式调整以渲染检查为主，不新增只断言颜色常量的测试。

## 任务 2：公共图标与经节操作热区

**修改：** `apps/app/src/shared/ui.tsx`、`apps/app/src/features/reader/ReaderScreen.tsx`、`apps/app/src/features/home/HomeHighlights.tsx`；搜索其他 IconButton 尺寸覆盖点并逐项修正。

**测试：** `apps/app/test/icon-button.test.ts`；保留 `reader-header.test.ts`、`reader-navigation.test.ts`、`reading-viewport.test.ts` 现有用例。

**接口：** IconButton 的 props 与回调签名不变；`visualSize` 继续只描述可见徽标大小，外部 style 不得让交互区域低于最小尺寸。

- [ ] 先修改 icon-button 回归：使用 `style:{width:28,height:26}`、`visualSize:20` 渲染时，断言最终 button 宽高至少 44，内部徽标仍为 20；保留 selected／disabled 语义断言。现有“28×26 保留热区”的用例名称与期待一起更正。
- [ ] 运行该用例，确认因为实际热区仍为 28×26 而失败，再实施尺寸下限。
- [ ] 公共 IconButton 默认 44×44，最小尺寸在外部 style 之后生效；内部 20 的选中圆点和 12 的细图标仍可独立设置。
- [ ] 阅读经节右侧操作列改为至少 44 宽，三个操作纵向排列且各有 44 高；为未选中经节保留相同列宽，避免选择时正文横向重排。
- [ ] 首页收藏和更多入口移除 28／25 尺寸覆盖；其他紧邻图标同步调整父容器间距，不使用重叠热区。
- [ ] 检查经节数字点击、正文点词和三个操作互不抢事件；如数字仍可播放，为其提供独立可点击布局空间，否则将该动作并入已有播放按钮，保留经节数字本身。
- [ ] 复测短经节／长经节、连续选择、滑动切章、播放高亮、收藏和单句循环；不新增工具或隐藏正文来放大热区。

**定向命令：** `npm test --workspace @selah/app -- test/icon-button.test.ts test/reader-header.test.ts test/reader-navigation.test.ts test/reading-viewport.test.ts`。

**验收：** 每项操作热区不重叠；393 宽默认字号仍有可读的正文行宽；点词不会触发播放或切章。

## 任务 3：首页与聆听页主任务前置

**修改：** `apps/app/src/features/home/HomeScreen.tsx`、`apps/app/src/features/home/HomeHighlights.tsx`、`apps/app/src/features/audio/MusicScreen.tsx`。

**测试：** 扩展 `apps/app/test/home-passage.test.ts`，保留 `home-hymns.test.ts`、`reading-position.test.ts`、`now-playing-navigation.test.ts`、`audio-session.test.ts`；新增 `apps/app/test/home-layout.test.ts` 与 `apps/app/test/music-layout.test.ts`，沿用现有 React 静态渲染与平台 mock 方式。

- [ ] 先补页面结构回归：首页“从这里继续”先于风景标题，聆听“聆听话语”先于诗歌推荐；使用可见文字与语义节点顺序验证，不断言样式字符串或组件内部层级。
- [ ] 首页顺序改为简短问候／日期 → 续读卡 → 风景卡 → 精选经文／回顾／诗歌。保留续读现有仓储取文和路由逻辑，不重新设置阅读位置。
- [ ] 首页风景卡手机最小高度从 225 收到约 156，保留一组主标题，去除重复英文眉题；经文完整展示，不用裁剪正文来压低高度。桌面约 210，按实际换行允许自然增高。
- [ ] 固定约翰 8:12 的卡片改名“精选经文 / Featured verse”；收藏标签同步为“收藏精选经文 / Save featured verse”，已收藏时明确显示取消收藏。
- [ ] 聆听顺序改为功能标题／离线入口 → 聆听话语及现有语言选择 → 诗歌推荐横幅 → 内置诗歌 → 我的收藏；沿用当前经文卡片内容和播放入口。
- [ ] 诗歌横幅手机高度约 156；中文模式以中文功能标题为主，减少常驻英文装饰句；来源说明仍可查看。
- [ ] 音乐页本地诗歌按钮辅助标签跟随状态：播放中为“暂停诗歌 / Pause track”，同曲暂停为“继续播放诗歌 / Resume track”，其他曲目为“播放诗歌 / Play track”。

**定向命令：** `npm test --workspace @selah/app -- test/home-passage.test.ts test/home-hymns.test.ts test/home-layout.test.ts test/music-layout.test.ts test/reading-position.test.ts test/now-playing-navigation.test.ts test/audio-session.test.ts`。

**验收：** 满足首屏目标；精选卡中英文仍为同一经节完整正文；跨页续读和全局播放行为保持一致。

## 任务 4：词汇页压缩统计并修正空态

**修改：** `apps/app/src/features/vocabulary/VocabularyScreen.tsx`。

**测试：** 新增 `apps/app/test/vocabulary-screen.test.ts`；保留 `vocabulary-list.test.ts`、`vocabulary-notes.test.ts`、`vocabulary-context.test.ts`。

- [ ] 先覆盖四种空态：无任何词汇、有词但搜索无结果、有词但待回顾为空、有词但已熟悉为空；断言文案与操作目标对应，不改变领域筛选算法。
- [ ] 标题改为“生词本 / Vocabulary”，保留添加按钮；删除装饰英文眉题，说明缩为一句。
- [ ] 三张统计卡压成一个允许换行的轻量统计条：“已收藏 4 · 待回顾 4 · 已熟悉 0”；不依靠淡色小字或只用图标说明状态。桌面也使用同一概念命名。
- [ ] 统计、搜索、排序、词条的必要标签至少 12–13；首词条名称／释义在基准视口可见。
- [ ] 空词库显示“还没有收藏单词”及“去读经”，点击仍进 /bible；搜索无结果显示“没有匹配的单词”及“清除搜索”，仅清空 query。
- [ ] 待回顾为空显示“今天没有待回顾单词”，已熟悉为空显示“还没有已熟悉的单词”；两者提供“查看全部”，同时将 filter 设为 all、query 设为空。
- [ ] 已保存例句、笔记、旧译文提示、发音和删除确认保持不变；不重写既有词汇内容。

**定向命令：** `npm test --workspace @selah/app -- test/vocabulary-screen.test.ts test/vocabulary-list.test.ts test/vocabulary-notes.test.ts test/vocabulary-context.test.ts`。

## 任务 5：回顾过程采用紧凑布局与独立评分区

**修改：** `apps/app/src/features/review/ReviewScreen.tsx`。

**测试：** 新增 `apps/app/test/review-screen.test.ts`；保留 `review-queue.test.ts`、`domain.test.ts`、`pronunciation.test.ts`。

**接口：** 不改 `reviewQueue`、`scheduleReview`、`reviewWord`、review 记录类型或每日目标统计；仅调整视图的展示分支与容器。

- [ ] 在测试中捕获 Pressable 回调，验证“开始 → 揭晓 → 四种评分分别推进下一词”“退出不计入回顾”；用固定测试词库和时间，避免写入真实学习资料。
- [ ] 空闲页使用“单词回顾 / Review”功能标题，保留一次温和说明；算法介绍改为“根据你的记忆情况安排下次回顾”，SM-2 名称不放在主要说明中。
- [ ] 活跃 session 隐藏闲置页的装饰眉题、大标题和说明，仅保留进度与明确退出操作；Shell 的一级导航和词汇二级入口继续保留。
- [ ] 将页面外层改为 flex:1 的 View：词卡、发音、释义、例句在可滚动区域中；揭晓后的评分区作为同级区域放在 ScrollView 之外，按两列排列四个操作。
- [ ] 评分区使用正常布局占位，位于 Shell 底栏之上；不以 absolute 覆盖正文，不重复叠加安全区。短屏时减少上下内边距，词卡仍能独立滚动。
- [ ] 移除活跃词卡的固定 minHeight:370，减少 30／36 等大间距；单词保留适当的大字号并允许长词换行；下次回顾时间至少 12，文字颜色满足任务 1。
- [ ] 加载／网络错误／长释义／个人笔记／例句状态下都能评分，评分只调用原有 grade；完成态、再次开始和当日目标完成提示继续准确。

**定向命令：** `npm test --workspace @selah/app -- test/review-screen.test.ts test/review-queue.test.ts test/domain.test.ts test/pronunciation.test.ts`。

**验收：** 393×852 揭晓后四个评分操作完整可见；320×568 与大字设置下仍可操作且说明可滚动；退出不会意外评分。

## 任务 6：设置页增加真实阅读预览

**修改：** `apps/app/src/features/settings/SettingsScreen.tsx`。

**新增：** `apps/app/src/features/settings/ReadingPreview.tsx`、`apps/app/test/reading-preview.test.ts`。

**接口：** `ReadingPreview` 无 props，在功能内部消费现有 `fontSize`、`lineHeight`、`primaryLocale`、`showTranslation`；读取 bibleRepository 的诗篇 23:1。不要依赖 ReaderScreen 或挂载音频功能。

- [ ] 先用真实仓储正文写中／英文主读、对照开关、字号与行距组合的渲染测试；断言先后顺序、显示内容及可见样式随偏好改变。
- [ ] 在“阅读”分组中字号／行距选项之后放“阅读预览 / Reading preview”，显示同一节完整正文与引用，不再手写经文副本。
- [ ] 预览文字使用与 VerseText 相同的字体、主次文字色、字号比例、行高公式；预览是非交互文本，不提供点词、收藏、朗读或经节选择。
- [ ] 调整字号和语言后即时更新预览；不调用 setChapter、setReadingPosition 或任何播放器方法，不创建新的持久化偏好。
- [ ] 若只有样式公式确实产生重复，将最小纯样式计算放入明确命名的阅读展示模块供二者使用；不为预览扩展领域模型或创建万能工具模块。

**定向命令：** `npm test --workspace @selah/app -- test/reading-preview.test.ts test/reading-preferences.test.ts test/verse-text.test.ts test/reading-position.test.ts`。

## 任务 7：跨页面校验与交付

- [ ] 先在 Node.js 22.13+ 环境运行客户端定向检查：

```bash
npm run typecheck --workspace @selah/app
npm run lint --workspace @selah/app
npm test --workspace @selah/app
npm run build:app
```

- [ ] 再按仓库要求执行完整检查，记录真实结果；不得把既有失败写成已通过，也不得顺带修复与设计精修无关的功能：

```bash
npm run verify
npm run build:server
```

- [ ] 通过运行页面检查 320×568、393×852、1280×900；分别查看中文／英文、可用／禁用、空／加载／错误／完成状态，以及有播放内容／无播放内容。
- [ ] 至少在可用的 Android 或 iOS 原生环境检查触控、大字、安全区、长释义、回顾评分和章节面板；环境不可用时明确标注未验证，不以 Web 结果代替真机。
- [ ] 回归“首页续读 → 阅读滚动 → 聆听播放 → 返回首页续读”：阅读位置不被播放高亮覆盖，切页不重建播放器，连续朗读不逐节换文件。
- [ ] 在阅读页检查长按选词、英文点词、竖向滚动、横向切章以及相邻热区误触；Web 检查 Tab／Shift+Tab、焦点可见、弹窗关闭后的焦点恢复。
- [ ] 使用测试隔离状态检查词汇筛选与回顾评分，不删除或改写用户真实词汇、收藏、下载、播放和阅读资料。
- [ ] 保存关键页面修改前后同视口截图到 docs/screenshots，文件名使用 `2026-10-25-design-<screen>-before/after` 前缀；未保留可靠基线的页面只提供修改后截图，不伪造对照。
- [ ] 检查最终 diff：只包含本轮修改，特别复核与当前未提交工作重叠的 Shell、ui、Reader、HomeHighlights、Settings；不将 storage、缓存、dist、凭据或运行状态纳入交付。

**完成条件：** 首批验收目标逐项有证据；检查结果与未验证项清楚记录；如用户没有要求提交或发布，不自动部署或混合提交现有工作区变更。

## 后续独立批次：夜间主题

该项保留在优化路线中，不并入首批页面精修，不以只修改正文背景作为完成。

- 偏好取值明确为 `system | light | dark`，旧数据缺字段时采用 system；保留旧字号、语言、书签、词汇和阅读位置。
- 在 shared 提供主题上下文，语义颜色集中管理；迁移 Shell、公共控件、页面、弹窗、播放器、输入、选中态和 Web 页面底色，避免浅色常量残留。
- 深色采用暖灰／深绿体系，分别校验主次文字、禁用、错误和评分状态，不简单反色图片或品牌标识。
- Web 的页面底色与原生状态栏同步；跨端 API 按 Expo 58 文档确认，领域层不读取系统外观。
- 补充旧状态迁移、系统主题变化、手动覆盖、重启恢复测试；完整复跑本计划的跨页播放与阅读恢复回归。
- 验收覆盖所有一级页、设置、离线、章节／词典／播放弹窗的三种主题模式，以及浅深切换前后播放不中断、阅读位置不跳动。

## 执行顺序与检查点

按任务 1 → 2 → 3 → 4 → 5 → 6 → 7 执行。任务 2 的阅读热区与任务 5 的评分布局先完成手机截图核验，再继续剩余收尾；若增大字号后不满足首屏指标，优先减少装饰和留白，不能重新缩小功能文字。

每项完成后记录实际改动与检查结果，再进入下一项。此计划默认在同一会话顺序执行，是否使用子代理由届时用户授权与适用技能决定。
