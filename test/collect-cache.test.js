// 采集节拍回归：
// 1) 同一节拍内 tick()/上报共用一份指标快照（旧实现每节拍两次全量 collect）
// 2) 磁盘用量走缓存，不再每个节拍 fork 一次 `df`
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.NIC_SKIP_MAIN = "1";
const { createCfProbe, resetDiskCache } = await import("../index.js");

const isLinux = process.platform === "linux";

function makeProbe() {
  return createCfProbe({
    cfNodeId: "n", cfSecret: "s", cfWorkerUrl: "http://127.0.0.1:9",
    cfInterval: 60, cfConnectionMode: "http", cfPingMode: "tcp",
    cfPingCt: "", cfPingCu: "", cfPingCm: "", cfPingBgp: "",
    cfNode1: "", cfNode2: "", cfNode3: "", cfNode4: "", cfIface: "",
  });
}

/** 造一个计数用的 df shim，返回 { dir, count() } */
async function dfShim(realDf) {
  const dir = await mkdtemp(join(tmpdir(), "nk-df-"));
  const log = join(dir, "count.log");
  await writeFile(log, "");
  const shim = join(dir, "df");
  await writeFile(shim, `#!/bin/sh\necho x >> "${log}"\nexec "${realDf}" "$@"\n`);
  await chmod(shim, 0o755);
  return {
    dir,
    async count() {
      const t = await readFile(log, "utf8").catch(() => "");
      return t.split("\n").filter(Boolean).length;
    },
    async cleanup() { await rm(dir, { recursive: true, force: true }); },
  };
}

test("同一节拍内复用指标快照，TTL 过后才重新采集", { timeout: 30000 }, async () => {
  const p = makeProbe();
  const a = await p._collectMetrics();
  const b = await p._collectMetrics();
  assert.equal(a, b, "复用窗口内应返回同一份快照对象");
  await new Promise((r) => setTimeout(r, 1700)); // 超过 COLLECT_REUSE_MS
  const c = await p._collectMetrics();
  assert.notEqual(a, c, "超过 TTL 应重新采集");
});

test("磁盘用量缓存：连续采集只 fork 一次 df", { timeout: 30000, skip: !isLinux }, async () => {
  const realDf = spawnSync("sh", ["-c", "command -v df"], { encoding: "utf8" }).stdout.trim();
  assert.ok(realDf, "需要 df 命令");
  const shim = await dfShim(realDf);
  const oldPath = process.env.PATH;
  process.env.PATH = `${shim.dir}:${oldPath}`;
  resetDiskCache();
  try {
    const p = makeProbe();
    const first = await p._collectMetrics();
    assert.ok(Number(first.disk_total) > 0, `disk_total 应大于 0，实际 ${first.disk_total}`);
    await new Promise((r) => setTimeout(r, 1700)); // 让指标快照过期，但磁盘缓存仍在
    await p._collectMetrics();
    assert.equal(await shim.count(), 1, "30s 缓存内不应重复调用 df");

    resetDiskCache(); // 缓存失效后应重新取一次
    await new Promise((r) => setTimeout(r, 1700)); // 指标快照同样要过期
    await p._collectMetrics();
    assert.equal(await shim.count(), 2);
  } finally {
    process.env.PATH = oldPath;
    resetDiskCache();
    await shim.cleanup();
  }
});
