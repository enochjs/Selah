# 从内网到 HTTPS：用 Docker、FRP 和阿里云部署 NestJS 服务

我有一个 NestJS 资源服务，运行在内网 Linux 机器上，提供管理后台、健康检查和音频接口。希望手机离开内网后仍能访问，又不想把完整音频资源搬到云服务器，于是采用了这条链路：

**内网 Docker 部署业务服务 → FRP 穿透 → 阿里云公网入口 → 域名解析 → Nginx 安装 HTTPS 证书。**

这篇文章记录从服务启动到 HTTPS 可用的全过程，也整理了实际遇到的几个问题：为什么域名解析正常仍然打不开、CSR 应该怎么选，以及为什么阿里云轻量服务器的「设置 HTTPS」按钮不能用于所有 Ubuntu 实例。

> 操作记录时间：2026-10-24。本文基于实际部署整理，为方便公开发布，IP、域名、用户名、主机别名和部分目录统一替换为示例。`203.0.113.10` 是文档示例地址，`example.com` 是示例域名，必须替换后才能操作。密码、FRP Token、证书私钥不包含在文中。

## 一、先看最终的请求链路

```text
浏览器 / 手机 App
    |
    | https://www.example.com
    v
DNS：www.example.com → 云服务器公网 IP
    |
    v
阿里云 Ubuntu：Nginx 监听 443，完成 HTTPS 解密
    |
    | proxy_pass http://127.0.0.1:80
    v
云服务器宿主机 80 → Docker frps 容器 8890
    |
    | FRP 的 selah-audio TCP 代理
    v
内网 Linux：frpc
    |
    | 192.168.1.100:8890
    v
Docker 内的 NestJS 服务
    ├── /admin/                 管理后台
    ├── /api/health             健康检查
    └── /api/audio/...          音频资源
```

FRP 分为两端：`frps` 运行在有公网 IP 的云服务器上，`frpc` 运行在内网机器上。内网机器主动连接云服务器，因此通常不需要给内网路由器配置入站端口转发。

这里使用 FRP 的 **TCP 代理**，HTTPS 由云服务器上的 Nginx 处理，没有使用 FRP 的 HTTP/HTTPS 虚拟主机代理。两种方案的配置不要混用。

### 环境与端口

| 项目 | 本文示例 |
| --- | --- |
| 业务服务 | NestJS，Docker Compose 部署 |
| 内网 Linux IP | `192.168.1.100` |
| 内网服务端口 | `8890` |
| 云服务器 | 阿里云轻量应用服务器，Ubuntu 24.04 |
| 云服务器公网 IP | `203.0.113.10` |
| FRP 版本 | `0.68.0`，客户端与服务端保持一致 |
| FRP 控制连接 | 云服务器 TCP `7000` |
| FRP 代理端口 | frps 容器内 TCP `8890` |
| 公网 HTTP 入口 | 云服务器 TCP `80`，映射到 frps 容器 `8890` |
| 公网 HTTPS 入口 | 云服务器 TCP `443`，由系统 Nginx 监听 |
| 域名 | `www.example.com`，主域名为 `example.com` |

**公网的 80、frps 容器内的 8890、内网服务的 8890 是不同位置的端口。** 它们通过 Docker 映射和 FRP 配置连接起来，并不要求数字相同。

## 二、准备服务器与运行环境

内网机器和云服务器都需要安装 Docker Engine 与 Docker Compose 插件，并确认当前用户可以执行 Docker 命令：

```bash
docker version
docker compose version
```

本文后续标注「内网机器」的命令在业务服务器上执行，标注「云服务器」的命令通过 SSH 登录云主机后执行。云服务器的系统配置命令按 root 用户编写；普通用户需要按权限添加 `sudo`。

云服务器安全组或轻量服务器防火墙中放行：

| 端口 | 用途 | 来源建议 |
| --- | --- | --- |
| TCP 22 | SSH 运维 | 自己的运维出口 IP |
| TCP 7000 | frpc 连接 frps | 内网机器的公网出口 IP；出口变化时相应调整 |
| TCP 80 | 当前 HTTP 入口 | 需要访问服务的来源 |
| TCP 443 | HTTPS 入口 | 需要访问服务的来源 |

本例的控制连接和代理都走 TCP，不需要额外开放 UDP 7000，也不需要在云服务器宿主机发布 8890。若服务器启用了 UFW 等系统防火墙，还要检查相应规则。

云服务器选择和域名实名、备案等手续需要事先准备好；使用中国内地云服务器提供网站服务时，按阿里云要求完成对应备案或接入手续。域名控制台的备案状态和 HTTPS 证书是两件事。

## 三、先把内网业务服务部署起来

### 1. 服务端独立构建

项目使用 npm workspaces，客户端与服务端分开维护：

```text
apps/app/                 Expo / React Native 客户端
apps/server/              NestJS 服务与管理后台静态资源
packages/content/data/    内容索引和词典
storage/admin/            后台凭据、审核状态等运行数据
storage/resources/media/  音频文件
docker-compose.yml        业务服务的部署入口
```

服务端 Dockerfile 位于 `apps/server/Dockerfile`，但 **构建 context 是仓库根目录**，因为构建会读取根目录的 lockfile、工作区声明和共享内容。

独立构建时，在仓库根目录执行：

```bash
docker build -f apps/server/Dockerfile -t selah-server:local .
```

实际 Dockerfile 采用多阶段构建：安装服务端依赖、编译 TypeScript、安装生产依赖，再组成运行镜像。服务端运行镜像不需要 Expo 工具链、Python 虚拟环境或开发机凭据。

### 2. 准备持久化数据

内网机器上假设代码已经同步到 `~/workspace/selah`：

```bash
cd ~/workspace/selah
mkdir -p storage/admin
```

部署前需要把真实数据同步到位，包括 `packages/content/data/`、`storage/resources/media/`，以及项目构建需要的审核元数据和时间轴目录。音频文件通过独立文件同步放到宿主机，不打入镜像。

已有部署需要保留 `storage/admin/` 和已经发布的词典，不能用开发环境的空目录或初始数据覆盖。内容和媒体同步时，先传媒体文件，再更新引用它们的内容索引。

业务 Compose 中关键配置如下，完整构建、安全选项和健康检查沿用仓库内配置：

```yaml
services:
  server:
    image: selah-server:local
    build:
      context: .
      dockerfile: apps/server/Dockerfile
    restart: unless-stopped
    user: "${SELAH_UID:-1000}:${SELAH_GID:-1000}"
    environment:
      NODE_ENV: production
      HOST: 0.0.0.0
      PORT: "8890"
      ADMIN_USERNAME: ${ADMIN_USERNAME:-admin}
      ADMIN_PASSWORD: ${ADMIN_PASSWORD:-}
    ports:
      - "${ADMIN_BIND_ADDRESS:-127.0.0.1}:${ADMIN_PUBLISHED_PORT:-8890}:8890"
    volumes:
      - ./storage/admin:/app/storage/admin
      - ./packages/content/data:/app/packages/content/data
      - ./storage/resources/media:/app/storage/resources/media:ro
```

后台状态与内容目录允许写入，音频只读挂载。词典发布采用原子替换，因此挂载整个内容目录，不单独挂载一个 JSON 文件。当前文件存储只运行一个业务实例。

### 3. 配置内网监听地址

首次部署时从根目录 `.env.example` 复制 `.env`；已有文件则直接编辑，保留原来的配置。

```dotenv
ADMIN_BIND_ADDRESS=192.168.1.100
ADMIN_PUBLISHED_PORT=8890
SELAH_UID=1000
SELAH_GID=1000
ADMIN_USERNAME=admin
ADMIN_PASSWORD=REPLACE_WITH_A_STRONG_INITIAL_PASSWORD
SELAH_IMAGE_TAG=local
```

UID/GID 用 `id -u`、`id -g` 查询，并与持久化目录所有者一致。初始化密码只在首次创建凭据时生效，已有凭据文件时继续使用原账号。

容器内 `HOST=0.0.0.0` 是让 NestJS 接收来自容器网络的请求；宿主机的 `ADMIN_BIND_ADDRESS` 则决定 Docker 把服务发布到哪块网卡，两者不是同一个配置。

这里发布到内网 IP，是为了让使用 host 网络的 frpc 访问 `192.168.1.100:8890`。如果改成只发布到 `127.0.0.1`，frpc 的 `localIP` 也必须相应调整。

### 4. 启动并验证

内网机器执行：

```bash
cd ~/workspace/selah
docker compose config --quiet
docker compose up -d --build
docker compose ps
docker compose logs --tail=100 server
curl --fail --max-time 15 http://192.168.1.100:8890/api/health
```

健康检查应包含：

```json
{"status":"ok","service":"selah-resource"}
```

实际响应可能还有其他字段。后台地址为 `http://192.168.1.100:8890/admin/`。

先让这一层正常，再配置 FRP，否则公网请求失败时很难区分是业务服务问题还是隧道问题。

## 四、在云服务器部署 frps

### 1. 创建配置文件

以下是新建独立 frps 的最小示例。实际环境已经有 frps 服务，因此是在原部署上增加端口映射；如果你也有其他穿透服务，不要用本节的最小配置覆盖原文件。

云服务器执行：

```bash
install -d -m 700 /srv/frp-server
cd /srv/frp-server
umask 077
nano frps.toml
```

`frps.toml`：

```toml
bindAddr = "0.0.0.0"
bindPort = 7000

auth.method = "token"
auth.token = "REPLACE_WITH_THE_SAME_RANDOM_TOKEN"
```

使用足够长的随机 Token，并在 frpc 中配置同一值。配置文件权限设为 600，不提交 Git，也不要把真实 Token 放到文章或日志中。

```bash
chmod 600 frps.toml
```

新建专用 frps 时，可以按需配置 `allowPorts` 限制客户端允许申请的远端端口；共享 frps 则要把已有代理的端口一并纳入，避免影响其他服务。[FRP 服务端配置说明](https://gofrp.org/en/docs/reference/server-configures/)

### 2. 配置 Docker Compose

在同目录创建 `compose.yml`：

```yaml
services:
  frps:
    image: fatedier/frps:v0.68.0
    container_name: frps
    restart: unless-stopped
    command: ["-c", "/etc/frp/frps.toml"]
    ports:
      - "7000:7000/tcp"
      - "80:8890/tcp"
    volumes:
      - ./frps.toml:/etc/frp/frps.toml:ro
```

这里的 `80:8890` 表示：云服务器收到的 HTTP 80 流量，进入 frps 容器的 8890 端口。容器里的 8890 监听由下一节的 frpc 代理申请建立。

```bash
docker compose config --quiet
docker compose run --rm frps verify -c /etc/frp/frps.toml
docker compose up -d
docker compose ps
docker compose logs --tail=50 frps
```

### 3. 已有 frps 时怎么改

本次实际环境已经有其他代理，因此采用 `docker-compose.override.yml` 补充映射：

```yaml
services:
  frps:
    ports:
      - "80:8890/tcp"
```

先备份现有 Compose 文件，然后检查合并结果，再重建 frps 容器。确认原有控制端口和其他代理端口仍然保留；容器重建期间，已有隧道会短暂重连。

```bash
docker compose config --quiet
docker compose up -d frps
docker compose ps
```

如果原主文件名是 `docker-compose.yml`，Compose 会读取对应的默认 override；其他文件名或自定义启动方式要明确检查加载规则，必要时通过 `-f` 指定两个文件。

## 五、在内网机器部署 frpc

### 1. 创建独立目录

内网机器执行：

```bash
mkdir -p ~/docker/selah-frp
chmod 700 ~/docker/selah-frp
cd ~/docker/selah-frp
umask 077
nano frpc.toml
```

`frpc.toml`：

```toml
serverAddr = "203.0.113.10"
serverPort = 7000

auth.method = "token"
auth.token = "REPLACE_WITH_THE_SAME_RANDOM_TOKEN"

transport.tls.enable = true

[[proxies]]
name = "selah-audio"
type = "tcp"
localIP = "192.168.1.100"
localPort = 8890
remotePort = 8890
transport.useEncryption = true
```

几个参数分别决定：连接哪台云服务器、使用哪个控制端口、如何认证，以及把 frps 端的代理端口转发到内网哪个服务。

`transport.tls.enable` 用于 frpc 与 frps 的 TLS 连接，`transport.useEncryption` 为此代理启用加密。浏览器使用的 HTTPS 则由后面的 Nginx 和域名证书提供；启用 FRP 加密不会自动给浏览器提供可验证的 HTTPS 证书。[FRP TLS 配置说明](https://gofrp.org/en/docs/features/common/network/network-tls/)

### 2. 启动客户端

同目录创建 `compose.yml`：

```yaml
services:
  frpc:
    image: fatedier/frpc:v0.68.0
    container_name: selah-frpc
    restart: unless-stopped
    network_mode: host
    command: ["-c", "/etc/frp/frpc.toml"]
    volumes:
      - ./frpc.toml:/etc/frp/frpc.toml:ro
```

这里使用 Linux Docker Engine 的 host 网络，使 frpc 直接访问宿主机可达的内网服务，不需要再发布 frpc 的容器端口。

```bash
chmod 600 frpc.toml
docker compose config --quiet
docker compose run --rm frpc verify -c /etc/frp/frpc.toml
docker compose up -d
docker compose logs --tail=50 frpc
```

日志中应能看到连接服务端、登录成功和 `selah-audio` 代理启动成功的信息。若提示 Token 不匹配、远端端口被占用或代理名冲突，先处理对应问题。

### 3. 从外网验证穿透

在自己的电脑或其他外网环境执行：

```bash
curl --fail --max-time 15 http://203.0.113.10/api/health
```

此时完整路径是：

```text
公网 IP:80 → frps 容器:8890 → frpc → 内网 IP:8890
```

健康检查正常后，才能确认穿透已经打通。浏览器后台入口为 `http://203.0.113.10/admin/`。

## 六、把域名解析到云服务器

进入阿里云域名解析页面，添加 A 记录：

| 主机记录 | 类型 | 记录值 | 对应访问域名 |
| --- | --- | --- | --- |
| `www` | A | `203.0.113.10` | `www.example.com` |
| `@` | A | `203.0.113.10` | `example.com` |

如果通过轻量应用服务器的「域名」页面配置，可点击「添加域名解析」，按页面要求选择目标实例。记录值只填 IP，不填 `http://`、端口或 `/api/health` 等路径。

`www` 和 `@` 是两条独立记录。只添加 `www`，并不代表主域名也能访问。其他子域名也各自需要对应解析。

检查解析结果：

```bash
dig +short www.example.com A
dig +short example.com A
```

两条命令都应返回你的云服务器公网 IP。若尚未返回，检查记录是否已保存、DNS 托管商与域名 NS 是否匹配，并考虑 DNS 缓存和 TTL 的影响。

接着测试 HTTP：

```bash
curl --fail --max-time 15 http://www.example.com/api/health
```

DNS 的作用是让域名找到服务器 IP。它不会安装网站、创建应用首页或配置 HTTPS。

## 七、申请阿里云免费 HTTPS 证书

### 1. 找到免费版入口

阿里云控制台搜索「数字证书管理服务」，进入：

```text
证书管理
  → SSL 证书管理 V2.0
  → 个人测试证书（原免费证书）
```

截至本文记录时，免费版有效期为 **90 天**，每个实名认证主体每自然年最多领取 **20 张**；免费版与付费 Pro 版需要区分，按免费版入口提交时确认订单金额为 0。[阿里云免费证书规则](https://help.aliyun.com/zh/ssl-certificate/purchase-an-individual-test-certificate)

额度显示 `0/20` 表示本年度已领取 0 张，总额度 20 张；证书列表为空不代表没有免费额度。

### 2. 「领取」以后还要「申请」

领取后会出现一个状态为「待申请」的证书实例，点击右侧「申请证书」：

| 字段 | 本例选择 |
| --- | --- |
| 绑定域名 | `www.example.com` |
| 域名验证方式 | 自动 DNS 验证，若可选 |
| 联系人 | 真实、可联系的信息 |
| 密钥算法 | `RSA_2048` |
| CSR 生成方式 | 系统生成 |

CSR 是证书签名请求。选择「系统生成」后，由阿里云生成 CSR 和配套私钥，签发后可下载用于 Nginx 部署，不需要自己手动准备 CSR。

填写的是完整域名，不带协议和路径；提交前核对好，当前规格申请后不支持直接修改绑定域名。[官方申请步骤](https://help.aliyun.com/zh/ssl-certificate/application-for-individual-test-certificate)

### 3. 完成 DNS 验证

域名由当前账号的阿里云 DNS 托管时，可以选择自动 DNS 验证。系统会添加用于证明域名所有权的解析记录。

若使用手动验证，需要到域名实际托管的 DNS 控制台，按申请页面给出的记录类型、主机记录、记录值逐项填写。这一步通常是 TXT 等验证记录，与前面让网站指向服务器的 A 记录用途不同，不要互相替换。

页面显示绿色「域名验证成功」后，保留验证记录并等待 CA 审核。域名验证成功不等于证书已经签发，实际等待时间以 CA 审核为准。

### 4. 下载 Nginx 格式证书

状态变成「已签发」后，点击「下载」，选择 Nginx 格式。解压后通常有：

```text
www.example.com.pem    证书及证书链
www.example.com.key    私钥
```

有些品牌会为 `www` 证书附带主域名，但不能仅凭「单域名」或申请页面的提示猜测覆盖范围，最终要检查证书 SAN 字段。

```bash
openssl x509 -in www.example.com.pem -noout -subject -issuer -dates -ext subjectAltName
```

本次实际下载的证书同时包含 `www` 和主域名。若你的证书不包含主域名，需要为它另行申请，或只对证书覆盖的域名提供 HTTPS。

## 八、在 Ubuntu 上安装 Nginx 和证书

### 1. 为什么没有直接点「设置 HTTPS」

阿里云轻量应用服务器控制台的一键 HTTPS 功能有镜像限制。按当前官方文档，支持一键设置的是 LNMP 7.4 应用镜像；其他镜像需要手动部署证书。

这次使用 Ubuntu 系统镜像，因此采用系统 Nginx。[轻量服务器一键 HTTPS 限制](https://help.aliyun.com/zh/simple-application-server/user-guide/quickly-configure-https/)

### 2. 安装系统 Nginx

云服务器执行：

```bash
apt-get update
apt-get install -y --no-install-recommends nginx
nginx -v
```

本次最初尝试拉取 Nginx Docker 镜像，但镜像下载停滞，于是改用服务器已配置的阿里云 Ubuntu 软件源安装系统包。最终运行的是 **系统 Nginx + systemd**，FRP 仍由 Docker Compose 管理。

默认 Nginx 配置通常监听 80，而本例的 80 已经由 frps 的 Docker 端口映射占用。因此安装后可能不会自动启动，或者默认站点启动时出现端口冲突。下面将禁用默认站点，仅让 Nginx 监听 443。

### 3. 上传证书

先在云服务器创建受限目录：

```bash
install -d -m 700 /etc/nginx/ssl/selah
```

在自己的电脑上解压证书，并上传两个文件，以下路径按实际下载位置替换：

```bash
scp ~/Desktop/certificate/www.example.com.pem root@203.0.113.10:/etc/nginx/ssl/selah/
scp ~/Desktop/certificate/www.example.com.key root@203.0.113.10:/etc/nginx/ssl/selah/
```

回到云服务器设置权限：

```bash
chmod 600 /etc/nginx/ssl/selah/www.example.com.pem
chmod 600 /etc/nginx/ssl/selah/www.example.com.key
```

该目录和私钥由 root 持有，Nginx 主进程启动时可以读取。不要把私钥放到 Git 仓库、静态资源目录或容器构建上下文中。

### 4. 检查证书与私钥是否匹配

分别计算证书公钥和私钥对应公钥的 SHA-256：

```bash
openssl x509 -in /etc/nginx/ssl/selah/www.example.com.pem -pubkey -noout | openssl pkey -pubin -outform DER | openssl dgst -sha256
openssl pkey -in /etc/nginx/ssl/selah/www.example.com.key -pubout -outform DER | openssl dgst -sha256
```

两次摘要应完全一致。再检查证书域名和到期时间：

```bash
openssl x509 -in /etc/nginx/ssl/selah/www.example.com.pem -noout -dates -ext subjectAltName
```

证书文件名可以修改，但证书真正覆盖的域名由 SAN 决定，改文件名不能改变它。

## 九、配置 HTTPS 反向代理

### 1. 创建 Nginx 站点

云服务器创建 `/etc/nginx/sites-available/selah-https`：

```nginx
server {
    listen 443 ssl;
    server_name www.example.com example.com;

    ssl_certificate /etc/nginx/ssl/selah/www.example.com.pem;
    ssl_certificate_key /etc/nginx/ssl/selah/www.example.com.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_session_cache shared:SelahTLS:10m;
    ssl_session_timeout 1d;
    ssl_session_tickets off;
    server_tokens off;

    location / {
        proxy_pass http://127.0.0.1:80;
        proxy_http_version 1.1;

        proxy_set_header Host $http_host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header Connection "";

        proxy_cookie_flags selah_admin secure;
        proxy_buffering off;
        proxy_read_timeout 300s;
    }
}
```

若证书不覆盖主域名，按实际情况调整 `server_name` 和主域名的证书配置。

这份配置有几个与业务相关的细节：

- `proxy_pass` 转发到云服务器现有的 HTTP 80 入口，保留已经打通的 FRP 链路。
- 传递原始 `Host`，让后台同源校验能够与浏览器的 Origin 对上。
- 普通请求头默认会被代理转发，Cookie、Range、If-Range、If-None-Match 不需要清空或重写。
- `proxy_buffering off` 用于本次音频流场景，让响应数据及时转发给客户端。
- `proxy_cookie_flags selah_admin secure` 给这个项目的后台会话 Cookie 增加 Secure；其他项目需要替换成自己的 Cookie 名。

代理设置 `X-Forwarded-Proto` 并不意味着应用自动信任它。本次没有修改 NestJS 的代理信任设置，而是在 HTTPS 代理层补上 Cookie 的 Secure 标记。若业务需要真实客户端 IP、协议识别或基于客户端 IP 限流，应另行设计并限制可信代理范围。

### 2. 禁用默认站点并启用新站点

以下命令假设这是一台没有其他 Nginx 站点的新主机。已有站点时，先检查监听和域名配置，避免覆盖其他网站。

```bash
install -d -m 700 /root/nginx-before-selah
cp -a /etc/nginx/sites-available/default /root/nginx-before-selah/
```

确认 `/etc/nginx/sites-enabled/default` 是安装包创建的默认站点链接后，移除这个链接；保留 `sites-available/default` 原文件作为恢复依据：

```bash
unlink /etc/nginx/sites-enabled/default
ln -s /etc/nginx/sites-available/selah-https /etc/nginx/sites-enabled/selah-https
nginx -t
```

不要只是把文件改名为 `default.disabled` 后继续留在 `sites-enabled/` 中，默认的 `include /etc/nginx/sites-enabled/*` 仍可能读取它。

配置校验成功后再启动服务：

```bash
systemctl enable --now nginx
systemctl is-active nginx
systemctl is-enabled nginx
ss -ltnp
```

确认 Nginx 正在监听 443，原来的 Docker 80 入口还在，云防火墙也允许访问 TCP 443。

### 3. 先在服务器本机验证

```bash
curl --fail --max-time 15 --resolve www.example.com:443:127.0.0.1 https://www.example.com/api/health
```

`--resolve` 让请求直连本机，同时仍然使用正确的域名进行 TLS SNI、Host 和证书校验。它适合排除外部 DNS 与云防火墙的影响。

验证时不要添加 `-k`，否则可能掩盖证书不受信任、域名不匹配等问题。

## 十、从外网做完整验证

### 1. 健康检查与后台

在自己的电脑执行：

```bash
curl --fail --max-time 15 https://www.example.com/api/health
curl --fail --max-time 15 -I https://www.example.com/admin/
curl --max-time 15 -i https://www.example.com/api/admin/session
```

预期健康检查和后台返回 200，未携带登录会话时，后台会话接口返回 401。这说明后台页面可达，同时鉴权仍然存在。

本次验证没有为了测试而关闭鉴权，也没有在公开文章中记录管理员账号密码。

### 2. 音频 HEAD、Range 和条件请求

仅健康检查正常，还不能证明音频拖动和分段请求正常。选一个确认存在的音频资源，替换下面的 `YOUR_AUDIO_SHA256`：

```bash
curl --fail --max-time 15 -I https://www.example.com/api/audio/resources/YOUR_AUDIO_SHA256.mp3
curl --fail --max-time 15 -D - -H 'Range: bytes=0-31' https://www.example.com/api/audio/resources/YOUR_AUDIO_SHA256.mp3 -o /tmp/selah-audio-range.bin
wc -c /tmp/selah-audio-range.bin
```

预期 HEAD 返回音频类型、长度、ETag 和 `Accept-Ranges: bytes`；Range 请求返回 `206 Partial Content`、对应的 `Content-Range`，文件实际长度为 32 字节。

还可以复制 HEAD 返回的 ETag，进一步检查缓存条件请求：

```bash
curl --max-time 15 -I -H 'If-None-Match: "REPLACE_WITH_THE_EXACT_ETAG"' https://www.example.com/api/audio/resources/YOUR_AUDIO_SHA256.mp3
```

资源未变化时应返回 304。这里的 ETag 必须使用真实响应值，并保留它原有的引号。

### 3. 保留原 HTTP 地址的兼容性

本次仍有 App 使用旧的 IP 地址，所以没有把所有 HTTP 请求强制跳转到 HTTPS：

```bash
curl --fail --max-time 15 http://203.0.113.10/api/health
```

当前 80 端口由 frps 映射占用，不能再让另一个 Nginx server 同时绑定同一地址的 80。后续如果统一 HTTPS，可调整端口布局，让 Nginx 接管 80 并跳转，同时把 FRP 上游改到仅本机可达的其他端口；这不属于本次实际改动。

### 4. 验证服务重启后的配置

本次部署执行了 Nginx 配置校验、服务重启，并再次检查健康接口，同时确认原 frps 容器仍在运行。日常可用：

```bash
nginx -t
systemctl status nginx --no-pager
docker ps
```

需要修改运行配置时，在维护窗口重启或重建对应服务，再复测接口。`unless-stopped` 与 systemd 的开机启用只是恢复机制，不能替代实际的启动验证。

本次实际验证结果为：

| 检查 | 结果 |
| --- | --- |
| 公网 TLS 证书与域名校验 | 通过 |
| HTTPS 健康检查 | 200，状态正常 |
| HTTPS 管理后台 | 200，返回 HTML |
| 未登录访问后台会话接口 | 401 |
| 音频 HEAD | 200，返回长度、ETag、Range 能力 |
| 音频范围请求 | 206，返回所请求的 32 字节 |
| 原 HTTP IP 健康检查 | 200 |
| Nginx 配置校验、重启及开机启用状态 | 正常 |

条件请求命令是额外建议的复查项，不属于上述本次已执行结果；也没有把完整登录流程或整机重启宣称为已验证。

## 十一、这次遇到的问题与定位方法

| 现象 | 判断方向 | 处理方式 |
| --- | --- | --- |
| `www` 可解析，主域名没有结果 | 缺少 `@` 记录 | 单独添加主域名 A 记录，等待生效 |
| 首页返回 `Cannot GET /` | 网络和应用已经可达，但没有根路由 | 使用真实入口 `/admin/` 或 `/api/health` |
| HTTP 正常，HTTPS 连接失败 | 443 没监听、被拦截，或证书未正确配置 | 检查 `ss`、云防火墙、`nginx -t` 和服务日志 |
| 免费证书列表为空 | 尚未领取或尚未申请 | 区分免费额度、待申请和已签发状态 |
| 域名验证成功，但 HTTPS 仍不可用 | 证书签发和安装是后续步骤 | 等待已签发，下载后部署到 Web 服务 |
| 轻量服务器不能一键设置 HTTPS | 系统镜像不符合一键功能要求 | Ubuntu 上手动安装 Nginx 证书 |
| Nginx 启动提示 80 被占用 | frps 的 Docker 映射已经占用 80 | 禁用默认 Nginx 80 站点，只监听 443 |
| frpc 连接成功但业务请求失败 | 代理目标地址不通或服务没起来 | 从内网检查 `localIP:localPort`，再逐层向外验证 |
| Nginx 返回 502 | Nginx 连接上游失败或隧道异常 | 先测试云主机 `127.0.0.1:80`，再查 frps/frpc |
| Docker 拉取镜像停滞 | 镜像源或网络连接问题 | 本次 Nginx 改用已配置的 Ubuntu 软件源安装 |

对于「浏览器打不开」，不要只看地址栏的域名，也要确认完整协议。浏览器可能尝试 HTTPS，而服务器当时只配置了 HTTP。用显式的 `curl http://...` 和 `curl https://...` 可以分开检查。

排查顺序可以固定为：**内网健康检查 → frpc 状态 → 云服务器 HTTP → DNS → Nginx 本机 HTTPS → 公网 HTTPS**。在哪一层开始失败，就先检查那一层。

## 十二、证书到期、更新和日常维护

### 1. 免费证书需要重新申请并替换

本次采用下载证书后手动安装，没有配置自动续签。90 天免费证书到期后，需要使用剩余额度重新申请、完成验证并部署新证书，不能只在控制台领取后就认为服务器会自动更新。

查看到期时间：

```bash
openssl x509 -in /etc/nginx/ssl/selah/www.example.com.pem -noout -enddate
```

OpenSSL 通常输出 GMT 时间，换算北京时间时加 8 小时。最好提前一到两周处理，留出审核和部署时间。

更新时先把新文件上传到临时受限目录，检查 SAN、有效期和公私钥匹配，再备份当前证书。两个文件替换完成以后执行：

```bash
nginx -t && systemctl reload nginx
curl --fail --max-time 15 https://www.example.com/api/health
```

磁盘上的新证书检查通过，不代表线上已经加载成功；还要从公网查看实际提供的证书和有效期。检查失败时恢复备份，重新校验后 reload。

### 2. 常用维护命令

云服务器：

```bash
systemctl status nginx --no-pager
journalctl -u nginx -n 50 --no-pager
tail -n 50 /var/log/nginx/error.log
cd /srv/frp-server
docker compose logs --tail=50 frps
```

内网机器：

```bash
cd ~/docker/selah-frp
docker compose logs --tail=50 frpc
cd ~/workspace/selah
docker compose ps
docker compose logs --tail=100 server
```

更新业务服务时，先备份后台状态与可写内容目录，再在项目根目录执行 `docker compose up -d --build`，然后复测公网健康检查、后台和音频请求。重建容器不应删除宿主机的持久化数据。

如果只撤销新增的 HTTPS 入口，可以停止并禁用 Nginx：

```bash
systemctl disable --now nginx
```

在本文的端口布局下，这不会关闭原来的 HTTP FRP 入口。若要撤销公网穿透，则单独停止内网 frpc，并按需移除云服务器新增的 80 映射，保留原有共享 frps 配置。

### 3. 手机 App 切换到域名

服务上线 HTTPS 后，客户端可以将资源服务地址改为：

```dotenv
EXPO_PUBLIC_BIBLE_SERVER_URL=https://www.example.com
```

本项目的 release 地址涉及原生网络策略，应使用同一环境变量重新预生成、构建并安装 App。仅修改服务器域名或本地 `.env`，不会改变已经安装的旧 APK；本次服务端证书安装也没有自动更新 App。

## 参考资料

- [Docker Engine 安装文档](https://docs.docker.com/engine/install/)
- [FRP 配置文件与 verify 命令](https://gofrp.org/en/docs/features/common/configure/)
- [FRP TCP/UDP 代理](https://gofrp.org/en/docs/features/tcp-udp/)
- [阿里云个人测试证书规则](https://help.aliyun.com/zh/ssl-certificate/purchase-an-individual-test-certificate)
- [阿里云个人测试证书申请步骤](https://help.aliyun.com/zh/ssl-certificate/application-for-individual-test-certificate)
- [阿里云轻量服务器一键 HTTPS 的使用限制](https://help.aliyun.com/zh/simple-application-server/user-guide/quickly-configure-https/)
- [Nginx HTTPS 配置](https://nginx.org/en/docs/http/configuring_https_servers.html)
- [Nginx HTTP 代理模块](https://nginx.org/en/docs/http/ngx_http_proxy_module.html)
