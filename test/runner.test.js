// Runner 重启计数单测：长期健康运行后偶发崩溃，应清零计数而不是累加上古早次数。
import test from "node:test";
import assert from "node:assert/strict";

process.env.NIC_SKIP_MAIN = "1";
const { Runner, RESTART_RESET_MS } = await import("../index.js");

test("连续健康运行超阈值：重启计数清零后重新计数", () => {
  const r = new Runner();
  r.restarts.set("svc", 29);
  r.spawnedAt.set("svc", Date.now() - RESTART_RESET_MS - 1000); // 上次启动是 10 分钟+ 以前
  r.scheduleRestart("svc", "/bin/false", [], {}, "test");
  assert.equal(r.restarts.get("svc"), 1); // 清零后再 +1，而不是 30（直接放弃）
  r.stop("svc", true); // 清掉 pending 的退避 timer
});

test("短时间内连续崩溃：计数正常累加", () => {
  const r = new Runner();
  r.restarts.set("svc", 5);
  r.spawnedAt.set("svc", Date.now() - 1000); // 1 秒前刚启动就崩
  r.scheduleRestart("svc", "/bin/false", [], {}, "test");
  assert.equal(r.restarts.get("svc"), 6);
  r.stop("svc", true);
});

test("达到上限仍放弃（防配置错误刷屏）", () => {
  const r = new Runner();
  r.restarts.set("svc", 30);
  r.spawnedAt.set("svc", Date.now() - 1000);
  r.scheduleRestart("svc", "/bin/false", [], {}, "test");
  assert.equal(r.restarts.get("svc"), 31);
  assert.equal(r.timers.has("svc"), false); // 超上限：不再安排重启
});
