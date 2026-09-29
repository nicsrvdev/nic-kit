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

test("达到上限放弃时触发 onGiveUp 钩子", () => {
  const r = new Runner();
  let fired = 0;
  r.onGiveUp("svc", () => { fired++; });
  r.restarts.set("svc", 30);
  r.spawnedAt.set("svc", Date.now() - 1000);
  r.scheduleRestart("svc", "/bin/false", [], {}, "test");
  assert.equal(fired, 1);
});

test("未达上限时不触发 onGiveUp 钩子", () => {
  const r = new Runner();
  let fired = 0;
  r.onGiveUp("svc", () => { fired++; });
  r.restarts.set("svc", 5);
  r.spawnedAt.set("svc", Date.now() - 1000);
  r.scheduleRestart("svc", "/bin/false", [], {}, "test");
  assert.equal(fired, 0);
  r.stop("svc", true); // 清掉 pending 的退避 timer
});

test("restart() 无启动记录时返回 false", () => {
  const r = new Runner();
  assert.equal(r.restart("ghost", "test"), false);
});

test("restart() 安排一次重启：旧进程迟到 exit 不导致重复", () => {
  const r = new Runner();
  // 模拟一次启动：只记 lastSpawn，不真 spawn
  r.lastSpawn = new Map();
  r.lastSpawn.set("svc", { bin: "/bin/false", args: [], opts: {} });
  r.restarts.set("svc", 0);
  r.spawnedAt.set("svc", Date.now() - 1000);
  assert.equal(r.restart("svc", "test restart"), true);
  assert.equal(r.timers.has("svc"), true); // 已安排退避重启
  r.stop("svc", true); // 清掉 timer，避免测试进程被挂住
});

test("_onExit: 意外死亡且 wantRunning → 安排重启", () => {
  const r = new Runner();
  r.wantRunning.add("svc");
  r.lastSpawn.set("svc", { bin: "/bin/false", args: [], opts: {} });
  const fakeChild = {};
  r.children.set("svc", fakeChild);
  r.spawnedAt.set("svc", Date.now());
  r._onExit("svc", fakeChild, 1, null);
  assert.equal(r.timers.has("svc"), true);
  assert.equal(r.restarts.get("svc"), 1);
  r.stop("svc", true);
});

test("_onExit: stop() 之后迟到的 exit → 不重启", () => {
  const r = new Runner();
  r.wantRunning.add("svc");
  r.lastSpawn.set("svc", { bin: "/bin/false", args: [], opts: {} });
  const fakeChild = {};
  r.children.set("svc", fakeChild);
  r.stop("svc", true); // 明确不该活着
  r._onExit("svc", fakeChild, 0, "SIGTERM");
  assert.equal(r.timers.has("svc"), false);
  assert.equal(r.restarts.get("svc") || 0, 0);
});

test("_onExit: 表里已是新进程，旧进程 exit → 不产生幽灵重启", () => {
  const r = new Runner();
  r.wantRunning.add("svc");
  r.lastSpawn.set("svc", { bin: "/bin/false", args: [], opts: {} });
  const oldChild = {}, newChild = {};
  r.children.set("svc", newChild);
  r._onExit("svc", oldChild, 0, "SIGTERM");
  assert.equal(r.timers.has("svc"), false);
  assert.equal(r.restarts.get("svc") || 0, 0);
});

test("restart(): 只计一次（随后旧 exit 不再重复计数）", () => {
  const r = new Runner();
  r.lastSpawn.set("svc", { bin: "/bin/false", args: [], opts: {} });
  r.spawnedAt.set("svc", Date.now());
  r.wantRunning.add("svc");
  const fakeChild = {};
  r.children.set("svc", fakeChild);
  assert.equal(r.restart("svc", "test"), true);
  assert.equal(r.restarts.get("svc"), 1);
  r._onExit("svc", fakeChild, 0, "SIGTERM"); // 旧进程迟到 exit
  assert.equal(r.restarts.get("svc"), 1); // 还是 1，没被重复计数
  assert.equal(r.timers.has("svc"), true);
  r.stop("svc", true);
});

test("_onError: ENOENT 走 refetch，随后 exit 不重复处理", async () => {
  const r = new Runner();
  let refetched = 0;
  r.onMissingBinary("svc", async () => { refetched++; return "/bin/true"; });
  r.wantRunning.add("svc");
  const fakeChild = {};
  r.children.set("svc", fakeChild);
  const err = new Error("spawn /nonexistent ENOENT");
  err.code = "ENOENT";
  r._onError("svc", fakeChild, "/nonexistent", [], {}, err);
  await new Promise((res) => setTimeout(res, 50));
  assert.equal(refetched, 1);
  r._onExit("svc", fakeChild, -2, null); // error 后的 exit 必到，应判 stale
  assert.equal(r.restarts.get("svc") || 0, 0);
  r.stop("svc", true);
});
