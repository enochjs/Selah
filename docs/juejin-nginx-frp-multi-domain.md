# 一台云服务器，多个内网网站：用 Nginx + FRP 按域名分流

我有两个服务运行在内网：一个发布管理平台，一个资源服务。它们通过 FRP 暴露到公网后，我希望用两个域名分别访问，同时共用一台云服务器、一个公网 IP 和一个 frps。

最终实现的效果是：

```text
https://console.example.com → 内网发布平台
https://www.example.com     → 内网资源服务
```

这件事最容易让人困惑的地方是：两个域名都解析到同一个 IP，浏览器也都访问 `443` 端口，服务器怎么知道该把请求交给哪个客户端？

答案分成两层：**Nginx 按域名选择上游端口，frps 按代理端口选择对应的 frpc 隧道。**

下面结合实际部署，拆开说明这条链路，再给出配置示例和排错顺序。

> 本文基于 Ubuntu 24.04、Docker Engine、Docker Compose 插件和 FRP 0.68.0 的部署实践整理。为方便公开发布，域名、公网 IP、内网 IP、服务名称和目录均已替换为示例；`example.com` 和 `203.0.113.10` 不能作为真实部署地址使用。配置中的 Token 和证书路径也需要自行替换。

## 一、先明确各个组件负责什么

整个方案涉及 DNS、Nginx 和 FRP，但它们解决的是不同问题。

| 组件            | 负责的事情                                                |
| --------------- | --------------------------------------------------------- |
| DNS             | 将域名解析为云服务器公网 IP                               |
| Nginx           | 接收 HTTP / HTTPS 请求、处理证书、按域名选择业务上游      |
| frps            | 运行在云服务器，接收客户端注册，将代理端口关联到对应隧道  |
| frpc            | 运行在内网，主动连接 frps，再把连接转给能够访问的业务服务 |
| Docker 端口映射 | 将云服务器宿主机上的端口转入 frps 容器                    |

在这个方案里，**域名分流发生在 Nginx，内网穿透由 FRP 完成**。

### 完整请求链路

```text
浏览器
  │
  ├─ console.example.com ─┐
  └─ www.example.com ────┤
                        │ DNS 都返回 203.0.113.10
                        ▼
              云服务器 Nginx :80 / :443
                        │
             根据域名匹配 server_name
                        │
             ┌──────────┴──────────┐
             ▼                     ▼
    127.0.0.1:18880       127.0.0.1:18890
             │                     │
             │  Docker 端口映射    │
             ▼                     ▼
       frps 容器 :8880        frps 容器 :8890
             │                     │
             └──── 同一个 frps ────┘
             │                     │
             │  对应的 FRP 隧道    │
             ▼                     ▼
       frpc-console          frpc-resource
             │                     │
             ▼                     ▼
    192.168.1.100:80     192.168.1.100:8890
         发布平台                资源服务
```

上图展示的是业务请求方向。实际建立穿透连接时，是两个 frpc **主动连接云服务器的 `7000/TCP`**，不是云服务器直接连接内网 IP。响应通过对应链路返回浏览器。

我的两个客户端运行在同一台内网机器上，拆成两个容器独立维护。它们也可以位于不同机器、不同网络，只要各自能连接云端 frps，并访问自己的业务目标。

## 二、为什么同一个 IP 能对应多个网站

两个域名配置相同的 A 记录：

| 主机记录  | 完整域名              | 记录值         |
| --------- | --------------------- | -------------- |
| `console` | `console.example.com` | `203.0.113.10` |
| `www`     | `www.example.com`     | `203.0.113.10` |

DNS 只负责找到云服务器，不会选择后面的客户端，也不会在 A 记录中配置业务端口。

浏览器连接服务器后，请求里仍然保留域名。例如 HTTP 请求包含：

```http
GET / HTTP/1.1
Host: console.example.com
```

Nginx 根据请求域名匹配 `server_name`，从而选择不同的站点配置。

HTTPS 还涉及 **SNI**：浏览器在 TLS 握手时提供目标域名，Nginx 据此选择证书；解密 HTTP 请求后，再按站点规则转发。

所以，两个域名可以共用公网 IP 和 `443` 端口。这里是一个 Nginx 管理多个虚拟主机，不是启动两个独立服务去争抢同一个监听端口。

## 三、先把端口关系理清楚

为了看清宿主机、容器和内网业务的区别，示例刻意使用不同的端口：

| 位置           | 端口              | 用途                        |
| -------------- | ----------------- | --------------------------- |
| 云服务器公网   | `80` / `443`      | Nginx 的网站入口            |
| 云服务器公网   | `7000/TCP`        | frpc 连接 frps 的控制入口   |
| 云服务器宿主机 | `127.0.0.1:18880` | 发布平台的本地代理入口      |
| frps 容器内    | `8880`            | 发布平台代理的 `remotePort` |
| 云服务器宿主机 | `127.0.0.1:18890` | 资源服务的本地代理入口      |
| frps 容器内    | `8890`            | 资源服务代理的 `remotePort` |
| 内网业务机器   | `80`              | 发布平台实际监听端口        |
| 内网业务机器   | `8890`            | 资源服务实际监听端口        |

以发布平台为例：

```text
云端 Nginx → 宿主机 18880 → frps 容器 8880 → frpc → 内网服务 80
```

**这几个端口属于不同位置，不需要使用相同数字。**

资源服务的 frps 代理端口和内网业务端口恰好都叫 `8890`，只是配置上的选择，不代表它们是同一个监听位置。

## 四、配置云端 frps

以下示例假设云端 Nginx 直接运行在宿主机，frps 运行在 Docker 容器中。业务服务已经启动，本文不展开 Docker、Nginx 的安装过程。

在云服务器准备目录：

```bash
mkdir -p /opt/frp-server
cd /opt/frp-server
```

创建 `frps.toml`：

```toml
bindAddr = "0.0.0.0"
bindPort = 7000

auth.method = "token"
auth.token = "REPLACE_WITH_YOUR_PRIVATE_TOKEN"

log.level = "info"
log.maxDays = 7
```

服务端和两个客户端使用同一个足够长的随机 Token。这里的字符串只是占位符，不要直接使用，更不要将实际 Token 提交到公开仓库。

创建 `compose.yml`：

```yaml
services:
  frps:
    image: fatedier/frps:v0.68.0
    container_name: frps
    restart: unless-stopped
    command: ["-c", "/etc/frp/frps.toml"]
    ports:
      - "7000:7000/tcp"
      - "127.0.0.1:18880:8880/tcp"
      - "127.0.0.1:18890:8890/tcp"
    volumes:
      - ./frps.toml:/etc/frp/frps.toml:ro
```

这里使用普通 TCP 连接，不需要为本例额外开放 UDP 7000。

### 为什么业务端口只绑定 127.0.0.1

这条映射：

```yaml
- "127.0.0.1:18880:8880/tcp"
```

表示把宿主机回环地址的 `18880` 映射到 frps 容器的 `8880`。

因为 Nginx 就运行在云服务器宿主机上，它可以直接访问这个回环入口。公网用户统一访问 Nginx，不需要直接访问 FRP 的业务端口。

因此，云防火墙不需要为这两个网站开放 `18880`、`18890`、`8880` 或 `8890`。本例通常需要允许：

| 端口         | 用途           | 来源建议                          |
| ------------ | -------------- | --------------------------------- |
| TCP 80 / 443 | 网站访问       | 按站点访问范围配置                |
| TCP 7000     | frpc 连接 frps | 条件允许时限制到客户端公网出口 IP |
| TCP 22       | SSH 运维       | 运维来源 IP                       |

同时检查云防火墙和系统防火墙。

校验并启动：

```bash
chmod 600 frps.toml
docker compose config --quiet
docker compose run --rm frps verify -c /etc/frp/frps.toml
docker compose up -d
```

此时 frps 已启动，但业务代理端口仍需等待对应 frpc 成功注册。

## 五、配置两个内网客户端

在内网 Linux 机器准备目录：

```bash
mkdir -p /opt/frp-clients
cd /opt/frp-clients
```

### 发布平台客户端

创建 `console.toml`：

```toml
serverAddr = "203.0.113.10"
serverPort = 7000
auth.method = "token"
auth.token = "REPLACE_WITH_YOUR_PRIVATE_TOKEN"
transport.tls.enable = true

[[proxies]]
name = "console-web"
type = "tcp"
localIP = "192.168.1.100"
localPort = 80
remotePort = 8880
transport.useEncryption = true
```

### 资源服务客户端

创建 `resource.toml`：

```toml
serverAddr = "203.0.113.10"
serverPort = 7000
auth.method = "token"
auth.token = "REPLACE_WITH_YOUR_PRIVATE_TOKEN"
transport.tls.enable = true

[[proxies]]
name = "resource-web"
type = "tcp"
localIP = "192.168.1.100"
localPort = 8890
remotePort = 8890
transport.useEncryption = true
```

两份配置都连接同一个 `serverAddr:serverPort`，认证信息也一致；区别在于代理名称、`remotePort` 和内网业务目标。

尤其注意：**因为 frps 运行在容器中，`remotePort = 8880` 指容器内的 8880，不是宿主机的 18880。**

创建客户端 `compose.yml`：

```yaml
services:
  console:
    image: fatedier/frpc:v0.68.0
    container_name: frpc-console
    restart: unless-stopped
    network_mode: host
    command: ["-c", "/etc/frp/frpc.toml"]
    volumes:
      - ./console.toml:/etc/frp/frpc.toml:ro

  resource:
    image: fatedier/frpc:v0.68.0
    container_name: frpc-resource
    restart: unless-stopped
    network_mode: host
    command: ["-c", "/etc/frp/frpc.toml"]
    volumes:
      - ./resource.toml:/etc/frp/frpc.toml:ro
```

这里使用 Linux Docker Engine 的 host 网络，让客户端直接访问宿主机能访问的内网业务地址。客户端不需要发布端口，它们会主动连接云服务器。

校验并启动：

```bash
chmod 600 console.toml resource.toml
docker compose config --quiet
docker compose run --rm console verify -c /etc/frp/frpc.toml
docker compose run --rm resource verify -c /etc/frp/frpc.toml
docker compose up -d
docker logs --tail 30 frpc-console
docker logs --tail 30 frpc-resource
```

日志中出现 `login to server success` 和 `start proxy success`，说明连接和代理注册成功。

此时在云服务器执行：

```bash
curl -I http://127.0.0.1:18880/
curl -I http://127.0.0.1:18890/
```

如果能得到各自业务的正常响应，就说明 Docker 映射、FRP 隧道和内网服务已经连通。先把这一步做通，再排查域名和证书。

## 六、让 Nginx 按域名分流

先为两个域名准备有效的 HTTPS 证书和私钥。下面假设证书已经部署到对应目录；证书申请过程不在本文展开。

在 Ubuntu 的 `/etc/nginx/sites-available/frp-sites` 中添加：

```nginx
# 本文件由 nginx.conf 的 http 上下文包含。
map $http_upgrade $frp_connection_upgrade {
    default upgrade;
    "" close;
}

server {
    listen 80;
    listen 443 ssl;
    server_name console.example.com;

    ssl_certificate /etc/nginx/ssl/console/fullchain.pem;
    ssl_certificate_key /etc/nginx/ssl/console/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;

    location / {
        proxy_pass http://127.0.0.1:18880;
        proxy_http_version 1.1;
        proxy_set_header Host $http_host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $frp_connection_upgrade;
        proxy_read_timeout 300s;
    }
}

server {
    listen 80;
    listen 443 ssl;
    server_name www.example.com;

    ssl_certificate /etc/nginx/ssl/resource/fullchain.pem;
    ssl_certificate_key /etc/nginx/ssl/resource/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;

    location / {
        proxy_pass http://127.0.0.1:18890;
        proxy_http_version 1.1;
        proxy_set_header Host $http_host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Connection "";
        proxy_buffering off;
        proxy_read_timeout 300s;
    }
}
```

这份示例让 HTTP 和 HTTPS 都进入相同业务，没有配置强制 HTTPS 跳转。实际业务可以按需要增加跳转、上传大小限制、安全 Cookie 和其他代理策略。

平台如果有 WebSocket，除了这里的 Upgrade 请求头，后端自身也需要支持 WebSocket。资源服务使用 `proxy_buffering off`，避免在代理层额外缓冲流式响应；音频拖动还要由业务服务正确支持 Range 请求。

首次启用这个站点文件时，建立链接，然后检查并重载：

```bash
sudo ln -s /etc/nginx/sites-available/frp-sites \
  /etc/nginx/sites-enabled/frp-sites
sudo nginx -t
# 仅在上一步检查通过后执行：
sudo systemctl reload nginx
```

已有站点链接时不要重复创建。若原配置中存在相同 `server_name`，应先整理对应站点，避免匹配结果与预期不一致。

此时访问不同域名，Nginx 就会选择不同的本地上游：

```text
console.example.com → 127.0.0.1:18880 → frps:8880 → console-web
www.example.com     → 127.0.0.1:18890 → frps:8890 → resource-web
```

这正是整个方案的分流关系。

## 七、从单服务入口迁移时，最容易踩的坑

我原来的 HTTP 入口直接使用 Docker 映射：

```yaml
ports:
  - "80:8890/tcp"
```

这表示公网 `80` 端口被 Docker 占用，流量直接进入 frps 的资源服务代理。

扩展到多域名后，如果让 Nginx 再监听 `80`，就会发生端口冲突。需要先重新安排入口：

```text
原来：公网 80 → Docker → frps:8890

调整后：公网 80 / 443 → Nginx
                         ├─ 127.0.0.1:18880 → frps:8880
                         └─ 127.0.0.1:18890 → frps:8890
```

迁移时，我把 frps 的业务映射改成仅回环可访问的两个端口，再让 Nginx 接管公网入口。

这里还有一个隐含问题：**如果 Nginx 仍然写着 `proxy_pass http://127.0.0.1:80`，接管 80 后就可能把请求转回自己，形成代理循环。** 调整端口时，要同步更新原站点的上游。

修改前应备份现有配置，保留原有 FRP 控制端口和其他代理。重建共享 frps 容器会使已有客户端短暂重连，不能只验证新增网站，还要回查旧隧道。

## 八、按链路从内向外排错

我更推荐逐层缩小范围，而不是一上来同时修改 DNS、Nginx 和 FRP。

### 1. 先检查内网业务

在客户端机器执行：

```bash
curl -I http://192.168.1.100:80/
curl -I http://192.168.1.100:8890/
```

这一步失败，先处理业务进程、监听地址和本机网络。

### 2. 再检查客户端与隧道

在内网机器查看 frpc 日志，在云服务器直接访问回环上游：

```bash
# 内网机器
docker logs --tail 30 frpc-console
docker logs --tail 30 frpc-resource

# 云服务器
curl -I http://127.0.0.1:18880/
curl -I http://127.0.0.1:18890/
```

客户端已经登录但代理启动失败时，检查代理重名、远端端口占用和 frps 的端口限制。

### 3. 检查 Nginx 的域名匹配

在云服务器执行：

```bash
curl -I -H 'Host: console.example.com' http://127.0.0.1/
curl -I -H 'Host: www.example.com' http://127.0.0.1/
```

直接请求 `http://127.0.0.1/` 可能进入默认站点，不能据此判断目标域名有没有匹配正确。还应核对页面内容或业务标识，不能只看到两个 `200` 就认定转发到了不同业务。

### 4. 最后检查 DNS 与 HTTPS

在外部网络执行，使用自己的真实域名：

```bash
dig +short A console.example.com
dig +short A www.example.com
curl -I https://console.example.com/
curl -I https://www.example.com/
```

如果怀疑 DNS 尚未生效，可以临时指定连接 IP，同时保留正确的域名、SNI 和证书验证：

```bash
curl --resolve www.example.com:443:203.0.113.10 \
  https://www.example.com/
```

这里同样要替换示例地址。不要把 `curl -k` 的成功当成 HTTPS 证书验证通过，它跳过了证书验证。

### 常见问题对照

| 现象                             | 优先检查                                                |
| -------------------------------- | ------------------------------------------------------- |
| 两个域名进入同一个网站           | `server_name`、默认站点、`proxy_pass`、Nginx 是否已重载 |
| Nginx 返回 502                   | 回环上游、Docker 映射、frpc 注册状态、内网业务可达性    |
| frpc 无法连接                    | 7000/TCP 网络、云防火墙、frps 状态和认证信息            |
| frpc 登录成功，代理启动失败      | 代理名称或 `remotePort` 冲突、服务端端口限制            |
| HTTP 正常，HTTPS 报错            | 证书是否覆盖域名、TLS 站点匹配、证书是否过期            |
| 本机链路正常，公网出现未备案拦截 | 云厂商的备案或接入策略                                  |

域名备案、DNS、HTTPS 证书和内网穿透是不同环节。使用中国内地云服务器提供网站服务时，应先完成所需备案及接入手续；穿透成功不代表公网访问一定已经放行。

## 九、几个容易混淆的细节

### 一个 frps 可以连接多个客户端

`7000` 是共享的控制入口，不要求每个客户端单独占用一个控制端口。不同 TCP 代理需要避免代理名称和远端监听端口冲突。

### 一个 frpc 也可以转发多个服务

同一份客户端配置可以包含多段 `[[proxies]]`。这次拆成两个容器，是为了独立维护，而不是 FRP 要求一个业务必须启动一个客户端。

### host 网络和 bridge 网络里的 localhost 不一样

本文客户端使用 Linux host 网络。如果改用 bridge 网络，容器里的 `127.0.0.1` 就是容器自己，不能直接拿它当宿主机地址。

同样，本文的 Nginx 运行在云服务器宿主机。如果将 Nginx 也放进容器，就需要重新设计它与 frps 的容器网络和上游地址，不能直接照搬 `127.0.0.1:18880`。

### 这是 TCP 代理方案，没有使用 customDomains

FRP 自身也支持 HTTP 虚拟主机代理，可以通过 `vhostHTTPPort` 和 `customDomains` 按域名分流。

本文选择把证书和域名匹配集中交给 Nginx，客户端使用 `type = "tcp"`。不要把这两种方案的配置直接混用。

### 云控制台的 HTTPS 状态不等于实际 Nginx 状态

在我的环境中，阿里云轻量服务器控制台仍显示“HTTPS 未设置”，但服务器上的 Nginx 已经配置证书，实际访问也通过了证书校验。

控制台的状态反映的是它所管理的 HTTPS 设置，不能代替对服务器实际配置和公网访问的检查。

### 域名别名可以复用已有隧道

如果只是给资源服务再加一个域名，通常调整 DNS、Nginx 的 `server_name` 和证书即可，不必新建一条 FRP 代理。

如果新增的是一个独立业务，则需要建立新的代理关系，并在当前 Docker 端口发布方式下追加对应回环映射。共享 Token 适合本文这种同一维护者管理的可信客户端，不应把它直接当作面向不同客户的权限隔离方案。

## 十、这次实践让我理清了什么

实际部署中，我验证了两个站点的 HTTP / HTTPS 访问、证书校验、业务响应标识，以及原有管理接口的匿名请求仍返回 `401`。配置调整后的链路已经能够根据域名进入不同内网业务。

这次实践最有帮助的认识，是把三个经常混在一起的问题拆开：

- **域名找到哪台机器**，由 DNS 决定。
- **进入哪一个网站**，由 Nginx 的域名匹配和上游配置决定。
- **怎样到达内网服务**，由 frps / frpc 的代理关系决定。

理解这三层后，“同一台云服务器、同一个 frps、多个域名和多个客户端”就变成了一组可以逐层配置、逐层验证的连接关系。
