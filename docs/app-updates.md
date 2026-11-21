# App 更新

客户端的“我的 → 设置 → 检查更新”和“关于与版权 → 检查更新”进入同一更新页。Android 当前发行渠道为直接 APK 安装，iOS 走 App Store 或 TestFlight；网页版随站点发布更新，不下载原生安装包。首个包含更新能力的版本为 **1.1.0 / 构建 2**。

**最新发布状态（2026-11-18）：** Android 体验版 **1.1.3 / 构建 5** 已公开，[官网](https://www.enochjs.top/#download) 与版本检查接口提供更新。公开包为 `storage/builds/public-release-20261118-1.1.3/Selah-1.1.3-build5-arm64.apk`，SHA-256 为 `9729a88a1f637d63db1714c79fb63429948ec88056e7effc107691a2d243d4f0`，大小 84,089,587 字节。升级已在 Android 模拟器完成 App 内下载与系统安装，在 PJE110 完成同签名覆盖安装和版本回读。发布状态以本段和 `docs/deployment.md` 的 1.1.3 记录为准，下文保留早期交付记录。

## 使用与兼容策略

- 启动和回到前台会检查，但自动检查每 24 小时最多一次；手动检查不受此限制。检查失败单独提示，不表示“已是最新版”。
- 普通更新可稍后提醒或跳过该构建，重要更新不可跳过。实际自动提醒每天最多一次，阅读、播放、缓冲或其他共享弹层打开时延后，不自动停止播放或重启 App。
- `minSupportedBuild` 表示在线服务支持下限；仅当当前构建低于它时，暂停新的在线目录、词典、图片、媒体下载与远程播放请求。更新检查、APK 下载、商店入口继续可用；经文、学习记录、本地音频以及已经开始的播放/传输保留。此版本没有单独的整 App 安全锁定模式，不应把“重要更新”当作锁定开关。
- 下载只在 Wi-Fi/以太网确认后直接开始，其他网络先说明完整包大小；切到后台会暂停，可以返回继续。断网和进程重启保留私有 `.part` 文件，使用 Range / If-Range 续传。
- 原生端流式核对包大小、SHA-256、应用包名、实际版本、递增构建号和与当前安装一致的签名。校验完成才提供系统安装入口；用户需在系统中确认。仅在用户点击后引导到“允许此来源安装应用”，不请求文件全盘访问权限。
- 进入系统安装或商店前保存播放队列身份、进度、倍速和循环状态；更高构建启动后从当前目录重新解析资源，恢复为暂停状态。已下架或无法匹配的内容明确提示，不播放其他资源。个人导入歌曲暂不支持升级后的自动播放位置恢复；歌曲文件和学习资料不删除。

## 构建与版本号

实际安装信息从原生包读取。`apps/app/app.json` 中 `expo.version` 为显示版本；`android.versionCode` 和 `ios.buildNumber` 为原生构建号。每次发布必须增加构建号，不复用已发布或已撤下的构建号。EAS 使用 `appVersionSource: local`；正式构建保留 `autoIncrement`。

```bash
EXPO_PUBLIC_BIBLE_SERVER_URL=https://www.enochjs.top npm run build:android --workspace @selah/app
npm run build:server
npm run build:app
npm run verify
```

当前 Android 产物仅打包 arm64-v8a。现有 App 的 APK 签名仍沿用原安装密钥，当前生成项目的 Release 使用原有 debug signing 配置；此次没有擅自换钥。正式扩大分发前应单独确认长期签名方案，不能直接更换密钥导致已安装用户无法覆盖更新。直接安装版请求 `REQUEST_INSTALL_PACKAGES`；未来单独上架 Google Play 的渠道包必须剥离该权限及直接安装模块，再完成商店审核。

iOS 从原生 Bundle 读取版本与构建号，使用原生 receipt 区分 App Store 与 TestFlight；无 receipt 的开发或 ad hoc 构建可通过 `ios.infoPlist.SelahUpdateChannel` 指定 `testflight`。实际商店 receipt 优先于该标记。iOS 构建及真机尚未验证。

## 后台发布

入口为管理中心的“App 版本”页（`/admin/#app-updates`），沿用现有登录、CSRF 和同源检查。

1. Android 先上传 APK（不超过 200 MiB），服务端计算大小、SHA-256 和固定下载路径。上传仅证明文件具有 ZIP 头及字节完整性；不证明包可安装，包名、版本和签名仍需原生安装验证。
2. 新建草稿，选择平台/渠道，填写版本、构建号、最低支持构建号和中英文更新说明。直接安装渠道绑定已上传的 APK；商店渠道只接受对应官方商店的链接。
3. 保存草稿后，在版本行点击发布并核对提示。新发布版本不能低于既有已发布构建；已发布版本的包、渠道和构建身份不可修改，只能发布更高构建号的修正版。
4. 出现问题时撤下该版本；公开检查和新下载立即不可用。撤下保留历史和构建身份，不删除证据。修复后发布更高构建号。

首次启用的引导版本需要覆盖安装一次：旧的构建 1 没有更新模块，无法自行发现新版。安装引导包时保留原应用，不卸载、不清除数据。后续通过 App 内更新。发布最低支持下限前，先确认大多数设备已有可用的更新入口。

## 服务端存储与接口

运行数据位于 `ADMIN_STATE_ROOT/app-updates/`，包括目录、APK 和发布备份，沿用现有管理状态目录挂载；不进入 Git 或镜像。文件仓储只运行一个写入实例。备份和恢复时连同 `ADMIN_STATE_ROOT/state.json` 的审计一起处理，不用空目录覆盖现有状态。

| 接口                                                                 | 用途                                                 |
| -------------------------------------------------------------------- | ---------------------------------------------------- |
| `GET /api/app-updates?platform=android&channel=direct&buildNumber=2` | 返回 `{release: ...}` 或 `{release: null}`，禁止缓存 |
| `GET /api/app-updates/artifacts/<sha256>.apk`                        | 仅已启用版本可下载，支持 HEAD、Range、ETag、If-Range |
| `GET /api/admin/app-updates`                                         | 管理目录与 revision                                  |
| `POST /api/admin/app-updates/artifacts`                              | 受鉴权保护的 multipart，字段 `file`                  |
| `PUT /api/admin/app-updates`                                         | 保存草稿、发布或修改允许的描述字段，校验 revision    |
| `DELETE /api/admin/app-updates`                                      | 根据 id/revision 撤下，保留历史                      |

反向代理需要允许 200 MiB 文件加 multipart 边界的请求体，例如 Nginx 的 `client_max_body_size 210m`，并允许上传超时。当前功能代码不自动修改生产 Nginx 配置。

## 本次交付的验证边界

已完成接口与状态机自动测试、服务端构建、Web 导出、Android Release 构建和源码复核。Web 已实际检查设置/关于的共用入口、返回导航、375×812 和横屏布局；管理中心已实际操作草稿保存、发布、编辑锁定身份和撤下。截图保存在 `docs/screenshots/2026-11-16-app-updates-web-375.png` 与 `2026-11-16-admin-app-updates-web.png`。

当前没有已连接 Android 真机，未验收真实 HTTPS 下载中的进程重启续传、权限设置往返、系统确认安装、覆盖更新后的学习/离线资料保留和暂停播放恢复。自动测试与编译不能替代这些验收；iOS 全量构建和真机同样待验收。服务端尚未部署到生产环境，未向真实用户发布版本。


### 连接手机后的补验

2026-11-16 已向 PJE110 保留数据覆盖安装 1.1.0 / 构建 2，并完成实际设备旧包签名比较、新包回读哈希、首次安装时间/数据目录、冷启动与学习计数核对。手机随后自动进入安全锁屏，更新页交互、歌曲收藏及离线文件完整性没有完成复核；App 内真实自更新流程仍待验收。此前“没有连接设备”的描述为首次构建交付时的状态，以本补验及 `device/verification-device.json` 为最新记录。线上服务部署状态未变。
