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

## 管理后台

运行 `npm run server`，打开 [管理中心](http://127.0.0.1:8890/admin/)。工作台、经文搜索与审核、录音筛选与试听、词典编辑发布、系统校验、审核导出与操作日志沿用现有 API。

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


| 资源 | 来源与版本 | 播放方式 | 授权 |
| --- | --- | --- | --- |
| 英文文字 | Berean Standard Bible（BSB），通过 AO Lab Free Use Bible API 导入 | 离线阅读与搜索 | Public Domain / CC0 |
| 英文 MP3 | BSB，Barry Hays 真人朗读 | 使用同一朗读者、同一 MP3 的来源时间轴 | CC0 1.0 |
| 中文文字 | Unique Bible App 的 CUVs，和合本上帝版（简体） | 与该项目发布的逐节音频配对 | Public Domain |
| 中文 MP3 | Eliran Wong / Unique Bible App 普通话合成朗读 | 独立经句 MP3，直接播放整个文件；来源合并经节按范围朗读 | CC BY 4.0 |

英文按用户选择从 NIV 改为 BSB；中文采用上帝版，保留原文中的“上帝”，不会擅自改成“神”。界面明确标注中文为合成朗读。中文文字与音频固定 GitHub revision，英文文本快照与每个本地 MP3 均记录 SHA-256。

- [BSB 文字许可](https://berean.bible/terms.htm)
- [BSB 官方音频与 CC0 声明](https://bereanbible.com/audio/)
- [AO Lab 逐节时间轴接口](https://bible.helloao.org/docs/reference/translations/standard.html)
- [中文逐节 MP3 与 CC BY 声明](https://github.com/eliranwong/MP3_ChineseUnionVersion_mandarin)
- [同一应用的 CUVs 文字模块](https://github.com/otseng/UniqueBible_Bibles)

MP3 Bible – Chinese Union Version (Mandarin), Eliran Wong / Unique Bible App. Unmodified verse MP3s. [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). 来源和署名也可从应用设置页查看。

英文有 1,188 章带来源时间轴；利未记 19 章的来源时间轴接口返回 404，现已针对原 Barry Hays MP3 补齐全部 37 节：CTC 声学对齐、独立 Whisper 识别核对、静音停顿边界检查。该章明确标为本地补充，不冒充来源官方时间轴。当前 2,378 / 2,378 章均可按经句点播和循环。中文全部 1,189 章使用独立经句文件。来源有 71 条合并范围占位标记（例如“22～23”），不将占位 MP3 当作经文播放；页面标明合并范围，点击时播放对应完整经文，队列只读一次。本地补充保存在 `storage/resources/timing-overrides/`，绑定 MP3 SHA-256、经文 SHA-256、模型 revision 及独立审计文件 SHA-256；资源变化即失效。导入时优先采用来源时间轴，缺失时才应用通过校验的本地补充，不需要重新安装语音模型。来源时间轴和自动核对均不等于逐句人工精校；自动校验检查覆盖、顺序、范围、时长和资源配对。

文字与索引保存在 `packages/content/data/`；本地 MP3 在 `storage/resources/media/<sha256>.mp3`，由 `/api/audio/resources/` 提供 HTTP Range、HEAD 和条件请求。下载缓存和 MP3 不纳入 Git，也不打入客户端 bundle。部署时需携带 `storage/resources/media/` 和资源服务。完整导入后再导出客户端。

导入支持缓存续跑；全部书卷下载与校验完成后才发布数据。可分别运行 `npm run resources:import -- --locale en` 和 `--locale zh`，两份完整检查点齐备后发布。`storage/resources/import.log`（自行重定向时）或终端显示进度，逐章来源记录在 `storage/resources/chapters/`。

旧项目 `/Users/fenghe/enochjs/bible` 的原文、原始 MP3 及已有对齐成果均未删除或修改。旧 `.timing.json` 不参与当前资源播放。旧导入、对齐命令检测到新资源集后会拒绝覆盖或忽略发布。无需再配置 `BIBLE_RESOURCE_ROOT`；该变量只用于读取旧资源。

## 功能


- 66 卷 / 1,189 章，中英对照、单语阅读、全经文搜索、收藏、字号调整、已读记录。
- 点选单节、单句 / 整章循环、连续播放、上一句 / 下一句、进度拖动、倍速、音量与队列；阅读跟随经句。
- 点击英文单词加入生词本，保存原句；搜索、排序、释义编辑、听原句。旧 NIV 笔记保留原样，原句与当前 BSB 不一致时不误播新的录音。
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
