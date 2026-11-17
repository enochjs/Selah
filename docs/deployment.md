# 服务端部署

## 2026-11-16 微信内下载引导修正

收到“安卓微信内点击下载没有反应”的反馈后，核对公网、实时版本目录与代理日志：官网和版本请求正常；实际 Android 微信客户端的 APK 请求多次只传输数 KB 至约 90 KB 后中断，其他浏览器有 `83,774,759` 字节完整传输。使用微信请求头的独立 HTTP 完整下载哈希正确，说明服务端没有按该请求头返回残缺安装包；此检查不能替代真实微信下载行为的验证。

官网现在在 Android 微信 / QQ 内提供独立的“在浏览器中下载”按钮，点击后复制官网下载页链接、聚焦步骤并显示反馈；剪贴板不可用时显示可手动复制的链接。引导建议从右上角菜单在手机浏览器打开，也提供手动粘贴到浏览器地址栏的路径。正常浏览器保留真实 APK 下载链接。此修正不宣称能绕过微信下载限制。

生产镜像更新为 `selah-server:website-wechat-20261116`，仅更新官网 HTML、JS、CSS，App 安装包、版本目录和签名均未更改。上一镜像 `selah-server:official-site-20261116` 保留；页面与环境备份、镜像日志及发布回读在服务器 `storage/builds/website-wechat-20261116/`。公网三个页面文件的 SHA-256 与本地完全一致，原安装包 HEAD 200，大小和 ETag 保持原值。

验证：先复现新增失败用例，再完成修复；Server 102 项测试、类型检查、lint、构建、格式检查通过，测试覆盖 Android 微信 / QQ 引导、正常浏览器直接下载及复制失败回退。已查看普通浏览器实际下载界面；Safari 模拟用户代理的 UI 自动化未完成，修正后的真实安卓微信交互及系统安装尚待真机复核。没有把请求头模拟或自动测试记录为真机通过。

## 2026-11-16 Selah 官网与公开下载

官网已发布至 `https://www.enochjs.top/`，下载区为 `/#download`，隐私说明为 `/privacy`，内容来源与使用说明为 `/terms`。现有 `/admin/`、鉴权和媒体接口保留。官网静态资源位于 `apps/server/public/website/`，由独立 `website` 模块按白名单提供；页面禁止外部脚本、框架嵌入和任意静态文件读取。

下载区从既有 `/api/app-updates` 查询已发布版本，实时显示版本、包大小、更新说明及 SHA-256；没有发布时不显示下载动作，网络失败提供重试。iOS 按 App Store / TestFlight 实际发布状态展示，目前均未开放。二维码固定指向 `https://www.enochjs.top/#download`，以后发布更高构建号无需更换二维码。微信 / QQ 内提供在浏览器中打开的提示。

本次公开 **Android 体验版 1.1.0 / 构建 2**，arm64，最低 Android 7.0，大小 `83,774,759` 字节（页面显示 79.9 MB）；SHA-256 为 `8ea1cb0fb09d0dca681aafa33993168905a03d8e592fbc1cb6c0bffd352bd64e`。安装包来自已构建的 `storage/builds/hymn-repeat-ui-20261116/Selah-1.1.0-repeat-ui-arm64.apk`；签名再次通过 apksigner 验证，沿用原证书。通过受信业务服务执行上传、DTO 校验、草稿、revision 校验和发布，保留备份与 `ssh:linkmore` 审计；维护期间停止在线实例，完成后恢复单实例。最终包尚未连接真机覆盖安装，本次没有将系统安装、原生播放及 App 内自更新计为通过。

生产镜像为 `selah-server:official-site-20261116`。基于已核验运行镜像构建，仅叠加编译后的官网、版本发布模块、应用组合入口与对应管理静态资源，不包含 App 工具链、私有凭据或 APK。远程源码同步对应源文件，未覆盖内容数据和其他服务模块。可恢复镜像 `selah-server:before-official-site-20261116` 与私有备份位于服务器 `/home/linkmore/workspace/selah/storage/builds/official-site-20261116/`，权限受限；如需切回旧镜像，在该服务器项目根目录设置 `SELAH_IMAGE_TAG=before-official-site-20261116 docker compose up -d --no-build server`，并同步调整 `.env` 标签。不要用旧状态覆盖发布后新增编辑。

Nginx 为 `/api/admin/app-updates/artifacts` 单独配置 `client_max_body_size 210m`，其余路由及 Cookie、Host、Range 转发保持原策略。配置校验和重载通过，原配置保存于 `handshake:/root/selah-https/official-site-20261116/selah-https.before.conf`。更新后台仅接受已鉴权的上传，应用层继续限制 200 MiB 并执行 CSRF 与同源校验。

实际验证：完整 `npm run verify` 通过，App 873 项通过 / 1 项跳过、Server 100 项、Content 43 项通过，Python 428 项 / 20 项可选依赖跳过；服务端构建与 App Web 构建通过。候选及生产接口验证官网页面、鉴权 401、音频 HEAD / Range、APK HEAD / Range / ETag / If-Range 与完整下载哈希；195 个原有数据文件中仅管理状态文件发生预期审计更新，其余原文件及既有业务数据保持一致。公网 HTTPS 完整下载哈希一致，静态和真实渲染二维码均经独立解码验证。

实际浏览器验收已检查桌面首页、375×812 手机响应式首页与线上下载区、版本信息、iOS 未发布状态及复制链接。截图为 `docs/screenshots/2026-11-16-website-desktop.jpg`、`2026-11-16-website-mobile.jpg` 与 `2026-11-16-website-download-live-mobile.jpg`。当前 `adb devices` 无连接真机，真机扫码、外部浏览器往返和系统安装流程尚未验收。官网反馈说明没有虚构邮箱或联系方式，独立公开反馈渠道仍待配置。

发布与回读记录位于本地及远程 `storage/builds/official-site-20261116/`。本次未变更 npm 依赖或 CLI 版本。

服务端是独立 NestJS 应用，不需要 Expo、Python 或数据库服务。Dockerfile 位于 `apps/server/Dockerfile`，构建 context 必须是仓库根目录。镜像通过多阶段构建，仅安装 `@selah/server` 的生产依赖，编译后的 TypeScript、管理界面、离线内容和必要审计元数据进入运行镜像。

## 2026-11-11 书卷目录分隔线、滚动恢复与留白

移动端书卷目录的列分隔线和当前书卷竖条改为独立绘制，修复 Android 未显示竖线；旧约、新约在本次面板打开期间分别保留实际滚动偏移，首次进入另一约从顶部开始。取消单行书名占用两行的固定空白，文字组合上下居中，并将点击区域限制在所属列内。

Android arm64 Release 已覆盖安装至 PJE110，版本仍为 `1.0.0`，签名、首次安装时间及数据目录保持不变，安装回读与本地 APK 一致。最终 SHA-256 为 `16a97637997062aea09b4a206ef27b933a2efdfc0b49cfb558eb4b852fb43588`；原 APK、新包、构建日志和验收记录保存在 `storage/builds/book-grid-lines-20261111/`。

真机操作通过：旧约与新约多次往返、分别滚动后恢复原位置、首次进入新约从顶部开始；三条列分隔线已通过截图像素回读，点击区域为每列 270px，单行名称上下留白为 62／64px，两行名称为 36／39px。App 类型检查、lint、791 项测试（另跳过 1 项）、Web 导出和 Android Release 构建通过，当前 App 进程未见运行异常。关键截图为 `docs/screenshots/2026-11-11-book-directory-spacing-android.png` 和 `2026-11-11-book-directory-new-spacing-android.png`。本次未发布服务端。

## Docker Compose

```bash
cd /Users/fenghe/enochjs/selah
mkdir -p storage/admin
# 完成资源导入或从已有环境同步，不能用空目录代替完整MP3集。
# storage/resources/media 与 packages/content/data 必须已存在。
cp .env.example .env
export SELAH_UID="$(id -u)"
export SELAH_GID="$(id -g)"
docker compose config --quiet
docker compose up -d --build
docker compose logs --tail=100 server
```

已有 `.env` 时直接编辑。UID/GID 匹配绑定目录的所有者，也可写入 `.env`。根 `.env` 仅供 Compose；本地 NestJS 读取 `apps/server/.env` / `.env.local`，App 读取 `apps/app/.env` / `.env.local`。进程环境变量优先于文件配置；管理员凭据不进入 App。

默认访问 `http://127.0.0.1:8890/admin/`，健康检查为 `/api/health`。端口被本机开发进程占用时，设置 `ADMIN_PUBLISHED_PORT=8891`。只有首次初始化时使用 ADMIN_USERNAME / ADMIN_PASSWORD；已有存储凭据继续有效。

镜像默认 `selah-server:local`，版本由 `SELAH_IMAGE_TAG` 配置。基础镜像默认 `node:22-alpine`，发布平台镜像源可通过 `NODE_IMAGE` 覆盖：

```bash
NODE_IMAGE=your-registry/node:22-alpine docker compose build
# 或独立构建
docker build -f apps/server/Dockerfile --build-arg NODE_IMAGE=node:22-alpine -t selah-server:local .
```

## 发布平台参数

参考现有 meta-server 发布配置的镜像、端口、重启与持久化方式：

| 项目          | 配置                                                                   |
| ------------- | ---------------------------------------------------------------------- |
| build context | 仓库根目录                                                             |
| Dockerfile    | `apps/server/Dockerfile`                                               |
| 服务名        | `server`                                                               |
| 容器端口      | `8890`                                                                 |
| 启动          | 使用镜像默认 `node apps/server/dist/main.js`                           |
| 环境          | `NODE_ENV=production`、`HOST=0.0.0.0`、`PORT=8890`、`TZ=Asia/Shanghai` |
| 健康检查      | `GET /api/health`                                                      |
| 实例数        | `1`，当前JSON仓储采用单进程写入队列                                    |

平台使用镜像仓库时，将构建镜像推送到自己的仓库，再设置部署镜像地址。禁止在构建阶段注入管理员密码或复制本机 `.env*`。

## 数据挂载与备份

| 宿主机                     | 容器                            | 模式                                                         |
| -------------------------- | ------------------------------- | ------------------------------------------------------------ |
| `storage/admin/`           | `/app/storage/admin/`           | 读写：凭据、审核、草稿、审计日志、备份及上传的每日经文照片   |
| `packages/content/data/`   | `/app/packages/content/data/`   | 读写：内容索引、每日经文排期与词典发布结果；包含初始每日照片 |
| `storage/resources/media/` | `/app/storage/resources/media/` | 只读：MP3，支持 Range / HEAD / 条件请求                      |

词典使用临时文件 + rename，必须挂载整个数据目录，不要单独绑定 dictionary.json。容器不自动创建宿主机挂载目录，缺失时直接报错，避免从空数据启动。源码、开发依赖、缓存、虚拟环境和完整MP3不进入镜像。

停止服务后备份 `storage/admin/` 和维护中的 `packages/content/data/dictionary.json`、`hymns.json`、`playlists.json`（首次创建云歌单后生成）、`daily-verses.json`，并保留 `daily-verse-images/`、照片来源与许可 JSON；恢复时放回对应目录并保证UID/GID一致。上传的每日照片位于 `storage/admin/daily-verse-images/`，与排期一起恢复。原 `var/admin/` 的内容已经迁入 `storage/admin/`，无需重新初始化账号。原始音频和索引也应独立备份。

导入新资源后同步完整 `packages/content/data/`、`storage/resources/media/`、`storage/resources/audits/`、`storage/resources/timing-overrides/` 和 `storage/resources/timings/`。WebVTT 时间轴随审计元数据进入镜像，必须与发布索引一起更新；重新构建并重建服务容器。审核与词典数据保留在绑定目录；App 使用的新内容需要另行构建或正常更新。

```bash
docker compose ps
docker compose stop server
docker compose down       # 绑定目录的数据仍保留
```

## 反向代理

默认宿主机仅绑定127.0.0.1；远程访问使用 HTTPS 代理，转发 `/admin/`、`/api/admin/`、`/api/audio/`、`/api/hymns`、`/api/playlists`、`/api/daily-verses`（含其 `/images/` 子路径）与 `/api/health`，保留原始Host、Cookie和Range请求头。若代理来自另一台机器，再设置 ADMIN_BIND_ADDRESS。移动端 EXPO_PUBLIC_BIBLE_SERVER_URL 设置为同一HTTPS服务地址。每日经文目录和图片使用服务端的 `no-store` 策略；代理不要额外长期缓存，以便审核撤回及时生效。

## 2026-11-10 诗歌离线下载与真机安装

歌曲列表和展开播放器新增下载与状态入口，“我的 → 下载”统一管理圣经录音与诗歌。复用既有队列、原生续传和后台下载服务；下载前通过现有音频 HEAD 获取真实大小，完成后校验文件大小与 SHA-256。歌曲资料和歌词保存到本机，断网重启后可离线播放。删除文件及索引成功后才移除界面记录，失败保留重试入口；跨公开路径引用同一哈希的音频会校验复用，删除时保留其他下载仍引用的文件。

北京时间 21:09:05，Android arm64 Release 已覆盖安装至 PJE110（`224066a3`），版本仍为 `1.0.0` / versionCode `1`，签名与首次安装时间 `2026-11-01 17:03:08`、数据目录均保持不变。安装包回读 SHA-256 与本地产物一致：`909c381076aedf58f56378f92730c35421aa5cfbbd4b0245782f15300fd77f14`。产物、原 APK、构建日志与 `verification.json` 位于 `storage/builds/hymn-downloads-20261110/`。

完整项目 verify 通过；最终菜单与通知文案调整后，App 类型检查、lint、767 项测试（另跳过 1 项）与 Web / Android Release 构建再次通过。Server 80 项、Content 43 项、Python 428 项（跳过 20 项）及内容校验通过，服务端独立构建通过。本次复用已有公开接口，无需发布服务端。

真机已验证 6.1 MB 歌曲下载确认、仅 Wi-Fi 等待、暂停任务重启恢复、继续下载，以及关闭 Wi-Fi 和移动数据后冷启动、播放和歌词显示。网页实际验证下载管理、移除确认、存储归零及重新加载后保持删除。真机截图为 `docs/screenshots/2026-11-10-hymn-download-list-android.png`、`2026-11-10-hymn-download-offline-player-android.png`；网页管理截图为 `2026-11-10-hymn-download-manager-web.png`。用户切换到其他应用期间停止触屏操作，真机移除与横屏／字体缩放矩阵未完成；最后一版仅调整下载菜单和后台通知计数文案，完整功能的真机操作基于前一构建。验证后恢复原有网络设置，保留歌曲下载及暂停状态。

## 2026-11-02 诗歌歌词播放器发布与真机安装

### 播放器布局修正与真机界面验收

用户指出上一版存在页面内完整播放器与底部播放器重复、底栏过高的问题。修正后，聆听页始终保留歌曲库；手机底部采用 64dp 单行迷你播放器，点击歌名打开独立歌词面板，完整控制集中在展开面板。缺少歌词时以封面和简短提示呈现；低高度横屏采用紧凑布局，保留歌名、提示、进度和播放控制。歌词面板关闭并完成原生宿主退出后，才打开队列或倍速面板。

最终修复包为 `storage/builds/lyrics-layout-fix-20261102-201809/selah-lyrics-player-arm64.apk`，SHA-256 为 `ab4cb336c8400b588375e7a785b1fc4e50f8d0aa12ae84e3f0e173900eb3b603`。已再次覆盖安装 PJE110，新旧签名一致；安装包回读字节校验通过，首次安装时间及应用数据目录保持不变。真机实际操作已覆盖：单行底栏、展开与收起、暂停后保持进度、下一曲、队列选曲、尾曲下一曲禁用、倍速和循环切换，以及横竖屏控件可见性。测试后恢复竖屏、1 倍速和顺序播放，保留暂停状态；进程日志未记录致命异常或 React Native 启动错误。

完整检查通过：App 660 项通过、1 项跳过，Server 80 项通过，Content 43 项通过，Python 428 项、20 项跳过；网页导出、Android Release 构建与 `git diff --check` 通过。修复前后截图、最终安装包及安装回读记录保存在同一产物目录，汇总见 `verification.json`。此次仅更新客户端，正式服务端和曲库未修改；正式歌曲尚无逐句歌词，本轮未把真机带时间轴歌词同步计为通过。根目录 `AGENTS.md` 已补充“界面设计与审美”规范，明确视觉质量、控件密度及真实界面验收要求。

### 首次功能发布记录

北京时间 20:00:22，服务端已发布 `selah-server:lyrics-player-20261102-195612`，回退镜像为 `selah-server:before-lyrics-player-20261102-195612`。上线前使用独立内容与状态副本验证候选容器；正式单实例重建后健康检查、完整内容校验、内网与公网 HTTP / HTTPS、匿名管理接口 401，以及音频 HEAD 200 / Range 206 / ETag 304 / If-Range 206 均通过。106 个原有内容及管理数据文件 SHA-256 保持一致，原有诗歌、每日经文和歌单响应字节不变。部署只调整镜像标签，私有备份位于远程 `storage/builds/lyrics-player-20261102-195612/before-publish.tar.gz`，权限 600。

北京时间 20:04:27，Android arm64 Release 已通过 `adb install -r` 覆盖安装到 PJE110（`224066a3`）。版本为 `1.0.0` / versionCode `1`，新旧签名一致，首次安装时间 `2026-11-01 17:03:08` 与应用数据目录保持不变，未卸载或清除资料。安装后的 APK 已重新拉取并核对 SHA-256，和本次构建完全一致；冷启动成功，进程日志未记录致命异常或 React Native 启动错误。

安装包为 `storage/builds/lyrics-player-20261102-195612/selah-lyrics-player-arm64.apk`，SHA-256 为 `13454965d6b8329d302b7cbb4eee05f43fc201c3068d6c1873f0aec20927522d`。预生成和编译均使用 `https://www.enochjs.top`；已核对包内歌词功能、HTTPS 地址和禁止明文流量配置，未含临时预览地址。原 APK、构建、签名、安装回读及发布检查记录保存在同一目录，汇总见 `verification.json`。

后台诗歌上传和编辑支持可选 LRC 或纯文本歌词；播放器支持逐句高亮、居中跟随、手动浏览后返回当前句和点击选句跳播。原有曲库保持不变，逐句同步需要管理员补充与录音对应的 LRC。桌面及手机网页歌词交互已验证；本次真机验收完成安装回读与冷启动，未使用正式曲库执行带时间轴歌词的交互验收。完整 `npm run verify`、Server 构建、App Web 导出和 Android Release 构建通过：App 650 项通过、1 项跳过，Server 80 项通过，Content 43 项通过，Python 428 项、20 项跳过。

## 2026-11-02 聆听歌单发布与真机安装

北京时间 15:38:41，服务端已切换为 `selah-server:listening-playlists-20261102-153410`，保留回退镜像 `selah-server:before-listening-playlists-20261102-153410`。候选容器先使用独立内容与状态副本验证，再切换正式单实例；Docker 健康、完整内容校验和公网 HTTP / HTTPS 检查均通过，包括歌单接口 200、匿名管理接口 401、音频 HEAD 200 / Range 206 / ETag 304 / If-Range 206。106 个管理状态与内容文件 SHA-256 保持一致，原有 3 首诗歌和 90 天每日经文响应字节不变。

生产云歌单目录当前为 `revision: 0, items: []`，未自动创建示例。管理员从「诗歌 → 云端歌单」创建并发布后，App 会自动获取。部署仅调整镜像标签，未更改 FRP / Nginx 或媒体文件。远程私有备份为 `/home/linkmore/workspace/selah/storage/builds/listening-playlists-20261102-153410/before-publish.tar.gz`（权限600）；完整发布验证记录同步至本地同名 `storage/builds/` 目录。

北京时间 15:42:30，Android arm64 Release 已通过 `adb install -r` 覆盖安装到 PJE110（`224066a3`）。新旧签名一致，首次安装时间仍为 `2026-11-01 17:03:08`，应用数据目录不变，未卸载或清除学习与离线数据。真机已确认新聆听页、云歌单空态、「我的音乐」、新建歌单入口及服务器 3 首诗歌；冷启动正常，应用进程未见启动错误。设备随后切换到其他应用，因此停止进一步屏幕交互，未把原生歌单增删改或重启持久化计为通过。

安装包为 `storage/builds/listening-playlists-20261102153500/selah-listening-playlists-arm64.apk`，SHA-256 为 `1a843ccfed29113201d588157dd9d1c651c8de1ebd7d377339555996e1a1586a`。预生成与构建均使用现有 `https://www.enochjs.top` 地址，包内已核对云歌单接口及 HTTPS 配置，未含临时预览地址。原 APK、签名、构建和安装日志、截图与 `verification.json` 保存在该目录。真机截图为 `docs/screenshots/2026-11-02-listening-playlists-android.png`、`2026-11-02-listening-cloud-empty-android.png`。

发布代码的完整 `npm run verify`、Server 构建、App Web 导出和 Android Release 构建通过；App 638 项通过、1 项跳过，Server 79 项通过，Content 43 项通过，Python 428 项、20 项跳过。

## 2026-11-02 每日经文发布

服务端镜像为 `selah-server:daily-scripture-20261102-104255`，部署在原 `10.10.0.216:8890` 单实例服务。上线前先在独立数据目录的临时容器检查，再切换 Compose；正式容器健康检查通过。HTTP 和 HTTPS 均已验证健康接口、管理页面、匿名管理接口401、音频 HEAD 200 / Range 206 / ETag 304；每日经文接口提供90天排期与90张照片，全部照片的公网 HEAD 通过，并核对了下载照片的 SHA-256。正式镜像内的完整内容校验通过，运行依赖不包含 Expo、React、TypeScript 或 Vitest。

发布前后的管理员凭据、管理状态、词典、诗歌目录、经文、录音索引和既有资源清单共7个文件的 SHA-256 一致。图片与排期作为新增内容发布，没有替换线上译本、录音或既有资源清单。首批排期覆盖2026-11-02至2027-01-30；后续从后台「圣经 → 每日经文」补稿。

回退镜像 `selah-server:before-daily-scripture-20261102-104255` 已保留。发布前环境、服务源码和管理数据备份位于服务器 `storage/builds/daily-scripture-20261102-104255/before-publish.tar.gz`（仅当前用户可读），同目录保存构建日志及临时容器检查记录。需要回退服务时可在项目根目录运行 `SELAH_IMAGE_TAG=before-daily-scripture-20261102-104255 docker compose up -d --no-build server`，再同步调整 `.env` 的镜像标签。恢复管理数据前应先备份其最新状态，避免覆盖发布后新增的编辑。

Android arm64 Release 为本地 `storage/builds/daily-scripture-20261102-104255/selah-daily-scripture-arm64.apk`，SHA-256 为 `2cdc2c6946597e976d3196811bdb0f92dc767bd8b5b27a36546f370e2e3d83e5`。预生成和编译均使用 `EXPO_PUBLIC_BIBLE_SERVER_URL=https://www.enochjs.top`，原签名密钥不变；APK 签名校验通过，90张照片字节哈希与内容目录一致，并确认包含编译后的图片分享模块。发布时没有连接的 Android 设备，未执行覆盖安装或真机分享验证；旧版 App 需要安装此更新后才有每日经文界面。验证记录保存在安装包同目录。

后续于北京时间2026-11-02 10:55:40覆盖安装至 PJE110（`224066a3`），新旧 APK 签名一致，`adb install -r` 返回 Success。首次安装时间2026-11-01 17:03:08及应用数据目录保持不变，未卸载或清除数据；启动命令成功，应用进程未见 React Native / Android 启动错误。尚未执行系统图片分享的真机交互验收，安装前 APK 与安装记录保存在上述产物目录。

### 2026-11-02 Android 每日经文背景图修复

北京时间 11:13:15 已覆盖安装 PJE110。修复 Android 内置图片资源标识未提取为文件，以及 `File.move()` 更新路径后清理误删成品 JPEG 的问题；本地缓存或内置资源异常时可继续尝试下一来源。首页和分享图减轻遮罩，首页同步调整字号与留白。

最终 APK 位于 `storage/builds/daily-image-fix-20261102-110436/selah-daily-image-fix-arm64.apk`，SHA-256 为 `0d3363f69cc41dccab09007069951982739e7a892ad155fe487c35a1ee8a02a4`，签名与原包一致。首次安装时间与应用数据目录保持不变，未卸载或清除应用数据。真机已确认首页背景照片、方形及竖版 PNG 分享预览和冷启动后图片显示，当前应用进程未见启动错误；未执行对外发送。截图见 `docs/screenshots/2026-11-02-daily-scripture-android-fixed.png` 和 `2026-11-02-daily-scripture-share-android-fixed.png`，详细记录位于安装包同目录的 `verification.json`。

完整 `npm run verify` 通过：App 623 项通过、1 项跳过，Server 67 项通过，Content 43 项通过，Python 428 项、20 项跳过。Web 导出、Android Release 构建和 `git diff --check` 通过。本次仅更新客户端，无需重新部署服务端。

## 当前内网部署

打包机为 `linkmore@10.10.0.216`，项目目录 `/home/linkmore/workspace/selah`。在该目录运行 Docker Compose，宿主机 `.env` 使用 `ADMIN_BIND_ADDRESS=10.10.0.216`、`ADMIN_PUBLISHED_PORT=8890` 和与挂载目录所有者一致的 UID/GID。管理端为 `http://10.10.0.216:8890/admin/`，健康检查为 `http://10.10.0.216:8890/api/health`。

客户端 release 构建的环境变量设置为 `EXPO_PUBLIC_BIBLE_SERVER_URL=http://10.10.0.216:8890`。Expo 插件根据该变量生成仅作用于 release 的网络访问配置：仅允许所配置主机的 HTTP，其他主机保持禁止明文；使用 HTTPS 服务时不添加 HTTP 例外。原生预生成与 APK 构建必须使用同一地址。开发环境仍可连接本机服务，发布包无需 Metro 或 USB 端口转发，设备须能路由到打包机 IP。

音频单独同步到 `storage/resources/media/`，不放入 Docker 镜像。部署以发布索引和 APK 实际引用的 MP3 清单为准，导入过程遗留的旧分句不必部署。同步资源时先传媒体文件，再更新经文和音频索引；保留远程 `storage/admin/` 与已发布词典。容器重建不删除这些绑定挂载的数据。

## 阿里云 FRP 公网入口

当前公网资源地址为 `http://106.14.219.191`，健康检查为 `/api/health`。流量经过阿里云 `80 → frps:8890 → selah-audio → 10.10.0.216:8890`；资源仍存放在打包机，音频支持 HEAD、Range 和条件请求，下载清单为 `/api/audio/download-manifest`。公网 8890 未放行，因此使用已开放且空闲的标准 HTTP 80 端口。

阿里云使用 SSH 别名 `handshake`（root）。原 frps 位于 `/root/handshake/frp-server`，`docker-compose.override.yml` 只增加 `80:8890/tcp` 映射，原 7000 TCP/UDP 和 GitLab、SSH 穿透配置保留。修改前的 Compose 保存在该目录 `backup-selah-*` 下。

打包机使用独立目录 `/home/linkmore/docker/selah-frp`，容器名 `selah-frpc`，镜像 `fatedier/frpc:v0.68.0`，通过 host 网络连接本机 `10.10.0.216:8890`。`frpc.toml` 使用现有 frps token，权限为 600，不入仓库；控制连接启用 TLS，代理启用加密。两端容器均配置 `unless-stopped`，可重建后恢复连接。

发布 App 时设置 `EXPO_PUBLIC_BIBLE_SERVER_URL=http://106.14.219.191`，原生预生成和构建使用同一个值。`apps/app/.env.production.local` 保存此部署地址，本地开发 `.env.local` 保留本机地址。Android release 的 HTTP 例外仅限该公网主机，切换地址后必须重新预生成并构建安装。

维护时分别进入上述目录运行 `docker compose ps` 或 `docker compose up -d`；查看打包机连接使用 `docker logs --tail 50 selah-frpc`。撤销公网入口时，在打包机的独立目录运行 `docker compose down`，移除阿里云的 `docker-compose.override.yml` 后在 frp-server 目录运行 `docker compose up -d`。保留原有 frps、frpc-source 和 Selah 服务及数据目录。

## 公网 HTTPS 入口

2026-10-24 在阿里云服务器 `handshake` 上通过已配置的 Ubuntu 软件源安装系统 Nginx，监听 TCP 443，将请求转发至本机原有 `http://127.0.0.1:80` FRP 入口。HTTPS 地址为 `https://www.enochjs.top`，后台为 `/admin/`，健康检查为 `/api/health`。原 HTTP 80 入口继续保留，既有 App 不必同步升级。Nginx 由 systemd 管理，已启用开机启动；FRP 的 Docker 配置不变。

站点配置为 `/etc/nginx/sites-available/selah-https`，通过 `/etc/nginx/sites-enabled/selah-https` 启用；证书与私钥分别为 `/etc/nginx/ssl/selah/www.enochjs.top.pem` 和同目录的 `.key` 文件，仅 root 可读。配置保留原始 Host、Cookie、Range 和条件请求，关闭代理缓冲，并为后台会话 Cookie 添加 Secure。首次配置与证书副本保存在服务器 `/root/selah-https/`，均不进入仓库或构建上下文。

当前证书覆盖 `www.enochjs.top` 和 `enochjs.top`，北京时间 2027-01-22 07:59:59 到期。主域名截至部署时尚无 A 记录，需要额外添加 `@ → 106.14.219.191` 才能通过主域名访问。免费证书没有在服务器配置自动续签；到期前需重新申请并下载 Nginx 证书，备份旧证书后更换上述文件，确认私钥匹配，执行 `sudo nginx -t && sudo systemctl reload nginx`，再从公网验证 HTTPS。不要将证书私钥写入 Git。

部署已通过 Nginx 配置校验及服务重启验证，公网证书校验、健康检查、后台 HTML、未登录接口 401、音频 HEAD、Range 206 和原 HTTP 健康检查均已验证。查看状态用 `systemctl status nginx`；仅撤销 HTTPS 时用 `systemctl disable --now nginx`，HTTP FRP 入口仍可使用。

## 2026-10-25 下载优化发布

已发布服务镜像 `selah-server:audio-download-20261025`，容器健康检查通过。沿用现有 HTTP / HTTPS / FRP 地址及持久化挂载；管理员凭据、管理状态和已发布词典的 SHA-256 在重建前后保持一致。

本次先补齐安装包引用但服务器缺少的 907 个分节 MP3（约 53 MB）和 3 个内置诗歌试听 MP3，再原子更新匹配的录音索引与资源清单，并同步时间轴/审计元数据。原生 bundle 中提取的 47,028 个音频路径均已确认在服务器存在；下载清单包含 2,378 份章节录音及 47,025 个去重的章节/经节文件。

已对公网 HTTP、HTTPS 分别验证健康接口 200、管理页面 200、匿名管理会话 401、音频 HEAD 200、Range 206 和 ETag 条件请求 304。新镜像中的下载清单采用最多 8 并发元数据检查。

Android arm64 Release 已覆盖安装到 PJE110（`224066a3`），包名 `app.selah.bible`，版本 `1.0.0` / versionCode `1`，更新时间为北京时间 2026-10-25 14:23:07。通过签名证书一致性检查后执行 `adb install -r`，保留应用数据；原安装时间 2026-10-24 17:03:22 未改变，启动后已有离线诗篇 23 英文仍显示无需下载。启动日志未见致命异常或 JavaScript 错误。

安装包位于 `storage/builds/audio-download-20261025/selah-audio-download-arm64.apk`，SHA-256 为 `83bc0848da3e58f532d0921d3d7a214dd7e9632189f4323ca99e7af7d08de524`。本地产物存放在已忽略的 `storage/builds/`，不进入 Git 和 Docker 构建上下文。

回退镜像已保留为 `selah-server:before-audio-download-20261025`；服务器的源文件、环境文件、管理员数据、词典和旧内容索引备份位于 `/home/linkmore/workspace/selah/storage/builds/audio-download-20261025/`。回退时先恢复该目录中的原 `.env` 和必要索引，再运行 `docker compose up -d --no-build server`。完整旧 APK 也保留在同一本地产物目录下。

手机额外核对：已有约 2.65 GB 离线音频仍可识别；诗篇 23 英文确认面板显示新增下载 0 B。诗篇 124 英文的新分节文件确认需要新增约 272.8 KB，入队后按“仅 Wi-Fi”设置等待联网；通过 Android `cmd wifi status` 确认当时 Wi-Fi 关闭，未擅自启用 Wi-Fi 或取消下载限制。此次未把该等待状态计为下载完成或真机提速测试通过。

## 2026-10-26 逐章音频修复真机安装

北京时间 09:02:48，已将最新 arm64 Release 覆盖安装到 PJE110（`224066a3`）。签名与原包一致，首次安装时间保持不变，启动正常，已有生词数据可见；未清除学习记录和离线文件。

App 内置索引与线上下载目录一致：完整支持 2261 份、部分支持 9 份、待复核 108 份，待处理 0 份。线上先补齐 4137 个 MP3，再更新录音索引和资源清单；60773 个必需媒体均可下载。词典和管理数据哈希保持不变，服务重启后健康；已验证匿名管理接口 401、音频 HEAD 200、Range 206 和条件请求 304。

安装包与旧包保存在 `storage/builds/audio-case-device-20261026/`，新 APK SHA-256 为 `99ed2016ab527d5d6a1b991fd2870c7823d5a514ebbd38919d52a3ca9df5fe2f`。线上旧索引保存在 `/home/linkmore/workspace/selah/storage/builds/audio-case-device-20261026/before-publish/`。本次验证启动和资源可达性，未逐节试听全部音频。

## 2026-10-26 句首边界修复更新

北京时间 09:20:50 已覆盖安装 PJE110。创世记 32 章英文第 17 节通过完整语音区间、相邻经节与原音间隔验证，范围为 142.976–152.832 秒；原始模型分数、ASR 时间戳和录音保留。线上和 APK 索引一致：完整支持 2262、部分支持 9、待复核 107、待处理 0；60805 个所需音频均可下载。新增 32 个分节 MP3 先于索引发布，词典和管理数据保持原样。

已通过完整项目 verify、236 项 Python 测试（本机跳过 20 项可选依赖测试，远端全部通过）、Web 导出、Android Release 构建及独立代码复核；音频 HEAD / Range / 条件请求通过。APK 与旧包签名一致，应用数据保留，启动正常。产物和验证记录位于 `storage/builds/audio-span-device-20261026/`，APK SHA-256 为 `03d314734496a53eb8733a2bef8de53b5a6af8c7a83d75d72a7a2992a6b928b2`。

## 2026-10-26 全部剩余章节区间复核

逐项复核剩余 107 份，新增恢复 8 份英文录音：路得记 2、撒母耳记上 19、列王纪上 16、历代志下 18/26、马太福音 2/5、约翰福音 11。原音背景片段通过完整来源 VAD 和相对强度复验；原始分数、经文、语音时间戳保留。其余 99 份保留具体未通过原因。

本机、远端及线上索引一致：完整支持 2270、部分支持 9、待复核 99、待处理 0；58693 个经节音频，61071 个所需媒体均在服务端存在。线上先补齐 262 个 MP3 后发布索引，词典及管理数据哈希不变；健康、匿名鉴权及新增 8 章的媒体 HEAD / Range / 条件请求验证通过。

完整项目 verify、241 项 Python 测试（本机跳过 20 项可选依赖测试，远端全部通过）、服务端与 App Web 构建、Android Release 构建和独立代码复核通过。北京时间 2026-10-26 09:37:42 已覆盖安装 PJE110，签名及首次安装时间保持不变，启动正常；未清除学习和离线资料。产物位于 `storage/builds/audio-context-device-20261026/`，APK SHA-256 为 `5cd6368e192a88693ef60e0988ee0d18c690a17c3cf22133b6e77b70261d959f`。107 份输入原报告、原音和原文哈希均保持一致；本轮复制的 483 份证据文件已对照远端验证。

## 2026-10-26 出埃及记 16 章局部分界修复

单独修复英文第 32 节 Egypt 与第 33 节 So 之间的分界。完整原音、原文、原始模型分数和 ASR 时间戳保留；独立尾词高置信时间戳、可靠的下一节词头和原音局部 80 毫秒间隔共同确认切点 294.540 秒。第 32 节区间 281.201–294.540，第 33 节区间 294.540–303.490；第 33 节开头向后移动 80 毫秒，排除上一节尾音。

原音校验、246 项 Python 测试（本机跳过 20 项可选依赖测试，远端全部通过）、完整项目 verify、两端构建、Android Release 构建及独立代码复核通过。两节线上媒体 HEAD / Range / 条件请求通过，目录包含 61107 个所需媒体；新增 36 个 MP3 先于索引发布，词典和管理数据保留。全库完整支持 2271、部分支持 9、待复核 98、待处理 0。

北京时间 2026-10-26 09:53:02 已覆盖安装 PJE110，签名和首次安装时间保持不变，启动正常。产物位于 `storage/builds/audio-word-pause-device-20261026/`，APK SHA-256 为 `91c0f52208b1d6e69cb6a4bda100c024c5a82019c55cf259488bc7b0038da809`；本地原报告备份为 `storage/resources/cache/site-20261024/alignment-before-word-pause/exodus__16__en.json`。

## 2026-11-11 聆听内容重排真机安装

北京时间 2026-11-11T19:37:01+08:00，Android arm64 Release 已通过 `adb install -r` 覆盖安装到 PJE110（`224066a3`）。版本仍为 `1.0.0` / versionCode `1`，新旧签名一致；首次安装时间 `2026-11-01 17:03:08` 与应用数据目录保持不变，未卸载或清除资料。已回读设备 APK，其 SHA-256 与构建包一致：`4509ce48f3ec698a615743bf1a3b6091b0429d9be4accb564975e8b7a4ec69a8`。音频地址仍为既有 HTTPS 服务；生成的网络安全配置禁止明文流量。

真机已确认新聆听页的真实歌曲主推、紧凑曲库、歌曲时长、展开操作区，以及原有 4 首收藏和已下载标记；应用进程存在，应用日志未匹配到致命启动异常，原生媒体会话观测到对应诗歌播放。手机随后切到其他应用，已停止屏幕交互，未将下载管理弹窗、展开播放器返回、横屏和系统字体放大计为真机通过。

安装包位于 `storage/builds/listen-content-20261111/selah-listen-content-arm64.apk`；旧 APK、设备回读 APK、签名、构建／安装日志、截图及 `verification-native.json` 保存在同目录 `device/`。关键真机截图：`docs/screenshots/2026-11-11-listen-content-android.png`。

## 2026-11-11 系统歌曲封面与精选歌曲队列

修复 Android Release 内置封面返回 drawable 资源名导致系统卡片没有封面的问题；先将资源缓存为可读取的文件 URL，再更新系统媒体信息。精选歌曲入口改为从当前歌曲开始播放完整曲库，保留已有暂停／续播位置，系统“下一首”随实际队列启用。

完整 `npm run verify` 通过：App 787 项通过、1 项跳过，Server 80 项通过，Content 43 项通过，Python 428 项执行、20 项可选依赖测试跳过；App Web、Server 和 Android arm64 Release 构建通过。新增封面资源名、旧请求取消、缓存失败及精选队列回归测试，均先验证失败后修复。

北京时间 2026-11-11T19:56:41.323994+08:00 完成 PJE110 保留数据覆盖安装和 APK 回读；版本仍为 1.0.0 / versionCode 1，签名、首次安装时间及数据目录不变，回读 SHA-256 与构建包一致：`d02e375189a459dd247df379a329138d7633e5ad31bcf0c5b411ec8db2b0370e`。真机已验证系统控制中心及展开媒体面板的封面，点击系统“下一首”从《哈利路亚（现场版）》切换至《凡事都有神的美意》，上一首返回及暂停／续播正常。上一首沿用播放超过 3 秒先回曲首、再次点击返回上一首的既有行为。App 日志未发现致命异常或 React Native JavaScript 错误；iOS 真机未验证。

安装包、旧 APK、设备回读、签名和完整验证记录位于 `storage/builds/system-artwork-20261111/`。关键截图：`docs/screenshots/2026-11-11-system-artwork-next-enabled.png`、`docs/screenshots/2026-11-11-system-artwork-next-song.png`。

## 2026-11-11 诗歌曲库单行紧凑操作

按用户要求，歌曲列表移除左侧独立播放图标和展开操作排，将播放／暂停、收藏、添加歌单、下载四个按钮统一放到右侧。每个按钮横向点击区为 32dp、纵向为 44dp，图标为 18dp，整组占 128dp；现有 360dp 真机内容区中，歌名区域为 192dp。歌名和说明各保持一行，长名称省略，收藏和下载状态仍直接可见。其他页面按钮默认尺寸保持原值。

完整 `npm run verify`、App Web 导出、Server 构建及 Android arm64 Release 构建通过：App 792 项通过、1 项跳过，Server 80 项、Content 43 项通过，Python 执行 428 项、20 项可选依赖测试跳过。Web 在 360／375／393dp 竖屏和 844dp 横屏核对按钮排列、点击区、歌名宽度，添加歌单和下载确认弹窗通过；相关回归测试验证直接收藏及添加歌单不触发播放。

Android 已保留数据覆盖安装至 PJE110，签名、首次安装时间和数据目录保持不变，安装回读与构建 APK 的 SHA-256 一致：`0c0042b8ede2301f7ae65cc456b54239396eca7aeeeb02ec6de8a1779f8cc279`。真机已核对最终布局及原有四首收藏、下载标记；设备随后进入锁屏／息屏状态，点按未送达 App，未将收藏切换、歌单弹窗、下载管理、播放暂停计为真机通过，未更改解锁策略。iOS 真机未验证。本次未发布服务端。

产物和完整记录保存在 `storage/builds/hymn-inline-actions-20261111/`，关键截图为 `docs/screenshots/2026-11-11-hymn-inline-actions-android.png`。

## 2026-11-11 聆听歌单 Tab 真机安装

Android arm64 Release 于北京时间 22:04:45 通过 `adb install -r` 覆盖安装到 PJE110（`224066a3`），版本仍为 `1.0.0` / versionCode `1`。新旧包签名一致；首次安装时间 `2026-11-01 17:03:08` 和数据目录保持不变，未卸载、未清除资料。包内包含当前歌单名称、Tab 歌曲数量、独立播放按钮与收藏菜单调整，服务地址仍为 `https://www.enochjs.top`，未包含本地预览地址。

安装后 APK 已回读，SHA-256 与本次构建一致：`ace3cc621e342531a4c71ba2eb6c65f67fb2ae5f284a62ef2ba42bf1131db54b`。安装包、安装前 APK、构建与安装日志及回读核验保存在 `storage/builds/listen-tab-counts-20261111/`；详见 `verification.json`。安装及回读后 USB 再次断开，尚未完成新版 App 启动、歌单切换、播放、弹层与截图的真机界面验收，不将安装成功计为界面验收通过。

## 2026-11-12 底部播放器同步歌词

聆听页底部播放器第二行显示实际播放进度对应的 LRC 歌词，中英文同时间歌词合并为单行。超出可用宽度时缓慢横向循环，短句保持静止；换句或换歌重置，暂停、后台及减少动态效果时停止滚动。前奏、间奏空行和未带时间轴的歌词保留“歌词 · 播放详情”，点击仍进入原有详情页；不推测纯文本歌词时间。

Android arm64 Release 已覆盖安装至 PJE110（`224066a3`），版本仍为 `1.0.0` / versionCode `1`。签名、首次安装时间 `2026-11-01 17:03:08` 及数据目录保持一致，安装后回读 APK 的 SHA-256 与本地构建一致：`3079d336577ed2b6cb4940f7b83f0eb0d17e684772642db98081e7aa4c71d461`。真机验证了当前歌词、中英文长句滚动与循环、暂停静止及详情往返，当前进程未发现致命异常或 JavaScript 错误；尚未执行横屏、大字体和读屏真机验收，减少动态与后台停止由自动测试覆盖。

完整 verify 通过：App 800 项通过 / 1 项跳过，Server 80 项通过，Content 43 项通过；Python 运行 428 项 / 20 项跳过，内容校验通过。Web、Server 和 Android Release 构建通过。安装包、旧包、回读包、构建日志和 `verification.json` 保存在 `storage/builds/current-lyric-20261112/`；关键截图为 `docs/screenshots/2026-11-12-current-lyric-android.png`。本次未发布服务端。

## 2026-11-15 诗歌循环切换卡顿修复

整首诗歌切换单曲循环时，原先会重新选择当前歌曲，触发暂停、资源解析、seek 和续播。现在整曲直接更新原生循环开关，保留当前进度与播放／暂停状态；经文区间循环仍沿用原有范围处理。新增播放中、已暂停与系统打断后三种回归测试，先确认失败再修复。

完整 verify、App Web、Server 与 Android arm64 Release 构建通过：App 815 项通过／1 项跳过，Server 88 项、Content 43 项通过；Python 执行 428 项／20 项可选依赖测试跳过。Android 因远程依赖仓库超时，使用当日已验证的同版本本地缓存离线构建，依赖版本未变。

北京时间 18:52:18 已保留数据覆盖安装至 PJE110（224066a3），版本仍为 1.0.0／versionCode 1；签名、首次安装时间及数据目录保持不变，原有 9 首收藏仍可见。设备 APK 回读 SHA-256 与构建包一致：`06ccc8278df8dccaaaac2c0ce53dab8aacf4521053559f2c0695f7a1f4c9fd4e`。

真机播放《领我到你宝血里》，依次切换顺序、单曲循环与列表循环。原生状态持续为 PLAYING，三段进度与设备时钟增量之差分别为 0、7、-4 毫秒；暂停后切换仍为 PAUSED，位置差在 20 毫秒内，验证结束已恢复顺序播放与续播。界面模式图标、歌词与进度正常，当前 App 日志未匹配到致命异常或 JavaScript 错误。本次通过原生状态和界面核验，未做声学录音分析，iOS 真机未验证。

安装包、旧包、回读、构建日志及 verification.json 位于 `storage/builds/hymn-repeat-20261115/`；关键截图为 `docs/screenshots/2026-11-15-hymn-repeat-android.png`。

## 2026-11-16 App 更新能力（本地交付，尚未生产部署）

新增“我的 → 设置 → 检查更新”和关于页共用入口，接入平台/渠道/构建号检查、更新说明、下载暂停与续传、原生安装包校验及系统确认安装。自动提醒在阅读、播放和共享弹层期间延后；低于在线服务最低构建号时保留离线内容并限制新的在线操作。服务端增加带 revision、备份和审计的版本草稿、发布、撤下及安装包接口；详细操作见 `docs/app-updates.md`。

本地 Android arm64 Release 为 **1.1.0 / versionCode 2**，安装包：`storage/builds/app-updates-20261116/Selah-1.1.0-build2-arm64.apk`。SHA-256：`292e2a53f21114266efa25f2d073c1d7ddcfbfbddd037e2522dcdd308e111537`。APK 签名验证通过，证书与本地旧包一致；未更换原有签名。实际 APK 已在隔离本地服务完成上传、草稿、发布、HEAD/Range、完整下载哈希及撤下回读，未修改生产目录或向真实用户发布。

App 最终类型检查、lint 与 863 项测试通过／1 项跳过；Server 95 项、Content 43 项通过；Python 执行 428 项／20 项可选测试跳过，内容校验、Server/Web/Android 构建和源码复核通过。Web 实际操作了设置、关于、更新和返回入口，并核对 375×812 与横屏；管理页已操作草稿保存、发布及撤下。

最终 ADB 列表没有已连接设备，未安装到真机；真实 HTTPS 进程重启续传、权限返回、系统安装、升级后资料保留及暂停播放恢复仍待真机验收，iOS 全量构建及真机同样未验证。当前 **服务端尚未生产部署，版本未公开发布**。旧构建 1 无更新模块，需先保留数据覆盖安装一次引导包。完整核验记录位于同目录 `verification.json`。


### 2026-11-16 真机覆盖安装补验

手机连接后，已于北京时间 **2026-11-16 10:15:20** 使用 `adb install -r` 将 **1.1.0 / versionCode 2** 覆盖安装至 PJE110（224066a3）。安装前备份了手机实际旧 APK 并确认签名一致；未卸载、未清除数据。首次安装时间仍为 **2026-11-01 17:03:08**，数据目录保持不变；设备新 APK 回读 SHA-256 与交付包一致：`292e2a53f21114266efa25f2d073c1d7ddcfbfbddd037e2522dcdd308e111537`。

新版冷启动成功，当前进程错误日志为空；安装前后的 3 个收藏单词、3 个待复习及 0 处经文收藏计数一致。随后手机自动进入安全锁屏，后续点击未送达 App，未将歌曲收藏数、更新入口及其重试/返回流程计为真机验收通过，也未改变设备解锁策略。旧构建 1 没有升级播放检查点，本次不宣称验证了播放进度自动恢复。证据见 `storage/builds/app-updates-20261116/device/verification-device.json`、启动与资料截图、旧/新回读 APK。线上更新服务仍未部署。


## 2026-11-16 诗歌循环方式文字入口（本地交付，真机待验收）

迷你播放器新增图标加文字的循环方式入口；展开播放器使用同一控件。点击后选择顺序播放、单曲循环或列表循环，每项附简短说明与当前选中标记，选中立即生效并关闭面板。切换继续使用既有 setRepeat，不重选歌曲。默认迷你栏保持约 64dp，大字体时允许自然增高，避免固定高度截断文字；原有播放队列入口保留。

完整 verify 通过：App 872 项／1 项跳过、Server 95 项、Content 43 项，Python 执行 428 项／20 项跳过，内容校验通过。最后补齐 Web 读屏选中语义后，App 类型检查、lint 与 873 项测试／1 项跳过再次通过；Server、Web 与 Android arm64 Release 构建通过，依赖版本未变。Web 实际验证三种模式选择、320／375／1280px 控件边界、375px 展开播放器、844×390 横屏、返回与队列弹层衔接及 aria-checked；关键截图保存在 docs/screenshots/2026-11-16-hymn-repeat-*.png。

本地安装包为 storage/builds/hymn-repeat-ui-20261116/Selah-1.1.0-repeat-ui-arm64.apk，版本仍为 1.1.0／versionCode 2，SHA-256：`8ea1cb0fb09d0dca681aafa33993168905a03d8e592fbc1cb6c0bffd352bd64e`。签名校验通过，证书与上一份本地包一致；安装包、日志及 verification.json 保存在同目录，未生产发布。

PJE110（224066a3）在构建期间断开，交付前多次 ADB 检查均无设备，因此本次未覆盖安装；Android 真机界面、大字体、读屏与播放验收，以及 iOS 构建和真机验收尚未完成。Web 预览和测试不计作真机通过。


## 2026-11-16 底栏切歌与旋转唱片（真机安装）

Android 1.1.0 / versionCode 2 已于北京时间 18:09:10 通过同签名覆盖安装到 PJE110。底栏保持单行，增加上一曲和下一曲；循环入口保留三种具名选项，手机端文字为 9sp、按钮为 44dp，收紧组间距后为歌名和歌词增加约 20dp。封面以圆形唱片缓慢旋转，暂停保留角度，续播按剩余角度维持速度，缓冲、后台和减少动态效果时停转。没有新增依赖。

最终包：`storage/builds/player-record-20261116/Selah-1.1.0-player-record-arm64.apk`，SHA-256：`0025862ba3f52185cecdaca94b28589a192d07d66cf74bfccbd85a9e1e04a06b`；设备 APK 回读完全一致。首次安装时间仍为 2026-11-01 17:03:08，数据目录不变，11 首收藏保留，未卸载或清除资料；本次没有公开发布。

实际验证：`npm run verify`、Web 导出、服务端构建、Android Release 构建通过。App 906 项通过 / 1 项跳过，Server 109 项通过，Content 43 项通过；Python 运行 428 项，20 项跳过。浏览器检查 320px、375px、横屏以及展开／返回；最终间距在真机再次复核。真机覆盖底栏上一曲／下一曲、三种循环、展开播放器、暂停并返回；原生会话分别回读 PLAYING / PAUSED，播放封面帧哈希不同，暂停后两帧一致。系统减少动态效果和前后台生命周期由组件回归验证，未在真机修改系统设置。测试结束保留暂停及原有列表循环状态。

关键截图：`docs/screenshots/2026-11-16-player-record-android.png`；原始截图、构建日志、签名／安装回读与 `verification.json` 保存在上述构建目录。


## 2026-11-16 播放器 UI 专项重设计（仅本地预览）

按用户最终反馈，播放器改为暖底独立白卡，使用14dp圆角、细边框、36dp薄环唱片、14sp中等字重歌名及18dp轻量播放图标；所有操作保留至少44dp触控区域。卡片72dp，包含外侧留白86dp；循环提示与歌词同基线，两者保留8dp真实空隙。320px使用较小侧边距，标题区66dp、歌词区190dp；375px标题区105dp、歌词区229dp。前奏或没有当前声学时间轴时显示真实演唱者，次选原有歌曲副标题，无资料时显示“查看歌词”，不伪造当前歌词。

UI专项完成独立前后截图比较，以及320px、375px和英文状态复审。隔离本地浏览器实际验证前奏、真实歌词、暂停、三种循环点击直接切换且不弹框、封面展开与返回、844px横屏和1280px桌面队列；控制台无页面脚本异常。模式文字与歌词Y坐标一致，操作区域均至少44dp。`npm run verify`及Web导出通过：App 908通过/1跳过，Server109、Content43通过；Python运行428，20跳过。

本地预览：`http://127.0.0.1:8765/preview`，可切换320/360/375/430px手机宽度，内嵌实际应用。按用户最终要求，本轮没有操作或安装真机，也没有公开发布；手机当前安装包不包含此次卡片设计，真机最终验收未执行。没有新增依赖。关键截图为 `docs/screenshots/2026-11-16-player-card-final-375.png` 和 `2026-11-16-player-card-final-320.png`；验证记录在 `storage/builds/player-card-design-20261116/verification.json`。
