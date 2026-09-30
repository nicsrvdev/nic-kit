// /health 启动窗口回归：server 先于二进制下载启动，下载未完成时打 /health
// 不能因为闭包引用后置声明（TDZ）打死进程。
// 造窗口的方法：PATH 指向空目录 → curl/wget 探测失败 → 走 node fetch 兜底
// （异步、不阻塞事件循环）；GH_PROXY 指向一个只 accept 不回应的本地 sink，
// 下载永远挂起，窗口保持敞开。
import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

// 用 fileURLToPath 而非 import.meta.dirname：后者需要 Node >= 20.11，
// 本套测试在 Node 18/20/22 上都要能跑（npm test 用的是 node --test 的自动发现）。
const HERE = dirname(fileURLToPath(import.meta.url));

async function freePort() {
  const s = createServer();
  await new Promise((r) => s.listen(0, "127.0.0.1", r));
  const { port } = s.address();
  await new Promise((r) => s.close(r));
  return port;
}

test("二进制下载窗口内 /health 返回 200 且进程存活", { timeout: 60000 }, async () => {
  // 只 accept 不回应的 sink：fetch 连上后无限等待，下载窗口不关闭
  const heldSockets = new Set();
  const sink = createServer((sock) => {
    heldSockets.add(sock);
    sock.on("close", () => heldSockets.delete(sock));
    sock.on("error", () => {});
  });
  await new Promise((r) => sink.listen(0, "127.0.0.1", r));
  const sinkPort = sink.address().port;

  const work = await mkdtemp(join(tmpdir(), "nk-health-"));
  const emptyPath = join(work, "empty-path");
  const port = await freePort();

  const child = spawn(process.execPath, [join(HERE, "..", "index.js")], {
    cwd: work,
    env: {
      PATH: emptyPath, // 隐藏 curl/wget/sh → downloadFile 走异步 fetch 兜底
      TMPDIR: work,
      PORT: String(port),
      BIN_DIR: join(work, ".bin"), // 全新目录 → 必然走下载
      GH_PROXY: `http://127.0.0.1:${sinkPort}`, // 下载目标 = sink，永远挂起
      NICCORE_VERSION: "v0.0.0-test", // 钉版本，跳过 resolveTag 的网络请求
      NICLINK_VERSION: "v0.0.0-test",
      UUID: randomUUID(),
      LOG_LEVEL: "warn",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (d) => { stderr += d; });

  try {
    // 轮询 /health：server 起来后、下载完成前必须能答
    const deadline = Date.now() + 20000;
    let body = null;
    while (Date.now() < deadline) {
      if (child.exitCode !== null) break;
      try {
        const res = await fetch(`http://127.0.0.1:${port}/health`);
        if (res.status === 200) { body = await res.json(); break; }
      } catch { /* 还没监听，继续轮询 */ }
      await new Promise((r) => setTimeout(r, 100));
    }
    assert.ok(body, `/health 未在窗口内返回 200（进程退出码=${child.exitCode}）\nstderr:\n${stderr}`);
    assert.equal(body.ok, true);
    // status 闭包读到的必须是已初始化的字符串，而不是 TDZ 抛错
    assert.equal(typeof body.direct_udp_reason, "string");
    assert.notEqual(body.direct_udp_reason, "");
    assert.equal(typeof body.direct_tcp_reason, "string");
    assert.equal(child.exitCode, null, "窗口内进程不应退出");
    assert.doesNotMatch(stderr, /before initialization|ReferenceError/);
  } finally {
    child.kill("SIGTERM");
    await Promise.race([
      new Promise((r) => child.once("exit", r)),
      new Promise((r) => setTimeout(r, 5000)).then(() => child.kill("SIGKILL")),
    ]);
    for (const s of heldSockets) s.destroy();
    await new Promise((r) => sink.close(r));
    await rm(work, { recursive: true, force: true });
  }
});
