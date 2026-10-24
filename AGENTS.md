# Selah project rules

## 执行偏好

除非用户明确要求写计划、先规划或同等含义，不创建设计文档、规格说明或实现计划，不等待计划确认；直接实施并验证。

## 认可的架构与目录边界

本仓库采用 **npm workspaces monorepo**。客户端与服务端为两个可分别运行、检查、构建、部署的应用。服务端采用 **NestJS 模块化单体 + 经典分层架构**；客户端采用 **按功能组织的 Clean Architecture**。架构优先保证职责、依赖方向、可读性和可测试性，不为模式而增加空壳。

```text
apps/app/          Expo / React Native 客户端，@selah/app
apps/server/       NestJS TypeScript 服务端与 public/ 静态管理界面，@selah/server
packages/content/  唯一的离线内容数据集、授权元数据和只读校验，@selah/content
tools/content/     Python 资源导入、对齐与审计工具
tools/assets/      图标与示例音频生成工具
tools/dev.mjs      本地开发进程编排
storage/           MP3、缓存、对齐产物、管理状态等运行数据
docs/              使用说明与截图
```

- 应用实现只能放在所属 `apps/` 包内；根目录仅保存工作区入口、仓库规则、部署编排与公共工程配置。
- App 和 Server 禁止互相导入源码、配置或依赖；共享需求提炼为有清晰职责的 `packages/` 包。共享包不得反向依赖应用。
- 移动端和服务端各自维护 package.json、TypeScript、lint、test 与构建配置；服务端不能继承 Expo 配置或安装移动端运行依赖。
- `packages/content/data/` 是经文、录音索引和词典的唯一来源，App 经包导出导入，服务端经内容仓储读取。不得在多处保留副本；词典发布应写回该目录并保留备份。
- 当前经文和录音采用用户指定的 `chineseandenglishbible.com` 站点资源：NIV / WordProject 普通话和合本。导入必须保存新的 HTTP 快照和 SHA-256，不复用旧项目的文本副本或时间轴；未经用户要求不得切换译文或配音。分句采用 Whisper 独立识别与 WhisperX 声学对齐，发布标准 WebVTT（USFM 经节 ID）和独立经节 MP3，使用原生文件循环。未通过完整音文和边界核对的内容只能整章播放，下载完成、待处理、待复核与通过核对必须分别计数。
- 连续播放使用整章原始录音，仅按时间轴更新经节高亮；经节自然切换不得停止、换文件或重新 seek 音源。独立经节 MP3 用于单句循环，切换播放模式必须保留当前经节内的进度和暂停状态。
- `storage/` 只放运行或导入数据，禁止放源代码；私有凭据、MP3、缓存、日志和虚拟环境不得进入 Git 或 Docker 构建上下文。
- 数据目录、媒体目录、后台状态目录通过服务端配置集中管理；路径基于项目物理位置或显式环境变量，不能依赖启动时的 cwd。

## 服务端架构

- 按业务能力划分模块，例如 auth、content、dictionary、reviews、system、media；模块通过 Nest Module 的 exports/imports 和依赖注入协作。
- **Controller → Service → Repository**：Controller 负责路由与协议映射，DTO / Pipe 负责输入校验，Service 负责用例与业务规则，Repository / Adapter 负责文件、数据库、外部进程和媒体流等 I/O。
- 领域类型和业务数据结构保持纯 TypeScript；不能引入 Request、Response、Nest、React 或文件系统。
- Controller 不得直接读取文件、执行脚本、实现认证算法或操作存储；不能把原来的单文件路由处理器套在框架中。
- 业务服务经仓储访问存储；仓储不得依赖 Controller。禁止跨层任意取文件、读取全局可变对象或隐藏初始化。
- 入口只做配置、组合、监听与优雅退出；全局异常响应、请求校验和安全策略集中配置，不能散落在各个路由。
- 输入使用 DTO + class-validator；拒绝未知写入字段，保留乐观并发校验；外部异常统一转为稳定 HTTP 响应，不回传内部路径、堆栈或凭据。
- 全部新增服务端源码使用 TypeScript strict；禁止 `any`、`@ts-ignore`、`@ts-nocheck`、allowJs 或通过关闭 lint 绕开类型边界。
- 保留密码散列、会话过期、登录限流、CSRF、同源校验、原子写入、发布备份和音频 Range / HEAD / 条件请求。文件存储部署只运行一个实例；需要多副本时先替换为支持并发的持久化仓储。

## 代码审美与维护

- 优先明确的名称、小而完整的职责和显式依赖；先读懂已有结构，再沿相同模式修改。
- 避免巨大路由条件链、万能 service、无边界 shared/utils、重复模型和只有转发作用的多余抽象。
- 共享技术能力放在明确命名的公共设施里，业务逻辑留在所属模块；依赖、路径、错误和数据结构必须可追踪。
- 不擅自更换数据来源、录音、译本、授权信息或既有学习数据格式；结构调整应保持原有行为和数据可恢复。
- 包管理使用 npm，根目录保留一份 package-lock.json。Expo 依赖遵从 apps/app/AGENTS.md 的版本化文档和 `expo install` 规则。
- 不直接编辑生成目录，不将 dist、缓存或运行状态当作源文件提交。

## 验证与部署

在根目录使用 Node.js 22.13+（`.nvmrc` 为22）运行：

```bash
npm ci
npm run verify       # 两端类型检查、lint、回归测试、Python测试、内容校验
npm run build:server
npm run build:app    # 涉及App或打包边界时必跑
```

- 修复缺陷先补可复现回归测试；重构应保留现有行为测试，通过真实接口验证关键流程，避免只断言实现细节。
- 涉及文件布局或资源路径时，验证导入/校验脚本、离线打包及原有管理数据可以继续读取。
- 服务端 Dockerfile 位于 `apps/server/`，构建 context 为仓库根目录；根 docker-compose.yml 仅编排服务端与其数据挂载。
- Docker 只安装服务端生产依赖；App 和 Server 可独立构建，不得把 Expo 工具链、Python 虚拟环境或本机凭据打进服务镜像。
- 修改部署配置后，校验 Compose、构建镜像，并验证健康检查、鉴权、媒体请求和重建后的持久化。
- 未实际执行并确认通过的检查，不得宣称已通过。
