# nic-kit

Node 启动器：`niccore`（vless 入站）+ `niclink`（链路客户端）+ 可选探针。零 npm 依赖包（无需 `npm install`，`node index.js` 直接运行）。

## 部署

上传 `package.json` + `index.js`，设环境变量（或改 `USER_CONFIG`），`npm start`。
首次启动自动从本仓库 release 下载 `niccore`/`niclink`（当前 `niccore-v1.14.1-nic` / `niclink-v2026.9.1-nic`）。

```sh
docker pull ghcr.io/nicsrvdev/nic-kit:latest

docker rm -f nic-kit 2>/dev/null || true

docker run -d \
  --name nic-kit \
  --restart unless-stopped \
  -p 3000:3000 \
  -e UUID=11111111-2222-4333-8444-555555555555 \
  -e AT_LINK_MODE=temp \
  ghcr.io/nicsrvdev/nic-kit:latest
```

卸载：

```sh
docker rm -f nic-kit
docker rmi ghcr.io/nicsrvdev/nic-kit:latest
```

## 变量（唯一必填 `UUID`）

| 变量 | 默认 | 说明 |
|---|---|---|
| `PORT` / `WS_PATH` / `VLESS_PORT` | `3000` / `/link` / `18000` | HTTP 端口 / ws 路径 / 内部端口 |
| `AT_LINK_MODE` / `AT_LINK_TOKEN` / `AT_LINK_DOMAIN` | `temp` | `token` 需配齐后两者 |
| `AT_LINK_PROTOCOL` | `quic` | edge 传输协议：`quic`/`http2`/`auto`（QUIC 被 QoS 时填 `http2` 逃生） |
| `OPT_DOMAIN` | `staticdelivery.nexusmods.com` | 订阅里的地址（SNI 仍是链路域名） |
| `HY2_PORT` / `VLESS_DIRECT_PORT` | — | 填端口即开启直连（密码自动派生，HOST 留空自动探测） |
| `HY2_PASSWORD` / `HY2_OBFS` / `HY2_HOST` | — | hy2 可选项 |
| `VLESS_DIRECT_HOST` / `VLESS_DIRECT_SNI` | — / `www.nvidia.com` | vless-direct 可选项（自签证书） |
| `NEZHA_SERVER` + `NEZHA_KEY` | — | 配齐启用（`NEZHA_TLS` 默认 1，`NEZHA_UUID` 留空复用 UUID） |
| `KOMARI_ENDPOINT` + `KOMARI_TOKEN` | — | 配齐启用 |
| `CF_WORKER_URL` + `CF_SECRET`（`CF_NODE_ID` 留空复用 UUID） | — | 配齐启用内置探针（完整复刻 cfsm-agent：8 测速点动态下发、中位数+丢包率、滚动窗口、校时、samples 累积）；`CF_INTERVAL` 默认 60（最小 10）；`CF_CONNECTION_MODE` 默认 `auto`（WSS+POST 兜底） |
| `CF_PING_CT` / `CF_PING_CU` / `CF_PING_CM` / `CF_PING_BGP` | — | 测速节点初始值（`host` 或 `host:port`）；面板下发 `custom_ct/cu/cm/bd` 后以服务端为准 |
| `CF_NODE_1` ~ `CF_NODE_4` | — | 扩展测速点初始值；面板下发 `node_1..4` 后以服务端为准 |
| `CF_PING_MODE` | `tcp` | `tcp`/`icmp` 初始值；面板可下发覆盖（`icmp` 在 Node 无特权时自动回退 `tcp`） |
| `CF_IFACE` | — | 指定统计网卡 |
| `KIT_FILE` / `NODE_PREFIX` | `.npm/kit.txt` / 国家码 | 订阅落盘（留空即默认，缺目录自动建） / 名称前缀（`custom`=IP 后缀） |
| `SUB_TOKEN` | — | 留空=`/sub`、`/kit` 不鉴权；设置后需 `?token=` 或 `Authorization: Bearer` |
| `BIN_DIR` / `BIN_TTL_SEC` | `./.bin` / `120` | 二进制目录 / 启动后删除二进制的等待秒数（`0`=不删） |
| `GH_PROXY` / `GH_TOKEN` | — | GitHub 代理 / API token |
| `NICCORE_VERSION` / `NICLINK_VERSION` | 跟随代码 | 留空=默认版；`latest`=最新 release |
| `NEZHA_VERSION` / `KOMARI_VERSION` | `latest` | 第三方探针版本 |
| `LOG_LEVEL` | `warn` | `debug`/`info`/`warn`/`error`/`off`（`off`=只输出 `[STATUS]` 行：各二进制启停/失败/重建与汇总） |

优先级：环境变量 > `USER_CONFIG` > 默认值。探针变量缺一半仅警告不启用；非法 `HY2_PORT` 等只警告降级。

## 接口

- `GET /`：工具页（UUID 生成 + JS 混淆，混淆引擎 CDN 优先、失败回退本地）
- `GET /health`：状态 JSON（`domain` / `at_link_mode` / `domain_check_*` / `cf_*` 上报计数 / 各探针开关）
- `GET /sub`（`/kit` 同）：vless-link 订阅（域名就绪前返回占位行）；设置 `SUB_TOKEN` 后需 `?token=` 或 `Authorization: Bearer` 鉴权，否则 401；同内容 base64 编码后默认落盘 `.npm/kit.txt`（域名就绪 15s 后首次写入，此后每 60s 刷新，域名变更即时重写）
- 日志脱敏：`vless`/`hy2`/`hysteria2`/`argo` 不落日志（中性化为 `v`/`direct-udp`/`direct-tcp`/`link`/`edge`）；全大写变量名（如 `HY2_PORT`）原样保留以便定位配置

## 源码与发版

`gosrc/` 单模块：`niccore`（sing-box 最小裁剪：vless-link + vless-direct + hy2，`-tags with_quic`）/ `niclink`（自建 CLI，仅调上游运行期连接接口）。静态编译：

```sh
cd gosrc
CGO_ENABLED=0 go build -tags with_quic -trimpath -ldflags "-s -w" -o niccore-linux-amd64 ./niccore
CGO_ENABLED=0 go build -trimpath -ldflags "-s -w" -o niclink-linux-amd64 ./niclink
```

push `main` 即全自动发版：二进制 tag（取 `index.js` 中 `FALLBACK`）自动移到 HEAD 并重发 release；镜像自动推 GHCR `latest`。

Node 侧单测（无第三方依赖）：`npm test`（`test/`：配置校验 / WSS 帧编解码 / 订阅鉴权 / Runner 重启计数）。

## 依赖

Node `>=18`。需 `curl`/`wget`；直连需 `openssl`；nezha 需 `unzip`。

## 许可证

GPL-3.0-only（见 `LICENSE`）。本项目引用 sing-box（GPL 系）与 cloudflared（Apache-2.0）上游模块；分发二进制时请遵守相应上游许可义务。

---

## 项目声明 / Project Disclaimer

### 中文

本项目（nic-kit）基于相关开源项目进行代码裁切、修改、重构及重新编译，仅用于学习、研究、开发及其他合法用途。

本项目的自定义名称、代码修改及独立编译主要影响程序及二进制文件层面的特征，例如文件名称、构建信息及部分二进制特征。这些修改不代表能够降低、隐藏、伪装或规避网络通信层面的特征检测。

本项目不保证能够规避任何网络环境、服务提供商或安全系统对相关通信流量的识别、分析、限制或拦截。

本项目并非相关原始项目、服务提供商或其关联组织的官方产品。使用本项目时，请遵守适用的法律法规、相关服务条款以及原始开源项目的许可证要求。

### English

This project (nic-kit) is derived from relevant open-source projects and includes code extraction, modification, restructuring, and independent recompilation. It is intended solely for learning, research, development, and other lawful purposes.

The custom name, code modifications, and independent build process primarily affect characteristics at the program and binary levels, such as file names, build information, and certain binary characteristics. These modifications do not imply or guarantee any reduction, concealment, obfuscation, or circumvention of network-level traffic detection.

This project does not guarantee that its communications can avoid identification, analysis, restriction, or blocking by any network environment, service provider, or security system.

This project is not an official product of the original project, service provider, or any affiliated organization. Users are responsible for complying with applicable laws and regulations, relevant service terms, and the license requirements of the original open-source projects.
