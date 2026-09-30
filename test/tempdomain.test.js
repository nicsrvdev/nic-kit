// 域名存活拨测回归：
// 历史问题：拨测用裸 `fetch(GET https://<域名>/)`，请求经 edge → niclink → niccore 的
// vless-link 入站时路径是 `/`（不是 WS 路径），niccore 每分钟记一条
// `ERROR inbound/v[link]: bad path: /`，日志噪音极大且看着像故障。
// 现在改为真实客户端同款 WS 握手（GET <wsPath> + Upgrade），路径配对时 niccore 正常
// 接受（101），日志干净；顺带验证"隧道 + WS 路径"整条链路。
import { test } from "node:test";
import assert from "node:assert/strict";

process.env.NIC_SKIP_MAIN = "1";
const { probeTempDomain, isLinkInboundNoise, linkNoise } = await import("../index.js");

/** 注入连接器：记录目标 URL 与头部，按需 resolve（101）或 reject（http=NNN / 网络错误） */
function stubConnect(behavior) {
  const seen = [];
  const connectFn = async (url, headers, timeoutMs) => {
    seen.push({ url, headers, timeoutMs });
    if (behavior.ok) return { sock: { destroy() { this.destroyed = true; }, destroyed: false } };
    throw new Error(behavior.error);
  };
  return { connectFn, seen };
}

test("拨测打的是 WS 路径（不是裸 /），并带 Upgrade 握手 —— 这是消除 bad path 噪音的关键", async () => {
  const { connectFn, seen } = stubConnect({ ok: true });
  const r = await probeTempDomain("https://abc.trycloudflare.com", 5000, "/link", connectFn);
  assert.deepEqual(r, { ok: true, reason: "ws=101" });
  assert.equal(seen.length, 1);
  assert.equal(seen[0].url, "wss://abc.trycloudflare.com/link");
  assert.equal(seen[0].headers["User-Agent"], "nic-kit-domaincheck");
  assert.equal(seen[0].timeoutMs, 5000);
});

test("拨测尊重自定义 WS_PATH（路径配错时能验出来）", async () => {
  const { connectFn, seen } = stubConnect({ ok: true });
  await probeTempDomain("abc.trycloudflare.com", 5000, "/my/ws", connectFn);
  assert.equal(seen[0].url, "wss://abc.trycloudflare.com/my/ws");
  // 不传 wsPath 时用默认 /link
  const { connectFn: c2, seen: s2 } = stubConnect({ ok: true });
  await probeTempDomain("abc.trycloudflare.com", 5000, undefined, c2);
  assert.equal(s2[0].url, "wss://abc.trycloudflare.com/link");
});

test("502/503 判死，其余 HTTP 状态判活（含限流 429/530）", async () => {
  for (const [status, wantOk] of [[502, false], [503, false], [400, true], [403, true], [404, true], [429, true], [530, true]]) {
    const { connectFn } = stubConnect({ error: `WSS handshake http=${status} body=...` });
    const r = await probeTempDomain("abc.trycloudflare.com", 5000, "/link", connectFn);
    assert.equal(r.ok, wantOk, `http=${status}`);
    assert.match(r.reason, new RegExp(`http=${status}`));
  }
});

test("网络错误/超时：判可疑（ok=false），reason 截断到 80 字符", async () => {
  const { connectFn } = stubConnect({ error: "WSS handshake timeout" });
  const r = await probeTempDomain("abc.trycloudflare.com", 2000, "/link", connectFn);
  assert.equal(r.ok, false);
  assert.equal(r.reason, "WSS handshake timeout");

  const long = "x".repeat(200);
  const { connectFn: c2 } = stubConnect({ error: long });
  const r2 = await probeTempDomain("abc.trycloudflare.com", 2000, "/link", c2);
  assert.equal(r2.ok, false);
  assert.equal(r2.reason.length, 80);
});

test("空域名：直接判死，不去握手", async () => {
  const { connectFn, seen } = stubConnect({ ok: true });
  for (const v of ["", null, undefined, "https://"]) {
    const r = await probeTempDomain(v, 1000, "/link", connectFn);
    assert.equal(r.ok, false);
    assert.equal(r.reason, "empty");
  }
  assert.equal(seen.length, 0);
});

// ---- niccore 逐连接噪音降噪（isLinkInboundNoise / linkNoise 见文件顶部动态导入）----

test("降噪：三条真实的 niccore 错误行被判为噪音（含 ANSI 色码）", () => {
  const lines = [
    // niccore 的真实原始输出：inbound/vless[vless-link]（未经 cleanLog 中性化）
    "\u001b[31mERROR\u001b[0m[0045] [\u001b[38;5;49m2926929400\u001b[0m 0ms] inbound/vless[vless-link]: process connection from 127.0.0.1:45896: bad path: /",
    "\u001b[31mERROR\u001b[0m[0060] [\u001b[38;5;41m3168704025\u001b[0m 38ms] inbound/vless[vless-link]: process connection from 136.69.241.252:45428: EOF",
    // 已中性化的展示形式同样要能判定（幂等）
    "ERROR[0045] [1622577780 130ms] inbound/v[link]: process connection from 136.69.241.252:36178: EOF",
    'ERROR[0121] [4185606779 0ms] inbound/v[link]: process connection from 127.0.0.1:51044: upgrade websocket connection: handshake error: bad "Upgrade" header',
  ];
  const before = linkNoise.count;
  for (const l of lines) assert.equal(isLinkInboundNoise(l), true, l);
  assert.equal(linkNoise.count, before + 4);
  assert.match(linkNoise.lastAt, /^\d{4}-\d{2}-\d{2}T/);
});

test("降噪：真正的故障行不受影响（不能被误吞）", () => {
  const keep = [
    "FATAL error: listen udp 0.0.0.0:4433: bind: address already in use",
    "inbound/v[link]: start: listen tcp 127.0.0.1:18000: bind: address already in use",
    "ERROR[0001] inbound/hysteria2[direct-udp]: failed to start",
    // 客户端真的连上了 WS 路径、但 vless 握手/版本不对：这是"配置/凭据有问题"的信号，必须保留
    "inbound/v[link]: process connection from 1.2.3.4:80: vless: unexpected version 0",
    // 端口缺失的畸形行不匹配（说明日志格式变了，宁可多报也不要漏报）
    "inbound/v[link]: process connection from 1.2.3.4: bad path: /",
    "inbound/vless[vless-link]: process connection from 1.2.3.4:80: vless: unexpected version 0",
  ];
  for (const l of keep) assert.equal(isLinkInboundNoise(l), false, l);
});
