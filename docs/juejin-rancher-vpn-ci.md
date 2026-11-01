---
highlight: a11y-dark
---

# Rancher 内网集群如何接入 CI：用 Docker 和 EasyConnect 打通部署链路

有些公司的 Rancher 和 Kubernetes 集群只能在内网访问。开发者在自己的电脑上连接 VPN 后，可以正常查看集群、发布应用；但 CI 执行器没有这条网络通道，构建完成后，部署步骤就会卡在连接集群上。

我采用的方案是：**把 EasyConnect VPN、kubectl 和部署脚本放进同一个容器，再由一个发布服务调用容器中的脚本。**

这样，CI 负责传入项目、环境和镜像版本，实际访问集群的命令在已经连接 VPN 的容器内执行。本文介绍这条链路的实现方式、配置方法和验证步骤，最后补充宿主机借用容器 VPN 网络的 NAT 方案。

完整项目：[enochjs/rancher-deploy-server](https://github.com/enochjs/rancher-deploy-server)。文中代码用于说明核心流程，完整接口和启动编排请参考项目仓库；使用文中的脚本和调用示例时，需要同步调整对应实现。

## 一、先看部署链路

```text
CI 完成构建并推送镜像
        │
        │ POST /deploy：项目、环境、Deployment、镜像、命名空间
        ▼
发布服务（Node.js / NestJS）
        │
        │ 按项目选择执行容器，通过 docker exec 调用 deploy.sh
        ▼
EasyConnect 容器
  ├── VPN 客户端：建立内网访问通道
  ├── kubeconfig：提供集群地址、上下文和访问凭据
  └── kubectl + deploy.sh：更新镜像、等待滚动发布
        │
        │ 经 VPN 访问 kubeconfig 中配置的 API 地址
        ▼
Rancher 管理的 Kubernetes 集群
```

这里有两件事需要分清：

- **VPN 解决网络可达性。** 让执行部署的进程能够连接 kubeconfig 中的 API 地址。
- **kubeconfig 解决集群连接配置和身份认证。** 网络通了，仍然需要有效凭据和对应命名空间的操作权限。

这个方案执行的是 Kubernetes Deployment 镜像更新，不是安装 Rancher，也不是在 CI 中模拟点击 Rancher 管理页面。

### 为什么把 kubectl 放进 VPN 容器？

容器拥有独立的网络环境。VPN 在某个容器里连接成功，不代表宿主机和其他容器会自动使用它的路由。

对于“执行一次部署脚本”的需求，直接在 VPN 容器中运行 kubectl，可以复用已有的 VPN 网络，减少宿主机路由、IP 转发和 NAT 配置。

这不是唯一实现方式：共享网络命名空间、代理或网关也能解决问题。本文先采用同容器执行的方式，宿主机网关方案放在最后单独说明。

## 二、运行前需要准备什么

| 项目 | 用途 |
| --- | --- |
| Docker 运行环境 | 运行 VPN 容器、默认 CLI 容器和发布服务 |
| Docker Compose | 编排和启动上述服务 |
| Node.js、Yarn | 执行项目中的 Compose 配置生成脚本 |
| EasyConnect 账号 | 登录企业 VPN，建立网络通道 |
| kubeconfig | 访问目标 Kubernetes 集群 |
| Linux 版 kubectl、Docker CLI | 分别用于集群操作和容器命令调用 |

本文使用 `hagb/docker-easyconnect:cli` 在容器中运行 EasyConnect，并通过 VPN 访问企业内网。运行时需要提供 TUN 设备和网络管理权限。该纯命令行镜像面向 amd64，支持用户名与密码、硬件特征码等登录方式，使用前需确认与企业 VPN 的认证方式兼容，详见 [docker-easyconnect 项目说明](https://github.com/docker-easyconnect/docker-easyconnect)。

以下主流程按 Linux Docker 宿主机说明。若使用 Apple Silicon 构建或运行，需要另外确认 amd64 平台支持；为 kubectl 换成 arm64 二进制，并不能让整个 EasyConnect CLI 镜像自动变成原生 arm64。

## 三、先准备项目配置

### 1. 项目目录

与本文相关的目录如下：

```text
rancher-deploy-server/
├── configs/
│   ├── config.help.json          # VPN 配置格式示例
│   ├── config.json               # 实际使用的 VPN 配置
│   └── kubeconfig/
│       ├── demo.test.yml
│       └── demo.prod.yml
├── deploy/
│   ├── kubectl                   # Linux 版 kubectl
│   ├── deploy.sh                 # 集群发布脚本
│   ├── download-kubectl.sh
│   ├── vpn/Dockerfile
│   └── default/Dockerfile
├── docker-compose/
│   ├── generate_compose.js       # 根据配置生成 Compose 文件
│   ├── package.json
│   └── start.sh
└── server/
    ├── docker-cli/docker         # 发布服务使用的 Docker CLI
    ├── download-docker-cli.sh
    └── src/                      # NestJS 发布服务
```

### 2. 获取并保存 kubeconfig

登录 Rancher，找到目标集群，复制或下载对应的 kubeconfig。不同 Rancher 版本的入口位置可能不同，可以参考 [Rancher 的 kubeconfig 使用说明](https://ranchermanager.docs.rancher.com/how-to-guides/new-user-guides/manage-clusters/access-clusters/use-kubectl-and-kubeconfig)。

获取 kubeconfig 的界面如下：

![Rancher 中获取 kubeconfig 的界面](https://p9-xtjj-sign.byteimg.com/tos-cn-i-73owjymdk6/1f7512d16c7748e3bd1ad7091ac3199b~tplv-73owjymdk6-jj-mark-v1:0:0:0:0:5o6Y6YeR5oqA5pyv56S-5Yy6IEAg5p6r6I23:q75.awebp?rk3s=f64ab15b&x-expires=1793254969&x-signature=qSpy9Sx39WNvhtXEoTEUjulWu%2BM%3D)

将文件保存到 `configs/kubeconfig/`，命名规则为：

```text
项目名.环境.yml
```

例如：

```text
demo.test.yml
demo.prod.yml
```

后面传入 `vpn_demo` 时，部署脚本使用的项目名是去掉前缀后的 `demo`，因此测试环境会读取 `/kubeconfig/demo.test.yml`。

检查 kubeconfig 中的 API 地址、当前上下文和权限是否正确。证书校验问题应配置正确的 CA 或证书链，不应把跳过 TLS 校验作为正常部署的默认设置。kubeconfig 和 VPN 密码都不应提交到公开仓库。

### 3. 配置 VPN

创建 `configs/config.json`，使用 `vpns` 数组配置 VPN 连接：

```json
{
  "vpns": [
    {
      "name": "vpn_demo",
      "server": "vpn.example.com:443",
      "user": "YOUR_VPN_USERNAME",
      "pass": "YOUR_VPN_PASSWORD",
      "ec_ver": "7.6.7"
    }
  ]
}
```

字段说明：

| 字段 | 作用 |
| --- | --- |
| `name` | VPN 容器名称，也是接口选择 VPN 的标识，例如 `vpn_demo` |
| `server` | 企业 VPN 的服务地址，按实际登录要求填写 |
| `user` | VPN 登录账号 |
| `pass` | VPN 登录密码 |
| `ec_ver` | EasyConnect 客户端版本，需与企业服务端兼容 |

需要多个 VPN 时，在 `vpns` 中添加多条记录，并使用不同的 `name`。

不需要 VPN 的项目可以使用默认 CLI 容器。即使没有 VPN 记录，当前 Compose 生成脚本仍然会读取 `configs/config.json`，可以保留以下空配置：

```json
{
  "vpns": []
}
```

仓库中的发布服务通过“是否找到 VPN 配置”决定是否回退到默认容器。接入实际 CI 时，建议明确配置项目与容器的映射，避免项目名写错后意外进入默认执行环境。

## 四、准备 VPN 镜像和部署脚本

### 1. VPN Dockerfile

以 EasyConnect CLI 镜像为基础，安装排查工具，并加入 kubectl 和发布脚本。Dockerfile 如下：

```dockerfile
FROM hagb/docker-easyconnect:cli

USER root

# 安装网络排查工具、JSON 工具和脚本运行环境
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      iputils-ping \
      iproute2 \
      net-tools \
      iptables \
      jq \
      procps \
      ca-certificates \
      bash && \
    rm -rf /var/lib/apt/lists/*

# 二进制必须匹配容器运行时的 Linux 架构
COPY deploy/kubectl /usr/local/bin/kubectl
RUN chmod +x /usr/local/bin/kubectl

# kubeconfig 运行时挂载，避免将集群凭据固化在镜像中
RUN mkdir -p /kubeconfig

COPY deploy/deploy.sh /usr/local/bin/deploy.sh
RUN chmod +x /usr/local/bin/deploy.sh

# 保留基础镜像的 VPN 启动流程，不在这里覆盖 ENTRYPOINT / CMD
```

构建时以项目根目录为 context，因此 `COPY deploy/...` 才能找到对应文件：

```bash
docker build -f deploy/vpn/Dockerfile -t docker-easyconnect-cli .
```

kubeconfig 建议通过运行时只读挂载提供，例如：

```yaml
volumes:
  - ../configs/kubeconfig:/kubeconfig:ro
```

这里的相对路径以 `docker-compose/` 中的 Compose 文件为基准。仓库中的生成脚本已经挂载了该目录；如需只读挂载，应修改生成脚本中的挂载配置，避免下次生成时覆盖手工修改。

### 2. deploy.sh 的参数与约定

脚本接收以下参数：

| 顺序 | 参数 | 示例 |
| --- | --- | --- |
| 1 | 项目名，不带 `vpn_` 前缀 | `demo` |
| 2 | 环境 | `test`、`prod` |
| 3 | Deployment 名称 | `scm-saas` |
| 4 | 完整镜像引用 | `registry.example.com/team/scm-saas:v1.0.0` |
| 5 | 命名空间，可选 | `web-cloud-test` |
| 6 | Deployment 中的目标容器名称，可选 | `scm-saas` |

脚本的前四个参数必填，第五个参数用于指定命名空间，第六个参数用于指定目标容器。未传容器名时，默认它与 Deployment 同名；如果两者不同，需要通过第六个参数明确指定。

```bash
#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 4 ] || [ "$#" -gt 6 ]; then
  echo "用法：deploy.sh PROJECT ENV DEPLOYMENT IMAGE [NAMESPACE] [CONTAINER]" >&2
  exit 1
fi

PROJECT_NAME="$1"
DEPLOY_ENV="$2"
DEPLOY_KEY="$3"
IMAGE_VERSION="$4"
DEPLOY_NAMESPACE="${5:-}"
CONTAINER_NAME="${6:-$DEPLOY_KEY}"

# 限制用于文件路径、资源名称的参数，拒绝空值和路径分隔符
for value in "$PROJECT_NAME" "$DEPLOY_KEY" "$CONTAINER_NAME"; do
  if [[ ! "$value" =~ ^[a-z0-9][a-z0-9._-]*$ ]]; then
    echo "项目、Deployment 或容器名称格式不合法" >&2
    exit 1
  fi
done

if [ -z "$IMAGE_VERSION" ]; then
  echo "镜像引用不能为空" >&2
  exit 1
fi

# 本文示例处理 test / prod，并将 main、stage 映射到对应环境
case "$DEPLOY_ENV" in
  main|prod)
    DEPLOY_ENV="prod"
    DEFAULT_NAMESPACE="web-cloud"
    ;;
  test|stage)
    DEPLOY_ENV="test"
    DEFAULT_NAMESPACE="web-cloud-test"
    ;;
  *)
    echo "不支持的环境：$DEPLOY_ENV，请显式配置对应环境" >&2
    exit 1
    ;;
esac

DEPLOY_NAMESPACE="${DEPLOY_NAMESPACE:-$DEFAULT_NAMESPACE}"
if [[ ! "$DEPLOY_NAMESPACE" =~ ^[a-z0-9][a-z0-9-]*$ ]]; then
  echo "命名空间格式不合法" >&2
  exit 1
fi

KCFG="/kubeconfig/${PROJECT_NAME}.${DEPLOY_ENV}.yml"
if [ ! -r "$KCFG" ]; then
  echo "找不到可读取的 kubeconfig：$KCFG" >&2
  exit 1
fi

export KUBECONFIG="$KCFG"

echo "项目：$PROJECT_NAME；环境：$DEPLOY_ENV"
echo "目标：$DEPLOY_NAMESPACE/deployment/$DEPLOY_KEY"
echo "容器：$CONTAINER_NAME；镜像：$IMAGE_VERSION"

kubectl -n "$DEPLOY_NAMESPACE" set image \
  "deployment/$DEPLOY_KEY" \
  "$CONTAINER_NAME=$IMAGE_VERSION"

kubectl -n "$DEPLOY_NAMESPACE" rollout status \
  "deployment/$DEPLOY_KEY" \
  --timeout=10m
```

需要按公司项目调整的是环境别名、默认命名空间以及 kubeconfig 文件名规则。`pre`、`dev` 等环境应明确增加映射，不要仅修改注释就假定已经支持。

`set image` 更新镜像配置，`rollout status` 等待 Deployment 滚动更新完成。这里按容器名精确更新，避免用 `*` 时把 sidecar 等其他容器一起替换。参数用法见 [kubectl set image 官方说明](https://kubernetes.io/docs/reference/kubectl/generated/kubectl_set/kubectl_set_image/)。

等待超时意味着本次命令没有确认发布完成，不代表 Kubernetes 自动回滚，也不一定意味着后台更新已经停止。需要继续检查 Deployment、Pod 和事件。

## 五、发布服务如何调用 VPN 容器

发布服务负责解析请求、选择执行容器，再调用容器中的 `deploy.sh`。

项目使用 NestJS，核心命令仍然是：

```bash
docker exec vpn_demo bash /usr/local/bin/deploy.sh \
  demo test scm-saas \
  registry.example.com/team/scm-saas:v1.0.0 \
  web-cloud-test
```

Node.js 中建议用 `execFile` 的参数数组传递这些值，避免把接口参数拼成一整条 shell 命令。它默认不启动 shell，空格和特殊字符也不会被外层 shell 再解释，见 [Node.js 子进程说明](https://nodejs.org/api/child_process.html#child_processexecfilefile-args-options-callback)。

下面仅展示部署执行部分，Controller、请求 DTO 和配置加载仍需在实际服务中接好：

```ts
import { Injectable } from '@nestjs/common';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

interface DeployRequest {
  platform: string;
  env: 'test' | 'prod';
  key: string;
  image: string;
  namespace?: string;
}

interface DeployTarget {
  container: string;
  project: string;
}

type DeployResult =
  | { success: true; output: string }
  | { success: false; error: string };

@Injectable()
export class DockerService {
  // 示例中使用显式映射；实际项目可从受控配置加载
  private readonly targets = new Map<string, DeployTarget>([
    ['vpn_demo', { container: 'vpn_demo', project: 'demo' }],
    ['direct_demo', { container: 'docker-default-cli', project: 'demo' }],
  ]);

  async deploy(request: DeployRequest): Promise<DeployResult> {
    const target = this.targets.get(request.platform);
    if (!target) {
      return { success: false, error: '未配置的部署项目' };
    }

    const args = [
      'exec',
      target.container,
      'bash',
      '/usr/local/bin/deploy.sh',
      target.project,
      request.env,
      request.key,
      request.image,
    ];

    if (request.namespace) {
      args.push(request.namespace);
    }

    try {
      const { stdout, stderr } = await execFileAsync('docker', args, {
        encoding: 'utf8',
        maxBuffer: 10 * 1024 * 1024,
        timeout: 12 * 60 * 1000,
      });

      return { success: true, output: [stdout, stderr].filter(Boolean).join('\n') };
    } catch (error: unknown) {
      // 完整异常保留在受控服务日志中，对外返回稳定的失败信息
      console.error('部署命令执行失败', error);
      return { success: false, error: '部署失败，请检查任务日志和集群状态' };
    }
  }
}
```

示例用显式映射限制执行容器，不直接把任意请求字段当作 Docker 容器名使用。接口层还需要校验项目、环境、镜像及目标资源，并控制调用权限。

发布服务通过 Docker CLI 操作宿主机 Docker，因此需要挂载 `/var/run/docker.sock`。这意味着服务拥有很强的宿主机操作能力，发布接口应只供受控的内部 CI 使用，并配好鉴权；不应作为匿名公网接口。

另外，外层 Node.js 调用超时不保证已经停止容器中的 kubectl，更不等于停止了集群的滚动更新。超时后的状态要重新查询，避免立即重复提交同一个发布任务。

## 六、启动项目并逐层验证

### 1. 准备 CLI 二进制

根据仓库中的 `deploy/download-kubectl.sh`，把 Linux 版 kubectl 放到 `deploy/kubectl`；根据 `server/download-docker-cli.sh`，把 Docker CLI 放到 `server/docker-cli/docker`。

下载版本要与集群、Docker daemon 和镜像架构兼容。不要直接把 macOS 的 kubectl 复制进 Linux 容器。

### 2. 安装生成脚本依赖并启动

完成配置和二进制准备后，在项目根目录执行：

```bash
cd docker-compose
yarn install
bash start.sh
```

`start.sh` 会生成 Compose 文件、构建镜像，再调用 `docker-compose` 启动。因此宿主机需要有该命令；如果只安装了 Compose v2 的 `docker compose`，应同步调整启动脚本。

脚本还提供 `bash start.sh amd`，用于指定 `linux/amd64`。这只是平台选择，仍需确认运行环境具备相应执行能力。

发布 API 和 CLI 容器使用的是宿主机 Docker，所以宿主机必须已安装并启动 Docker。容器“正在运行”也不代表 VPN 已登录完成，需要继续查看日志并验证集群连接。

### 3. 检查容器和文件

在 Docker 宿主机上执行：

```bash
docker ps --format '{{.Names}}'
docker logs --tail=100 vpn_demo

docker exec vpn_demo ls -l \
  /usr/local/bin/deploy.sh \
  /kubeconfig/demo.test.yml

docker exec vpn_demo kubectl version --client
```

### 4. 检查 API 存活和 VPN 基础网络

```bash
curl --fail --max-time 10 http://localhost:9090/health

curl --fail --max-time 15 \
  -X POST http://localhost:9090/ping \
  -H 'Content-Type: application/json' \
  -d '{"platform":"vpn_demo"}'
```

`/health` 用于检查发布服务是否响应。项目中的 `/ping` 主要检查容器是否存在，以及是否能 ping 到配置的 VPN 服务地址。

**`/ping` 返回 `success: true`，不能证明 VPN 隧道已可用，更不能证明具有集群发布权限。** VPN 服务端本身可能在公网可达；反过来，禁止 ICMP 的服务器也可能实际可以正常连接。

### 5. 从 VPN 容器内验证集群访问

先做只读检查：

```bash
docker exec \
  -e KUBECONFIG=/kubeconfig/demo.test.yml \
  vpn_demo \
  kubectl --request-timeout=15s \
  -n web-cloud-test get deployment scm-saas
```

这一步能读取目标 Deployment，才能说明当前 kubeconfig 上下文下的网络、认证和读取权限基本可用。更新操作仍需要对应的写入权限。

检查发布身份是否允许更新 Deployment：

```bash
docker exec \
  -e KUBECONFIG=/kubeconfig/demo.test.yml \
  vpn_demo \
  kubectl --request-timeout=15s \
  auth can-i patch deployments.apps -n web-cloud-test
```

`rollout status` 还需要读取、观察 Deployment 的权限。权限应由集群 RBAC 按部署需要配置。

### 6. 调用发布接口

确认项目、环境和目标镜像后再执行，下面的请求会真正更新 Deployment：

```bash
curl --fail-with-body --max-time 750 \
  -X POST http://localhost:9090/deploy \
  -H 'Content-Type: application/json' \
  -d '{
    "platform": "vpn_demo",
    "env": "test",
    "key": "scm-saas",
    "image": "registry.example.com/team/scm-saas:v1.0.0",
    "namespace": "web-cloud-test"
  }'
```

这里的镜像地址是示例，需要替换为已推送、且集群能够拉取的镜像。若实际发布接口配置了鉴权，也要按服务要求附带认证信息。

这条请求依次确定：使用 `vpn_demo` 容器、读取 `demo.test.yml`、进入 `web-cloud-test` 命名空间、更新 `scm-saas` Deployment，再等待滚动发布结果。

CI 接入时，应让部署步骤等待并检查实际发布结果，不能只记录“HTTP 请求已发出”。正式使用还应结合健康检查验证业务是否正常。

## 七、扩展：让宿主机借用容器中的 VPN 网络

主流程已经可以在 VPN 容器内完成发布。只有确实需要在宿主机上直接访问内网目标时，才需要考虑让容器充当网关。

容器内的路由信息示例如下：

![VPN 容器的路由信息](https://p9-xtjj-sign.byteimg.com/tos-cn-i-73owjymdk6/fda4c193756b45a3a081cd1f894890e4~tplv-73owjymdk6-jj-mark-v1:0:0:0:0:5o6Y6YeR5oqA5pyv56S-5Yy6IEAg5p6r6I23:q75.awebp?rk3s=f64ab15b&x-expires=1793254969&x-signature=1y4n6VGE%2F%2FE4N4Mlh1uvHRPQaBk%3D)

### 1. 先明确适用环境

以下示例适用于 **Linux Docker Engine 的 bridge 网络**，假设：

| 项目 | 示例值 |
| --- | --- |
| VPN 容器名 | `vpn_demo` |
| 容器在 bridge 网络中的 IP | `172.19.0.3` |
| 需要访问的内网目标 | `172.16.5.42` |
| 容器的 Docker 网络接口 | `eth0` |
| VPN 隧道接口 | `tun0` |

IP 和接口名必须以当前环境为准。容器重建后 IP 可能变化；如果用于长期网关，需要稳定地址和规则管理，不能一直依赖临时地址。

Docker Desktop 的容器网络位于 Linux 虚拟机中，macOS 或 Windows 宿主机通常不能直接照搬“把容器 bridge IP 当作下一跳”的配置。macOS 的 `route add` 与 Linux 的 `ip route` 语法不同，且仅修改 macOS 路由并不能自动打通 Docker Desktop 的虚拟机网络。

### 2. 确认容器内路由

```bash
docker exec vpn_demo ip addr
docker exec vpn_demo ip route
docker exec vpn_demo ip route get 172.16.5.42
```

先确认目标流量在 VPN 容器内确实会走到 VPN 隧道，再配置宿主机转发。

### 3. 在 VPN 容器内开启转发和 NAT

以下命令在 Linux 宿主机上执行，通过 `docker exec` 修改 VPN 容器的网络规则：

```bash
docker exec vpn_demo sysctl -w net.ipv4.ip_forward=1

docker exec vpn_demo iptables -t nat -A POSTROUTING \
  -d 172.16.5.42/32 -o tun0 -j MASQUERADE
```

`ip_forward=1` 允许容器转发不是发给自身的数据包；`MASQUERADE` 将发往指定内网目标、从 `tun0` 离开的请求做源地址转换，让返回流量能回到 VPN 隧道。

如果容器的 FORWARD 规则不允许这类流量，还需要按实际规则顺序放行：

```bash
docker exec vpn_demo iptables -I FORWARD 1 \
  -i eth0 -o tun0 -d 172.16.5.42/32 -j ACCEPT

docker exec vpn_demo iptables -I FORWARD 1 \
  -i tun0 -o eth0 -s 172.16.5.42/32 \
  -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
```

这些命令只是单目标的临时示例，不是适用于所有 VPN 的完整网关配置。实际还可能受到 VPN 客户端规则、宿主机防火墙和 `rp_filter` 等设置影响。不要反复执行以叠加重复规则，持久化前需要整理现有规则。

### 4. 在 Linux 宿主机添加路由

先确认没有冲突路由，然后执行：

```bash
sudo ip route add 172.16.5.42/32 via 172.19.0.3
ip route get 172.16.5.42
ping -c 3 172.16.5.42
```

ICMP 被禁用时，ping 不通不代表 TCP 不通，应继续检查实际业务端口，例如使用 `nc` 测试目标的 HTTPS 端口：

```bash
nc -vz -w 5 172.16.5.42 443
```

成功时，流量大致经过以下路径：

```text
请求：宿主机 → Docker bridge → VPN 容器 → tun0 → 企业内网目标
响应：企业内网目标 → VPN → VPN 容器 → Docker bridge → 宿主机
```

不再需要这条临时路由时，可以删除：

```bash
sudo ip route del 172.16.5.42/32 via 172.19.0.3
```

对于本文的 CI 发布需求，把 kubectl 留在 VPN 容器中就能省掉这层宿主机网关维护。

## 八、常见问题

| 现象 | 优先检查 |
| --- | --- |
| VPN 容器运行，但集群连接超时 | VPN 是否登录成功、内网 DNS、kubeconfig API 地址和容器内路由 |
| `/ping` 成功，kubectl 仍然失败 | `/ping` 只做基础探测，继续验证 API 端口、TLS、认证和 RBAC |
| 提示 kubeconfig 不存在 | 项目名是否去掉 `vpn_` 前缀，环境映射和文件名是否一致，目录是否挂载成功 |
| kubectl 出现 `exec format error` | 二进制是否为 Linux 版，架构是否与容器匹配 |
| API 返回 Unauthorized 或 Forbidden | 凭据是否有效、当前上下文是否正确、发布身份是否有相应权限 |
| 目标容器找不到 | Deployment 名称与 Pod 模板中的容器名是否一致 |
| `ImagePullBackOff` | 镜像地址、版本、仓库凭据及集群到镜像仓库的网络 |
| rollout 超时 | Deployment 条件、Pod 事件、调度、镜像拉取和 readiness 状态 |
| VPN 容器能访问内网，宿主机不能 | 宿主机不会自动继承容器路由；先判断是否真的需要网关模式 |

这套方案把集群访问集中在有 VPN 网络的执行容器中，CI 只需传递明确的发布参数。验证时依次检查服务存活、VPN 网络、集群只读访问、写入权限和滚动发布结果，就能更容易区分网络问题、权限问题与应用启动问题。
