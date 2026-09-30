# 修复说明（FIXES）

本文件记录针对代码审查（`nic-kit-审查报告.md`）所做的修复。每条都带**验证方式**，可独立复现。

测试：`npm test`（= `node --test`）→ **80 个用例全绿**（原 47 + 第一轮 26 + 第二轮 7）。
Node：修复工作基于 Node v20.20.2；CI/Docker 仍用 Node 22 / node:20-alpine。

---

## P0

### 1. 二进制下载阻塞事件循环（`downloadFile`）

**问题**：用 `spawnSync("curl", [... "--max-time" 300 ...])`（无 curl 时 `spawnSync("wget")`）下载，
同步调用把整个事件循环卡住：下载窗口内 `/health` 无响应、SIGTERM/SIGINT 无法处理、
`Promise.all` 的"并行下载"实际串行。

**修复**：改为内置 `fetch` + 流式写盘（`node:stream/promises` pipeline），带超时（默认 300s）
与指数退避重试（默认 2 次）；失败/超时删除半截文件；`minSize` 校验语义不变。不再依赖 curl/wget。

**验证**（`nic-kit-repro/block_test.mjs` / `sigterm_test.mjs`）：

| 场景 | 修复前 | 修复后 |
|---|---|---|
| 下载挂起 12s 内 `/health` 成功次数 | 0/19 | **47/1**（首次未监听） |
| 下载期 SIGTERM 后 4s 进程状态 | 仍存活 | **已优雅退出** |
| 新增单测 `test/download.test.js` | — | 5 用例（非阻塞/超时/404/minSize/重试） |

### 2. 其余阻塞点一并异步化

- `unzip`（nezha 解压）、`openssl version` / `openssl req`（自签证书）、`Runner.check`
  （niclink `run --help` 自检）全部改为异步 `execFile`（`execFileAsync` 封装，带超时）。
- `have()` 的可执行文件探测结果加缓存，不再每次调用 fork 一个 `sh`。

---

## P1

### 3. 启动 1 秒内重复上报 3 次

**问题**：`wssConnectOnce` 首帧、`tick()` 的 POST 兜底（握手期间 `wssConnected` 仍为 false）、
`wssTickLoop` 首轮各发一次完整 report。

**修复**：
- 新增 `state.wssConnecting`：握手进行中 `tick()` 不再发 POST 兜底；
- 新增 `state.lastWssSendAt`：`wssTickLoop` 必须等距上次发送满一个 `wssIntervalMs()` 才发，
  不再与首帧背靠背。

**验证**（`nic-kit-repro/mockcf2.mjs`，mock Worker 记录收包时间）：

```
修复前:  +132ms WSS / +140ms POST / +1018ms WSS     （3 条，其中两条间隔 900ms）
修复后:  +74ms WSS / +2078ms WSS / +4080ms WSS      （3 条，间隔约 2s，POST 0 条）
```

新增单测 `test/cfprobe-startup.test.js`：断言 6s 内无 POST 兜底、相邻上报间隔 ≥ 1s、总数 ≤ 4。

### 4. 重复采集 + 每个节拍 fork `df`

**问题**：`tick()` 与 `sendViaWss()`/`postOnce()` 各自 `collect()`；`collect()` 每次都
`execFile("df")`。auto 模式默认 2s 节奏 → 实测 10s 内 9 次 `df`。

**修复**：
- 拆成 `collectMetrics()`（指标快照，`COLLECT_REUSE_MS=1500` 内复用）+ `buildBody()`
  （时间/样本列表每次重新组装，语义不变）；
- `diskInfo()` 加 30s 缓存（`resetDiskCache()` 供测试清缓存）。

**验证**（`nic-kit-repro/dyn_test.mjs`）：10s 内 `df` 调用 **9 次 → 1 次**；`disk_total` 仍为真实值。
新增单测 `test/collect-cache.test.js`。

### 5. `SUB_TOKEN` 明文进日志

**问题**：`redact()` 漏了 `subToken`，`LOG_LEVEL=debug` 时明文打印。

**修复**：改为 `SECRET_KEYS` 列表统一掩码（含 `subToken`）；同时把默认复用主 UUID 的派生 ID
（`cfNodeId` / `nezhaUuid`）一并截断，否则 uuid 的掩码会被另一个字段原样还原。

**验证**：`test/redact.test.js`；实测日志中 `subToken: '***'`、`cfSecret: '***'`。

---

## P2

### 6. `npm test` 与 Node 版本声明不一致

**问题**：`node --test "test/*.test.js"` 的引号 glob 需要 Node ≥ 21（Node 18/20 直接报
`Could not find ...`），而 `engines` 写 `>=18`；`test/health-startup.test.js` 还用了
`import.meta.dirname`（需 ≥ 20.11）。

**修复**：脚本改为 `node --test`（自动发现 `test/`，各版本一致）；测试文件改用
`fileURLToPath(import.meta.url)`。README 的测试与依赖说明同步更新。

### 7. 自签证书 CN/SAN 与客户端 SNI 不一致 + 生成顺序

**问题**：CN 只取 `cfg.directUdpHost || "direct-udp"`，忽略 `VLESS_DIRECT_SNI`；
且证书在公网 IP 探测前生成，自动探测到的 IP 写不进证书。

**修复**：main() 调整顺序为 端口探测 → HOST/国家码探测 → 证书生成；
CN/SAN 取 `VLESS_DIRECT_SNI` / `HY2_HOST` / `directTcpHost` / 自动探测到的公网 IP，
并把 localhost 与 IPv4 正确写成 `DNS:` / `IP:` 条目。

**验证**：

```
subject=CN=www.nvidia.com
X509v3 Subject Alternative Name:
    DNS:localhost, DNS:www.nvidia.com, IP Address:203.0.113.7
```

证书复用逻辑不变（存在即不重新生成）。

### 8. 公网 IP 探测校验缺失

**问题**：v6 用 `/([0-9a-fA-F:]{2,45})/` 抓取，错误页里的 `ea` 之类碎片也会被当成地址上报；
v4 不校验八位组范围。

**修复**：新增严格 `isIpv6()`（含 `::` 压缩与内嵌 IPv4 规则）；`publicIp()` 改为
"按非 IP 字符切分 + 严格校验"，非法值继续尝试下一个端点。

**验证**：`test/publicip.test.js`（错误页 HTML → `""`；`2001:db8::1234` → 采纳；`999.1.1.1` → `""`）。

### 9. 月度流量字段语义错误

**问题**：`net_rx_monthly`/`net_tx_monthly` 直接等于开机以来累计值，面板"本月流量"失真；
面板下发的 `rx_correction`/`tx_correction` 被当 noop 丢弃。

**修复**：新增流量账期模块，持久化 `BIN_DIR/.run/traffic.json`：

- 每次采样按"当前累计计数器 − 上次基准"累加进本月，计数器回绕（重启/换机）不产生负数；
- 账期由 `reset_day`（面板可下发，1–31）决定，跨账期自动清零；首月按月内重置日退化；
- 进程重启从文件恢复，最多丢失最近 60 秒（写盘节流）；
- `rx_correction`/`tx_correction` 作为本月基准覆盖；
- 未初始化（无 `BIN_DIR`）或文件损坏时回落到累计值，只告警不致命。

**验证**：`test/traffic.test.js`（账期边界 / 跨账期清零 / 回绕 / 重启恢复 / 坏文件）；
实测上报里 `net_rx=6557290` 而 `net_rx_monthly=66`（差值累计）。

### 10. 动态配置未知字段导致整包被拒

**问题**：响应体里出现一个不在白名单的 key（面板升级新增字段）就 `reject` 整包，
该实例静默失去全部动态配置。

**修复**：未知字段一律忽略 + 每个字段只告警一次；已知字段取值非法仍严格拒绝（语义不变）。
另外 `rx_correction`/`tx_correction` 现在会真正生效（见 #9）。

**验证**：`test/dyncfg.test.js`（未知字段不拖垮整包 / 非法值仍拒 / 全未知视为无配置）。

---

## P3（工程与细节）

| 项 | 修复 |
|---|---|
| Dockerfile `ARG GOTOOLCHAIN` 死代码 | 在 `go build` stage 内重新声明，ARG 真正生效 |
| 订阅链接 `path=%2Flink` | 改用 `encodeURI`，`path=/link`（实测 `/sub` 输出已修正） |
| `niclink` 覆盖 `QUIC_GO_DISABLE_ECN` | 仅当用户未显式设置时才写入 |
| 临时域名拨测过于激进 | 502/503 判"真死"（2 次失败换域名），超时/DNS 等网络类容错到 3 次 |
| 死代码 | 删除 `splitHostPort`、`resetCpuState`；`probeTempDomain` 去掉未使用的 `cfg` 参数（调用点与测试同步更新） |
| cfprobe `state` 初始字段 | 补 `probeTimer` / `ipTimer`（不再运行期临时挂） |
| `refetch` 失败分支空 bin | 复用 `lastSpawn` 的真实 bin，不再空转一次 ENOENT |
| `redactArgs` 未接线 | 在 `_spawn` 的 debug 日志里启用（命令行脱敏可见） |

---

## 第二轮审查（对当前最新代码的复查）

### 11. 半截二进制被当成有效文件 → 重启 30 次后彻底变砖

**问题**（修复前存在的健壮性缺陷，第一轮漏掉）：`ensure*` 只判断"文件是否存在"。
进程被强杀/镜像返回截断内容时留在 `dest` 的半截二进制会被当成有效文件，
子进程随即反复快速崩溃，Runner 按 5s/10s/20s… 退避，到 30 次上限后放弃（give-up），
期间**永远不会重新下载**，实例再也无法自愈。实测：

```
[STATUS] niccore starting
[WARN]   [niccore] /tmp/part/.bin/niccore: 1: Syntax error: EOF in backquote substitution
[STATUS] niccore exited code=2 signal=null
[STATUS] niccore restart #1 in 5s → #2 in 10s → … → max restarts (30) reached, giving up
```

**修复**：
1. `downloadFile` 改为**先写同目录 `.part-*` → 大小校验 → 原子 rename**，从此 `dest` 不会出现半截文件；
2. 启动清理遗留的 `.part-*`（10 分钟内修改过的跳过，避免误删并发下载）；
3. `usableBinary()`：已有二进制小于 512 KiB（真实二进制 20 MB+）视为截断，删除后重新下载；
4. 启动自检扩展：niccore 也做 `run --help` 自检，**失败则删除并自动重下一次**，仍失败才带明确
   `[STATUS] niccore failed: self-check failed, aborting` 退出（容器编排会重启重试），不再进重启循环；
5. 顺带去掉"下到 tmp → copyFile → chmod"的绕行：`downloadFile` 支持 `mode`，
   在 rename 前设好权限，直接落位到 `dest`（省一次 20 MB+ 拷贝与双倍磁盘占用）。

**验证**：
- 新单测 `test/binary-integrity.test.js`（5 例）：下载中断时 `dest` 不存在、成功时无 `.part-*` 残留、
  大小不合格不落位、截断文件判为不可用并删除、`.part-*` 清扫保留正在写入的。
- 实测损坏二进制（1 MiB 随机数据）：启动即报 `self-check failed` → 重下载 → 失败则 abort，退出码 1。
- 真实二进制端到端：21.1 MiB + 24.3 MiB 并行下载 0.5s、权限 755、无残留、`run --help` 自检 exit 0。

### 12. 订阅链接路径编码（第一轮修复引入的边界回归）

第一轮把 `encodeURIComponent` 换成 `encodeURI` 以保留 `/`，但 `encodeURI` **不转义 `& # ?`**：
`WS_PATH=/a&b` 会生成 `path=/a&b`，把查询串截断（客户端解析出错误的 path）。
改为**段级编码**（`split("/")` 后逐段 `encodeURIComponent`）：既保留 `/`，又正确转义 `& # ?` 与空格。

**验证**：`test/subpath.test.js` 新增用例，用 `URLSearchParams` 反解 `path` 必须等于原值。

### 13. 工具页（public/index.html）两个真实问题

- **UUID 用 `Math.random()` 生成**：这个 UUID 直接当作 vless 凭据（共享密钥），
  `Math.random` 的状态可从少量输出反推，凭据可预测。改为 `crypto.getRandomValues` 拼 v4
  （`crypto.randomUUID` 仅在安全上下文可用，而本页常经 `http://IP:3000` 访问，所以不能用它）。
- **`navigator.clipboard` 在 http 页面是 undefined**：本页典型访问方式就是 `http://IP:3000`
  （非安全上下文），直接调用会抛 `TypeError`，复制按钮**静默失效**且没有任何提示。
  新增 `writeClipboard()`：优先 Clipboard API，不可用/失败时回退 `textarea + execCommand`，
  仍失败给出明确 toast。

### 14. 账期时区（第一轮实现细节）

`monthKeyOf` 原用 UTC 计算账期；官方 agent 用 Go 的 `time.Now()`（本机时区）。
已改为按本机时区计算，并在测试里用 `TZ=Pacific/Kiritimati` / `TZ=Pacific/Midway` 子进程验证
同一时刻在不同时区确实落在不同账期。

## 未改动 / 已知取舍

- **`/health` 仍不鉴权**（会返回隧道域名）：平台健康检查依赖它，未加保护；
  已在 README 里明确提示，需要时请在反向代理层加白名单。
- **`BIN_TTL_SEC` 默认 120s 会删除本地二进制**：此后每次重启都要重新下载（GitHub 不可达时无法自动恢复）。
  Docker 镜像已设 `BIN_TTL_SEC=0`；源码部署若网络不稳，建议显式设 0。
- **`/sub` 在域名未就绪时返回占位行**（`# link domain not ready yet`）：保持原有行为。
- WSS 帧编解码、握手校验、`ack.nextWssReportAfterMs` 夹逼、Runner 意图状态机、
  `checkSubAuth` 的 `timingSafeEqual` 等经审查确认正确的部分**未做改动**。
- Go 侧本次只改了 `main.go` 的 ECN 环境变量处理；沙箱无 Go 工具链，未重新编译验证
  （CI 的 `go build` + smoke 会覆盖）。
