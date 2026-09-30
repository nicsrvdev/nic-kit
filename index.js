// ================= 配置区（环境变量优先，其次本区，最后代码默认值） =================
// 面板能设环境变量就用环境变量；否则直接改这里再上传。留空 "" = 默认/关闭。
const USER_CONFIG = {
  // ---- 基础 ----
  UUID: "",        // 必填：vless 的 UUID，例如 "11111111-2222-4333-8444-555555555555"
  PORT: "",        // HTTP 端口（/health /sub /kit /），默认 3000；PaaS 会自动注入 PORT 时不用填
  WS_PATH: "",     // 链路 ws 路径，默认 /link
  VLESS_PORT: "",  // 内部转发端口，niccore 听 127.0.0.1、niclink 转发到它；默认18000，被占用才改

  // ---- 链路 ----
  AT_LINK_MODE: "",    // token=固定域名 temp=临时域名，默认 temp
  AT_LINK_TOKEN: "",   // AT_LINK_MODE=token 时必填：链路 Token
  AT_LINK_DOMAIN: "",  // AT_LINK_MODE=token 时必填：已绑定的域名
  AT_LINK_PROTOCOL: "", // edge 传输协议：quic|http2|auto，默认 quic；QUIC 被 QoS 时填 http2 逃生
  AT_LINK_CONNECTIONS: "", // edge 连接数：默认 4（上游 cloudflared 默认）；填 1 最省内存
  OPT_DOMAIN: "",   // vless-link 出口地址（直连CF优选IP）；默认 staticdelivery.nexusmods.com

  // ---- 直连 UDP（可选：只填端口即开启） ----
  HY2_PORT: "",     // 填了端口就启动直连 UDP（如 "4443"）；留空则关闭；其它参数自动生成
  HY2_PASSWORD: "", // 可选：留空则用 UUID 自动派生；如需固定密码再填
  HY2_OBFS: "",     // 可选：salamander 混淆密码，不用可留空
  HY2_HOST: "",     // 可选：留空则自动获取公网 IPv4；有固定域名/IP 再填

  // ---- 直连 TCP+TLS（可选：只填端口即开启，与直连 UDP 处理方式相同） ----
  VLESS_DIRECT_PORT: "",  // 填了端口就启动直连 TCP（如 "4433"）；留空则关闭
  VLESS_DIRECT_HOST: "",  // 可选：留空则自动获取公网 IPv4；有固定域名/IP 再填
  VLESS_DIRECT_SNI: "",   // 直连 sni，默认 www.nvidia.com；自签证书，客户端需跳过证书验证

  // ---- Nezha 探针（SERVER + KEY 配齐才启用） ----
  NEZHA_SERVER: "",  // 面板地址带端口，例如 "dns.example.com:5555"
  NEZHA_KEY: "",     // 客户端密钥
  NEZHA_TLS: "",     // 是否 TLS，默认 1；填 0 关闭
  NEZHA_UUID: "",    // 留空则复用上面的 UUID；如需 agent 自动生成请填 auto
  NEZHA_ALLOW_COMMAND: "",  // 默认 0=禁用远程命令；填 1 才允许

  // ---- Komari 探针（ENDPOINT + TOKEN 配齐才启用） ----
  KOMARI_ENDPOINT: "",  // 面板地址，例如 "https://panel.example.com"
  KOMARI_TOKEN: "",     // agent token
  KOMARI_INTERVAL: "",  // 采集间隔秒，默认 3
  KOMARI_ALLOW_SSH: "", // 默认 0=禁用 web ssh；填 1 才允许

  // ---- CF 探针（URL + SECRET 配齐即启用，NODE_ID 留空则复用 UUID，Node 内置上报） ----
  CF_WORKER_URL: "",  // Worker 地址，例如 "https://probe.example.com"
  CF_SECRET: "",      // 上报密钥（= Worker 的 API_SECRET）
  CF_NODE_ID: "",     // 服务器 ID，留空则复用上面的 UUID
  CF_INTERVAL: "",    // 上报间隔秒，默认 60，最小 10
  CF_PING_CT: "",     // 可选测速节点，host 或 host:port
  CF_PING_CU: "",
  CF_PING_CM: "",
  CF_PING_BGP: "",
  CF_IFACE: "",       // 可选指定网卡，逗号分隔，例如 "eth0"
  CF_CONNECTION_MODE: "",  // auto=优先WSS实时上报+POST兜底 http=仅POST；默认 auto

  // ---- 输出 ----
  KIT_FILE: "",  // 节点信息落盘，例如 "kit.txt"；留空默认写入 .npm/kit.txt；支持绝对/相对路径
  BIN_TTL_SEC: "",  // 本地二进制存活秒数：启动 120s 后删除已加载进内存的二进制文件；0=关闭；默认 120
  NODE_PREFIX: "",  // 节点名称前缀，默认自动识别国家（如 JP）；填 custom 则用 IP 后缀；填其它值则直接用该值

  // ---- 运行期 ----
  BIN_DIR: "",              // 二进制目录，默认 ./.bin；只读环境改 "/tmp/.bin"
  GH_PROXY: "",             // GitHub 代理前缀（无尾斜杠）
  GH_TOKEN: "",             // 可选，提高 GitHub API 限流额度
  NICCORE_VERSION: "",      // niccore 版本，默认跟随 FALLBACK（如 niccore-v1.14.1-nic）；填 latest 自动取最新 release
  NICLINK_VERSION: "",      // niclink 版本，默认跟随 FALLBACK（如 niclink-v2026.9.1-nic）；填 latest 自动取最新 release
  NEZHA_VERSION: "",        // 默认 latest
  KOMARI_VERSION: "",       // 默认 latest
  LOG_LEVEL: "",            // debug/info/warn/error，默认 warn
};
// ================= 配置区结束，以下为程序代码 =================
import { execFile, spawn, spawnSync } from "node:child_process";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { connect as tlsConnect } from "node:tls";
import { createSocket } from "node:dgram";
import { promises as fs, createWriteStream } from "node:fs";
import { createServer } from "node:http";
import { createConnection, createServer as createNetServer } from "node:net";
import { arch, cpus, freemem, hostname, platform, totalmem } from "node:os";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

// ---- src/logger.js ----
const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3, off: 4 };

// 日志脱敏：协议名不落日志，所有 logger 出口统一过一遍。
// 全大写 ENV_VAR 风格 token（如 HY2_PORT/VLESS_PORT）原样保留，否则警告没法定位变量。
function cleanLog(s) {
  const str = String(s);
  const kept = [];
  const protected_ = str.replace(/[A-Z][A-Z0-9_]{2,}/g, (m) => {
    kept.push(m);
    return `\0${kept.length - 1}\0`;
  });
  const cleaned = protected_
    .replace(/hysteria2/gi, "direct-udp")
    .replace(/(?<![A-Za-z])hy2(?![A-Za-z0-9])/gi, "direct-udp")
    .replace(/vless-direct/gi, "direct-tcp")
    .replace(/vless-link/gi, "link")
    .replace(/(?<![A-Za-z])vless(?![A-Za-z0-9])/gi, "v")
    .replace(/argotunnel/gi, "edgetunnel")
    .replace(/(?<![A-Za-z])argo(?![A-Za-z0-9])/gi, "edge");
  return cleaned.replace(/\0(\d+)\0/g, (_, i) => kept[Number(i)]);
}
function cleanArg(a) {
  if (typeof a === "string") return cleanLog(a);
  if (Array.isArray(a)) return a.map(cleanArg);
  if (a && typeof a === "object") {
    const o = {};
    for (const [k, v] of Object.entries(a)) o[cleanKey(k)] = cleanArg(v);
    return o;
  }
  return a;
}

// 键名中性化：内部键名不含协议词，debug 配置转储也不落地。
function cleanKey(k) {
  return String(k)
    .replace(/hysteria2/gi, "direct_udp")
    .replace(/hy2/gi, "direct_udp")
    .replace(/vless-direct/gi, "direct_tcp")
    .replace(/vless-link/gi, "link")
    .replace(/(?<![A-Za-z])vless(?![A-Za-z0-9])/gi, "v")
    .replace(/argotunnel/gi, "edgetunnel")
    .replace(/(?<![A-Za-z])argo(?![A-Za-z0-9])/gi, "edge");
}

let level = "warn";

function setLogLevel(l) {
  if (LOG_LEVELS[l] !== undefined) level = l;
}

function log(l, ...args) {
  if (LOG_LEVELS[l] >= LOG_LEVELS[level]) {
    const ts = new Date().toISOString();
    console.log(`[${ts}] [${l.toUpperCase()}]`, ...cleanArg(args));
  }
}

// 状态行：实例启停/失败等关键事件，LOG_LEVEL=off 时也照常输出（面板只看这几行）。
function statusLine(msg) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] [STATUS] ${cleanLog(msg)}`);
}

const logger = {
  debug: (...a) => log("debug", ...a),
  info: (...a) => log("info", ...a),
  warn: (...a) => log("warn", ...a),
  error: (...a) => log("error", ...a),
  status: (...a) => statusLine(a.join(" ")),
};


// ---- src/config.js ----
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function str(name, def = "") {
  // 优先级：环境变量 > 文件内置 > 默认值
  const v = process.env[name];
  if (v !== undefined && v !== "") return String(v).trim();
  const fromUser = USER_CONFIG[name];
  if (fromUser !== undefined && String(fromUser).trim() !== "") return String(fromUser).trim();
  return def;
}

function int(name, def) {
  // 优先级：环境变量 > 文件内置 > 默认值
  const raw = process.env[name];
  const pick = (raw !== undefined && raw !== "")
    ? String(raw).trim()
    : ((USER_CONFIG[name] !== undefined && String(USER_CONFIG[name]).trim() !== "")
      ? String(USER_CONFIG[name]).trim()
      : undefined);
  if (pick === undefined || pick === "") return def;
  const n = parseInt(pick, 10);
  if (Number.isNaN(n)) throw new Error(`config ${name} must be an integer, got: ${pick}`);
  return n;
}

function bool01(name, def) {
  // 优先级：环境变量 > 文件内置 > 默认值
  const raw = process.env[name];
  const pick = (raw !== undefined && raw !== "")
    ? String(raw).trim()
    : ((USER_CONFIG[name] !== undefined && String(USER_CONFIG[name]).trim() !== "")
      ? String(USER_CONFIG[name]).trim()
      : undefined);
  if (pick === undefined || pick === "") return def;
  const v = String(pick).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(v)) return true;
  if (["0", "false", "no", "off"].includes(v)) return false;
  throw new Error(`config ${name} must be 0/1, got: ${pick}`);
}

function normalizeWsPath(p) {
  if (!p.startsWith("/")) p = "/" + p;
  return p.replace(/\/+$/, "") || "/";
}

function loadConfig() {
  const cfg = {
    port: int("PORT", 3000),
    uuid: str("UUID", ""),
    wsPath: normalizeWsPath(str("WS_PATH", "/link")),
    corePort: int("VLESS_PORT", 18000),

    atLinkMode: str("AT_LINK_MODE", "temp").toLowerCase(),
    atLinkToken: str("AT_LINK_TOKEN", ""),
    atLinkDomain: str("AT_LINK_DOMAIN", ""),
    atLinkProtocol: str("AT_LINK_PROTOCOL", "quic").toLowerCase(),
    atLinkConnections: int("AT_LINK_CONNECTIONS", 4),
    optDomain: str("OPT_DOMAIN", "staticdelivery.nexusmods.com"),

    directUdpPortRaw: str("HY2_PORT", ""),
    directUdpPassword: str("HY2_PASSWORD", ""),
    directUdpObfs: str("HY2_OBFS", ""),
    directUdpHost: str("HY2_HOST", ""),

    directTcpPortRaw: str("VLESS_DIRECT_PORT", ""),
    directTcpHost: str("VLESS_DIRECT_HOST", ""),
    directTcpSni: str("VLESS_DIRECT_SNI", "www.nvidia.com"),

    binDir: str("BIN_DIR", "./.bin"),
    ghProxy: str("GH_PROXY", "").replace(/\/+$/, ""),
    ghToken: str("GH_TOKEN", ""),
    niccoreVersion: str("NICCORE_VERSION", ""),
    niclinkVersion: str("NICLINK_VERSION", ""),
    nezhaVersion: str("NEZHA_VERSION", "latest"),
    komariVersion: str("KOMARI_VERSION", "latest"),
    logLevel: str("LOG_LEVEL", "warn").toLowerCase(),

    // --- nezha (enabled only when SERVER + KEY both present) ---
    nezhaServer: str("NEZHA_SERVER", ""),
    nezhaKey: str("NEZHA_KEY", ""),
    nezhaTls: bool01("NEZHA_TLS", true),
    nezhaUuid: str("NEZHA_UUID", ""),
    nezhaAllowCommand: bool01("NEZHA_ALLOW_COMMAND", false),

    // --- komari (enabled only when ENDPOINT + TOKEN both present) ---
    komariEndpoint: str("KOMARI_ENDPOINT", "").replace(/\/+$/, ""),
    komariToken: str("KOMARI_TOKEN", ""),
    komariInterval: int("KOMARI_INTERVAL", 3),
    komariAllowSsh: bool01("KOMARI_ALLOW_SSH", false),

    // --- cf probe, node built-in (URL + SECRET 配齐即启用，NODE_ID 留空复用 UUID) ---
    // 测速节点/网卡/上报间隔：本地变量是初始值，面板动态下发（custom_ct/cu/cm/bd, node_1..4,
    // interface, report_interval 等）到达后以服务端为准（对齐官方 cfsm-agent）。
    cfWorkerUrl: str("CF_WORKER_URL", "").replace(/\/+$/, ""),
    cfSecret: str("CF_SECRET", ""),
    cfNodeId: str("CF_NODE_ID", ""),
    cfInterval: int("CF_INTERVAL", 60),
    cfPingCt: str("CF_PING_CT", ""),
    cfPingCu: str("CF_PING_CU", ""),
    cfPingCm: str("CF_PING_CM", ""),
    cfPingBgp: str("CF_PING_BGP", ""),
    cfNode1: str("CF_NODE_1", ""),
    cfNode2: str("CF_NODE_2", ""),
    cfNode3: str("CF_NODE_3", ""),
    cfNode4: str("CF_NODE_4", ""),
    cfIface: str("CF_IFACE", ""),
    cfPingMode: str("CF_PING_MODE", "tcp").toLowerCase(),
    cfConnectionMode: str("CF_CONNECTION_MODE", "auto").toLowerCase(),

    // --- kit.txt 落盘：留空默认写 .npm/kit.txt（npm 缓存旁，源码上传也不怕丢） ---
    kitFile: str("KIT_FILE", ".npm/kit.txt"),
    binTtlSec: int("BIN_TTL_SEC", 120),
    nodePrefix: str("NODE_PREFIX", ""),
    // 订阅鉴权：留空=不鉴权（默认行为不变）；设置后 /sub、/kit 需 ?token= 或 Authorization: Bearer
    subToken: str("SUB_TOKEN", ""),
  };

  cfg.nezhaEnabled = cfg.nezhaServer !== "" && cfg.nezhaKey !== "";
  cfg.komariEnabled = cfg.komariEndpoint !== "" && cfg.komariToken !== "";
  // UUID 复用：探针 ID 默认用主 UUID，省得填三遍。
  // NEZHA_UUID=auto 时显式留空，让 agent 自己生成；CF_NODE_ID 留空则用主 UUID。
  if (cfg.nezhaUuid === "" || cfg.nezhaUuid.toLowerCase() === "auto") {
    cfg.nezhaUuidAuto = cfg.nezhaUuid.toLowerCase() === "auto";
    cfg.nezhaUuid = cfg.nezhaUuidAuto ? "" : cfg.uuid;
  }
  if (cfg.cfNodeId === "") cfg.cfNodeId = cfg.uuid;
  cfg.cfEnabled =
    cfg.cfWorkerUrl !== "" && cfg.cfSecret !== "" && cfg.cfNodeId !== "";
  const warnings = [];
  if (!["auto", "http"].includes(cfg.cfConnectionMode)) {
    warnings.push(`CF_CONNECTION_MODE unknown (${cfg.cfConnectionMode}), using auto`);
    cfg.cfConnectionMode = "auto";
  }

  if (!cfg.nezhaEnabled && (cfg.nezhaServer || cfg.nezhaKey)) {
    warnings.push("NEZHA_SERVER/NEZHA_KEY incomplete, nezha disabled");
  }
  if (!cfg.komariEnabled && (cfg.komariEndpoint || cfg.komariToken)) {
    warnings.push("KOMARI_ENDPOINT/KOMARI_TOKEN incomplete, komari disabled");
  }
  if (!cfg.cfEnabled && (cfg.cfWorkerUrl || cfg.cfSecret || str("CF_NODE_ID", ""))) {
    warnings.push("CF_WORKER_URL/CF_SECRET incomplete, cf probe disabled");
  }
  cfg.warnings = warnings;

  setLogLevel(LOG_LEVEL_OK(cfg.logLevel) ? cfg.logLevel : "warn");

  const errors = [];

  if (!cfg.uuid) {
    errors.push("UUID is required");
  } else if (!UUID_RE.test(cfg.uuid)) {
    errors.push(`UUID format invalid: ${cfg.uuid}`);
  }

  if (!["token", "temp"].includes(cfg.atLinkMode)) {
    errors.push(`AT_LINK_MODE must be token|temp, got: ${cfg.atLinkMode}`);
  }
  // 上游合法值只有 quic|http2|auto（auto=先 QUIC 不通回退 HTTP/2）；非法直接报错，
  // 不静默回退——协议选错表现为连不上，fail-fast 比 warn 更易定位。
  if (!["quic", "http2", "auto"].includes(cfg.atLinkProtocol)) {
    errors.push(`AT_LINK_PROTOCOL must be quic|http2|auto, got: ${cfg.atLinkProtocol}`);
  }
  if (!Number.isInteger(cfg.atLinkConnections) || cfg.atLinkConnections < 1 || cfg.atLinkConnections > 16) {
    errors.push(`AT_LINK_CONNECTIONS must be 1-16, got: ${cfg.atLinkConnections}`);
  }
  if (cfg.atLinkMode === "token") {
    if (!cfg.atLinkToken) errors.push("AT_LINK_MODE=token requires AT_LINK_TOKEN");
    if (!cfg.atLinkDomain) errors.push("AT_LINK_MODE=token requires AT_LINK_DOMAIN");
  }

  if (!Number.isInteger(cfg.port) || cfg.port < 1 || cfg.port > 65535) {
    errors.push(`PORT must be 1-65535, got: ${cfg.port}`);
  }
  if (!Number.isInteger(cfg.corePort) || cfg.corePort < 1 || cfg.corePort > 65535) {
    errors.push(`VLESS_PORT must be 1-65535, got: ${cfg.corePort}`);
  }
  // HY2/VLESS直连：只填 PORT 即开启；密码留空用 UUID 派生（各协议盐不同）；
  // HOST 留空启动后自动获取公网 IP。端口非法只警告降级，不断线。
  // 兼容旧变量：HY2_ENABLED=1 且 HY2_PORT 为空时视为开启（端口 4443）。
  function derivePw(salt) {
    // 纯 JS hash（无 crypto 依赖，config 段可独立求值）：cyrb53 取 16 hex。
    // 同一 UUID 重启后密码不变，kit.txt 链接长期有效。
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    const s = `${salt}:${cfg.uuid}`;
    for (let i = 0; i < s.length; i++) {
      const ch = s.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return ((h2 >>> 0).toString(16).padStart(8, "0") + (h1 >>> 0).toString(16).padStart(8, "0")).slice(0, 16);
  }
  function portOn(raw, label) {
    const env = (raw || "").trim();
    if (env === "") return { on: false, port: 0 };
    const parsed = parseInt(env, 10);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
      warnings.push(`${label} invalid (${env}), disabled`);
      return { on: false, port: 0 };
    }
    return { on: true, port: parsed };
  }
  const directUdpPortEnv = (cfg.directUdpPortRaw || "").trim();
  const hy2LegacyOn = bool01("HY2_ENABLED", false);
  if (directUdpPortEnv !== "" || hy2LegacyOn) {
    const r = portOn(directUdpPortEnv || "4443", "HY2_PORT");
    cfg.directUdpEnabled = r.on;
    cfg.directUdpPort = r.on ? r.port : 4443;
  } else {
    cfg.directUdpEnabled = false;
    cfg.directUdpPort = 4443;
  }
  delete cfg.directUdpPortRaw;
  if (!cfg.directUdpPassword) {
    cfg.directUdpPassword = derivePw("hy2");
    cfg.directUdpPasswordAuto = true;
  }
  // VLESS 直连
  {
    const r = portOn((cfg.directTcpPortRaw || "").trim(), "VLESS_DIRECT_PORT");
    cfg.directTcpEnabled = r.on;
    cfg.directTcpPort = r.port;
  }
  delete cfg.directTcpPortRaw;
  if (cfg.komariEnabled) {
    if (!/^https?:\/\//.test(cfg.komariEndpoint)) {
      errors.push(`KOMARI_ENDPOINT must start with http(s)://, got: ${cfg.komariEndpoint}`);
    }
    if (!Number.isInteger(cfg.komariInterval) || cfg.komariInterval < 1) {
      errors.push(`KOMARI_INTERVAL must be >= 1, got: ${cfg.komariInterval}`);
    }
  }
  if (cfg.cfEnabled) {
    if (!/^https?:\/\//.test(cfg.cfWorkerUrl)) {
      errors.push(`CF_WORKER_URL must start with http(s)://, got: ${cfg.cfWorkerUrl}`);
    }
    if (!Number.isInteger(cfg.cfInterval) || cfg.cfInterval < 10) {
      errors.push(`CF_INTERVAL must be >= 10, got: ${cfg.cfInterval}`);
    }
    if (!["tcp", "icmp"].includes(cfg.cfPingMode)) {
      warnings.push(`CF_PING_MODE unknown (${cfg.cfPingMode}), using tcp`);
      cfg.cfPingMode = "tcp";
    }
  }

  if (errors.length > 0) {
    const err = new Error("Invalid config:\n- " + errors.join("\n- "));
    err.code = "ECONFIG";
    throw err;
  }

  logger.debug("config loaded", redact(cfg));
  for (const w of warnings) logger.warn(w);
  return cfg;
}

function LOG_LEVEL_OK(l) {
  return ["debug", "info", "warn", "error", "off"].includes(l);
}

// 所有密钥字段必须在这里掩码（debug 日志会整体转储 cfg）。
// 新增密钥类配置项时，务必同步补一行，否则会明文落日志。
const SECRET_KEYS = [
  "atLinkToken",
  "directUdpPassword",
  "directUdpObfs",
  "nezhaKey",
  "komariToken",
  "cfSecret",
  "ghToken",
  "subToken",
];
function redact(cfg) {
  const out = { ...cfg };
  const uuid = cfg.uuid;
  const maskId = (v) => (v ? String(v).slice(0, 8) + "-****" : v);
  if (out.uuid) out.uuid = maskId(out.uuid);
  // 派生 ID（探针节点 ID / nezha UUID 默认复用主 UUID）同样截断，
  // 否则 uuid 那行的掩码会被另一个字段原样还原
  for (const k of ["cfNodeId", "nezhaUuid"]) {
    if (out[k] && uuid && out[k] === uuid) out[k] = maskId(out[k]);
  }
  for (const k of SECRET_KEYS) {
    if (out[k]) out[k] = "***";
  }
  return out;
}


// ---- src/downloader.js ----
const FALLBACK = {
  niccore: "niccore-v1.14.1-nic",
  niclink: "niclink-v2026.9.1-nic",
  nezha: "v2.3.5",
  komari: "1.5.11",
};
// 自编译二进制仓库（与本仓库同 owner，release 里放 niccore-/niclink- 开头 asset）
const NIC_REPO = "nicsrvdev/nic-kit";

/** Map node arch to the naming used by nezha/komari assets. */
function goArch() {
  const a = detectArch(); // amd64 | arm64
  return a;
}

function detectArch() {
  const a = process.arch;
  if (a === "x64") return "amd64";
  if (a === "arm64") return "arm64";
  throw new Error(`unsupported arch: ${a} (only amd64/arm64)`);
}

function withProxy(url, ghProxy) {
  if (ghProxy) return `${ghProxy}/${url}`;
  return url;
}

async function resolveTag(repo, pinned, fallback, ghToken = "") {
  if (pinned && pinned !== "latest" && pinned !== "") return pinned;
  if (pinned === "") return fallback;
  try {
    const headers = { "User-Agent": "nic-kit", Accept: "application/vnd.github+json" };
    if (ghToken) headers.Authorization = `Bearer ${ghToken}`;
    const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
      headers,
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`github api ${res.status}`);
    const data = await res.json();
    if (!data.tag_name) throw new Error("no tag_name");
    logger.info(`resolved latest ${repo}: ${data.tag_name}`);
    return data.tag_name;
  } catch (e) {
    logger.warn(`resolve latest ${repo} failed (${e.message}), use fallback ${fallback}`);
    return fallback;
  }
}

// 可执行文件探测结果缓存（进程生命周期内不变；避免每次调用都 fork 一个 sh）
const __haveCache = new Map();
function have(cmd) {
  if (__haveCache.has(cmd)) return __haveCache.get(cmd);
  const ok = spawnSync("sh", ["-c", `command -v ${cmd} >/dev/null 2>&1`], { stdio: "ignore" }).status === 0;
  __haveCache.set(cmd, ok);
  return ok;
}

/** 异步 execFile 包装：不阻塞事件循环（下载/解压/自检等外部命令统一走这里）。 */
function execFileAsync(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    execFile(
      cmd,
      args,
      { timeout: opts.timeout || 60000, maxBuffer: 8 * 1024 * 1024, encoding: "utf8", ...opts },
      (err, stdout, stderr) => {
        const out = `${stdout || ""}${stderr || ""}`;
        if (err && (err.code === "ENOENT" || err.code === "EACCES")) {
          resolve({ ok: false, missing: true, code: null, out: out || String(err.message || err), error: err });
          return;
        }
        resolve({
          ok: !err,
          missing: false,
          code: err ? (typeof err.code === "number" ? err.code : 1) : 0,
          out: out || (err ? String(err.message || err) : ""),
          error: err || null,
        });
      }
    );
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** 临时目录：TMPDIR > BIN_DIR/tmp（避开小 /tmp） */
async function workTmpDir(cfg) {
  const base = (process.env.TMPDIR && process.env.TMPDIR.trim())
    ? process.env.TMPDIR.trim()
    : join(cfg.binDir, "tmp");
  await fs.mkdir(base, { recursive: true });
  return base;
}

// 下载阶段状态：health 在二进制就绪前上报进度，避免面板误判掉线
const dlState = {
  phase: "starting", // starting | downloading | ready | failed
  detail: "",
  startedAt: Date.now(),
};
function dlStatus() {
  return {
    download_phase: dlState.phase,
    download_detail: dlState.detail,
    download_elapsed_s: Math.floor((Date.now() - dlState.startedAt) / 1000),
  };
}
function dlMark(phase, detail = "") {
  dlState.phase = phase;
  dlState.detail = detail;
}

/** tmp 目录残留清理：只删本程序命名规范的临时文件，不碰其它 */
async function cleanTmpLeftovers(cfg) {
  let dir;
  try {
    dir = await workTmpDir(cfg);
  } catch {
    return 0;
  }
  let entries;
  try {
    entries = await fs.readdir(dir);
  } catch {
    return 0;
  }
  let removed = 0;
  for (const name of entries) {
    // 命名规范：dl-<ts>-<rand> / nezha-agent_linux_<arch>.zip / nezha-<tag>-<arch>-<ts> / komari dl-*
    if (!/^(dl-\d+-\d+|nezha-agent_linux_.*\.zip|nezha-.*-\d+$|komari-dl-\d+-\d+)$/.test(name)) continue;
    const p = join(dir, name);
    try {
      const st = await fs.stat(p);
      // 正在写入的文件（5 分钟内修改过）跳过，避免误删并发下载
      if (Date.now() - st.mtimeMs < 5 * 60 * 1000) continue;
      await fs.rm(p, { recursive: true, force: true });
      removed++;
    } catch {}
  }
  if (removed > 0) logger.info(`tmp leftovers cleaned: ${removed} in ${dir}`);
  return removed;
}

/** 二进制中性名：niccore, niclink, nezha→sys-monitor, komari→node-monitor */
const BIN_NAMES = {
  niccore: "niccore",
  niclink: "niclink",
  nezha: "sys-monitor",
  komari: "node-monitor",
};
function binPath(cfg, key) {
  return join(cfg.binDir, BIN_NAMES[key]);
}

// 本次启动新下载的二进制注册表（TTL 删除只删这些，不碰复用的旧文件）
const __freshBins = [];
function markFreshBinary(p) {
  if (p && !__freshBins.includes(p)) __freshBins.push(p);
}

/**
 * 本地二进制 TTL 清理：启动 binTtlSec 秒后，删除本次下载的二进制文件。
 * 原理：子进程已通过 spawn 加载进内存（Linux 执行中的 ETXTBSY 文件 unlink 后进程不受影响，
 * 新 spawn 会失败——所以只删"本次下载"的，复用旧文件的因为重启会重新下载而不删；
 * 且 Runner 30 次重启上限内进程早已常驻）。0=关闭。失败只告警。
 */
function scheduleBinaryTtl(cfg, runner) {
  const ttl = cfg.binTtlSec;
  if (!ttl || ttl <= 0) return;
  if (!__freshBins.length) {
    logger.debug("binary ttl: nothing freshly downloaded, skipping");
    return;
  }
  logger.info(`binary ttl: will remove ${__freshBins.length} fresh binaries in ${ttl}s`);
  const t = setTimeout(async () => {
    for (const f of [...__freshBins]) {
      try {
        await fs.rm(f, { force: true });
        logger.warn(`[OK] binary ttl removed: ${f}`);
      } catch (e) {
        logger.warn(`binary ttl remove failed (${f}): ${e.message}`);
      }
    }
    __freshBins.length = 0;
  }, ttl * 1000);
  if (t.unref) t.unref();
}

/**
 * 下载文件到 dest。
 * 全程异步（fetch + 流式写盘）：不阻塞事件循环，下载期间 /health 正常应答、
 * SIGTERM 能及时处理，多个下载也能真正并发。
 * 落盘策略：先写 dest 同目录的临时文件 .part-*，大小校验通过后原子 rename 覆盖 dest。
 * 这样进程被强杀/网络中断都不会在 dest 留下半截文件（半截二进制会被当成有效文件，
 * 导致子进程反复快速崩溃、退避到 30 次上限后彻底放弃，见 runner 的快速失败处理）。
 */
async function downloadFile(url, dest, opts = {}) {
  const minSize = opts.minSize || 0;
  const retries = Number.isInteger(opts.retries) ? opts.retries : 2;
  const timeoutMs = opts.timeoutMs || 300000;
  // 确保 dest 的父目录存在
  await fs.mkdir(dirname(dest), { recursive: true }).catch(() => {});
  // 清掉上次失败的残留（含旧版本可能留下的半截文件）
  await fs.rm(dest, { force: true }).catch(() => {});
  let lastErr = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const part = `${dest}.part-${process.pid}-${randomBytes(3).toString("hex")}`;
    try {
      await fetchToFile(url, part, timeoutMs);
      // 大小校验放在 rename 之前：不合格的临时文件直接丢弃，dest 永远不会出现坏文件
      if (minSize > 0) {
        const st = await fs.stat(part).catch(() => null);
        const size = st ? st.size : 0;
        if (size < minSize) {
          throw new Error(`download incomplete: ${url} got ${size} bytes, expect >= ${minSize}`);
        }
      }
      if (opts.mode) await fs.chmod(part, opts.mode);
      await fs.rename(part, dest);
      lastErr = null;
      break;
    } catch (e) {
      lastErr = e;
      await fs.rm(part, { force: true }).catch(() => {});
      if (attempt < retries) {
        const delay = 1000 * Math.pow(2, attempt);
        logger.warn(`download failed (${e.message}), retry ${attempt + 1}/${retries} in ${delay}ms`);
        await sleep(delay);
      }
    }
  }
  if (lastErr) throw lastErr;
}

/** 单次下载：流式落盘（大文件不进内存），失败时删掉半截文件。 */
async function fetchToFile(url, dest, timeoutMs) {
  const res = await fetch(url, {
    headers: { "User-Agent": "nic-kit" },
    redirect: "follow",
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`fetch ${res.status}: ${url}`);
  const ws = createWriteStream(dest);
  try {
    if (!res.body) {
      ws.end();
      await new Promise((resolve, reject) => {
        ws.on("finish", resolve);
        ws.on("error", reject);
      });
      return;
    }
    await pipeline(Readable.fromWeb(res.body), ws);
  } catch (e) {
    try { ws.destroy(); } catch {}
    throw e;
  }
}

async function ensureNiccore(cfg) {
  const arch = detectArch();
  const dest = binPath(cfg, "niccore");
  if (await usableBinary(dest)) {
    logger.info(`niccore exists: ${dest}`);
    return dest;
  }
  const tag = await resolveTag(NIC_REPO, cfg.niccoreVersion, FALLBACK.niccore, cfg.ghToken);
  // 自编译静态二进制：niccore-{tag}-linux-{arch}（plain binary，无需 tar）
  const asset = `niccore-${tag}-linux-${arch}`;
  const url = withProxy(
    `https://github.com/${NIC_REPO}/releases/download/${tag}/${asset}`,
    cfg.ghProxy
  );
  logger.info(`downloading niccore ${tag} (${arch})`);
  // 直接下到 dest：downloadFile 先写 .part-* 再原子 rename，不存在半截文件，
  // 因此不再需要"下到 tmp → copyFile → chmod"这一圈（省一次 20MB+ 的拷贝与双倍磁盘占用）
  await downloadFile(url, dest, { minSize: 1024 * 1024, mode: 0o755 });
  markFreshBinary(dest);
  logger.info(`niccore ready: ${dest}`);
  return dest;
}

async function ensureNiclink(cfg) {
  const arch = detectArch();
  const dest = binPath(cfg, "niclink");
  if (await usableBinary(dest)) {
    logger.info(`niclink exists: ${dest}`);
    return dest;
  }
  const tag = await resolveTag(NIC_REPO, cfg.niclinkVersion, FALLBACK.niclink, cfg.ghToken);
  // 自编译静态二进制：niclink-{tag}-linux-{arch}（plain binary）
  const asset = `niclink-${tag}-linux-${arch}`;
  const url = withProxy(
    `https://github.com/${NIC_REPO}/releases/download/${tag}/${asset}`,
    cfg.ghProxy
  );
  logger.info(`downloading niclink ${tag} (${arch})`);
  await downloadFile(url, dest, { minSize: 1024 * 1024, mode: 0o755 });
  markFreshBinary(dest);
  logger.info(`niclink ready: ${dest}`);
  return dest;
}

async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * 二进制可用性判断：不只是"文件存在"，还要看大小是否合理。
 * 半截下载（进程被强杀/镜像返回截断内容）留下的文件会被当成有效二进制，
 * 子进程随即快速崩溃并退避到 30 次上限后放弃，实例再也不会自愈。
 * 真实 niccore/niclink/nezha/komari 都是 5MB+ 的静态二进制，低于下限即视为损坏并重新下载。
 */
const MIN_SANE_BIN = 512 * 1024;
async function usableBinary(dest) {
  const st = await fs.stat(dest).catch(() => null);
  if (!st) return false;
  if (st.size < MIN_SANE_BIN) {
    logger.warn(`binary looks truncated (${st.size} bytes < ${MIN_SANE_BIN}): ${dest}, re-downloading`);
    await fs.rm(dest, { force: true }).catch(() => {});
    return false;
  }
  return true;
}

/** 清理上次遗留的下载临时文件（正在写入的跳过），避免 .bin 目录堆积 .part-* */
async function sweepStalePartials(cfg) {
  let entries = [];
  try {
    entries = await fs.readdir(cfg.binDir);
  } catch {
    return 0;
  }
  let removed = 0;
  for (const name of entries) {
    if (!/\.part-\d+-[0-9a-f]+$/.test(name)) continue;
    const p = join(cfg.binDir, name);
    try {
      const st = await fs.stat(p);
      if (Date.now() - st.mtimeMs < 10 * 60 * 1000) continue; // 可能仍在下载
      await fs.rm(p, { force: true });
      removed++;
    } catch {}
  }
  if (removed > 0) logger.info(`stale download leftovers cleaned: ${removed} in ${cfg.binDir}`);
  return removed;
}

async function findFile(dir, name) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isFile() && e.name === name) return p;
    if (e.isDirectory()) {
      const f = await findFile(p, name);
      if (f) return f;
    }
  }
  return null;
}

/** Exposed for tests: build asset URLs without network. */
function niccoreAssetUrl(tag, arch, ghProxy) {
  return withProxy(`https://github.com/${NIC_REPO}/releases/download/${tag}/niccore-${tag}-linux-${arch}`, ghProxy);
}

function niclinkAssetUrl(tag, arch, ghProxy) {
  return withProxy(`https://github.com/${NIC_REPO}/releases/download/${tag}/niclink-${tag}-linux-${arch}`, ghProxy);
}

function nezhaAssetUrl(tag, arch, ghProxy) {
  return withProxy(`https://github.com/nezhahq/agent/releases/download/${tag}/nezha-agent_linux_${arch}.zip`, ghProxy);
}

function komariAssetUrl(tag, arch, ghProxy) {
  return withProxy(`https://github.com/komari-monitor/komari-agent/releases/download/${tag}/komari-agent-linux-${arch}`, ghProxy);
}

async function downloadBinary(cfg, url, dest) {
  await downloadFile(url, dest, { minSize: 1024 * 1024, mode: 0o755 });
}

/** nezha-agent ships as a zip containing one `nezha-agent` binary. */
async function ensureNezha(cfg) {
  const arch = goArch();
  const dest = binPath(cfg, "nezha");
  if (await usableBinary(dest)) {
    logger.info(`sys-monitor exists: ${dest}`);
    return dest;
  }
  const tag = await resolveTag("nezhahq/agent", cfg.nezhaVersion, FALLBACK.nezha, cfg.ghToken);
  const url = nezhaAssetUrl(tag, arch, cfg.ghProxy);
  logger.info(`downloading nezha-agent ${tag} (${arch})`);
  const zipTmp = join(await workTmpDir(cfg), `nezha-agent_linux_${arch}.zip`);
  await downloadFile(url, zipTmp, { minSize: 1024 * 1024 });
  const outDir = join(await workTmpDir(cfg), `nezha-${tag}-${arch}-${Date.now()}`);
  await fs.mkdir(outDir, { recursive: true });
  if (have("unzip")) {
    const r = await execFileAsync("unzip", ["-o", "-j", zipTmp, "-d", outDir], { timeout: 60000 });
    if (!r.ok) throw new Error(`extract nezha-agent failed: ${r.out.slice(0, 200)}`);
  } else {
    // node >= 20: no built-in unzip; busybox/alpine images may lack unzip
    throw new Error("unzip is required to extract nezha-agent (apk add unzip)");
  }
  const found = await findFile(outDir, "nezha-agent");
  if (!found) throw new Error("nezha-agent binary not found in archive");
  await fs.mkdir(cfg.binDir, { recursive: true });
  await fs.copyFile(found, dest);
  await fs.chmod(dest, 0o755);
  await fs.rm(zipTmp, { force: true }).catch(() => {});
  await fs.rm(outDir, { recursive: true, force: true }).catch(() => {});
  markFreshBinary(dest);
  logger.info(`sys-monitor ready: ${dest}`);
  return dest;
}

/** komari-agent ships as a plain binary (no archive). */
async function ensureKomari(cfg) {
  const arch = goArch();
  const dest = binPath(cfg, "komari");
  if (await usableBinary(dest)) {
    logger.info(`node-monitor exists: ${dest}`);
    return dest;
  }
  const tag = await resolveTag("komari-monitor/komari-agent", cfg.komariVersion, FALLBACK.komari, cfg.ghToken);
  const url = komariAssetUrl(tag, arch, cfg.ghProxy);
  logger.info(`downloading komari-agent ${tag} (${arch})`);
  await downloadBinary(cfg, url, dest);
  markFreshBinary(dest);
  logger.info(`node-monitor ready: ${dest}`);
  return dest;
}


// ---- src/cert.js ----
async function haveOpenssl() {
  const r = await execFileAsync("openssl", ["version"], { timeout: 10000 });
  return r.ok;
}

/**
 * 直连协议共用的自签证书（vless-direct 强制校验 SNI，hy2 走 insecure）。
 * CN/SAN 取自客户端实际使用的名字：
 *   - 开了 vless-direct 时用 VLESS_DIRECT_SNI（默认 www.nvidia.com），与 niccore 的 server_name 一致；
 *   - 否则用 HY2_HOST（若配了）；都拿不到时回落中性名 direct-udp。
 * 自动探测到的公网 IP 也会一起写进 SAN（若已探测到），进一步保证客户端校验能过。
 * Returns { certPath, keyPath } or null when openssl is unavailable.
 * Cert is reused if both files already exist.
 */
async function ensureSelfSignedCert(cfg, opts = {}) {
  const certPath = join(cfg.binDir, ".run", "cert.pem");
  const keyPath = join(cfg.binDir, ".run", "key.pem");
  try {
    await fs.access(certPath);
    await fs.access(keyPath);
    logger.info(`direct-tls cert reused: ${certPath}`);
    return { certPath, keyPath };
  } catch {
    // need to generate
  }
  if (!(await haveOpenssl())) {
    logger.warn("openssl not found, direct protocols disabled (self-signed cert unavailable)");
    return null;
  }
  await fs.mkdir(join(cfg.binDir, ".run"), { recursive: true });
  // SAN 收集：SNI / hybrid host / 自动探测到的公网 IP / localhost
  const sanNames = new Set();
  const addSan = (v) => {
    const s = String(v || "").trim();
    if (s) sanNames.add(s);
  };
  if (cfg.directTcpEnabled) addSan(cfg.directTcpSni || "www.nvidia.com");
  addSan(cfg.directUdpHost);
  addSan(cfg.directTcpHost);
  addSan(opts.autoHost || "");
  const cn = [...sanNames][0] || "direct-udp";
  const allNames = [...new Set(["localhost", ...sanNames])];
  const sans = allNames.map((v) => (isIpv4(v) ? `IP:${v}` : `DNS:${v}`));
  const r = await execFileAsync(
    "openssl",
    [
      "req", "-x509", "-newkey", "rsa:2048", "-nodes",
      "-keyout", keyPath,
      "-out", certPath,
      "-days", "3650",
      "-subj", `/CN=${cn}`,
      "-addext", `subjectAltName=${[...new Set(sans)].join(",")}`,
    ],
    { timeout: 60000 }
  );
  if (!r.ok) {
    logger.warn(`openssl cert generation failed, direct protocols disabled: ${r.out.slice(0, 200)}`);
    return null;
  }
  logger.info(`direct-tls self-signed cert generated: ${certPath} (CN=${cn})`);
  return { certPath, keyPath };
}


// ---- src/netprobe.js ----
/**
 * Probe whether UDP bind on the direct-udp port works.
 * PaaS without UDP support -> disable direct-udp gracefully.
 */
function probeUdp(port) {
  return new Promise((resolve) => {
    let finished = false;
    const done = (ok, reason) => {
      if (finished) return;
      finished = true;
      try {
        sock.close();
      } catch {}
      resolve({ ok, reason });
    };
    const sock = createSocket("udp4");
    sock.on("error", (e) => {
      done(false, e.message);
    });
    try {
      sock.bind(port, "0.0.0.0", () => done(true, ""));
    } catch (e) {
      done(false, e.message);
    }
    setTimeout(() => done(false, "timeout"), 5000).unref();
  });
}

/** 探测 TCP 端口是否可 bind（直连协议降级用，失败只警告） */
function probeTcp(port) {
  return new Promise((resolve) => {
    let finished = false;
    const done = (ok, reason) => {
      if (finished) return;
      finished = true;
      try {
        server.close();
      } catch {}
      resolve({ ok, reason });
    };
    const server = createNetServer();
    server.on("error", (e) => done(false, e.message));
    try {
      server.listen(port, "0.0.0.0", () => done(true, ""));
    } catch (e) {
      done(false, e.message);
    }
    setTimeout(() => done(false, "timeout"), 5000).unref();
  });
}


// ---- src/singbox.js ----
/**
 * Minimal niccore config: link inbound always, direct protocols optional.
 * @param {object} cfg loaded config
 * @param {object|null} tls { certPath, keyPath } or null (shared by direct protocols)
 */
function buildSingBoxConfig(cfg, tls = null) {
  const inbounds = [
    {
      type: "vless",
      tag: "vless-link",
      listen: "127.0.0.1",
      listen_port: cfg.corePort,
      users: [{ uuid: cfg.uuid, flow: "" }],
      transport: {
        type: "ws",
        path: cfg.wsPath,
        max_early_data: 0,
        early_data_header_name: "",
      },
    },
  ];

  if (cfg.directUdpEnabled && tls) {
    const directUdpInbound = {
      type: "hysteria2",
      tag: "hy2",
      listen: "0.0.0.0",
      listen_port: cfg.directUdpPort,
      users: [{ password: cfg.directUdpPassword }],
      tls: {
        enabled: true,
        certificate_path: tls.certPath,
        key_path: tls.keyPath,
      },
    };
    if (cfg.directUdpObfs) {
      directUdpInbound.obfs = { type: "salamander", password: cfg.directUdpObfs };
    }
    inbounds.push(directUdpInbound);
  }

  if (cfg.directTcpEnabled && tls) {
    inbounds.push({
      type: "vless",
      tag: "vless-direct",
      listen: "0.0.0.0",
      listen_port: cfg.directTcpPort,
      users: [{ uuid: cfg.uuid, flow: "xtls-rprx-vision" }],
      tls: {
        enabled: true,
        server_name: cfg.directTcpSni || "www.nvidia.com",
        certificate_path: tls.certPath,
        key_path: tls.keyPath,
      },
    });
  }

  return {
    log: { level: cfg.logLevel === "debug" ? "debug" : cfg.logLevel === "warn" ? "warn" : "info" },
    inbounds,
    outbounds: [{ type: "direct", tag: "direct" }],
  };
}

/**
 * @param {object} cfg loaded config
 * @param {string} dir output dir (legacy, ignored: always BIN_DIR/.run/sb.json)
 * @param {object|null} tls cert paths or null (shared by direct protocols)
 */
async function writeSingBoxConfig(cfg, dir = ".", tls = null) {
  const obj = buildSingBoxConfig(cfg, tls);
  await fs.mkdir(join(cfg.binDir, ".run"), { recursive: true });
  const path = join(cfg.binDir, ".run", "sb.json");
  await fs.writeFile(path, JSON.stringify(obj, null, 2));
  const tags = obj.inbounds.map((i) => i.tag).join(",");
  logger.info(`niccore.json written: ${path} (inbounds: ${tags})`);
  return path;
}


// ---- src/link.js ----
/** Build niclink args for token / temp mode. */
function buildLinkArgs(cfg, binPath) {
  const target = `http://127.0.0.1:${cfg.corePort}`;
  // AT_LINK_PROTOCOL 直传 --protocol（上游 runQuickLink 仅在未显式设置时才默认 quic，
  // 这里总是显式传，temp/token 两模式行为一致，无隐式覆盖问题）。
  const proto = ["--protocol", cfg.atLinkProtocol];
  // edge 连接数直传 --ha-connections（覆盖 Go 二进制内默认的 1）；JS 侧默认 4，
  // 与上游 cloudflared 默认一致。temp/token 两模式共用。
  const conns = ["--ha-connections", String(cfg.atLinkConnections)];
  if (cfg.atLinkMode === "token") {
    // token 隧道同样需要 --url 把流量转发到本地 niccore，否则 edge 建链成功但无源站（502）
    return {
      bin: binPath,
      args: ["run", "--no-autoupdate", "--token", cfg.atLinkToken, "--url", target, "--no-tls-verify", ...proto, ...conns],
      domain: cfg.atLinkDomain,
    };
  }
  return {
    bin: binPath,
    args: ["--no-autoupdate", "--url", target, "--no-tls-verify", ...proto, ...conns],
    domain: null, // parsed from log: https://xxx.trycloudflare.com
  };
}

/** Extract https://xxx.trycloudflare.com from niclink log line. */
function parseTempDomain(line) {
  const m = String(line).match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
  return m ? m[0] : null;
}

function watchLinkOutput(child, onDomain) {
  // 注意：每次 niclink spawn（含 Runner 重启）都要重新绑一次；
  // 新域名出现即回调（同一进程内只认第一个，不同进程可更新）。
  // 拿到域名后解绑 scan，只留 Runner 的轻量 onChunk，避免双份字符串拷贝。
  let found = null;
  const scan = (data) => {
    const text = String(data);
    if (!found) {
      const d = parseTempDomain(text);
      if (d) {
        found = d;
        logger.info(`link temp domain: ${d}`);
        onDomain && onDomain(d);
        try {
          child.stdout && child.stdout.off("data", scan);
          child.stderr && child.stderr.off("data", scan);
        } catch {}
      }
    }
  };
  child.stdout && child.stdout.on("data", scan);
  child.stderr && child.stderr.on("data", scan);
  return () => found;
}

/** 拨测 temp 域名是否存活：纯 HTTPS GET /（可达即活；502/503=隧道真死；超时/网络异常算"可疑"）。
 * 注意：fetch 不允许手拼 Upgrade 头（undici 直接抛 invalid upgrade header），
 * 所以这里只能是普通 GET——它验证的是 edge 可达 + 源站有响应，足够做存活判断。 */
async function probeTempDomain(domain, timeoutMs = 15000) {
  const host = String(domain || "").replace(/^https?:\/\//, "").replace(/\/+$/, "");
  if (!host) return { ok: false, reason: "empty" };
  try {
    const res = await fetch(`https://${host}/`, {
      method: "GET",
      headers: { "User-Agent": "nic-kit-domaincheck" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    // 502 = 源站（niccore）无响应；503 = edge 上隧道已注销/不可用；
    // 530/429（edge 限流）判活，否则限流时段 niclink 会被反复杀（本地实测 restart 死循环）。
    if (res.status === 502 || res.status === 503) {
      return { ok: false, reason: `http=${res.status}` };
    }
    return { ok: true, reason: `http=${res.status}` };
  } catch (e) {
    return { ok: false, reason: String(e.message || e).slice(0, 80) };
  }
}


// ---- src/monitors.js ----
/**
 * Build nezha-agent config.yaml.
 * Schema per nezhahq/agent model/config.go AgentConfig.
 * Security defaults: disable_command_execute=true unless NEZHA_ALLOW_COMMAND=1.
 */
function buildNezhaYaml(cfg) {
  const lines = [
    `server: ${cfg.nezhaServer}`,
    `client_secret: ${cfg.nezhaKey}`,
    `tls: ${cfg.nezhaTls ? "true" : "false"}`,
    `disable_command_execute: ${cfg.nezhaAllowCommand ? "false" : "true"}`,
    `disable_auto_update: true`,
    `disable_force_update: true`,
    `report_delay: 3`,
  ];
  if (cfg.nezhaUuid) lines.push(`uuid: ${cfg.nezhaUuid}`);
  return lines.join("\n") + "\n";
}

async function writeNezhaYaml(cfg) {
  const path = join(cfg.binDir, ".run", "nz.yaml");
  await fs.mkdir(join(cfg.binDir, ".run"), { recursive: true });
  await fs.writeFile(path, buildNezhaYaml(cfg), { mode: 0o600 });
  await fs.chmod(path, 0o600);
  logger.info(`nezha config written: ${path}`);
  return path;
}

/** nezha-agent run args: binary -c config.yaml (foreground). */
function nezhaArgs(yamlPath) {
  return ["-c", yamlPath];
}

/**
 * Build komari-agent argv.
 * Security defaults: --disable-auto-update --disable-web-ssh unless KOMARI_ALLOW_SSH=1.
 */
function komariArgs(cfg) {
  const args = [
    "--endpoint", cfg.komariEndpoint,
    "--token", cfg.komariToken,
    "--interval", String(cfg.komariInterval),
    "--reconnect-interval", "5",
    "--disable-auto-update",
  ];
  if (!cfg.komariAllowSsh) args.push("--disable-web-ssh");
  return args;
}

/** 公网 IPv4（多源兜底，只取 v4） */
async function detectPublicIp() {
  const cands = [
    "https://www.cloudflare.com/cdn-cgi/trace",
    "https://api.ipify.org",
    "https://ifconfig.me/ip",
  ];
  for (const u of cands) {
    try {
      const res = await fetch(u, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) continue;
      const text = (await res.text()).trim();
      if (u.includes("cdn-cgi")) {
        const m = text.match(/^ip=(.+)$/m);
        if (m && isIpv4(m[1].trim())) return m[1].trim();
      } else if (isIpv4(text.split(/\s+/)[0])) {
        return text.split(/\s+/)[0];
      }
    } catch {}
  }
  return "";
}

async function detectCountry() {
  // 首选 CF trace 的 loc=（无额外请求，main 流程里已顺手拿到则复用，这里独立再取一次也便宜）
  try {
    const res = await fetch("https://www.cloudflare.com/cdn-cgi/trace", { signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      const m = (await res.text()).match(/^loc=([A-Z]{2})$/m);
      if (m) return m[1];
    }
  } catch {}
  // 兜底 ip-api（http 明文，45次/分钟限额，失败即放弃）
  try {
    const res = await fetch("http://ip-api.com/line/?fields=countryCode", { signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      const cc = (await res.text()).trim().toUpperCase();
      if (/^[A-Z]{2}$/.test(cc)) return cc;
    }
  } catch {}
  return "";
}

/**
 * 节点名称前缀：默认国家码（JP/HK/US…），未知国家回退 IP 末段。
 * NODE_PREFIX=custom 强制用 IP 后缀；填其它非空值直接用该值。
 */
function nodePrefixFor(cfg, cc, ip) {
  const manual = (cfg.nodePrefix || "").trim();
  if (manual && manual.toLowerCase() !== "custom") return manual;
  if (manual.toLowerCase() === "custom") return ipTail(ip);
  if (cc) return cc;
  return ipTail(ip) || "NODE";
}

function ipTail(ip) {
  if (!ip) return "";
  if (ip.includes(".")) return ip.split(".").slice(-1)[0];
  return ip.replace(/:/g, "").slice(-4).toUpperCase() || "";
}

function isIpv4(s) {
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(s)) return false;
  return s.split(".").every((n) => Number(n) >= 0 && Number(n) <= 255);
}

/**
 * 严格 IPv6 校验（含 :: 压缩与结尾内嵌 IPv4）。用于公网 IP 探测结果的过滤，
 * 避免把错误页里的十六进制碎片（如 "ea"）当成地址上报。
 */
function isIpv6(s) {
  if (typeof s !== "string") return false;
  const str = s.trim();
  if (str.length < 2 || str.length > 45) return false;
  if (!/^[0-9a-fA-F:.]+$/.test(str)) return false;
  if (!str.includes(":")) return false;
  const parts = str.split("::");
  if (parts.length > 2) return false;
  const groups = [
    ...(parts[0] === "" ? [] : parts[0].split(":")),
    ...(parts.length === 2 && parts[1] !== "" ? parts[1].split(":") : []),
  ];
  let count = 0;
  for (let i = 0; i < groups.length; i++) {
    const g = groups[i];
    if (g === "") return false;
    if (g.includes(".")) {
      // 内嵌 IPv4 只能出现在最后一段
      if (i !== groups.length - 1 || !isIpv4(g)) return false;
      count += 2;
      continue;
    }
    if (!/^[0-9a-fA-F]{1,4}$/.test(g)) return false;
    count += 1;
  }
  // 有 :: 时至少压缩掉一组（因此 count <= 7）；没有 :: 时必须是完整 8 组
  return parts.length === 2 ? count <= 7 : count === 8;
}


// ---- src/collectors.js ----
/**
 * Lightweight collectors for the built-in CF probe.
 * Only stdlib, no native deps. Linux-first, degrades elsewhere.
 */

let lastCpu = null;

async function cpuPercent() {
  const list = cpus();
  let idle = 0;
  let total = 0;
  for (const c of list) {
    const t = c.times;
    idle += t.idle;
    total += t.user + t.nice + t.sys + t.idle + t.irq;
  }
  const now = { idle, total };
  if (!lastCpu) {
    lastCpu = now;
    return 0;
  }
  const idleD = now.idle - lastCpu.idle;
  const totalD = now.total - lastCpu.total;
  lastCpu = now;
  if (totalD <= 0) return 0;
  return Math.max(0, Math.min(100, ((totalD - idleD) / totalD) * 100));
}

function memInfo() {
  const total = Math.floor(totalmem() / 1024 / 1024);
  const free = Math.floor(freemem() / 1024 / 1024);
  return { total, used: Math.max(0, total - free) };
}

async function readText(path) {
  try {
    return await fs.readFile(path, "utf8");
  } catch {
    return "";
  }
}

function pickIfaces(text, only) {
  // /proc/net/dev lines: "  eth0: rx ... tx ..."
  const rows = [];
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*([^:\s]+):\s*(.*)$/);
    if (!m) continue;
    const name = m[1];
    if (name === "lo") continue;
    if (only && only.length > 0 && !only.includes(name)) continue;
    const nums = m[2].trim().split(/\s+/).map(Number);
    if (nums.length < 16) continue;
    rows.push({ name, rx: nums[0], tx: nums[8] });
  }
  return rows;
}

async function netCounters(iface) {
  if (platform() !== "linux") return { rx: 0, tx: 0 };
  const text = await readText("/proc/net/dev");
  const only = iface ? iface.split(",").map((s) => s.trim()).filter(Boolean) : [];
  let rx = 0;
  let tx = 0;
  for (const r of pickIfaces(text, only)) {
    rx += r.rx;
    tx += r.tx;
  }
  return { rx, tx };
}

// 磁盘用量变化慢：`df` 是子进程，按 TTL 缓存，避免每个采集节拍都 fork 一次
const DISK_CACHE_MS = 30000;
let diskCache = { at: 0, val: null };
async function diskInfo() {
  if (platform() !== "linux") return { total: 0, used: 0 };
  const now = Date.now();
  if (diskCache.val && now - diskCache.at < DISK_CACHE_MS) return diskCache.val;
  const df = await runDf();
  if (df) {
    diskCache = { at: now, val: df };
    return df;
  }
  // 取失败：返回上一次的可用值，没有则 0（下次节拍会重试）
  return diskCache.val || { total: 0, used: 0 };
}

/** 测试用：清掉磁盘缓存（模拟缓存过期/环境变化） */
function resetDiskCache() {
  diskCache = { at: 0, val: null };
}

function runDf() {
  return new Promise((resolve) => {
    // busybox df (alpine) lacks -x/--total: use plain `df -BM` and filter.
    execFile("df", ["-BM"], (err, stdout) => {
      if (err) return resolve(null);
      try {
        const lines = stdout.trim().split("\n").slice(1);
        let total = 0;
        let used = 0;
        for (const line of lines) {
          const parts = line.split(/\s+/);
          // Filesystem 1M-blocks Used Available Use% Mounted-on
          if (parts.length < 6) continue;
          const fs = parts[0];
          if (/^(tmpfs|devtmpfs|shm|overlay|cgroup|none)$/.test(fs)) continue;
          if (fs.startsWith("/dev/") === false && !fs.includes("mapper") && !fs.startsWith("//") && fs !== "/") {
            // keep / (container root) but skip virtual mounts we can't classify;
            // busybox on docker: root fs shows as overlay -> skip, fall back below
            if (fs === "overlay") continue;
          }
          total += toMiB(parts[1]);
          used += toMiB(parts[2]);
        }
        // docker/alpine: everything is overlay -> fallback to root `/` row
        if (total === 0) {
          const root = lines.map((l) => l.split(/\s+/)).find((p) => p[p.length - 1] === "/");
          if (root && root.length >= 4) {
            total = toMiB(root[1]);
            used = toMiB(root[2]);
          }
        }
        resolve({ total, used });
      } catch {
        resolve(null);
      }
    });
  });
}

function toMiB(s) {
  return parseInt(String(s).replace(/M$/, ""), 10) || 0;
}

async function osRelease() {
  try {
    const text = await readText("/etc/os-release");
    const m = text.match(/^PRETTY_NAME[=](.+)$/m);
    if (m) return m[1].trim().replace(/^"|"$/g, "");
    const m2 = text.match(/^ID[=](.+)$/m);
    if (m2) return m2[1].trim().replace(/^"|"$/g, "");
    const m3 = text.match(/^ID_LIKE[=](.+)$/m);
    if (m3) return m3[1].trim().replace(/^"|"$/g, "").split(/\s+/)[0];
    return "Linux";
  } catch {
    return "Linux";
  }
}

// 主机元信息：os/arch/kernel/cpu 型号等启动后不变，只读一次缓存
let hostMetaCache = null;
async function hostMeta() {
  if (!hostMetaCache) {
    const osName = platform() === "linux" ? await osRelease() : platform();
    const a = arch() === "x64" ? "amd64" : arch() === "arm64" ? "arm64" : arch();
    let kernel = "";
    let cpuModel = "";
    const cores = String(cpus().length || 0);
    if (platform() === "linux") {
      const ver = await readText("/proc/version");
      kernel = ver.trim().slice(0, 128);
      const cpuinfo = await readText("/proc/cpuinfo");
      const m = cpuinfo.match(/model name\s*:\s*(.+)/);
      if (m) cpuModel = m[1].trim().slice(0, 128);
    }
    hostMetaCache = { os: osName, arch: a, kernel, cpuModel, cores };
  }
  return { ...hostMetaCache, hostname: hostname() };
}

async function loadAvg() {
  if (platform() !== "linux") return "0 0 0";
  const text = await readText("/proc/loadavg");
  const parts = text.trim().split(/\s+/);
  if (parts.length >= 3) return `${parts[0]} ${parts[1]} ${parts[2]}`;
  return "0 0 0";
}

async function bootTimeMs() {
  if (platform() === "linux") {
    const text = await readText("/proc/stat");
    const m = text.match(/^btime\s+(\d+)/m);
    if (m) return String(Number(m[1]) * 1000);
  }
  try {
    const { execFileSync } = await import("node:child_process");
    void execFileSync;
  } catch {}
  return "0";
}

async function procCount() {
  if (platform() !== "linux") return "0";
  try {
    const entries = await fs.readdir("/proc");
    let n = 0;
    for (const e of entries) if (/^\d+$/.test(e)) n++;
    return String(n);
  } catch {
    return "0";
  }
}

async function tcpUdpCount() {
  if (platform() !== "linux") return { tcp: "0", udp: "0" };
  const [tcpFull, udpText] = await Promise.all([
    readText("/proc/net/tcp"),
    readText("/proc/net/udp"),
  ]);
  let tcp = 0;
  for (const line of tcpFull.split("\n").slice(1)) {
    const cols = line.trim().split(/\s+/);
    if (cols.length > 3 && cols[3] === "01") tcp++; // ESTABLISHED
  }
  let udp = 0;
  for (const line of udpText.split("\n").slice(1)) {
    if (line.trim()) udp++;
  }
  return { tcp: String(tcp), udp: String(udp) };
}

async function swapInfo() {
  if (platform() !== "linux") return { total: "0", used: "0" };
  const text = await readText("/proc/meminfo");
  const get = (k) => {
    const m = text.match(new RegExp(`^${k}:\\s+(\\d+)`, "m"));
    return m ? Math.floor(Number(m[1]) / 1024) : 0;
  };
  const total = get("SwapTotal");
  const free = get("SwapFree");
  return { total: String(total), used: String(Math.max(0, total - free)) };
}

async function diskIo() {
  // /proc/diskstats 聚合：读扇区/写扇区(每扇区512B) + IO 时间；速率由 cfprobe 两次采样差分
  if (platform() !== "linux") return { readBytes: 0, writeBytes: 0 };
  const text = await readText("/proc/diskstats");
  let r = 0;
  let w = 0;
  for (const line of text.split("\n")) {
    const cols = line.trim().split(/\s+/);
    if (cols.length < 14) continue;
    const name = cols[2] || "";
    if (!isWholeDisk(name)) continue;
    r += (Number(cols[5]) || 0) * 512;
    w += (Number(cols[9]) || 0) * 512;
  }
  return { readBytes: r, writeBytes: w };
}

// 整盘判定：nvme0n1/mmcblk0 以数字结尾但是整盘（分区是 nvme0n1p1/mmcblk0p1）；
// sda1/vda1 这类以数字结尾的才是分区
function isWholeDisk(name) {
  if (/^(loop|ram|dm-\d+|sr\d+)/.test(name)) return false;
  if (/^nvme\d+n\d+$/.test(name)) return true;
  if (/^mmcblk\d+$/.test(name)) return true;
  if (/[0-9]$/.test(name)) return false;
  return true;
}

// ---- 月度流量累计（net_rx_monthly / net_tx_monthly）----
// 面板语义："本月"累计。以 BIN_DIR/.run/traffic.json 持久化，重启后继续累加；
// 账期由面板下发的 reset_day（1-31）决定，缺省 1 号；计数器回绕/重启后归零不会产生负数。
// 未初始化（测试或没有 BIN_DIR）时回落到累计计数器，与原行为一致。
const TRAFFIC_SAVE_MS = 60000;
const trafficState = {
  ready: false,   // loadTraffic 成功后为 true
  primed: false,  // 首次采样只对齐基准，不把开机以来的流量算进本月
  path: "",
  monthKey: "",
  base: { rx: 0, tx: 0 },
  month: { rx: 0, tx: 0 },
  lastSaveAt: 0,
  saveWarned: false,
};

/**
 * 账期键：reset_day 之前算上一个月，之后算当月（返回 "YYYY-MM"）。
 * 用**本机时区**计算，与官方 agent（Go 的 time.Now()）语义一致；
 * 节点时区为空时（容器默认 UTC）即等于 UTC。
 */
function monthKeyOf(now, resetDay) {
  const d = new Date(now);
  const y = d.getFullYear();
  const m = d.getMonth();
  const days = new Date(y, m + 1, 0).getDate();
  const day = Math.max(1, Math.min(days, Number(resetDay) || 1));
  const src = d.getDate() >= day ? new Date(y, m, 1) : new Date(y, m - 1, 1);
  return `${src.getFullYear()}-${String(src.getMonth() + 1).padStart(2, "0")}`;
}

async function loadTraffic(cfg) {
  if (!cfg || !cfg.binDir) return trafficState;
  trafficState.ready = true;
  trafficState.path = join(cfg.binDir, ".run", "traffic.json");
  try {
    const obj = JSON.parse(await fs.readFile(trafficState.path, "utf8"));
    trafficState.month = {
      rx: Math.max(0, Number(obj.month_rx) || 0),
      tx: Math.max(0, Number(obj.month_tx) || 0),
    };
    trafficState.monthKey = typeof obj.month_key === "string" ? obj.month_key : "";
  } catch (e) {
    if (e && e.code !== "ENOENT") logger.warn(`traffic state load failed: ${e.message}`);
    trafficState.month = { rx: 0, tx: 0 };
    trafficState.monthKey = "";
  }
  return trafficState;
}

async function saveTraffic(now = Date.now()) {
  if (!trafficState.ready || !trafficState.path) return;
  trafficState.lastSaveAt = now;
  try {
    await fs.mkdir(dirname(trafficState.path), { recursive: true });
    await fs.writeFile(
      trafficState.path,
      JSON.stringify({
        month_key: trafficState.monthKey,
        month_rx: trafficState.month.rx,
        month_tx: trafficState.month.tx,
        saved_at: now,
      })
    );
  } catch (e) {
    if (!trafficState.saveWarned) {
      trafficState.saveWarned = true;
      logger.warn(`traffic state save failed (will keep counting in memory): ${e.message}`);
    }
  }
}

/**
 * 用当前累计计数器推进本月累计。
 * 返回 { rx, tx }：本月累计（未初始化时返回传入的累计值，保持旧语义）。
 */
function accumulateTraffic(rx, tx, now, resetDay) {
  if (!trafficState.ready) return { rx, tx };
  const key = monthKeyOf(now, resetDay);
  if (trafficState.monthKey !== key) {
    // 跨账期（含 reset_day 触发）：清零
    trafficState.month = { rx: 0, tx: 0 };
    trafficState.monthKey = key;
  }
  if (!trafficState.primed) {
    // 首次采样：只对齐基准。进程启动前的流量无法归因，不计入本月。
    trafficState.primed = true;
    trafficState.base = { rx, tx };
    setImmediate(() => saveTraffic(Date.now()));
    return { rx: trafficState.month.rx, tx: trafficState.month.tx };
  }
  const drx = rx - trafficState.base.rx;
  const dtx = tx - trafficState.base.tx;
  if (drx > 0) trafficState.month.rx += drx;
  if (dtx > 0) trafficState.month.tx += dtx;
  trafficState.base = { rx, tx };
  if (now - trafficState.lastSaveAt > TRAFFIC_SAVE_MS) setImmediate(() => saveTraffic(Date.now()));
  return { rx: trafficState.month.rx, tx: trafficState.month.tx };
}

/** 面板下发 rx_correction/tx_correction 时，以服务端值为本月基准 */
function applyTrafficCorrection(rxCorr, txCorr) {
  if (!trafficState.ready) return;
  if (Number.isFinite(rxCorr) && rxCorr >= 0) trafficState.month.rx = Math.floor(rxCorr);
  if (Number.isFinite(txCorr) && txCorr >= 0) trafficState.month.tx = Math.floor(txCorr);
  setImmediate(() => saveTraffic(Date.now()));
}



// ---- cfprobe ws client (zero-dep, mirrors cfsm-agent websocket_client.go) ----
const WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const WS_MAX_MSG = 1 << 20;
const WSS_HANDSHAKE_TIMEOUT = 10000;
const WSS_HELLO_TIMEOUT = 10000;
const WSS_WRITE_TIMEOUT = 8000;

function wsAccept(key) {
  return createHash("sha1").update(key + WS_GUID).digest("base64");
}

function wsNewKey() {
  return randomBytes(16).toString("base64");
}

function wsBuildHandshake(urlStr, extraHeaders) {
  const u = new URL(urlStr);
  const key = wsNewKey();
  const path = (u.pathname || "/") + (u.search || "");
  const lines = [
    `GET ${path} HTTP/1.1`,
    `Host: ${u.host}`,
    "Connection: Upgrade",
    "Upgrade: websocket",
    `Sec-WebSocket-Key: ${key}`,
    "Sec-WebSocket-Version: 13",
  ];
  for (const [k, v] of Object.entries(extraHeaders || {})) {
    lines.push(`${k}: ${v}`);
  }
  lines.push("", "");
  return { raw: lines.join("\r\n"), key };
}

function wsParseHandshakeResponse(buf) {
  // 返回 { ok, status, headers, rest }；数据不全返回 { ok:false, needMore:true }
  const idx = buf.indexOf("\r\n\r\n");
  if (idx === -1) return { ok: false, needMore: true };
  const head = buf.slice(0, idx).toString("latin1");
  const rest = buf.slice(idx + 4);
  const lines = head.split("\r\n");
  const statusLine = lines[0] || "";
  const m = statusLine.match(/^HTTP\/\d(?:\.\d)?\s+(\d+)/);
  const status = m ? parseInt(m[1], 10) : 0;
  const headers = {};
  for (const ln of lines.slice(1)) {
    const ci = ln.indexOf(":");
    if (ci === -1) continue;
    const k = ln.slice(0, ci).trim().toLowerCase();
    const v = ln.slice(ci + 1).trim();
    if (headers[k]) headers[k] = headers[k] + ", " + v;
    else headers[k] = v;
  }
  return { ok: true, status, headers, rest };
}

function wsHeaderHasToken(headers, name, want) {
  const v = (headers[name.toLowerCase()] || "").toLowerCase();
  return v.split(",").map((x) => x.trim()).includes(want.toLowerCase());
}

function wsFrameEncode(opcode, payload) {
  const len = payload.length;
  let header;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x80 | opcode;
    header[1] = 0x80 | len;
  } else if (len <= 0xffff) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 0x80 | 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 0x80 | 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  const mask = randomBytes(4);
  const out = Buffer.concat([header, mask]);
  const masked = Buffer.alloc(len);
  for (let i = 0; i < len; i++) masked[i] = payload[i] ^ mask[i % 4];
  return Buffer.concat([out, masked]);
}

function wsFrameDecodeOne(buf) {
  // 返回 { ok, needMore, fin, opcode, payload, rest }
  if (buf.length < 2) return { ok: false, needMore: true };
  const fin = (buf[0] & 0x80) !== 0;
  const opcode = buf[0] & 0x0f;
  const masked = (buf[1] & 0x80) !== 0;
  let length = buf[1] & 0x7f;
  let off = 2;
  if (length === 126) {
    if (buf.length < 4) return { ok: false, needMore: true };
    length = buf.readUInt16BE(2);
    off = 4;
  } else if (length === 127) {
    if (buf.length < 10) return { ok: false, needMore: true };
    const big = buf.readBigUInt64BE(2);
    if (big > BigInt(WS_MAX_MSG)) throw new Error("WSS frame too large");
    length = Number(big);
    off = 10;
  }
  if (length > WS_MAX_MSG) throw new Error("WSS frame too large");
  let maskKey = null;
  if (masked) {
    if (buf.length < off + 4) return { ok: false, needMore: true };
    maskKey = buf.slice(off, off + 4);
    off += 4;
  }
  if (buf.length < off + length) return { ok: false, needMore: true };
  let payload = buf.slice(off, off + length);
  const rest = buf.slice(off + length);
  if (masked && maskKey) {
    const un = Buffer.alloc(payload.length);
    for (let i = 0; i < payload.length; i++) un[i] = payload[i] ^ maskKey[i % 4];
    payload = un;
  }
  return { ok: true, fin, opcode, payload, rest };
}

function wsCloseCode(payload) {
  if (!payload || payload.length < 2) return { code: 1005, reason: "" };
  return { code: payload.readUInt16BE(0), reason: payload.slice(2).toString("utf8") };
}

function cfWsUrl(rawUrl, schema, md5) {
  // https:// -> wss://，http:// -> ws://，路径 query 保留；再带 config_schema/config_md5（对齐官方）
  const u = new URL(rawUrl);
  if (u.protocol === "https:") u.protocol = "wss:";
  else if (u.protocol === "http:") u.protocol = "ws:";
  else if (u.protocol !== "wss:" && u.protocol !== "ws:") throw new Error(`unsupported scheme ${u.protocol}`);
  if (schema) u.searchParams.set("config_schema", schema);
  if (md5) u.searchParams.set("config_md5", md5);
  return u.toString();
}

function wsConnect(rawWsUrl, extraHeaders, timeoutMs) {
  // 返回 Promise<{ sock, headers, startedAt, receivedAt }>；握手失败 reject（带 status/headers/body）
  return new Promise((resolve, reject) => {
    const u = new URL(rawWsUrl);
    const secure = u.protocol === "wss:";
    const port = u.port ? parseInt(u.port, 10) : secure ? 443 : 80;
    const host = u.hostname;
    const startedAt = Date.now();
    let sock = null;
    let settled = false;
    const fail = (e) => {
      if (settled) return;
      settled = true;
      try { sock && sock.destroy(); } catch {}
      reject(e);
    };
    const timer = setTimeout(() => fail(new Error("WSS handshake timeout")), timeoutMs || WSS_HANDSHAKE_TIMEOUT);
    const onConnect = () => {
      const { raw, key } = wsBuildHandshake(rawWsUrl, extraHeaders);
      let acc = Buffer.alloc(0);
      const onData = (chunk) => {
        acc = Buffer.concat([acc, chunk]);
        let parsed;
        try {
          parsed = wsParseHandshakeResponse(acc);
        } catch (e) {
          cleanup();
          fail(e);
          return;
        }
        if (!parsed.ok) return; // needMore
        cleanup();
        const receivedAt = Date.now();
        if (parsed.status !== 101) {
          const body = parsed.rest.slice(0, 1024).toString("utf8");
          const err = new Error(`WSS handshake http=${parsed.status}${body ? " body=" + body.trim().slice(0, 200) : ""}`);
          err.status = parsed.status;
          err.headers = parsed.headers;
          err.body = body;
          fail(err);
          return;
        }
        if (!wsHeaderHasToken(parsed.headers, "upgrade", "websocket") || !wsHeaderHasToken(parsed.headers, "connection", "upgrade")) {
          fail(new Error("WSS handshake missing upgrade headers"));
          return;
        }
        const got = (parsed.headers["sec-websocket-accept"] || "").trim();
        if (got !== wsAccept(key)) {
          fail(new Error("WSS handshake invalid accept"));
          return;
        }
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        // 握手剩余字节是首帧数据（DO 行为：一般无；保留给调用方）
        resolve({ sock, headers: parsed.headers, startedAt, receivedAt, rest: parsed.rest });
      };
      const onError = (e) => { cleanup(); fail(e); };
      const cleanup = () => {
        if (sock) {
          sock.off("data", onData);
          sock.off("error", onError);
        }
      };
      sock.on("data", onData);
      sock.on("error", onError);
      sock.write(raw);
    };
    const opts = { host, port, servername: host, minVersion: "TLSv1.2" };
    try {
      sock = secure
        ? tlsConnect(port, host, opts, onConnect)
        : createConnection({ host, port }, onConnect);
      sock.on("error", (e) => fail(e));
    } catch (e) {
      fail(e);
    }
  });
}

// ---- src/cfprobe.js ----
// 完整复刻 cfsm-agent 行为（https://github.com/huilang-me/cfsm-agent）：
// - 8 测速点：ct/cu/cm/bd + node_1..4；本地变量是初始值，面板下发 custom_ct/cu/cm/bd、
//   node_1..4 到达后以服务端为准；ping_mode（tcp/icmp）同样可下发
// - 探测：tcp=4 次取中位数+丢包率（默认 80 端口，1.5s 超时）；icmp 需 raw socket，Node 无特权时自动回退 tcp
// - 滚动窗口：上报用近 2 分钟内最多 6 次采样的中位数（对齐官方 rollingProbeHistory）
// - report body：collect_interval 取服务端下发值；config_schema/config_md5 按官方节奏上报
//   （md5 变化或每分钟至少一次）；上报成功后清空 samples
// - 校时：Date 头 + 半 RTT 补偿，阈值 20s，24h 过期；boot_time 按校准偏移修正
// - WSS：握手带 X-Agent-* 头 + config_schema/config_md5 query；ack 下发 nextWssReportAfterMs
//   （1s-5min 夹逼）；error(401/403/404/1008 -> 停 120s)；409+wss_schedule_inactive -> 切 POST
// - 退避：网络错误 60s 起指数退避上限 5min；读空闲 = 上报间隔+15s（下限 15s）
// - never throws out; reports status via getStatus()
const AGENT_VERSION = "nic-kit-cfprobe/0.2.0";
const CONFIG_SCHEMA = "7";
const WSS_REPORT_MIN_MS = 1000;
const WSS_REPORT_MAX_MS = 5 * 60 * 1000;
const WSS_PAUSE_MS = 120 * 1000;
const WSS_NET_MIN_MS = 60 * 1000;
const WSS_NET_MAX_MS = 5 * 60 * 1000;
const WSS_IDLE_GRACE_MS = 15000;
// 同一节拍内 tick() 与上报共用一份指标快照（避免每节拍两次全量采集）
const COLLECT_REUSE_MS = 1500;

function createCfProbe(cfg) {
  const state = {
    running: false,
    timer: null,
    lastOk: null,
    lastError: "",
    reportCount: 0,
    wssReports: 0,
    postReports: 0,
    configMd5: "none",
    clockCal: null, // { accurateAtAnchor, anchorMs, roundTripMs, source }（对齐官方 calibratedClock）
    // ---- 动态配置（面板下发，内存生效；对齐官方 applyRemoteConfig） ----
    // 下发字段：collect_interval/report_interval/wss_report_interval/reset_day/schema_version/
    // custom_ct,custom_cu,custom_cm,custom_bd/node_1..4/interface/connection_mode/ping_mode
    dynCollectInterval: 0,   // 有效采样间隔（auto 模式归一到 wss 间隔，见 effCollectInterval）
    dynReportInterval: 0,    // 有效上报间隔（0=用本地 CF_INTERVAL）
    dynWssReportInterval: 2, // 面板下发的 wss 上报间隔（秒）；wssIntervalMs 的基准，可被 ack 覆盖
    dynResetDay: 1,
    dynCt: "", dynCu: "", dynCm: "", dynBgp: "",
    dynNode1: "", dynNode2: "", dynNode3: "", dynNode4: "",
    dynIface: "",
    dynConnectionMode: "",   // 生效的 connection_mode（空=本地值）
    dynPingMode: "",         // 生效的 ping_mode（空=本地值）
    serverCfg: {},           // 原始下发 key-values（health 可见）
    samples: [],             // collect 采样累积（上报成功后清空，对齐官方 samples）
    lastSampleAt: 0,
    lastReportAt: 0,         // 上次 POST 上报时间戳（HTTP 模式/WSS 兜底按上报间隔节流）
    lastConfigStateAt: 0,
    lastConfigStateMd5: "",
    lastNet: null,
    lastIo: null,
    lastAt: 0,
    lastMetrics: null,   // 指标快照缓存（COLLECT_REUSE_MS 内复用）
    lastMetricsAt: 0,
    // 测速滚动窗口：每点保留近 2 分钟内最多 6 次采样，上报取中位数（对齐官方）
    probeHist: {}, // key -> [{ at, rtt, ok }]
    lastProbeAt: 0,
    probeTimer: null,    // 后台测速定时器（start 时挂，stop 时清）
    ipTimer: null,       // 公网 IP 刷新定时器
    lastIpAt: 0,
    lastIpv4: "",
    lastIpv6: "",
    // wss runtime
    ws: null,            // { sock, buf }
    wssConnected: false,
    wssConnecting: false, // 握手进行中：期间 tick() 不发 POST 兜底，避免与首帧重复
    wssPausedUntil: 0,
    wssPauseReason: "",
    wssBackoffMs: WSS_NET_MIN_MS,
    wssReportAfterMs: 0, // 服务端 ack 下发的下次上报间隔（0=用默认 2s）
    lastWssSendAt: 0,    // 上次 WSS 上报时间：首帧已由 wssConnectOnce 发出，tickLoop 不重复发
    wssLoop: null,
    wssTickLoop: null,
    wssLastConfigAt: 0,
    wssWantStop: false,
  };

  // ---- 生效值解析（动态下发优先，本地兜底；对齐官方 configSnapshot 语义） ----
  function effConnectionMode() {
    const m = (state.dynConnectionMode || cfg.cfConnectionMode || "auto").toLowerCase();
    return m === "http" ? "http" : "auto";
  }
  function useWss() { return effConnectionMode() !== "http"; }
  function effPingMode() {
    const m = (state.dynPingMode || cfg.cfPingMode || "tcp").toLowerCase();
    return m === "icmp" ? "icmp" : "tcp";
  }
  function effReportInterval() {
    const r = state.dynReportInterval > 0 ? state.dynReportInterval : cfg.cfInterval;
    return r >= 1 ? r : 60;
  }
  function effCollectInterval() {
    // 官方：auto 模式下 collect<=0 或大于 wss 间隔时归一到 wss 间隔
    let c = state.dynCollectInterval;
    if (effConnectionMode() === "auto") {
      const wss = wssIntervalMs() / 1000;
      if (!(c > 0) || c > wss) c = wss;
    }
    return c > 0 ? c : 0;
  }
  function effIface() { return state.dynIface || cfg.cfIface; }
  function effResetDay() { return state.dynResetDay >= 0 ? state.dynResetDay : 1; }
  // 测速点：服务端 custom_ct/cu/cm/bd + node_1..4 优先，本地 CF_PING_*/CF_NODE_* 兜底
  function effProbeTargets() {
    return {
      ct: state.dynCt || cfg.cfPingCt,
      cu: state.dynCu || cfg.cfPingCu,
      cm: state.dynCm || cfg.cfPingCm,
      bd: state.dynBgp || cfg.cfPingBgp,
      node1: state.dynNode1 || cfg.cfNode1,
      node2: state.dynNode2 || cfg.cfNode2,
      node3: state.dynNode3 || cfg.cfNode3,
      node4: state.dynNode4 || cfg.cfNode4,
    };
  }

  /**
   * 指标快照（同一节拍内复用）。
   * tick()（采样）与 sendViaWss()/postOnce()（上报）都要指标，但它们通常在同一秒内发生，
   * 过去各自 collect() 一次 → 每个节拍 2 次全量采集（含 `df` 子进程）。这里加一层短 TTL 缓存：
   * 采样与上报共用同一份快照，指标口径也保持一致。
   */
  async function collectMetrics() {
    const now = Date.now();
    if (state.lastMetrics && now - state.lastMetricsAt < COLLECT_REUSE_MS) {
      return state.lastMetrics;
    }
    const m = await collectMetricsFresh();
    state.lastMetrics = m;
    state.lastMetricsAt = now;
    return m;
  }

  /** buildBody: 用快照组装上报体（时间/样本列表每次都是最新的） */
  function buildBody(metrics, now = Date.now()) {
    const body = {
      id: cfg.cfNodeId,
      secret: cfg.cfSecret,
      time: clockSnapshot(now),
      metrics,
      collect_interval: effCollectInterval(),
      report_interval: effReportInterval(),
    };
    // config_schema/config_md5 按官方节奏：md5 变化或每分钟至少一次
    if (shouldReportConfigState(state.configMd5, now)) {
      body.config_schema = CONFIG_SCHEMA;
      body.config_md5 = state.configMd5;
    }
    if (state.samples.length > 0) {
      body.samples = state.samples.map((s) => ({ ts: s.ts, metrics: s.metrics }));
    }
    return body;
  }

  /** 兼容入口：采集一次并组装上报体（内部调用方优先用 collectMetrics + buildBody） */
  async function collect() {
    return buildBody(await collectMetrics());
  }

  async function collectMetricsFresh() {
    const [cpu, mem, net, disk, meta, load, boot, procs, conns, swap, io] = await Promise.all([
      cpuPercent(),
      Promise.resolve(memInfo()),
      netCounters(effIface()),
      diskInfo(),
      hostMeta(),
      loadAvg(),
      bootTimeMs(),
      procCount(),
      tcpUdpCount(),
      swapInfo(),
      diskIo(),
    ]);
    const now = Date.now();
    let inSpeed = 0;
    let outSpeed = 0;
    let readBps = 0;
    let writeBps = 0;
    if (state.lastNet && state.lastAt) {
      const dt = Math.max(1, (now - state.lastAt) / 1000);
      inSpeed = Math.max(0, Math.floor((net.rx - state.lastNet.rx) / dt));
      outSpeed = Math.max(0, Math.floor((net.tx - state.lastNet.tx) / dt));
      if (state.lastIo) {
        readBps = Math.max(0, Math.floor((io.readBytes - state.lastIo.readBytes) / dt));
        writeBps = Math.max(0, Math.floor((io.writeBytes - state.lastIo.writeBytes) / dt));
      }
    }
    state.lastNet = net;
    state.lastIo = io;
    state.lastAt = now;

    // 测速快照来自后台滚动窗口（对齐官方 networkWorker + ProbeSnapshot）
    const snap = probeSnapshot(now);
    const targets = effProbeTargets();
    // 月度流量：持久化的本月累计（面板语义），未启用/失败时回落到累计计数器
    const monthly = accumulateTraffic(net.rx, net.tx, now, effResetDay());
    return {
      cpu: Number(cpu).toFixed(2),
      ram_total: String(mem.total),
      ram_used: String(mem.used),
      swap_total: swap.total,
      swap_used: swap.used,
      disk_total: String(disk.total),
      disk_used: String(disk.used),
      disk: {
        read_bps: readBps,
        write_bps: writeBps,
        read_iops: 0,
        write_iops: 0,
        await_ms: 0,
        util: 0,
      },
      load_avg: load,
      boot_time: String(calibratedBootTime(boot, now)),
      net_rx: String(net.rx),
      net_tx: String(net.tx),
      net_rx_monthly: String(monthly.rx),
      net_tx_monthly: String(monthly.tx),
      net_in_speed: String(inSpeed),
      net_out_speed: String(outSpeed),
      os: meta.os,
      arch: meta.arch,
      kernel_version: meta.kernel,
      cpu_info: meta.cpuModel,
      cpu_cores: meta.cores,
      gpu_info: null,
      processes: procs,
      tcp_conn: conns.tcp,
      udp_conn: conns.udp,
      ip_v4: state.lastIpv4 || "0",
      ip_v6: state.lastIpv6 || "0",
      ping_ct: probeRttValue(targets.ct, snap.ct),
      ping_cu: probeRttValue(targets.cu, snap.cu),
      ping_cm: probeRttValue(targets.cm, snap.cm),
      ping_bgp: probeRttValue(targets.bd, snap.bd),
      ping_node_1: probeRttValue(targets.node1, snap.node1),
      ping_node_2: probeRttValue(targets.node2, snap.node2),
      ping_node_3: probeRttValue(targets.node3, snap.node3),
      ping_node_4: probeRttValue(targets.node4, snap.node4),
      loss_ct: probeLossValue(targets.ct, snap.ct),
      loss_cu: probeLossValue(targets.cu, snap.cu),
      loss_cm: probeLossValue(targets.cm, snap.cm),
      loss_bgp: probeLossValue(targets.bd, snap.bd),
      loss_node_1: probeLossValue(targets.node1, snap.node1),
      loss_node_2: probeLossValue(targets.node2, snap.node2),
      loss_node_3: probeLossValue(targets.node3, snap.node3),
      loss_node_4: probeLossValue(targets.node4, snap.node4),
    };
  }

  // ---- 官方探测语义 ----
  function probeKey(kind, target) {
    const t = String(target || "").trim();
    if (!t) return "";
    return `${kind === "icmp" ? "icmp" : "tcp"}\0${t}`;
  }
  function medianInt(values) {
    if (!values.length) return -1;
    const s = [...values].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : Math.floor((s[mid - 1] + s[mid]) / 2);
  }
  // 单次 tcp 探测（DNS 解析后直连 IP，1.5s 超时；对齐官方 tcpPing）
  function tcpProbeOnce(target, timeoutMs = 1500) {
    return new Promise((resolve) => {
      const t = String(target || "").trim();
      if (!t) return resolve(null);
      let host = t, port = 80;
      const m = t.match(/^\[([^\]]+)\](?::(\d+))?$/) || t.match(/^([^:]+)(?::(\d+))?$/);
      if (m) { host = m[1]; if (m[2]) port = parseInt(m[2], 10) || 80; }
      if (!host || port < 1 || port > 65535) return resolve(null);
      const start = Date.now();
      let done = false;
      const finish = (v) => { if (!done) { done = true; clearTimeout(timer); try { sock.destroy(); } catch {} resolve(v); } };
      const sock = createConnection({ host, port });
      const timer = setTimeout(() => finish(null), timeoutMs);
      try { timer.unref && timer.unref(); } catch {}
      sock.on("connect", () => { const ms = Math.max(1, Date.now() - start); finish(ms); });
      sock.on("error", () => finish(null));
    });
  }
  // 官方 measureProbe：count 次（默认 4 次）取中位数 + 丢包率
  async function measureProbe(kind, target, count = 4) {
    const t = String(target || "").trim();
    if (!t) return { rtt: -1, loss: 100, ok: false };
    const k = kind === "icmp" ? "icmp" : "tcp";
    if (k === "icmp") {
      // Node 无特权 raw socket：icmp 回退到 tcp（行为降级，字段语义不变）
      return measureProbe("tcp", target, count);
    }
    let ok = 0;
    const values = [];
    for (let i = 0; i < Math.max(1, count); i++) {
      const ms = await tcpProbeOnce(t);
      if (ms !== null) { ok++; values.push(ms); }
    }
    const n = Math.max(1, count);
    if (!ok) return { rtt: -1, loss: 100, ok: false };
    return { rtt: medianInt(values), loss: Math.floor((n - ok) * 100 / n), ok: true };
  }
  function histAdd(key, result) {
    if (!key) return;
    const now = Date.now();
    const h = state.probeHist[key] || (state.probeHist[key] = []);
    h.push({ at: now, rtt: result.rtt, ok: result.ok });
    while (h.length > 6) h.shift();
  }
  // 滚动窗口快照：近 2 分钟内 OK 采样的中位数；loss 按窗口内失败占比（对齐官方）
  function histSnapshot(key, now) {
    const h = state.probeHist[key] || [];
    const cutoff = now - 2 * 60 * 1000;
    const values = [];
    let lost = 0, total = 0;
    for (const s of h.slice(-6)) {
      if (s.at < cutoff) continue; // 过期采样直接出窗口：不计入 total，否则会稀释 loss
      total++;
      if (!s.ok || s.rtt < 0) { if (!s.ok) lost++; continue; }
      values.push(s.rtt);
    }
    const loss = total ? Math.floor(lost * 100 / total) : 100;
    if (!values.length) return { rtt: -1, loss, ok: false };
    return { rtt: medianInt(values), loss, ok: true };
  }
  function probeSnapshot(now) {
    const kind = effPingMode();
    const t = effProbeTargets();
    const get = (target) => histSnapshot(probeKey(kind, target), now);
    return {
      ct: get(t.ct), cu: get(t.cu), cm: get(t.cm), bd: get(t.bd),
      node1: get(t.node1), node2: get(t.node2), node3: get(t.node3), node4: get(t.node4),
    };
  }
  function probeRttValue(node, r) {
    if (!String(node || "").trim()) return false;
    if (!r.ok || r.rtt < 0) return "null";
    return String(r.rtt);
  }
  function probeLossValue(node, r) {
    if (!String(node || "").trim()) return false;
    return String(r.loss < 0 ? 100 : r.loss);
  }
  // 后台采样：每 20s 对 8 个点各测 1 次（对齐官方 metricsProbeInterval/SampleCount）
  // 8 个点并行探测（每点独立 1.5s 超时），避免串行最坏 12s 占满采样窗口
  async function probeTick() {
    const now = Date.now();
    const kind = effPingMode();
    const t = effProbeTargets();
    const jobs = [
      ["ct", t.ct], ["cu", t.cu], ["cm", t.cm], ["bd", t.bd],
      ["node1", t.node1], ["node2", t.node2], ["node3", t.node3], ["node4", t.node4],
    ].filter(([, target]) => String(target || "").trim());
    const results = await Promise.all(jobs.map(async ([, target]) => {
      try {
        return [target, await measureProbe(kind, target, 1)];
      } catch {
        return [target, null];
      }
    }));
    for (const [target, r] of results) {
      if (r) histAdd(probeKey(kind, target), r);
    }
    state.lastProbeAt = now;
  }
  // 公网 IP：10 分钟刷新一次（对齐官方 networkWorker；失败保留旧值）
  async function ipTick() {
    try {
      const v4 = await publicIp("v4");
      if (v4) state.lastIpv4 = v4;
      const v6 = await publicIp("v6");
      if (v6) state.lastIpv6 = v6;
      state.lastIpAt = Date.now();
    } catch {}
  }
  function publicIp(ver) {
    const eps = ver === "v6"
      ? ["https://api6.ipify.org", "https://ipv6.icanhazip.com"]
      : ["https://api.ipify.org", "https://cloudflare.com/cdn-cgi/trace"];
    return (async () => {
      for (const u of eps) {
        try {
          const res = await fetch(u, { headers: { "User-Agent": "curl/8.0.1" }, signal: AbortSignal.timeout(8000) });
          const text = await res.text().catch(() => "");
          // 按"非 IP 字符"切分后逐段严格校验：
          // 旧实现用宽松正则匹配（v6 只要 2 个连续 hex 就命中），错误页里的碎片也会被当成地址上报。
          for (const raw of String(text).split(/[^0-9a-fA-F:.]+/)) {
            const tok = raw.replace(/^\.+|\.+$/g, "");
            if (!tok) continue;
            if (ver === "v6") {
              if (isIpv6(tok)) return tok;
            } else if (isIpv4(tok)) {
              return tok;
            }
          }
        } catch {}
      }
      return "";
    })();
  }

  // ---- 官方校时语义（Date 头 + 半 RTT 补偿，阈值 20s，24h 过期） ----
  function clockSnapshot(now) {
    const out = { local_ts: now };
    const cal = state.clockCal;
    if (cal) {
      const age = now - cal.anchorMs;
      if (age >= 0 && age <= 24 * 3600 * 1000) {
        const accurate = cal.accurateAtAnchor + age;
        out.accurate_ts = accurate;
        out.offset_ms = accurate - now;
        out.source = cal.source;
        out.round_trip_ms = cal.roundTripMs;
        out.sample_age_ms = age;
      }
    }
    return out;
  }
  function calibratedBootTime(bootMsStr, now) {
    const b = Number(bootMsStr) || 0;
    if (!b) return bootMsStr;
    const snap = clockSnapshot(now);
    if (snap.accurate_ts == null) return bootMsStr;
    return String(b + (snap.accurate_ts - now));
  }
  function calibrateClock(dateHeader, rttMs, atMs) {
    const t = Date.parse(dateHeader);
    if (Number.isNaN(t)) return false;
    const half = Math.floor(rttMs / 2) + (rttMs % 2);
    const anchor = { accurateAtAnchor: t + half, anchorMs: atMs, roundTripMs: rttMs, source: "date" };
    const cur = state.clockCal;
    if (cur) {
      const curTs = cur.accurateAtAnchor + (atMs - cur.anchorMs);
      if (Math.abs(curTs - anchor.accurateAtAnchor) <= 20000) return false;
    }
    state.clockCal = anchor;
    return true;
  }
  function shouldReportConfigState(md5, now) {
    if (!state.lastConfigStateAt || md5 !== state.lastConfigStateMd5 || now - state.lastConfigStateAt >= 60000) {
      state.lastConfigStateAt = now;
      state.lastConfigStateMd5 = md5;
      return true;
    }
    return false;
  }

  // ---- 官方动态配置语义 ----
  const dynUnknownWarned = new Set();
  const DYN_ALLOWED = new Set([
    "collect_interval", "report_interval", "wss_report_interval", "reset_day", "schema_version",
    "custom_ct", "custom_cu", "custom_cm", "custom_bd",
    "node_1", "node_2", "node_3", "node_4",
    "interface", "connection_mode", "ping_mode",
    "rx_correction", "tx_correction", "update",
  ]);
  function applyDynConfig(bodyText, md5Hex, opts = {}) {
    const raw = String(bodyText || "").trim();
    if (!raw) return { ok: false, reason: "empty body" };
    if (raw.length > 1024) return { ok: false, reason: "response too large" };
    if (!/^[A-Za-z0-9_=&.,:%+\-*?\[\]]*$/.test(raw)) return { ok: false, reason: "invalid body characters" };
    let values;
    try { values = Object.fromEntries(new URLSearchParams(raw).entries()); }
    catch { return { ok: false, reason: "parse failed" }; }
    // 未知字段：忽略并告警一次，不让一个字段把整包合法配置带下水
    // （面板升级新增字段时，旧实现的整包 reject 会让该实例静默失去全部动态配置）
    for (const k of Object.keys(values)) {
      if (DYN_ALLOWED.has(k)) continue;
      if (!dynUnknownWarned.has(k)) {
        dynUnknownWarned.add(k);
        logger.warn(`cfprobe dynamic config: unknown field ignored: ${k}`);
      }
      delete values[k];
    }
    const hasConfig = ["collect_interval", "report_interval", "wss_report_interval", "reset_day",
      "schema_version", "interface", "connection_mode", "ping_mode",
      "node_1", "node_2", "node_3", "node_4"].some((k) => k in values);
    if (!hasConfig) {
      // 流量校正：以服务端下发的值为本月累计基准（其余字段无需处理）
      if (("rx_correction" in values) || ("tx_correction" in values)) {
        const rx = parseInt(values.rx_correction, 10);
        const tx = parseInt(values.tx_correction, 10);
        applyTrafficCorrection(rx, tx);
        logger.info(`cfprobe traffic correction applied rx=${Number.isFinite(rx) ? rx : "-"} tx=${Number.isFinite(tx) ? tx : "-"}`);
        return { ok: true, noop: true };
      }
      if ("update" in values) return { ok: true, noop: true }; // 升级确认：Node 版无可执行动作
      return { ok: false, reason: "no config fields" };
    }
    const hex = String(md5Hex || "").toLowerCase();
    const hasMd5 = /^[0-9a-f]{32}$/.test(hex);
    if (!hasMd5 && !opts.allowMissingMd5) return { ok: false, reason: "invalid remote md5" };
    const pint = (k, d) => {
      if (!(k in values)) return d;
      const n = parseInt(values[k], 10);
      return Number.isNaN(n) ? d : n;
    };
    const collect = pint("collect_interval", -1);
    const report = pint("report_interval", -1);
    const wssReport = pint("wss_report_interval", 2);
    const reset = pint("reset_day", -1);
    // 字段缺席时不校验（pint 返回 -1 表示缺席，消费者会回退到本地值）；只校验下发了但写错的情况
    if ("collect_interval" in values && ![0, 1, 2, 5, 10].includes(collect)) return { ok: false, reason: `invalid collect_interval ${collect}` };
    if ("report_interval" in values && ![30, 60, 120, 180].includes(report)) return { ok: false, reason: `invalid report_interval ${report}` };
    if (wssReport < 1 || wssReport > 5) return { ok: false, reason: `invalid wss_report_interval ${wssReport}` };
    if ("reset_day" in values && (reset < 0 || reset > 31)) return { ok: false, reason: `invalid reset_day ${reset}` };
    // schema_version 缺席时不卡（只校验下发了但写错的情况），避免面板只推部分字段时整个配置被拒
    if ("schema_version" in values && values.schema_version !== CONFIG_SCHEMA) return { ok: false, reason: `invalid schema_version ${values.schema_version}` };
    if ("report_interval" in values && "collect_interval" in values && report < collect) return { ok: false, reason: "report_interval less than collect_interval" };
    const connMode = String(values.connection_mode ?? "").toLowerCase();
    if (connMode && connMode !== "auto" && connMode !== "http") return { ok: false, reason: `invalid connection_mode ${values.connection_mode}` };
    const pingMode = String(values.ping_mode ?? "").toLowerCase();
    if (pingMode && pingMode !== "tcp" && pingMode !== "icmp") return { ok: false, reason: `invalid ping_mode ${values.ping_mode}` };
    // auto 模式归一：collect<=0 或大于 wss 间隔时取 wss 间隔（对齐官方）
    let effCollect = collect;
    if ((connMode || effConnectionMode()) === "auto" && (collect <= 0 || collect > wssReport)) effCollect = wssReport;
    const changed = hasMd5 ? hex !== state.configMd5
      : (effCollect !== state.dynCollectInterval || report !== (state.dynReportInterval || effReportInterval())
        || wssReport !== state.dynWssReportInterval
        || reset !== state.dynResetDay || (values.custom_ct ?? "") !== state.dynCt
        || (values.custom_cu ?? "") !== state.dynCu || (values.custom_cm ?? "") !== state.dynCm
        || (values.custom_bd ?? "") !== state.dynBgp || (values.node_1 ?? "") !== state.dynNode1
        || (values.node_2 ?? "") !== state.dynNode2 || (values.node_3 ?? "") !== state.dynNode3
        || (values.node_4 ?? "") !== state.dynNode4 || (values.interface ?? "") !== state.dynIface
        || (connMode || "") !== state.dynConnectionMode || (pingMode || "") !== state.dynPingMode);
    if (!changed) return { ok: true, noop: true };
    state.dynCollectInterval = effCollect;
    state.dynReportInterval = report;
    state.dynWssReportInterval = wssReport;
    state.dynResetDay = reset;
    state.dynCt = values.custom_ct ?? "";
    state.dynCu = values.custom_cu ?? "";
    state.dynCm = values.custom_cm ?? "";
    state.dynBgp = values.custom_bd ?? "";
    state.dynNode1 = values.node_1 ?? "";
    state.dynNode2 = values.node_2 ?? "";
    state.dynNode3 = values.node_3 ?? "";
    state.dynNode4 = values.node_4 ?? "";
    state.dynIface = values.interface ?? "";
    state.dynConnectionMode = connMode;
    state.dynPingMode = pingMode;
    if (hasMd5) state.configMd5 = hex;
    state.serverCfg = { ...values };
    // 配置变更后重置采样与上报节奏（对齐官方）
    state.samples = [];
    state.lastSampleAt = 0;
    state.wssReportAfterMs = 0;
    // connection_mode 动态切换：http→auto 拉起 WSS 双循环；auto→http 断开现有连接（循环自行退出）
    if (useWss()) ensureWssLoops();
    else closeWs();
    logger.status(`cfprobe ok: dynamic config applied md5=${hasMd5 ? hex : "(none)"} conn=${connMode || effConnectionMode()} ping=${pingMode || effPingMode()}`);
    return { ok: true };
  }

  function handleResponse(res, bodyText, startedAt, receivedAt) {
    // POST 响应头 X-Agent-Wss-Mode: active -> 解除 409 时段关闭
    try { handleWssModeHeader(res.headers); } catch {}
    // 校时：Date 头 + 半 RTT 补偿（对齐官方 calibratedClock）
    try {
      const date = res.headers.get("date");
      if (date && startedAt && receivedAt) calibrateClock(date, receivedAt - startedAt, receivedAt);
    } catch {}
    if (!bodyText) return;
    const raw = String(bodyText).trim();
    if (!raw || raw === "{}" || /^OK$/i.test(raw)) return;
    // 动态配置：query-string body + 服务端 X-Agent-Config-Md5 头（对齐官方）；
    // 只要 body 里出现任一已知配置字段就尝试解析（之前只认 collect/report/schema 三个关键词，
    // 面板只推 connection_mode/ping_mode 等会被静默丢掉）
    if (bodyHasConfigField(raw)) {
      let md5 = "";
      try { md5 = String(res.headers.get("x-agent-config-md5") || ""); } catch {}
      const r = applyDynConfig(raw, md5);
      if (!r.ok && !r.noop) logger.warn(`cfprobe dynamic config rejected: ${r.reason}`);
    }
  }

  // body 里是否出现任一已知动态配置字段（query-string key 形态）
  function bodyHasConfigField(raw) {
    for (const seg of String(raw).split("&")) {
      const k = seg.split("=", 1)[0];
      if (DYN_ALLOWED.has(k)) return true;
    }
    return false;
  }

  function postUrl() {
    return cfg.cfWorkerUrl.endsWith("/update") ? cfg.cfWorkerUrl : `${cfg.cfWorkerUrl}/update`;
  }

  function agentHeaders(extra) {
    return {
      "Content-Type": "application/json",
      Accept: "*/*",
      "User-Agent": "cfsm",
      "X-Agent-Config-Schema": CONFIG_SCHEMA,
      "X-Agent-Version": AGENT_VERSION,
      "X-Agent-Config-Md5": state.configMd5,
      ...(extra || {}),
    };
  }

  function wssPaused() {
    return Date.now() < state.wssPausedUntil;
  }

  function wssPause(reason) {
    // 认证/配置类错误：WSS + POST 同时停 120s（对齐官方 delayProtocol）
    state.wssPausedUntil = Date.now() + WSS_PAUSE_MS;
    state.wssPauseReason = reason || "protocol_error";
    closeWs();
    logger.warn(`WSS retry delayed reason=${state.wssPauseReason} delay=120s`);
    logger.warn(`POST fallback delayed reason=${state.wssPauseReason} delay=120s`);
  }

  function wssIntervalMs() {
    // 优先级：服务端 ack 下发的 nextWssReportAfterMs > 面板配置 wss_report_interval > 默认 2s
    if (state.wssReportAfterMs > 0) {
      return Math.min(Math.max(state.wssReportAfterMs, WSS_REPORT_MIN_MS), WSS_REPORT_MAX_MS);
    }
    const base = (state.dynWssReportInterval > 0 ? state.dynWssReportInterval : 2) * 1000;
    return Math.min(Math.max(base, WSS_REPORT_MIN_MS), WSS_REPORT_MAX_MS);
  }

  function closeWs() {
    state.wssConnected = false;
    if (state.ws) {
      try { state.ws.sock.destroy(); } catch {}
      state.ws = null;
    }
  }

  function wsWriteText(text) {
    if (!state.ws) return false;
    try {
      state.ws.sock.write(wsFrameEncode(0x1, Buffer.from(text)));
      return true;
    } catch {
      closeWs();
      return false;
    }
  }

  function handleWssModeHeader(headers) {
    // POST 响应头 X-Agent-Wss-Mode: active -> 解除 409 时段关闭，恢复 WSS
    if (!headers || !headers.get) return;
    const mode = String(headers.get("x-agent-wss-mode") || "").toLowerCase();
    const reason = String(headers.get("x-agent-wss-reason") || "").toLowerCase();
    if (mode === "active") {
      if (state.wssPauseReason === "wss_schedule_inactive") {
        state.wssPausedUntil = 0;
        state.wssPauseReason = "";
        logger.warn(`WSS temporary disable cleared reason=${reason || "server_active"}`);
      }
    } else if (mode === "inactive" || mode === "disabled") {
      if (reason === "wss_schedule_inactive" || reason === "wss_schedule_empty" || reason === "wss_disabled") {
        state.wssPausedUntil = Date.now() + WSS_PAUSE_MS;
        state.wssPauseReason = reason;
        closeWs();
        logger.warn(`WSS temporarily disabled reason=${reason}; using POST report`);
      }
    }
  }

  function applyWssConfig(bodyText, md5) {
    // 最短 1 分钟处理一次 WSS 配置下发（对齐官方 wssConfigMinInterval）
    const now = Date.now();
    if (now - state.wssLastConfigAt < 60000) {
      logger.debug("WSS config delayed (min interval 60s)");
      return;
    }
    state.wssLastConfigAt = now;
    const r = applyDynConfig(bodyText, md5, { allowMissingMd5: true });
    if (!r.ok && !r.noop) logger.warn(`cfprobe WSS config rejected: ${r.reason}`);
  }

  function handleServerFrame(raw) {
    let frame;
    try {
      frame = JSON.parse(raw);
    } catch {
      logger.debug("WSS message ignored invalid_json");
      return;
    }
    const type = frame.type;
    if (type === "ack") {
      if (frame.nextWssReportAfterMs != null) {
        const ms = Number(frame.nextWssReportAfterMs);
        if (ms > 0) {
          state.wssReportAfterMs = Math.min(Math.max(ms, WSS_REPORT_MIN_MS), WSS_REPORT_MAX_MS);
        }
      }
      logger.debug(`WSS ack ts=${frame.ts} persisted=${!!frame.persisted} nextWssReportAfterMs=${frame.nextWssReportAfterMs}`);
      // ack 内携带的 config 下发（body / config_body / config / payload 多形态）
      const body = frame.body || frame.config_body || (typeof frame.config === "string" ? frame.config : "") || "";
      const md5 = frame.config_md5 || frame.configMd5 || frame.md5 || "";
      const pl = frame.payload;
      let plBody = "", plMd5 = "";
      if (typeof pl === "string") plBody = pl;
      else if (pl && typeof pl === "object") {
        plBody = pl.body || pl.config || "";
        plMd5 = pl.config_md5 || pl.configMd5 || pl.md5 || "";
      }
      const cfgBody = body || plBody;
      if (cfgBody) applyWssConfig(String(cfgBody), md5 || plMd5);
    } else if (type === "error") {
      const code = Number(frame.code || 0);
      const reason = String(frame.error || frame.text || "server_error");
      if (code === 409 && /wss_schedule_inactive|wss_schedule_empty|wss_disabled/.test(reason)) {
        state.wssPausedUntil = Date.now() + WSS_PAUSE_MS;
        state.wssPauseReason = reason;
        closeWs();
        logger.warn(`WSS unavailable reason=${reason}`);
        return;
      }
      if (code === 401 || code === 403 || code === 404 || code === 1008) {
        logger.warn(`WSS error code=${code} error=${reason}`);
        wssPause(`server error code=${code} error=${reason}`);
        return;
      }
      logger.warn(`WSS error code=${code} error=${reason}`);
      wssPause(`server error code=${code}`);
    } else if (type === "config" || type === "remote_config") {
      const body = frame.body || frame.config_body || (typeof frame.config === "string" ? frame.config : "") || "";
      const md5 = frame.config_md5 || frame.configMd5 || frame.md5 || "";
      if (body) applyWssConfig(String(body), md5);
      else logger.debug("WSS config ignored: empty body");
    } else if (type === "hello") {
      logger.debug(`WSS hello repeated ts=${frame.ts}`);
    } else {
      logger.debug(`WSS message ignored type=${JSON.stringify(type)}`);
    }
  }

  async function wssEnsureLoop() {
    // 后台长连接循环：握手 -> 等 hello -> 标记 connected；读循环在 onData 里驱动；
    // 成功后等待断连再重建（否则会紧接着再建连，旧连接的 idle 定时器还会误杀新连接）
    if (state.wssLoop) return;
    state.wssLoop = (async () => {
      while (state.running && useWss() && !state.wssWantStop) {
        if (wssPaused()) {
          const wait = state.wssPausedUntil - Date.now();
          logger.debug(`WSS paused reason=${state.wssPauseReason}, wait ${Math.ceil(wait / 1000)}s`);
          await new Promise((r) => setTimeout(r, Math.min(Math.max(wait, 1000), 30000)));
          continue;
        }
        try {
          await wssConnectOnce();
          state.wssBackoffMs = WSS_NET_MIN_MS;
          while (state.running && useWss() && !state.wssWantStop && state.wssConnected && state.ws && !wssPaused()) {
            await new Promise((r) => setTimeout(r, 1000));
          }
          if (!state.running || !useWss() || state.wssWantStop || wssPaused()) continue;
          // 正常断连后稍等再重建，避免紧接着握手打扰服务端
          await new Promise((r) => setTimeout(r, 2000));
        } catch (e) {
          if (!state.running || !useWss()) break;
          const msg = String((e && e.message) || e);
          if (/http=401|http=403|http=404|close code=1008/i.test(msg)) {
            wssPause(msg.slice(0, 120));
            continue;
          }
          if (/http=409|wss_schedule_inactive/i.test(msg)) {
            state.wssPausedUntil = Date.now() + WSS_PAUSE_MS;
            state.wssPauseReason = "wss_schedule_inactive";
            closeWs();
            logger.warn("WSS temporarily disabled reason=wss_schedule_inactive; using POST report");
            continue;
          }
          logger.warn(`WSS retry delayed reason=${msg.slice(0, 120)} delay=${Math.ceil(state.wssBackoffMs / 1000)}s`);
          await new Promise((r) => setTimeout(r, state.wssBackoffMs));
          state.wssBackoffMs = Math.min(state.wssBackoffMs * 2, WSS_NET_MAX_MS);
        }
      }
      state.wssLoop = null;
    })();
  }

  async function wssConnectOnce() {
    state.wssConnecting = true;
    try {
      return await wssConnectOnceInner();
    } finally {
      state.wssConnecting = false;
    }
  }

  async function wssConnectOnceInner() {
    const wsUrl = cfWsUrl(postUrl(), CONFIG_SCHEMA, state.configMd5);
    const headers = {
      Accept: "*/*",
      "User-Agent": "cfsm",
      "X-Agent-Config-Schema": CONFIG_SCHEMA,
      "X-Agent-Version": AGENT_VERSION,
      "X-Agent-Config-Md5": state.configMd5,
    };
    const startedAt = Date.now();
    const { sock, headers: respHeaders, receivedAt, rest } = await wsConnect(wsUrl, headers, WSS_HANDSHAKE_TIMEOUT);
    // Date 头校准（握手响应，半 RTT 补偿；对齐官方 calibratedClock）
    try {
      const d = respHeaders["date"];
      if (d) calibrateClock(d, receivedAt - startedAt, receivedAt);
    } catch {}
    // 等 hello（10s）
    const helloRaw = await wssReadOne(sock, rest, WSS_HELLO_TIMEOUT);
    let hello;
    try {
      hello = JSON.parse(helloRaw);
    } catch {
      try { sock.destroy(); } catch {}
      throw new Error("WSS hello invalid json");
    }
    if (!hello || hello.type !== "hello" || hello.protocol !== "update") {
      try { sock.destroy(); } catch {}
      throw new Error(`WSS hello invalid type=${hello && hello.type} protocol=${hello && hello.protocol}`);
    }
    logger.warn(`WSS connected protocol=${hello.protocol} ts=${hello.ts}`);
    state.ws = { sock, buf: Buffer.alloc(0) };
    state.wssConnected = true;
    attachWsReader(sock);
    // 首包：旧 POST body 不变，立即发一次（对齐官方）
    await sendViaWss();
    // 读空闲超时 = 当前上报间隔 + 15s（对齐官方）；由 reader 看门狗执行
    return true;
  }

  function wssReadOne(sock, seed, timeoutMs) {
    return new Promise((resolve, reject) => {
      let acc = seed && seed.length ? seed : Buffer.alloc(0);
      let msgBuf = Buffer.alloc(0);
      let msgOpcode = 0;
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error("WSS hello timeout"));
      }, timeoutMs);
      try { timer.unref && timer.unref(); } catch {}
      const cleanup = () => {
        clearTimeout(timer);
        sock.off("data", onData);
        sock.off("error", onError);
        sock.off("close", onClose);
      };
      const pump = () => {
        while (true) {
          let fr;
          try {
            fr = wsFrameDecodeOne(acc);
          } catch (e) {
            cleanup();
            reject(e);
            return false;
          }
          if (!fr.ok) return true; // needMore
          acc = fr.rest;
          if (fr.opcode === 0x9) {
            try { sock.write(wsFrameEncode(0xa, fr.payload)); } catch {}
            continue;
          }
          if (fr.opcode === 0xa) continue;
          if (fr.opcode === 0x8) {
            const { code, reason } = wsCloseCode(fr.payload);
            cleanup();
            const err = new Error(`WSS close code=${code} reason=${reason}`);
            err.closeCode = code;
            reject(err);
            return false;
          }
          if (fr.opcode === 0x1 || fr.opcode === 0x2) {
            msgOpcode = fr.opcode;
            msgBuf = Buffer.concat([msgBuf, fr.payload]);
          } else if (fr.opcode === 0x0) {
            msgBuf = Buffer.concat([msgBuf, fr.payload]);
          } else {
            cleanup();
            reject(new Error(`WSS unsupported opcode=${fr.opcode}`));
            return false;
          }
          if (fr.fin) {
            cleanup();
            resolve(msgBuf.toString("utf8"));
            return false;
          }
        }
      };
      const onData = (chunk) => {
        acc = Buffer.concat([acc, chunk]);
        pump();
      };
      const onError = (e) => { cleanup(); reject(e); };
      const onClose = () => { cleanup(); reject(new Error("WSS closed before hello")); };
      sock.on("data", onData);
      sock.on("error", onError);
      sock.on("close", onClose);
      if (acc.length) pump();
    });
  }

  function attachWsReader(sock) {
    let acc = Buffer.alloc(0);
    let msgBuf = Buffer.alloc(0);
    let idleTimer = null;
    const mySock = sock; // 绑定本连接：idle 只杀自己，不杀重建后的新连接
    const armIdle = () => {
      if (idleTimer) clearTimeout(idleTimer);
      if (state.ws === null || state.ws.sock !== mySock) return; // 已被新连接取代
      const idle = wssIntervalMs() + WSS_IDLE_GRACE_MS;
      idleTimer = setTimeout(() => {
        if (state.ws === null || state.ws.sock !== mySock) return;
        logger.warn("WSS idle timeout, reconnecting");
        closeWs();
      }, idle);
      try { idleTimer.unref && idleTimer.unref(); } catch {}
    };
    armIdle();
    const pump = () => {
      while (true) {
        let fr;
        try {
          fr = wsFrameDecodeOne(acc);
        } catch (e) {
          logger.warn(`WSS frame error: ${e.message}`);
          if (state.ws && state.ws.sock === mySock) closeWs();
          else try { mySock.destroy(); } catch {}
          return;
        }
        if (!fr.ok) return;
        acc = fr.rest;
        armIdle();
        if (fr.opcode === 0x9) {
          try { sock.write(wsFrameEncode(0xa, fr.payload)); } catch {}
          continue;
        }
        if (fr.opcode === 0xa) continue;
        if (fr.opcode === 0x8) {
          const { code, reason } = wsCloseCode(fr.payload);
          try { sock.write(wsFrameEncode(0x8, fr.payload)); } catch {}
          if (state.ws && state.ws.sock === mySock) closeWs();
          else try { mySock.destroy(); } catch {}
          logger.warn(`WSS close code=${code} reason=${reason}`);
          if (code === 1008) wssPause(`WSS close code=1008 reason=${reason}`);
          else if (wssPaused()) { /* 409 时段关闭已在 handleServerFrame 处理 */ }
          return;
        }
        if (fr.opcode === 0x1 || fr.opcode === 0x2) {
          msgBuf = Buffer.alloc(0);
          msgBuf = Buffer.concat([msgBuf, fr.payload]);
        } else if (fr.opcode === 0x0) {
          msgBuf = Buffer.concat([msgBuf, fr.payload]);
        } else {
          logger.warn(`WSS unsupported opcode=${fr.opcode}`);
          closeWs();
          return;
        }
        if (fr.fin) {
          const text = msgBuf.toString("utf8");
          msgBuf = Buffer.alloc(0);
          try {
            handleServerFrame(text);
          } catch (e) {
            logger.debug(`WSS frame handle error: ${e.message}`);
          }
        }
      }
    };
    sock.on("data", (chunk) => {
      acc = Buffer.concat([acc, chunk]);
      if (acc.length > WS_MAX_MSG * 2) {
        logger.warn("WSS buffer overflow, reconnecting");
        if (state.ws && state.ws.sock === mySock) closeWs();
        else try { mySock.destroy(); } catch {}
        return;
      }
      pump();
    });
    sock.on("error", () => {
      if (state.ws && state.ws.sock === mySock) closeWs();
      else try { mySock.destroy(); } catch {}
    });
    sock.on("close", () => {
      if (idleTimer) clearTimeout(idleTimer);
      if (state.ws && state.ws.sock === mySock) closeWs();
    });
  }

  async function sendViaWss() {
    if (!state.wssConnected || !state.ws) return false;
    try {
      // 复用节拍内的指标快照（与 tick() 共用一次采集）
      const metrics = await collectMetrics();
      const body = buildBody(metrics);
      // collect 采样累积（对齐官方 samples；上报成功后清空）
      const ci = effCollectInterval();
      if (ci > 0) {
        pushSample(clockSnapshot(Date.now()).local_ts, sampleMetrics(metrics));
        state.lastSampleAt = Date.now();
      }
      const text = JSON.stringify(body);
      if (!wsWriteText(text)) return false;
      state.lastOk = new Date().toISOString();
      state.lastError = "";
      state.reportCount += 1;
      state.wssReports += 1;
      state.lastWssSendAt = Date.now();
      state.samples = [];
      logger.debug(`cfprobe WSS reported #${state.reportCount}`);
      return true;
    } catch (e) {
      closeWs();
      // 写失败立即尝试一次 POST fallback（对齐官方）；sendViaWss 已采样过，这里不再重复推
      logger.debug(`WSS write failed, POST fallback once: ${e.message}`);
      return await postOnce(true, true);
    }
  }

  function sampleMetrics(m) {
    // 对齐官方 sampleMetricsToMap：只保留轻量字段
    return {
      cpu: m.cpu, ram_total: m.ram_total, ram_used: m.ram_used,
      swap_total: m.swap_total, swap_used: m.swap_used,
      net_in_speed: m.net_in_speed, net_out_speed: m.net_out_speed,
    };
  }

  // samples 上限：上报失败时不再无界增长（2s 采集间隔下约保留 8 分钟窗口）
  const MAX_SAMPLES = 240;
  function pushSample(ts, metrics) {
    state.samples.push({ ts, metrics });
    if (state.samples.length > MAX_SAMPLES) {
      state.samples.splice(0, state.samples.length - MAX_SAMPLES);
    }
  }

  async function postOnce(isFallback, skipSample) {
    try {
      // 复用节拍内的指标快照（tick() 刚采集过就不重复采集）
      const metrics = await collectMetrics();
      const body = buildBody(metrics);
      const ci = effCollectInterval();
      // 同一节拍里 tick() 已采样过则不再重复 push，避免每个 report 塞两份样本
      if (ci > 0 && !skipSample) {
        pushSample(clockSnapshot(Date.now()).local_ts, sampleMetrics(metrics));
        state.lastSampleAt = Date.now();
      }
      const startedAt = Date.now();
      const res = await fetch(postUrl(), {
        method: "POST",
        headers: agentHeaders(),
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(20000),
      });
      const receivedAt = Date.now();
      const text = await res.text().catch(() => "");
      if (!res.ok) {
        // 401/403/404：WSS+POST 同时停 120s（对齐官方 delayProtocol）
        if ([401, 403, 404].includes(res.status)) wssPause(`POST fallback http=${res.status}`);
        throw new Error(`worker ${res.status}: ${text.slice(0, 200)}`);
      }
      handleWssModeHeader(res.headers);
      handleResponse(res, text, startedAt, receivedAt);
      state.lastOk = new Date().toISOString();
      state.lastError = "";
      state.reportCount += 1;
      state.postReports += 1;
      state.samples = [];
      logger.debug(`cfprobe ${isFallback ? "POST fallback" : "POST"} reported #${state.reportCount}`);
      return true;
    } catch (e) {
      state.lastError = String(e.message || e).slice(0, 300);
      logger.warn(`cfprobe report failed: ${state.lastError}`);
      return false;
    }
  }

  // 主节拍：对齐官方 tick()——WSS 节奏 / POST 兜底 / collect 采样三路；节拍按 GCD 动态重排
  async function tick() {
    const now = Date.now();
    const wssOn = useWss();
    const wssConnected = wssOn && state.wssConnected && state.ws;
    const ri = effReportInterval() * 1000;
    const ci = effCollectInterval() * 1000;
    if (ci > 0 && (!state.lastSampleAt || now - state.lastSampleAt >= ci)) {
      try {
        const m = await collectMetrics();
        pushSample(clockSnapshot(now).local_ts, sampleMetrics(m));
        state.lastSampleAt = now;
      } catch {}
    }
    if (wssConnected) return; // WSS 节奏由 wssTickLoop 负责
    // 握手进行中也跳过：否则会与 wssConnectOnce 的首帧、以及紧随其后的 WSS 上报重复
    // （实测修复前启动 1 秒内会发出 WSS+POST+WSS 共 3 条完整 report）。
    if (wssOn && state.wssConnecting) return;
    if (wssPaused()) {
      logger.debug(`POST fallback delayed reason=${state.wssPauseReason}`);
      return;
    }
    // POST 上报按上报间隔节流：HTTP 模式和 WSS 断连兜底都不能每节拍上报，
    // 否则每 2s 打一次全量 report（ri 算出来却从没被用过）。
    if (state.lastReportAt && now - state.lastReportAt < ri) return;
    state.lastReportAt = now;
    await postOnce(false, true);
  }
  function tickIntervalMs() {
    // 对齐官方 tickInterval：WSS 间隔与 collect 取 GCD
    let active = wssIntervalMs();
    const c = effCollectInterval() * 1000;
    if (c > 0) active = gcdMs(active, c);
    return Math.max(1000, active);
  }
  function gcdMs(a, b) {
    a = Math.max(1, Math.floor(a)); b = Math.max(1, Math.floor(b));
    while (b) { const t = a % b; a = b; b = t; }
    return a;
  }

  async function wssTickLoop() {
    // WSS 节奏发送循环：按服务端下发的间隔发送；断连则停等重连。
    // 注意：连接建立时的"首帧"已由 wssConnectOnce 发出，这里不能立刻再发一次，
    // 必须等到距上次发送满一个 wss 间隔（否则启动 1 秒内会连发两条相同 report）。
    if (state.wssTickLoop) return;
    state.wssTickLoop = (async () => {
      while (state.running && useWss() && !state.wssWantStop) {
        if (!state.wssConnected || !state.ws) {
          await new Promise((r) => setTimeout(r, 1000));
          continue;
        }
        const waitMs = state.lastWssSendAt
          ? Math.max(0, state.lastWssSendAt + wssIntervalMs() - Date.now())
          : 0;
        if (waitMs > 0) {
          await new Promise((r) => setTimeout(r, waitMs));
          continue;
        }
        const ok = await sendViaWss();
        if (!ok) {
          await new Promise((r) => setTimeout(r, 2000));
          continue;
        }
        await new Promise((r) => setTimeout(r, wssIntervalMs()));
      }
      state.wssTickLoop = null;
    })();
  }

  /** 按当前 connection_mode 确保 WSS 双循环在跑（幂等；动态切回 auto 时拉起） */
  function ensureWssLoops() {
    if (!state.running || state.wssWantStop || !useWss()) return;
    wssEnsureLoop();
    wssTickLoop();
  }

  return {
    start() {
      if (state.running) return;
      state.running = true;
      state.wssWantStop = false;
      logger.status(`cfprobe ok: started mode=${effConnectionMode()} every ${effReportInterval()}s ping=${effPingMode()}`);
      ensureWssLoops();
      // 后台采样：测速 20s + 公网 IP 10min（对齐官方 networkWorker）
      probeTick();
      ipTick();
      state.probeTimer = setInterval(() => { probeTick().catch(() => {}); }, 20000);
      if (state.probeTimer.unref) state.probeTimer.unref();
      state.ipTimer = setInterval(() => { ipTick().catch(() => {}); }, 10 * 60 * 1000);
      if (state.ipTimer.unref) state.ipTimer.unref();
      tick();
      state.timer = setInterval(() => {
        tick().catch(() => {});
        // 节拍按 GCD 动态重排（对齐官方 resetTimer(tickInterval)）
        try {
          if (state.timer) { clearInterval(state.timer); state.timer = setInterval(() => tick().catch(() => {}), tickIntervalMs()); if (state.timer.unref) state.timer.unref(); }
        } catch {}
      }, tickIntervalMs());
      if (state.timer.unref) state.timer.unref();
    },
    stop() {
      state.running = false;
      state.wssWantStop = true;
      if (state.timer) clearInterval(state.timer);
      state.timer = null;
      if (state.probeTimer) clearInterval(state.probeTimer);
      state.probeTimer = null;
      if (state.ipTimer) clearInterval(state.ipTimer);
      state.ipTimer = null;
      state.wssLoop = null;
      closeWs();
    },
    getStatus() {
      const t = effProbeTargets();
      return {
        cf_enabled: true,
        cf_running: state.running,
        cf_mode: effConnectionMode(),
        cf_ping_mode: effPingMode(),
        cf_report_interval: effReportInterval(),
        cf_collect_interval: effCollectInterval(),
        cf_wss_connected: state.wssConnected,
        cf_wss_paused: wssPaused() ? state.wssPauseReason : "",
        cf_wss_reports: state.wssReports,
        cf_post_reports: state.postReports,
        cf_last_ok: state.lastOk,
        cf_last_error: state.lastError,
        cf_reports: state.reportCount,
        cf_config_md5: state.configMd5,
        cf_probes: { ct: t.ct, cu: t.cu, cm: t.cm, bd: t.bd, node1: t.node1, node2: t.node2, node3: t.node3, node4: t.node4 },
        cf_dyn: state.serverCfg,
      };
    },
    // exposed for tests
    _collect: collect,
    _collectMetrics: collectMetrics,
    _publicIp: publicIp,
    _handleResponse: handleResponse,
    _applyDynConfig: applyDynConfig,
    _handleServerFrame: handleServerFrame,
    _wssIntervalMs: wssIntervalMs,
    _state: state,
  };
}


// ---- src/runner.js ----
const MAX_RESTARTS = 30; // 单进程最大自动重启次数，防止配置错误刷屏
const RESTART_BASE_MS = 5000;
const RESTART_RESET_MS = 10 * 60 * 1000; // 连续健康运行超过 10 分钟，重启计数清零（偶发崩溃不累加上古早次数）

class Runner {
  constructor() {
    this.children = new Map();   // name -> ChildProcess（正在运行）
    this.timers = new Map();     // name -> 待触发的重启 timer
    this.restarts = new Map();   // name -> 连续非预期退出计数
    this.spawnedAt = new Map();  // name -> 上次 spawn 时间戳
    this.lastSpawn = new Map();  // name -> { bin, args, opts }（restart/意外退出复用）
    this.wantRunning = new Set();// 明确意图：这些进程"应该活着"，只有它们配自动重启
    this.refetchers = new Map(); // name -> async () => binPath | null（TTL 删二进制后重下用）
    this.spawnHooks = new Map(); // name -> [fn]
    this.giveUpHooks = new Map();// name -> [fn]
    this.stopping = false;
  }

  /** 注册缺二进制时的重下函数（ensure* 包装）。不注册则保持原行为。 */
  onMissingBinary(name, fn) {
    this.refetchers.set(name, fn);
  }

  /** 注册进程每次 spawn 成功后的钩子（onSpawn(name, child)）；用于 niclink 重启后重绑日志监听 */
  onSpawn(name, fn) {
    pushHook(this.spawnHooks, name, fn);
  }

  /** 注册进程达到最大重启次数放弃后的钩子（onGiveUp(name)） */
  onGiveUp(name, fn) {
    pushHook(this.giveUpHooks, name, fn);
  }

  /** 对外启动：标记"应该活着"并拉起；已在跑的先杀掉（不触发重启，由本调用接管） */
  start(name, bin, args, opts = {}) {
    this.lastSpawn.set(name, { bin, args, opts });
    this.wantRunning.add(name);
    this._clearTimer(name);
    this._kill(name, true);
    return this._spawn(name, bin, args, opts);
  }

  /** 对外停止：明确"不该活着"——随后到来的 exit 一律视为 stale，不触发重启 */
  stop(name, silent = false) {
    this.wantRunning.delete(name);
    this._clearTimer(name);
    this._kill(name, silent);
  }

  /** 对外重启：保持"应该活着"，杀旧进程并按退避显式重排一次（不依赖 exit 事件） */
  restart(name, reason) {
    const s = this.lastSpawn.get(name);
    if (!s) {
      logger.warn(`${name} restart: no spawn info, skipped`);
      return false;
    }
    this.wantRunning.add(name);
    this._clearTimer(name);
    this._kill(name, true);
    this.scheduleRestart(name, s.bin, s.args, s.opts, reason || "manual restart");
    return true;
  }

  stopAll() {
    this.stopping = true;
    for (const name of [...this.children.keys()]) this.stop(name);
    this.wantRunning.clear();
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
  }

  _clearTimer(name) {
    const t = this.timers.get(name);
    if (t) {
      clearTimeout(t);
      this.timers.delete(name);
    }
  }

  /** 只杀进程删表，不碰 wantRunning/timer——调用方自己决定意图 */
  _kill(name, silent) {
    const child = this.children.get(name);
    this.children.delete(name); // 先删表：随后到来的 exit 一律判 stale
    if (child && !child.killed) {
      try {
        child.kill("SIGTERM");
      } catch {}
      if (!silent) logger.info(`stopped ${name}`);
    }
  }

  _spawn(name, bin, args, opts) {
    logger.status(`${name} starting`);
    // debug 级记录命令行（token/secret 已脱敏），方便排查参数问题
    logger.debug(`${name} spawn: ${redactArgs([bin, ...args]).join(" ")}`);
    // niccore 日志量大且已脱敏过滤：pipe 接住只为错误上浮，不缓存
    const child = spawn(bin, args, {
      stdio: ["ignore", "pipe", "pipe"],
      ...opts,
    });
    const onChunk = (d) => {
      // 分块到达即处理，不累积；单块截断 500/300 字符
      const raw = String(d);
      const head = raw.length > 500 ? raw.slice(0, 500) : raw;
      const line = head.trim();
      if (!line) return;
      logger.debug(`[${name}] ${line}`);
      if (/ERR|error|panic|failed|Couldn't/i.test(line)) {
        logger.warn(`[${name}] ${line.length > 300 ? line.slice(0, 300) : line}`);
      }
    };
    child.stdout && child.stdout.on("data", onChunk);
    // stderr 同 stdout 合并处理；域名监听拿到首个域名后自动解绑
    child.stderr && child.stderr.on("data", onChunk);
    this.children.set(name, child);
    this.spawnedAt.set(name, Date.now());
    // spawn 钩子：每次（含重启）都触发，调用方自行挂监听
    for (const fn of this.spawnHooks.get(name) || []) {
      try {
        fn(child);
      } catch (e) {
        logger.warn(`${name} spawn hook error: ${e.message}`);
      }
    }
    child.on("exit", (code, signal) => this._onExit(name, child, code, signal));
    child.on("error", (e) => this._onError(name, child, bin, args, opts, e));
    return child;
  }

  /** 进程退出的唯一决策点：stale（被 stop/restart/replace 过）直接忽略；
   *  只有"应该活着"又意外死了的，才按退避重启。 */
  _onExit(name, child, code, signal) {
    if (this.children.get(name) !== child) return; // stale
    this.children.delete(name);
    if (this.stopping || !this.wantRunning.has(name)) return; // 主动停的 → 保持死亡
    logger.status(`${name} exited code=${code} signal=${signal}`);
    const s = this.lastSpawn.get(name);
    if (s) this.scheduleRestart(name, s.bin, s.args, s.opts, `exited code=${code} signal=${signal}`);
  }

  /** spawn 失败（error 后必有 exit）：这里决策，exit 到时判 stale，避免一次失败安排两次重启 */
  _onError(name, child, bin, args, opts, e) {
    if (this.children.get(name) === child) this.children.delete(name);
    if (this.stopping || !this.wantRunning.has(name)) return;
    // ENOENT = 二进制被 TTL 删了（或从未下载成功）：先重下再重启，而不是空转 30 次
    if (e.code === "ENOENT" || /ENOENT/.test(e.message || "")) {
      logger.warn(`${name} binary missing (${bin}), refetching...`);
      this.refetch(name, args, opts);
      return;
    }
    logger.error(`${name} spawn error: ${e.message}`);
    this.scheduleRestart(name, bin, args, opts, `spawn error: ${e.message}`);
  }

  scheduleRestart(name, bin, args, opts, reason) {
    if (this.stopping) return;
    // 上次 spawn 后健康运行超过阈值：清零计数，偶发崩溃不该累加上古早的次数
    const spawnedAt = this.spawnedAt.get(name) || 0;
    if (spawnedAt && Date.now() - spawnedAt > RESTART_RESET_MS) {
      this.restarts.set(name, 0);
    }
    const n = (this.restarts.get(name) || 0) + 1;
    this.restarts.set(name, n);
    if (n > MAX_RESTARTS) {
      logger.status(`${name} failed: max restarts (${MAX_RESTARTS}) reached, giving up (${reason})`);
      for (const fn of this.giveUpHooks.get(name) || []) {
        try {
          fn();
        } catch (e) {
          logger.warn(`${name} giveup hook error: ${e.message}`);
        }
      }
      return;
    }
    // 指数退避：5s, 10s, 20s ... 上限 60s
    const delay = Math.min(RESTART_BASE_MS * Math.pow(2, Math.min(n - 1, 4)), 60000);
    logger.status(`${name} restart #${n} in ${delay / 1000}s (${reason})`);
    this._clearTimer(name);
    const t = setTimeout(() => {
      if (!this.stopping) this.start(name, bin, args, opts);
    }, delay);
    this.timers.set(name, t);
  }

  /** 缺二进制重下：调用注册的 refetch，成功后重置该进程重启计数并拉起 */
  async refetch(name, args, opts) {
    if (this.stopping) return;
    const fn = this.refetchers.get(name);
    if (!fn) {
      // 没注册重下函数：退回普通重启（用上次 spawn 的实际 bin，避免空路径再空转一轮）
      const prev = this.lastSpawn.get(name);
      this.scheduleRestart(name, (prev && prev.bin) || "", args, opts, "binary missing, no refetcher");
      return;
    }
    try {
      const freshBin = await fn();
      if (!freshBin) throw new Error("refetch returned empty");
      this.restarts.set(name, 0);
      logger.status(`${name} ok: binary refetched`);
      if (!this.stopping) {
        this._clearTimer(name);
        const t = setTimeout(() => {
          if (!this.stopping) this.start(name, freshBin, args, opts);
        }, 3000);
        this.timers.set(name, t);
      }
    } catch (e) {
      this.scheduleRestart(name, "", args, opts, `refetch failed: ${e.message}`);
    }
  }

  /** 二进制自检：异步执行，不阻塞事件循环（启动期用于快速失败） */
  async check(bin, args = ["version"], timeoutMs = 15000) {
    const r = await execFileAsync(bin, args, { timeout: timeoutMs });
    return { ok: r.ok, out: r.out };
  }

  isAlive(name) {
    const c = this.children.get(name);
    return !!c && c.exitCode === null && !c.killed;
  }
}

/** hook 注册小工具：Map<name, fn[]> */
function pushHook(map, name, fn) {
  const arr = map.get(name) || [];
  arr.push(fn);
  map.set(name, arr);
}

/** 启动日志脱敏：token/secret/password 不打明文。 */
function redactArgs(args) {
  const out = [];
  let maskNext = false;
  for (const a of args) {
    const s = String(a);
    if (maskNext) {
      out.push("***");
      maskNext = false;
      continue;
    }
    if (/^(--token|.*secret.*|.*password.*)$/i.test(s)) {
      out.push(s);
      maskNext = true;
      continue;
    }
    if (/^[A-Za-z0-9-_]{20,}\.[A-Za-z0-9-_]+/.test(s) && s.includes(".")) {
      out.push("***"); // link token 整坨
      continue;
    }
    out.push(s.length > 120 ? s.slice(0, 20) + "...***" : s);
  }
  return out;
}

/** 写 kit.txt：节点信息 base64 编码后落盘（核心进程存活且链路就绪时；失败只告警，缺目录自动建） */
async function dumpKitFile(cfg, state) {
  if (!cfg.kitFile) return;
  try {
    const procsOk = state.runner.isAlive("niccore") && state.runner.isAlive("niclink");
    if (!procsOk) {
      logger.debug("kit.txt skipped: core processes not alive yet");
      return;
    }
    const links = buildSubEntries(cfg, state);
    if (!links.length || links[0].startsWith("#")) {
      logger.debug("kit.txt skipped: link domain not ready");
      return;
    }
    const body = Buffer.from(links.join("\n") + "\n", "utf8").toString("base64") + "\n";
    await fs.mkdir(dirnameKit(cfg.kitFile), { recursive: true });
    await fs.writeFile(cfg.kitFile, body);
    logger.info(`kit nodes written: ${cfg.kitFile} (${links.length} links, base64)`);
  } catch (e) {
    logger.warn(`kit.txt write failed: ${e.message}`);
  }
}

function dirnameKit(p) {
  const i = String(p).replace(/\\/g, "/").lastIndexOf("/");
  return i <= 0 ? "." : String(p).slice(0, i);
}


// ---- src/server.js ----
// 静态页根目录：脚本所在目录下的 public/（源码与镜像布局一致）
import { fileURLToPath } from "node:url";
function publicDir() {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, "public");
}
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};
async function servePublicFile(res, name) {
  if (name.includes("..") || name.includes("\0")) {
    res.writeHead(400, { "content-type": "text/plain" });
    res.end("bad request\n");
    return;
  }
  const ext = name.slice(name.lastIndexOf(".")).toLowerCase();
  try {
    const data = await fs.readFile(join(publicDir(), name));
    res.writeHead(200, { "content-type": MIME[ext] || "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("not found\n");
  }
}
// /sub、/kit 鉴权：SUB_TOKEN 留空=不鉴权；设置后接受 ?token= 或 Authorization: Bearer。
// 纯函数，便于测试。Exposed for tests.
function checkSubAuth(req, cfg) {
  const token = String((cfg && cfg.subToken) || "").trim();
  if (!token) return true;
  const ok = (cand) => {
    if (typeof cand !== "string" || !cand) return false;
    const a = Buffer.from(cand);
    const b = Buffer.from(token);
    return a.length === b.length && timingSafeEqual(a, b);
  };
  try {
    const url = new URL(req.url || "/", "http://localhost");
    if (ok(url.searchParams.get("token"))) return true;
  } catch {}
  const h = req.headers && req.headers.authorization;
  if (typeof h === "string" && /^bearer /i.test(h) && ok(h.slice(7).trim())) return true;
  return false;
}

function startServer(cfg, state) {
  const server = createServer((req, res) => {
    const url = new URL(req.url || "/", `http://localhost`);
    if (url.pathname === "/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, ...dlStatus(), ...state.status() }));
      return;
    }
    if (url.pathname === "/sub" || url.pathname === "/kit") {
      if (!checkSubAuth(req, cfg)) {
        res.writeHead(401, { "content-type": "text/plain" });
        res.end("unauthorized\n");
        return;
      }
      const links = buildSubEntries(cfg, state);
      res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
      res.end(links.join("\n") + "\n");
      return;
    }
    if (url.pathname === "/" || url.pathname === "/index.html") {
      servePublicFile(res, "index.html");
      return;
    }
    if (url.pathname === "/javascript-obfuscator.js") {
      servePublicFile(res, "javascript-obfuscator.js");
      return;
    }
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("not found\n");
  });

  server.listen(cfg.port, () => {
    logger.info(`http server listening on :${cfg.port} (/health /sub /kit /)`);
  });
  return server;
}

function nodeTag(cfg, state, base) {
  const prefix = (state.getNodePrefix ? state.getNodePrefix() : "") || "NODE";
  return `${prefix}-${base}`;
}

function buildLinkEntry(cfg, state) {
  const domain = state.getDomain();
  if (!domain) return null;
  const host = domain.replace(/^https?:\/\//, "");
  // 代理地址用 OPT_DOMAIN（默认 staticdelivery.nexusmods.com）
  const addr = (cfg.optDomain || "").trim() || host;
  // 段级编码：保留 "/"（个别老客户端不会把 %2F 还原成路径分隔符），
  // 同时把 & # ? 等会破坏查询串的字符正常转义（encodeURI 不会转义这些）
  const path = String(cfg.wsPath || "")
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
  return (
    `vless://${cfg.uuid}@${addr}:443` +
    `?encryption=none&security=tls&sni=${host}&fp=chrome&type=ws&host=${host}&path=${path}#${nodeTag(cfg, state, "vless-link")}`
  );
}

function resolveDirectHost(manual, getter) {
  return ((manual || "").trim() || (getter ? getter() : "") || "").trim();
}

function buildDirectUdpLink(cfg, state) {
  if (!state.isDirectUdpActive || !state.isDirectUdpActive()) return null;
  const host = resolveDirectHost(cfg.directUdpHost, state.getDirectUdpHost);
  if (!host) return null;
  const params = new URLSearchParams();
  params.set("insecure", "1");
  params.set("sni", host);
  if (cfg.directUdpObfs) {
    params.set("obfs", "salamander");
    params.set("obfs-password", cfg.directUdpObfs);
  }
  return `hysteria2://${encodeURIComponent(cfg.directUdpPassword)}@${host}:${cfg.directUdpPort}?${params.toString()}#${nodeTag(cfg, state, "hy2")}`;
}

function buildDirectTcpLink(cfg, state) {
  if (!state.isDirectTcpActive || !state.isDirectTcpActive()) return null;
  const host = resolveDirectHost(cfg.directTcpHost, state.getDirectTcpHost);
  if (!host) return null;
  // sni 用配置的 VLESS_DIRECT_SNI（默认 www.nvidia.com），与 niccore server_name 一致；自签证书需客户端跳过验证
  const sni = (cfg.directTcpSni || "www.nvidia.com").trim();
  const params = new URLSearchParams();
  params.set("encryption", "none");
  params.set("security", "tls");
  params.set("sni", sni);
  params.set("fp", "chrome");
  params.set("flow", "xtls-rprx-vision");
  params.set("allowInsecure", "1");
  return `vless://${cfg.uuid}@${host}:${cfg.directTcpPort}?${params.toString()}#${nodeTag(cfg, state, "vless-direct")}`;
}

function buildSubEntries(cfg, state) {
  const links = [];
  const vless = buildLinkEntry(cfg, state);
  if (vless) {
    links.push(vless);
  } else {
    links.push("# link domain not ready yet");
  }
  const vd = buildDirectTcpLink(cfg, state);
  if (vd) links.push(vd);
  const hy2 = buildDirectUdpLink(cfg, state);
  if (hy2) links.push(hy2);
  return links;
}


// ---- index.js (main) ----
async function main() {
  // 防检测：ps 显示为 node 而不是带参长的 index.js 路径
  try {
    process.title = "node";
  } catch {}
  let cfg;
  try {
    cfg = loadConfig();
  } catch (e) {
    console.error(cleanLog(e.message));
    process.exit(1);
  }
  setLogLevel(cfg.logLevel);

  const runner = new Runner();
  const startedAt = Date.now();
  let domain = cfg.atLinkMode === "token" ? `https://${cfg.atLinkDomain}` : null;
  // temp 域名健康状态（health 可见；定期拨测更新）
  const domainCheck = { ok: null, reason: "not-checked", at: null, fails: 0 };
  let cfProbe = null;
  const monitorState = {
    nezha: cfg.nezhaEnabled ? "pending" : "disabled",
    komari: cfg.komariEnabled ? "pending" : "disabled",
  };
  const getDomain = () => domain;
  // server 先行规则：startServer 的闭包只能读启动前已初始化完成的状态对象
  // （live / domainCheck / monitorState），禁止引用后置 let —— 否则下载窗口内
  // health 请求会撞上 TDZ 直接打死进程。直连细节在下面第 2 步往 live 里填。
  const live = {
    directUdpActive: false, directTcpActive: false,
    directUdpReason: cfg.directUdpEnabled ? "pending" : "disabled",
    directTcpReason: cfg.directTcpEnabled ? "pending" : "disabled",
    directAutoHost: "", nodePrefix: "NODE",
  };

  const server = startServer(cfg, {
    getDomain,
    isDirectUdpActive: () => live.directUdpActive,
    isDirectTcpActive: () => live.directTcpActive,
    getDirectUdpHost: () => ((cfg.directUdpHost || "").trim() || live.directAutoHost),
    getDirectTcpHost: () => ((cfg.directTcpHost || "").trim() || live.directAutoHost),
    getNodePrefix: () => live.nodePrefix,
    status: () => ({
      uptime_s: Math.floor((Date.now() - startedAt) / 1000),
      at_link_mode: cfg.atLinkMode,
      at_link_protocol: cfg.atLinkProtocol,
      at_link_connections: cfg.atLinkConnections,
      domain,
      domain_check_ok: domainCheck.ok,
      domain_check_reason: domainCheck.reason,
      domain_check_at: domainCheck.at,
      node_prefix: live.nodePrefix,
      niccore: runner.children.has("niccore"),
      niclink: runner.children.has("niclink"),
      direct_udp_enabled: cfg.directUdpEnabled,
      direct_udp_active: live.directUdpActive,
      direct_udp_reason: live.directUdpReason,
      direct_udp_host: (cfg.directUdpHost || "").trim() || live.directAutoHost || "",
      direct_udp_password_auto: !!cfg.directUdpPasswordAuto,
      direct_tcp_enabled: cfg.directTcpEnabled,
      direct_tcp_active: live.directTcpActive,
      direct_tcp_reason: live.directTcpReason,
      direct_tcp_host: (cfg.directTcpHost || "").trim() || live.directAutoHost || "",
      nezha_enabled: cfg.nezhaEnabled,
      nezha_state: monitorState.nezha,
      nezha_running: runner.children.has("sys-monitor"),
      komari_enabled: cfg.komariEnabled,
      komari_state: monitorState.komari,
      komari_running: runner.children.has("node-monitor"),
      ...(cfProbe ? cfProbe.getStatus() : { cf_enabled: cfg.cfEnabled, cf_running: false }),
    }),
  });

  const shutdown = () => {
    logger.info("shutting down...");
    if (cfProbe) cfProbe.stop();
    runner.stopAll();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  // 1. core binaries：并行下载，server 先行，health 即时报 downloading
  dlMark("downloading", "niccore+niclink");
  await cleanTmpLeftovers(cfg);
  await sweepStalePartials(cfg);
  const [niccoreBin, niclinkBin] = await Promise.all([
    (async () => {
      dlMark("downloading", "niccore");
      const b = await ensureNiccore(cfg);
      return b;
    })(),
    (async () => {
      dlMark("downloading", "niclink");
      const b = await ensureNiclink(cfg);
      return b;
    })(),
  ]).catch((e) => {
    dlMark("failed", String(e.message || e).slice(0, 200));
    throw e;
  });
  dlMark("ready", "binaries ok");

  // 2. 直连协议：direct-udp(UDP)/direct-tcp(TCP) —— 填端口即开，密码自动派生，
  //    HOST 自动获取公网 IP，失败只警告降级，不断线。
  //    顺序：先探测端口可用性 → 再探测 HOST/国家码 → 最后生成自签证书（这样自动探测到的
  //    公网 IP 能写进证书 SAN），两协议共享同一份 cert。
  let tlsCert = null;
  const needTls = cfg.directUdpEnabled || cfg.directTcpEnabled;
  if (cfg.directUdpEnabled) {
    const probe = await probeUdp(cfg.directUdpPort);
    if (!probe.ok) {
      live.directUdpReason = `udp-unavailable: ${probe.reason}`;
      logger.warn(`direct-udp disabled: UDP :${cfg.directUdpPort} unavailable`);
    } else {
      live.directUdpActive = true;
      live.directUdpReason = "active";
      logger.info(`direct-udp enabled on :${cfg.directUdpPort}`);
    }
  }
  if (cfg.directTcpEnabled) {
    const probe = await probeTcp(cfg.directTcpPort);
    if (!probe.ok) {
      live.directTcpReason = `tcp-unavailable: ${probe.reason}`;
      logger.warn(`direct-tcp disabled: TCP :${cfg.directTcpPort} unavailable`);
    } else {
      live.directTcpActive = true;
      live.directTcpReason = "active";
      logger.info(`direct-tcp enabled on :${cfg.directTcpPort}`);
    }
  }
  // 公网 IPv4 只获取一次，两直连协议共用；手动 HOST 优先，见 resolveDirectHost()
  // 国家码顺手取一次，给节点名称前缀用（默认国家码，如 JP；失败回退 IP 末段）
  let nodeCc = "";
  if ((live.directUdpActive && !cfg.directUdpHost) || (live.directTcpActive && !cfg.directTcpHost)) {
    live.directAutoHost = await detectPublicIp();
    if (live.directAutoHost) logger.info(`direct public host: ${live.directAutoHost}`);
    else logger.warn("public IP detect failed, direct links skipped (fill *_HOST manually)");
  }
  if (!cfg.nodePrefix || cfg.nodePrefix.trim() === "" || cfg.nodePrefix.trim().toLowerCase() === "custom") {
    nodeCc = await detectCountry();
    if (nodeCc) logger.info(`node country: ${nodeCc}`);
  }
  // 手动前缀非空（且非 custom）则跳过国家码请求，直接用手动值
  live.nodePrefix = nodePrefixFor(cfg, nodeCc, live.directAutoHost || cfg.directUdpHost || cfg.directTcpHost || "");
  logger.info(`node prefix: ${live.nodePrefix}`);
  // 证书：HOST 已知后生成（SAN 带上 SNI/HOST/自动探测到的 IP）；生成失败则两个直连一起降级
  if (needTls && (live.directUdpActive || live.directTcpActive)) {
    tlsCert = await ensureSelfSignedCert(cfg, { autoHost: live.directAutoHost });
    if (!tlsCert) {
      const msg = "cert unavailable (no openssl)";
      if (cfg.directUdpEnabled) { live.directUdpActive = false; live.directUdpReason = msg; logger.warn(`direct-udp disabled: ${msg}`); }
      if (cfg.directTcpEnabled) { live.directTcpActive = false; live.directTcpReason = msg; logger.warn(`direct-tcp disabled: ${msg}`); }
    }
  }
  // niccore 只装配真正 active 的协议：cert 有但端口被占的，不进 config
  const sbTls = (live.directUdpActive || live.directTcpActive) ? tlsCert : null;
  if (cfg.directUdpEnabled && !live.directUdpActive) cfg.directUdpEnabled = false;
  if (cfg.directTcpEnabled && !live.directTcpActive) cfg.directTcpEnabled = false;

  // 3. niccore config（配置由本程序生成，JSON 写盘即校验，不再 spawn check 子进程）
  const sbPath = await writeSingBoxConfig(cfg, ".", sbTls);

  /**
   * 启动自检：二进制坏包（半截下载、磁盘损坏、架构不匹配）在这里暴露。
   * 坏包若直接交给 Runner，会表现为"启动即崩"，一路退避到 30 次上限后放弃，
   * 期间永远不会重新下载。这里先自检一次：失败则删掉重下一次再试，仍失败才退出。
   */
  async function selfCheckOrRefetch(name, bin, args, refetch) {
    let cur = bin;
    for (let attempt = 0; attempt < 2; attempt++) {
      const chk = await runner.check(cur, args);
      if (chk.ok) return { ok: true, bin: cur };
      logger.warn(`${name} self-check failed (attempt ${attempt + 1}): ${chk.out.slice(0, 200)}`);
      if (attempt === 1) return { ok: false, bin: cur, out: chk.out };
      await fs.rm(cur, { force: true }).catch(() => {});
      try {
        cur = await refetch();
        markFreshBinary(cur);
      } catch (e) {
        return { ok: false, bin: cur, out: `re-download failed: ${e.message}` };
      }
    }
    return { ok: false, bin: cur, out: "unknown" };
  }

  const coreChk = await selfCheckOrRefetch("niccore", niccoreBin, ["run", "--help"], () => ensureNiccore(cfg));
  if (!coreChk.ok) {
    logger.status(`niccore failed: self-check failed, aborting`);
    logger.error(`niccore self-check failed, aborting (not restarting):\n${String(coreChk.out).slice(0, 2000)}`);
    process.exit(1);
  }
  const linkChk = await selfCheckOrRefetch("niclink", niclinkBin, ["run", "--help"], () => ensureNiclink(cfg));
  if (!linkChk.ok) {
    logger.status(`niclink failed: self-check failed, aborting`);
    logger.error(`niclink self-check failed, aborting (not restarting):\n${String(linkChk.out).slice(0, 2000)}`);
    process.exit(1);
  }

  // 4. start niccore（注册 TTL 缺二进制重下）
  runner.onMissingBinary("niccore", async () => {
    const fresh = await ensureNiccore(cfg);
    markFreshBinary(fresh);
    return fresh;
  });
  runner.start("niccore", coreChk.bin, ["run", "-c", sbPath]);

  // 5. start niclink（注册 TTL 缺二进制重下；启动即崩则快速失败，不进 30 次重启）
  runner.onMissingBinary("niclink", async () => {
    const fresh = await ensureNiclink(cfg);
    markFreshBinary(fresh);
    return fresh;
  });
  const t = buildLinkArgs(cfg, linkChk.bin);
  const linkBirthMs = Date.now();
  // kit 状态闭包提前定义：onTempDomain（域名变更即重写）与定时 tick 共用
  const kitState = {
    getDomain: () => domain,
    isDirectUdpActive: () => live.directUdpActive,
    isDirectTcpActive: () => live.directTcpActive,
    getDirectUdpHost: () => ((cfg.directUdpHost || "").trim() || live.directAutoHost),
    getDirectTcpHost: () => ((cfg.directTcpHost || "").trim() || live.directAutoHost),
    getNodePrefix: () => live.nodePrefix,
    runner,
  };
  const onTempDomain = (d) => {
    if (d !== domain) {
      logger.status(`niclink ok: link domain ${d}`);
      domain = d;
      domainCheck.ok = null;
      domainCheck.reason = "changed-wait-probe";
      domainCheck.fails = 0;
      // 域名一变就立刻重写 kit.txt（不等 60s tick），/kit 下次请求即新值
      dumpKitFile(cfg, kitState);
    }
  };
  // niclink 彻底放弃重启（30 次上限）时：temp 模式清掉域名，
  // /kit 不再下发已死的链接（dumpKitFile 本来就有存活检查，这里清的是内存里的 domain）
  runner.onGiveUp("niclink", () => {
    if (cfg.atLinkMode === "temp" && domain) {
      logger.status("niclink gave up: clearing temp domain");
      domain = null;
      domainCheck.ok = false;
      domainCheck.reason = "link-gave-up";
      domainCheck.at = new Date().toISOString();
      domainCheck.fails = 0;
    }
  });
  if (cfg.atLinkMode === "temp") {
    // 每次 spawn（含 Runner 重启）都重绑日志监听，否则重启后的新域名永远收不到
    runner.onSpawn("niclink", (c) => watchLinkOutput(c, onTempDomain));
  } else {
    logger.info(`link fixed domain: https://${cfg.atLinkDomain}`);
  }
  const child = runner.start("niclink", t.bin, t.args);
  child.on("exit", (code, signal) => {
    // 30 秒内退出且从未拿到域名 = 启动即崩（panic/缺库/参数错）：直接致命退出
    if (Date.now() - linkBirthMs < 30000 && !domain) {
      logger.status(`niclink failed: died within 30s without domain (code=${code}), aborting`);
      logger.error(`niclink died within 30s without domain (code=${code} signal=${signal}), aborting instead of restart loop`);
      process.exit(1);
    }
  });

  // 6. monitors (best-effort, never fatal)
  if (cfg.nezhaEnabled) {
    try {
      const bin = await ensureNezha(cfg);
      const yaml = await writeNezhaYaml(cfg);
      runner.onMissingBinary("sys-monitor", async () => {
        const fresh = await ensureNezha(cfg);
        markFreshBinary(fresh);
        return fresh;
      });
      runner.start("sys-monitor", bin, nezhaArgs(yaml));
      monitorState.nezha = "started";
      logger.status(`sys-monitor ok: started`);
    } catch (e) {
      monitorState.nezha = `failed: ${String(e.message).slice(0, 200)}`;
      logger.status(`sys-monitor failed: ${e.message}`);
      logger.warn(`nezha-agent disabled: ${e.message}`);
    }
  }
  if (cfg.komariEnabled) {
    try {
      const bin = await ensureKomari(cfg);
      runner.onMissingBinary("node-monitor", async () => {
        const fresh = await ensureKomari(cfg);
        markFreshBinary(fresh);
        return fresh;
      });
      runner.start("node-monitor", bin, komariArgs(cfg));
      monitorState.komari = "started";
      logger.status(`node-monitor ok: started`);
    } catch (e) {
      monitorState.komari = `failed: ${String(e.message).slice(0, 200)}`;
      logger.status(`node-monitor failed: ${e.message}`);
      logger.warn(`komari-agent disabled: ${e.message}`);
    }
  }
  // 月度流量状态：持久化文件读取（失败只在内部告警，不影响启动）
  await loadTraffic(cfg);
  if (cfg.cfEnabled) {
    cfProbe = createCfProbe(cfg);
    cfProbe.start();
  } else {
    logger.status(`cfprobe off: disabled`);
  }

  // 7. kit.txt：链路就绪后（域名分配到）且核心进程存活时落盘；此后每 60s 刷新一次
  const kitTick = () => dumpKitFile(cfg, kitState);
  if (cfg.kitFile) {
    const kitTimer = setInterval(kitTick, 60000);
    if (kitTimer.unref) kitTimer.unref();
    // 首次延迟 15s，等 niclink 注册域名
    const once = setTimeout(kitTick, 15000);
    if (once.unref) once.unref();
  }

  // 8. temp 域名存活拨测：每 60s 打一次当前域名；连续 2 次不通则重启 niclink
  //    拿新域名（onTempDomain 会更新 domain + 立刻重写 kit.txt，/kit 下次请求即新值）。
  //    token 模式固定域名，不拨测（域名不变，拨测无意义；链路状态看 niclink 进程与 edge 注册）。
  if (cfg.atLinkMode === "temp") {
    const domainTick = async () => {
      if (!domain || !runner.isAlive("niclink")) return; // 未就绪/重建中：跳过
      const r = await probeTempDomain(domain);
      domainCheck.at = new Date().toISOString();
      if (r.ok) {
        if (domainCheck.ok === false) logger.status(`niclink ok: domain reachable again (${r.reason})`);
        domainCheck.ok = true;
        domainCheck.reason = r.reason;
        domainCheck.fails = 0;
        return;
      }
      domainCheck.ok = false;
      domainCheck.reason = r.reason;
      domainCheck.fails += 1;
      // edge 明确回 502/503 才算"隧道真死"（2 次重启）；超时/DNS 抖动等网络类
      // 失败容错到 3 次，避免网络抖动或本地出网问题时主动掐掉还能用的隧道。
      const hardDead = /^http=50[23]$/.test(String(r.reason || ""));
      const need = hardDead ? 2 : 3;
      logger.status(`niclink warn: domain check failed #${domainCheck.fails}/${need} (${r.reason})`);
      if (domainCheck.fails >= need) {
        logger.status(`niclink restarting: domain dead, fetching fresh domain`);
        domainCheck.fails = 0;
        domain = null; // 清掉旧值：/kit 立刻回占位行，避免吐出已死的旧链接
        domainCheck.reason = "restarting-for-fresh-domain";
        runner.restart("niclink", "domain dead, fetching fresh domain"); // 显式重启：stop() 的 exit 会被 stale guard 拦，不能靠它
      }
    };
    const domainTimer = setInterval(domainTick, 60000);
    if (domainTimer.unref) domainTimer.unref();
    const domainOnce = setTimeout(domainTick, 45000); // 首次 45s（错开 kit.txt 的 15s）
    if (domainOnce.unref) domainOnce.unref();
  }

  // 关键状态行：全部实例一次汇总，LOG_LEVEL=off 时也输出
  logger.status(`all started: link=${cfg.atLinkMode} proto=${cfg.atLinkProtocol} direct-udp=${live.directUdpActive ? "on" : "off"} direct-tcp=${live.directTcpActive ? "on" : "off"} cf=${cfg.cfEnabled ? "on" : "off"} nezha=${monitorState.nezha} komari=${monitorState.komari}`);

  // 9. 本地二进制 TTL：全部子进程已 spawn（文件已加载进内存）后开始计时，到期删除本次下载的二进制
  scheduleBinaryTtl(cfg, runner);
}

// 测试时 NIC_SKIP_MAIN=1：只 import 纯函数/类，不启动服务（见 test/）
if (process.env.NIC_SKIP_MAIN !== "1") {
  main().catch((e) => {
    logger.error(e.stack || e.message);
    process.exit(1);
  });
}

export {
  loadConfig,
  createCfProbe,
  Runner,
  checkSubAuth,
  buildSubEntries,
  downloadFile,
  usableBinary,
  sweepStalePartials,
  MIN_SANE_BIN,
  wsFrameEncode,
  wsFrameDecodeOne,
  probeTempDomain,
  isWholeDisk,
  isIpv4,
  isIpv6,
  resetDiskCache,
  monthKeyOf,
  loadTraffic,
  saveTraffic,
  accumulateTraffic,
  trafficState,
  MAX_RESTARTS,
  RESTART_RESET_MS,
};
