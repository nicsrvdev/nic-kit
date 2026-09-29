import { test } from "node:test";
import assert from "node:assert/strict";

process.env.NIC_SKIP_MAIN = "1";
const { createCfProbe } = await import("../index.js");

const MD5 = "d41d8cd98f00b204e9800998ecf8427e"; // 32 位 hex，下发必须带

function makeProbe(pingCt = "") {
  return createCfProbe({
    cfNodeId: "test-node",
    cfSecret: "s",
    cfWorkerUrl: "https://example.com",
    cfInterval: 60,
    cfConnectionMode: "http", // 走 POST，不碰 WSS
    cfPingMode: "tcp",
    cfPingCt: pingCt,
    cfPingCu: "",
    cfPingCm: "",
    cfPingBgp: "",
    cfNode1: "",
    cfNode2: "",
    cfNode3: "",
    cfNode4: "",
    cfIface: "",
  });
}
const fakeRes = (md5 = MD5) => ({
  headers: { get: (k) => (String(k).toLowerCase() === "x-agent-config-md5" ? md5 : null) },
});

test("applyDynConfig: 缺 schema_version 不应拒收（只校验下发了但写错的）", () => {
  const p = makeProbe();
  const r = p._applyDynConfig("collect_interval=5&report_interval=60&reset_day=1", MD5);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(p._state.dynCollectInterval, 5);
  assert.equal(p._state.dynReportInterval, 60);
});

test("applyDynConfig: schema_version 写错仍拒绝", () => {
  const p = makeProbe();
  const r = p._applyDynConfig("collect_interval=5&report_interval=60&reset_day=1&schema_version=99", MD5);
  assert.equal(r.ok, false);
  assert.match(r.reason, /schema_version/);
});

test("applyDynConfig: 部分下发（只有 connection_mode）被接受", () => {
  const p = makeProbe();
  const r = p._applyDynConfig("connection_mode=http", MD5);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(p._state.dynConnectionMode, "http");
});

test("applyDynConfig: 部分下发（只有 collect_interval）不被 report<collect 误杀", () => {
  const p = makeProbe();
  const r = p._applyDynConfig("collect_interval=5", MD5);
  assert.equal(r.ok, true, JSON.stringify(r));
});

test("applyDynConfig: 下发了但非法的字段仍拒绝", () => {
  const p = makeProbe();
  const r = p._applyDynConfig("collect_interval=7&report_interval=60", MD5);
  assert.equal(r.ok, false);
  assert.match(r.reason, /collect_interval/);
});

test("handleResponse: 只改 connection_mode 的下发不再被静默丢掉", () => {
  const p = makeProbe();
  assert.equal(p._state.dynConnectionMode, "");
  p._handleResponse(fakeRes(), "connection_mode=http", null, null);
  assert.equal(p._state.dynConnectionMode, "http");
});

test("handleResponse: 非配置 body 不触发解析", () => {
  const p = makeProbe();
  p._handleResponse(fakeRes(), "some random text", null, null);
  assert.equal(p._state.dynConnectionMode, "");
});

test("histSnapshot: 过期采样不计入 loss（不稀释丢包率）", async () => {
  const p = makeProbe("1.2.3.4");
  const now = Date.now();
  // key 形态与 probeKey("tcp", target) 一致："tcp\0" + target
  p._state.probeHist["tcp\0" + "1.2.3.4"] = [
    { at: now - 3 * 60 * 1000, rtt: 10, ok: true }, // 过期 ok：不应稀释 loss
    { at: now - 3 * 60 * 1000, rtt: 12, ok: true }, // 过期 ok
    { at: now - 10000, rtt: -1, ok: false },        // 新鲜失败
    { at: now - 5000, rtt: -1, ok: false },         // 新鲜失败
  ];
  const body = await p._collect();
  // 2 个新鲜失败 / 2 个有效采样 = 100%，过期 ok 的不能把它拉低到 50%
  assert.equal(body.metrics.loss_ct, "100");
  assert.equal(body.metrics.ping_ct, "null");
});

test("applyDynConfig: wss_report_interval 落盘进状态（之前解析完就丢了）", () => {
  const p = makeProbe();
  const r = p._applyDynConfig("wss_report_interval=5", MD5);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(p._state.dynWssReportInterval, 5);
});

test("applyDynConfig: wss_report_interval 缺席回退默认 2", () => {
  const p = makeProbe();
  const r = p._applyDynConfig("connection_mode=http", MD5);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(p._state.dynWssReportInterval, 2);
});

test("applyDynConfig: 切到 http 模式会断开已有 WSS 连接", () => {
  const p = makeProbe();
  let destroyed = 0;
  p._state.wssConnected = true;
  p._state.ws = { sock: { destroy: () => { destroyed++; } } };
  const r = p._applyDynConfig("connection_mode=http", MD5);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(p._state.wssConnected, false);
  assert.equal(p._state.ws, null);
  assert.equal(destroyed, 1);
});

test("applyDynConfig: 切回 auto 但 probe 未 start 时不拉循环（无网络副作用）", () => {
  const p = makeProbe(); // cfConnectionMode=http 起步
  const r = p._applyDynConfig("connection_mode=auto", MD5);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(p._state.wssLoop, null); // running=false，ensureWssLoops 应直接返回
  assert.equal(p._state.wssTickLoop, null);
});
