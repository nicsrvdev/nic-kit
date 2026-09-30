// 动态配置下发回归：未知字段只忽略 + 告警，不能让整包合法配置被拒。
import test from "node:test";
import assert from "node:assert/strict";

process.env.NIC_SKIP_MAIN = "1";
const { createCfProbe } = await import("../index.js");

const MD5 = "d41d8cd98f00b204e9800998ecf8427e";

function makeProbe() {
  return createCfProbe({
    cfNodeId: "n", cfSecret: "s", cfWorkerUrl: "https://example.com",
    cfInterval: 60, cfConnectionMode: "http", cfPingMode: "tcp",
    cfPingCt: "", cfPingCu: "", cfPingCm: "", cfPingBgp: "",
    cfNode1: "", cfNode2: "", cfNode3: "", cfNode4: "", cfIface: "",
  });
}

test("未知字段：忽略并应用其余合法配置", () => {
  const p = makeProbe();
  const r = p._applyDynConfig("collect_interval=5&report_interval=60&brand_new_field=1", MD5);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(p._state.dynCollectInterval, 5);
  assert.equal(p._state.dynReportInterval, 60);
  assert.equal("brand_new_field" in (p._state.serverCfg || {}), false, "未知字段不应写入 serverCfg");
});

test("未知字段 + 已知字段非法：仍按非法拒绝", () => {
  const p = makeProbe();
  const r = p._applyDynConfig("collect_interval=7&brand_new_field=1", MD5);
  assert.equal(r.ok, false);
  assert.match(r.reason, /collect_interval/);
});

test("全是不认识的字段：视为无配置字段", () => {
  const p = makeProbe();
  const r = p._applyDynConfig("some_future_flag=1", MD5);
  assert.equal(r.ok, false);
  assert.match(r.reason, /no config fields/);
});

test("schema_version 回显（非白名单外的配置项）不再拖垮整包", () => {
  const p = makeProbe();
  const r = p._applyDynConfig("schema_version=7&collect_interval=2&report_interval=60&reset_day=1", MD5);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(p._state.dynCollectInterval, 2);
});
