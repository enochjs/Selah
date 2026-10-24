# 服务端部署

服务端是独立 NestJS 应用，不需要 Expo、Python 或数据库服务。Dockerfile 位于 `apps/server/Dockerfile`，构建 context 必须是仓库根目录。镜像通过多阶段构建，仅安装 `@selah/server` 的生产依赖，编译后的 TypeScript、管理界面、离线内容和必要审计元数据进入运行镜像。

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

| 项目 | 配置 |
| --- | --- |
| build context | 仓库根目录 |
| Dockerfile | `apps/server/Dockerfile` |
| 服务名 | `server` |
| 容器端口 | `8890` |
| 启动 | 使用镜像默认 `node apps/server/dist/main.js` |
| 环境 | `NODE_ENV=production`、`HOST=0.0.0.0`、`PORT=8890`、`TZ=Asia/Shanghai` |
| 健康检查 | `GET /api/health` |
| 实例数 | `1`，当前JSON仓储采用单进程写入队列 |

平台使用镜像仓库时，将构建镜像推送到自己的仓库，再设置部署镜像地址。禁止在构建阶段注入管理员密码或复制本机 `.env*`。

## 数据挂载与备份

| 宿主机 | 容器 | 模式 |
| --- | --- | --- |
| `storage/admin/` | `/app/storage/admin/` | 读写：凭据、审核、草稿、审计日志、备份 |
| `packages/content/data/` | `/app/packages/content/data/` | 读写：内容索引与词典发布结果 |
| `storage/resources/media/` | `/app/storage/resources/media/` | 只读：MP3，支持 Range / HEAD / 条件请求 |

词典使用临时文件 + rename，必须挂载整个数据目录，不要单独绑定 dictionary.json。容器不自动创建宿主机挂载目录，缺失时直接报错，避免从空数据启动。源码、开发依赖、缓存、虚拟环境和完整MP3不进入镜像。

停止服务后备份 `storage/admin/` 和 `packages/content/data/dictionary.json`；恢复时放回对应目录并保证UID/GID一致。原 `var/admin/` 的内容已经迁入 `storage/admin/`，无需重新初始化账号。原始音频和索引也应独立备份。

导入新资源后同步完整 `packages/content/data/`、`storage/resources/media/`、`storage/resources/audits/`、`storage/resources/timing-overrides/` 和 `storage/resources/timings/`。WebVTT 时间轴随审计元数据进入镜像，必须与发布索引一起更新；重新构建并重建服务容器。审核与词典数据保留在绑定目录；App 使用的新内容需要另行构建或正常更新。

```bash
docker compose ps
docker compose stop server
docker compose down       # 绑定目录的数据仍保留
```

## 反向代理

默认宿主机仅绑定127.0.0.1；远程访问使用 HTTPS 代理，转发 `/admin/`、`/api/admin/`、`/api/audio/` 与 `/api/health`，保留原始Host、Cookie和Range请求头。若代理来自另一台机器，再设置 ADMIN_BIND_ADDRESS。移动端 EXPO_PUBLIC_BIBLE_SERVER_URL 设置为同一HTTPS服务地址。

## 当前内网部署

打包机为 `linkmore@10.10.0.216`，项目目录 `/home/linkmore/workspace/selah`。在该目录运行 Docker Compose，宿主机 `.env` 使用 `ADMIN_BIND_ADDRESS=10.10.0.216`、`ADMIN_PUBLISHED_PORT=8890` 和与挂载目录所有者一致的 UID/GID。管理端为 `http://10.10.0.216:8890/admin/`，健康检查为 `http://10.10.0.216:8890/api/health`。

客户端 release 构建的环境变量设置为 `EXPO_PUBLIC_BIBLE_SERVER_URL=http://10.10.0.216:8890`。Expo 插件根据该变量生成仅作用于 release 的网络访问配置：仅允许所配置主机的 HTTP，其他主机保持禁止明文；使用 HTTPS 服务时不添加 HTTP 例外。原生预生成与 APK 构建必须使用同一地址。开发环境仍可连接本机服务，发布包无需 Metro 或 USB 端口转发，设备须能路由到打包机 IP。

音频单独同步到 `storage/resources/media/`，不放入 Docker 镜像。部署以发布索引和 APK 实际引用的 MP3 清单为准，导入过程遗留的旧分句不必部署。同步资源时先传媒体文件，再更新经文和音频索引；保留远程 `storage/admin/` 与已发布词典。容器重建不删除这些绑定挂载的数据。
