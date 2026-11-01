# Selah · 息语

中英圣经阅读、经句循环、生词本、间隔复习与诗歌收藏。App 和 Server 使用各自的依赖、配置、测试及构建入口，通过 HTTP 与共享内容包协作。

## 目录与架构

```text
apps/
  app/                Expo / React Native 客户端
    src/app/          Expo Router 路由
    src/features/     按功能组织的界面与用例编排
    src/domain/       纯 TypeScript 业务模型与规则
    src/data/         离线内容与录音适配器
    test/             客户端业务回归测试
  server/             NestJS TypeScript 模块化单体
    src/              按业务模块分组，Controller → Service → Repository
    public/           管理界面静态资源
    test/             HTTP、业务、安全与媒体回归测试
    Dockerfile        服务端独立生产镜像
packages/
  content/            唯一离线数据集、来源许可、完整性校验与测试
tools/
  content/            资源导入、对齐和审计工具
  assets/             图标和示例音频生成工具
  dev.mjs             本地启动 App 与 Server
storage/
  admin/              管理凭据、审核、日志、草稿与备份
  resources/          MP3、导入缓存和来源审计
  alignment/          已有对齐成果归档
docs/                 部署说明与开发截图
```

架构约束写在 [项目规则](AGENTS.md)、[App 规则](apps/app/AGENTS.md) 和 [Server 规则](apps/server/AGENTS.md)。App 按功能组织 Clean Architecture；Server 使用 NestJS 模块、依赖注入、DTO 校验与分层，框架路由、业务逻辑及文件存储分别管理。两端禁止互相导入源码。共享包不得依赖应用。

工作目录为 `/Users/fenghe/enochjs/selah`；原 `/Users/fenghe/Documents/ChatGPT/bible` 仅为指向这里的兼容符号链接。原管理凭据已迁到 `storage/admin/`，数据格式保持兼容；完整音频、缓存、旧对齐成果和截图均已保留。

## 开发

需要 Node.js 22.13+、npm；资源导入使用 Python 3.11。根目录统一安装，一份 lockfile：

```bash
nvm use
npm ci
cp apps/app/.env.example apps/app/.env.local
# 可选：配置服务端监听地址、初始密码或自定义数据路径
cp apps/server/.env.example apps/server/.env.local
npm run web       # 启动本地 Server，再启动 Expo Web
npm start         # 启动本地 Server，再选择移动设备
npm run ios
npm run android
```

已有 `.env.local` 时直接编辑，不要覆盖。手机使用开发电脑局域网 IP 作为 `EXPO_PUBLIC_BIBLE_SERVER_URL`，并先用 `HOST=0.0.0.0 npm run server` 启动服务端。远程或局域网地址不会被开发脚本自动接管。Expo SDK 58 的 monorepo 支持按官方默认配置工作，无需手工设置 Metro 的 watchFolders 或 resolver。

两端可独立运行：

```bash
npm run server                           # NestJS 开发服务器，默认8890
npm run web --workspace @selah/app        # 仅 Expo Web
npm run build:server
npm run start --workspace @selah/server   # 运行已构建的服务端
npm run build:app                        # 仅导出客户端
```

离线经文、录音索引与词典从 `@selah/content/*.json` 打包进 App。MP3 通过服务端 HTTP 读取，不进入客户端 bundle。开发环境统一使用 `http://127.0.0.1:8890`；原8888开发音频入口已合并至服务端8890端口。

聆听页右上角的下载图标进入“离线音频”，设置中也可管理存储。中英文录音分别选择整部圣经、旧约、新约或书卷；播放控制中可下载当前章。确认面板显示本次新增大小和可用空间，默认仅 Wi-Fi。原生端支持当前文件暂停续传，重新打开应用后可继续暂停的任务；Web 保留已完成文件，当前未完成文件重新下载，浏览器无法识别 Wi-Fi 时需取消“仅 Wi-Fi”。Android 下载通过前台服务在切换应用、锁屏后继续，通知显示进度并可暂停；暂停或全部完成时自动释放服务与唤醒锁。“仅 Wi-Fi”限制在后台仍然生效。系统强行停止应用后，重新打开可继续已保存的任务；Android 的后台同步时长限制触发时会暂停并保存续传信息。Web 下载期间仍需保持页面运行。

下载按章排队，每章下载一个原始 MP3；字节进度每 200 ms 合并更新。下载索引按 500 ms 或完成 8 个文件合并保存，暂停、章节完成、失败和进入后台时立即刷盘。意外退出后，已落盘但未登记索引的完整文件会重新校验 SHA-256 后复用，不重复下载。

离线包包含整章 MP3 和对应经节起止时间快照。旧下载记录会复用整章文件与时间轴，不再要求经节切片完整；已有切片不会自动删除。播放器自动使用已校验的本地文件；可在下载页按书卷、语言删除，阅读位置、词汇与收藏保留。下载性能测量与复现方法见 [下载性能记录](docs/audio-download-performance.md)。新客户端下载清单来自 `/api/audio/download-manifest?mode=chapter`（不带参数仍保留旧版切片清单），原生文件存于应用文档目录，Web 存于浏览器缓存；清除应用数据或站点数据会同时移除离线音频。

## 管理后台

运行 `npm run server`，打开 [管理中心](http://127.0.0.1:8890/admin/)。工作台、经文搜索与审核、录音筛选与试听、词典编辑发布、系统校验、审核导出与操作日志沿用现有 API。

本地服务先使用 TypeScript 编译，再启动编译结果；源文件与 TypeScript 配置变动后自动重新编译并重启。这样保留 NestJS 的 DTO 类型元数据，开发环境与正式构建使用相同的参数默认值和输入校验。

侧边栏按圣经、诗歌和管理分组。「圣经音频」按章筛选、试听与审核；「诗歌管理」支持上传 MP3（最大 30 MB）、编辑中英文资料、试听、审核与启用／停用。上传后进入待审核，仅管理员可试听；核对录音、来源与授权后可通过并发布或驳回。修改上传诗歌的资料后重新进入待审核，审核通过且启用的诗歌才向用户提供；停用、重新送审或驳回后停止公开播放。平台诗歌资料的唯一来源仍为 `packages/content/data/hymns.json`，上传、编辑、审核均检查 revision 并发冲突、备份旧目录并记录操作日志。

App 保留共享目录和三首内置录音用于离线启动，联网进入首页或聆听页时获取 `/api/hymns`，页面打开期间每分钟刷新，审核发布无需再次打包客户端（已安装旧版 App 需先更新到支持在线诗歌列表的版本）。断网时保留本次运行最近成功获取的列表；新上传的录音需联网播放。后台不读取用户设备上的私人诗歌和收藏。上传原始音频与已发布音频分别保存在 `ADMIN_STATE_ROOT/hymn-media/`、`ADMIN_STATE_ROOT/hymn-published/`，复用管理状态的可写持久化挂载，不要求圣经媒体目录可写。公开诗歌音频使用 `/api/audio/hymns/{sha256}.mp3`，支持 HEAD、Range 和条件请求，每次请求检查审核与启用状态。

首次使用诗歌试听时，在仓库根目录运行 `node tools/assets/prepare-hymn-audio.mjs`，把现有 3 首内置合成器乐录音按 SHA-256 准备到服务端媒体目录（支持 `MEDIA_ROOT`，相对路径基于仓库位置）。脚本可重复运行，不重新生成或更换录音。服务端只读取媒体目录；缺少试听文件时后台显示「试听文件未就绪」。部署时将准备好的文件放入实际挂载的媒体目录。新增内置曲目仍需准备 App 音频资源和授权资料。

初次启动通过 `apps/server/.env.local` 的 `ADMIN_USERNAME`、`ADMIN_PASSWORD` 设置凭据；不设置密码则在终端输出一次随机密码。已有 `storage/admin/credentials.json` 时继续使用原凭据。scrypt 密码散列、8小时会话、HttpOnly / SameSite Cookie、CSRF、同源验证及登录限流保留。忘记密码时停止服务，只移走 credentials.json，再启动重设；审核数据仍保留。

词典发布保留 revision 并发校验与发布前备份，通过原子 rename 写回 `packages/content/data/dictionary.json`。App 需重新构建或正常更新后生效。个人词汇、学习进度和收藏保存在设备本地，尚无用户账号与云同步。当前管理仓储采用单进程 JSON 存储，部署只运行一个实例。

Docker 构建、Compose、发布平台参数、持久化与恢复操作见 [部署说明](docs/deployment.md)。

## 资源导入

```bash
uv venv --python 3.11 tools/content/.venv
uv pip install --python tools/content/.venv/bin/python -r tools/content/requirements-resources.txt
npm run resources:import
npm run check:content
```

导入工具、Python测试及旧声学对齐命令见 [工具说明](tools/content/README.md)。导入后重启服务端，重新导出客户端。请勿删除 `storage/resources/media/` 或用旧对齐产物覆盖当前提供方数据。

## 验证

```bash
npm run verify           # App、Server、内容包分别检查并运行回归测试
npm run build:server
npm run build:app
npm run alignment:test   # 可选：已安装声学环境时运行全部 Python 测试
```

`npm run verify` 包含两端类型检查、lint、HTTP/业务测试、Python资源测试和全量内容索引校验。导出成功不代表已经验收真机音频、后台与锁屏行为。

## 当前配套资源

资源从 [中英文圣经](https://chineseandenglishbible.com/) 当前站点重新下载，不读取旧项目的经文副本、音频或时间轴。

| 资源 | 站点实际使用的来源 | 播放方式 |
| --- | --- | --- |
| 英文文字 | 站点 `/bible/niv/*.json`，NIV | 离线阅读和搜索，保留原文与节号 |
| 英文音频 | 站点 `/niv-audio.json` 指向的 BibleGateway NIV dramatized MP3 | 整章录音；通过核对的经节使用原章起止时间 |
| 中文文字 | 站点 `/bible/mandarin/*.json`，和合本 | 保留原文、诗题和合并经节范围 |
| 中文音频 | 站点指向的 WordProject 普通话真人录音 | 整章录音；通过核对的经节使用原章起止时间 |

当前快照已完整下载 66 卷、1,189 章的中英文文字及 2,378 份录音。每次导入使用独立快照，保留 HTTP 来源、下载时间、ETag 和 SHA-256；原始下载、核对报告及媒体均放在 `storage/resources/`，不进入 Git 或客户端 bundle。英文版权属于 Biblica 等原权利人，音频按原来源条款使用，不能沿用此前 BSB / CC0 或中文合成录音的许可声明。

站点的按字数跟随高亮不作为分句依据。离线处理采用 **Whisper 独立识别 + WhisperX 词级声学对齐**，固定模型 revision；检查措辞、完整朗读覆盖和句间多余语音。中文识别的同音字通过发音归一化核对，阅读原文保持不变。诗题及明确的章节播报单独记录，不作为经文。存在不匹配、缺失或低置信度的章节会标记待复核，仅提供整章播放。

通过核对的时间轴导出为 UTF-8 **WebVTT**，使用 USFM 经节标识（例如 `PSA.23.4`），保存在 `storage/resources/timings/`。FFmpeg 切片得到的 `sourceStart / sourceEnd` 继续作为原章经节边界；独立经节 MP3 保留作核对与回退。App 单句循环始终使用整章 MP3：Android 由 Media3 裁剪区间并重复，iOS 设置原生句尾停止位置并在原生层回跳，不依赖 JS 进度轮询控制句尾。连续播放始终使用整章原录音，时间轴只更新经节高亮，经节间不停止、不换文件、不重新定位，保留原录音的自然节奏；切换循环模式时保留当前位置和暂停状态。独立 MP3 和原章录音都以实际 SHA-256 寻址，通过服务端的 HTTP Range、HEAD 和条件请求提供；换译文或换媒体即使旧对齐失效。

原生区间循环需要重新构建并安装 App（本地 Expo 模块 `SelahAudioRanges`），不能仅通过 JS 更新获得，也不能在 Expo Go 中验证。Web 使用经节时间轴和播放进度回调兼容循环，切换后台后的精度受浏览器调度限制；iOS 回跳不承诺采样级无缝衔接。

**下载完成与核对完成是两个状态。** 当前进度以 `packages/content/data/resource-manifest.json` 和设置页为准；诗篇 23 的中英文已完成新流程核对，其他章节由离线批处理逐章处理。不能把待处理章节算作音文匹配或逐节播放完成。完整媒体可直接整章聆听。

```bash
npm run resources:import                         # 新快照：下载、核对、增量发布
npm run resources:download                       # 只下载新快照
npm run resources:align                          # 继续处理当前快照
npm run resources:align -- --keys psalms:23:en --locale en
npm run check:content
```

首次使用需安装离线模型环境，见 [内容工具](tools/content/README.md)。批处理状态和日志在当前快照的 `pipeline-status.json`、`alignment-status-en.json`、`alignment-status-zh.json`、`worker-en.log`、`worker-zh.log` 中。通过校验后逐批发布索引；App 导出和服务端重启应在所需进度发布后执行。原数据集发布前自动备份到 `storage/resources/backups/`，媒体保留，可恢复。历史导入/对齐工具不能覆盖当前站点资源集。

## 功能


- 66 卷 / 1,189 章，中英对照、单语阅读、全经文搜索、收藏、字号调整、已读记录。
- 点选单节、单句 / 整章循环、连续播放、上一句 / 下一句、进度拖动、倍速、音量与队列；阅读跟随经句。
- 点击英文单词加入生词本，保存原句；搜索、排序、释义编辑、听原句。已存笔记保留原样，原句与当前译文不一致时不误播其他录音。
- SM-2 间隔重复、每日数量、未来七天安排与过去七天记录；遗忘的词 10 分钟后重学。计划在应用内展示，未接系统推送。
- 中英界面，独立设置阅读与录音语言，本地保存学习数据。无需注册，暂无跨设备同步。
- 3 首公版旋律的合成器乐示例；可导入自己的 MP3/M4A/WAV/FLAC，单文件最大 100 MB。原生端存文档目录，Web 存 IndexedDB。

## 移动端发布

在 `apps/app/` 中执行 EAS，配置来自该目录的 `eas.json`。需要自己的 Expo、Apple / Google 账号与签名：

```bash
cd apps/app
npx eas-cli@latest build --platform android --profile preview
npx eas-cli@latest build --platform ios --profile production
```

自然摄影来自 Unsplash：`photo-1470770841072-f978cf4d019e`、`photo-1470071459604-3b5ec3a7fe05`、`photo-1464822759023-fed622ff2c3b`。DM Sans / Lora 字体本地打包，图标使用 Lucide。
