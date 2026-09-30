// HTTP 服务健壮性回归：
// 1) 畸形请求目标（`http://`、`//`、`\\`）过去会让 new URL 抛 TypeError，
//    而请求处理函数没有兜底 → 未捕获异常 → 整个进程退出（一条请求即可打崩探针）。
//    现在必须回 400 且进程存活。
// 2) 客户端「发请求后立刻 RST」的洪泛不能打死服务。
import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { connect } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

process.env.NIC_SKIP_MAIN = "1"; // 只导入纯函数，不启动服务（同其它测试文件）
const { parseRequestUrl } = await import("../index.js");

const HERE = dirname(fileURLToPath(import.meta.url));

async function freePort() {
  const s = createServer();
  await new Promise((r) => s.listen(0, "127.0.0.1", r));
  const { port } = s.address();
  await new Promise((r) => s.close(r));
  return port;
}

/** 原始 socket 发一条请求，返回响应首行（或超时返回 ""） */
function rawRequest(port, raw, { rst = false, timeout = 3000 } = {}) {
  return new Promise((resolve) => {
    const sock = connect(port, "127.0.0.1");
    let buf = "";
    const done = (out) => { try { sock.destroy(); } catch {} resolve(out); };
    const timer = setTimeout(() => done(buf.split("\r\n")[0] || ""), timeout);
    sock.on("connect", () => {
      sock.write(raw);
      if (rst) sock.resetAndDestroy ? sock.resetAndDestroy() : sock.destroy();
    });
    sock.on("data", (d) => {
      buf += d;
      if (buf.includes("\r\n")) {
        clearTimeout(timer);
        done(buf.split("\r\n")[0]);
      }
    });
    sock.on("error", () => { clearTimeout(timer); done(buf.split("\r\n")[0] || ""); });
    sock.on("close", () => { clearTimeout(timer); done(buf.split("\r\n")[0] || ""); });
  });
}

test("parseRequestUrl：畸形目标不抛异常，正常目标可解析", () => {
  assert.equal(parseRequestUrl("http://"), null);
  assert.equal(parseRequestUrl("//"), null);
  assert.equal(parseRequestUrl("\\\\"), null);
  assert.equal(parseRequestUrl("").pathname, "/");
  assert.equal(parseRequestUrl("/health").pathname, "/health");
  // `//foo` 在 URL 语义里是「host=foo, path=/」——不崩即可；路由命中 index
  assert.equal(parseRequestUrl("//foo").pathname, "/");
  assert.equal(parseRequestUrl("//foo").hostname, "foo");
  // 百分号编码原样保留（不做二次解码）
  assert.equal(parseRequestUrl("/a%26b").pathname, "/a%26b");
});

test("畸形请求目标打不崩进程（回归：曾经一条 GET http:// 即退出）", { timeout: 60000 }, async () => {
  // 用「只 accept 不回应」的 sink 把二进制下载挂住：进程停在下载窗口，
  // 事件循环空闲，任何未捕获异常都会立刻显形。
  const held = new Set();
  const sink = createServer((sock) => {
    held.add(sock);
    sock.on("close", () => held.delete(sock));
    sock.on("error", () => {});
  });
  await new Promise((r) => sink.listen(0, "127.0.0.1", r));
  const sinkPort = sink.address().port;

  const work = await mkdtemp(join(tmpdir(), "nk-http-"));
  const port = await freePort();
  const child = spawn(process.execPath, [join(HERE, "..", "index.js")], {
    cwd: work,
    env: {
      PATH: join(work, "empty-path"), // 隐藏 curl/wget → fetch 兜底（异步不阻塞）
      TMPDIR: work,
      PORT: String(port),
      BIN_DIR: join(work, ".bin"),
      GH_PROXY: `http://127.0.0.1:${sinkPort}`,
      NICCORE_VERSION: "v0.0.0-test",
      NICLINK_VERSION: "v0.0.0-test",
      UUID: randomUUID(),
      LOG_LEVEL: "warn",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (d) => { stderr += d; });

  try {
    // 等 /health 就绪
    let up = false;
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
      if (child.exitCode !== null) break;
      try {
        const res = await fetch(`http://127.0.0.1:${port}/health`);
        if (res.status === 200) { up = true; break; }
      } catch {}
      await new Promise((r) => setTimeout(r, 100));
    }
    assert.ok(up, `服务未就绪（exit=${child.exitCode}）\n${stderr}`);

    // 逐个攻击：畸形目标必须回 400，且进程必须活着
    const attacks = [
      "GET http:// HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n",
      "GET // HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n",
      "GET \\\\ HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n",
    ];
    for (const a of attacks) {
      const line = await rawRequest(port, a);
      assert.match(line, /^HTTP\/1\.1 400/, `畸形目标应回 400，实际：${JSON.stringify(line)}`);
      assert.equal(child.exitCode, null, `畸形请求打崩了进程：${a.split("\r\n")[0]}`);
    }

    // RST 洪泛（客户端发完立刻复位）不能打死服务
    for (let i = 0; i < 100; i++) {
      await rawRequest(port, "GET /health HTTP/1.1\r\nHost: x\r\n\r\n", { rst: true, timeout: 500 });
    }

    const res = await fetch(`http://127.0.0.1:${port}/health`);
    assert.equal(res.status, 200, "攻击后 /health 应仍为 200");
    assert.equal(child.exitCode, null, "进程不应退出");
    assert.doesNotMatch(stderr, /Invalid URL|uncaughtException/);
  } finally {
    child.kill("SIGTERM");
    await Promise.race([
      new Promise((r) => child.once("exit", r)),
      new Promise((r) => setTimeout(r, 5000)).then(() => child.kill("SIGKILL")),
    ]);
    for (const s of held) s.destroy();
    await new Promise((r) => sink.close(r));
    await rm(work, { recursive: true, force: true });
  }
});
