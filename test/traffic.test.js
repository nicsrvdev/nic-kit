// 月度流量累计回归：面板字段 net_rx_monthly/net_tx_monthly 语义为"本月"，
// 需要跨账期清零、跨重启恢复、计数器回绕（重启/换机）不产生负数。
import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

process.env.NIC_SKIP_MAIN = "1";
const { loadTraffic, saveTraffic, accumulateTraffic, monthKeyOf, trafficState } = await import("../index.js");

// 用本地时间构造（实现按本机时区算账期），测试因此在任意时区都稳定
const T = (iso) => Date.parse(iso);
const local = (y, m, d, h = 12) => new Date(y, m - 1, d, h).getTime();

test("monthKeyOf：reset_day 之前算上一个账期", () => {
  assert.equal(monthKeyOf(local(2026, 9, 15), 1), "2026-09");
  assert.equal(monthKeyOf(local(2026, 9, 15), 20), "2026-08");
  assert.equal(monthKeyOf(local(2026, 9, 20), 20), "2026-09");
  // 31 号在只有 30 天的月份里退化为月末
  assert.equal(monthKeyOf(local(2026, 9, 30), 31), "2026-09");
});

test("未初始化时回落到累计计数器（保持旧语义）", () => {
  trafficState.ready = false;
  assert.deepEqual(accumulateTraffic(1234, 5678, Date.now(), 1), { rx: 1234, tx: 5678 });
});

test("累加、跨账期清零、重启恢复", { timeout: 30000 }, async () => {
  const dir = await mkdtemp(join(tmpdir(), "nk-traffic-"));
  try {
    await loadTraffic({ binDir: dir });
    const now = local(2026, 9, 15);
    // 首次采样只对齐基准，不把开机以来的流量算进本月
    assert.deepEqual(accumulateTraffic(100000, 200000, now, 1), { rx: 0, tx: 0 });
    assert.deepEqual(accumulateTraffic(100500, 200900, now, 1), { rx: 500, tx: 900 });
    assert.deepEqual(accumulateTraffic(100700, 201000, now, 1), { rx: 700, tx: 1000 });
    // 计数器回绕（重启/换机）不产生负数
    assert.deepEqual(accumulateTraffic(50, 60, now, 1), { rx: 700, tx: 1000 });

    // 跨账期（10 月）：清零后，上次采样以来的增量计入新账期
    const oct = local(2026, 10, 2);
    assert.deepEqual(accumulateTraffic(100, 200, oct, 1), { rx: 50, tx: 140 });
    assert.deepEqual(accumulateTraffic(400, 900, oct, 1), { rx: 350, tx: 840 });

    await saveTraffic();
    const persisted = JSON.parse(await readFile(join(dir, ".run", "traffic.json"), "utf8"));
    assert.equal(persisted.month_key, "2026-10");
    assert.equal(persisted.month_rx, 350);

    // 模拟进程重启：清内存后从文件恢复
    trafficState.primed = false;
    trafficState.month = { rx: 0, tx: 0 };
    trafficState.monthKey = "";
    await loadTraffic({ binDir: dir });
    assert.deepEqual(trafficState.month, { rx: 350, tx: 840 });
    assert.equal(trafficState.monthKey, "2026-10");
    // 重启后继续累加（首次采样对齐基准）
    assert.deepEqual(accumulateTraffic(1000, 2000, oct, 1), { rx: 350, tx: 840 });
    assert.deepEqual(accumulateTraffic(1100, 2000, oct, 1), { rx: 450, tx: 840 });
  } finally {
    trafficState.ready = false;
    trafficState.primed = false;
    await rm(dir, { recursive: true, force: true });
  }
});

test("状态文件损坏：告警并从 0 起步，不抛错", { timeout: 30000 }, async () => {
  const dir = await mkdtemp(join(tmpdir(), "nk-traffic-bad-"));
  try {
    await mkdir(join(dir, ".run"), { recursive: true });
    await writeFile(join(dir, ".run", "traffic.json"), "{not json");
    await loadTraffic({ binDir: dir });
    assert.equal(trafficState.ready, true);
    assert.deepEqual(trafficState.month, { rx: 0, tx: 0 });
    assert.equal(trafficState.monthKey, "");
  } finally {
    trafficState.ready = false;
    await rm(dir, { recursive: true, force: true });
  }
});


test("账期按本机时区计算（同一时刻在不同时区落在不同账期）", () => {
  const indexPath = fileURLToPath(new URL("../index.js", import.meta.url));
  const script = [
    'process.env.NIC_SKIP_MAIN = "1";',
    `const { monthKeyOf } = await import(${JSON.stringify(indexPath)});`,
    'console.log(monthKeyOf(Date.parse("2026-09-30T22:00:00Z"), 1));',
  ].join("\n");
  const run = (tz) =>
    spawnSync(process.execPath, ["--input-type=module", "-e", script], {
      env: { ...process.env, TZ: tz },
      encoding: "utf8",
    }).stdout.trim();
  // UTC+14 已是 10-01，UTC-11 还是 09-30
  assert.equal(run("Pacific/Kiritimati"), "2026-10");
  assert.equal(run("Pacific/Midway"), "2026-09");
  assert.equal(run("UTC"), "2026-09");
});
