// 下载实现回归：
// 1) 异步非阻塞（旧实现用 spawnSync 调 curl，下载期间事件循环整体卡死）
// 2) 超时/HTTP 错误/大小不足时不留残留文件
// 3) 重试可恢复
import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.NIC_SKIP_MAIN = "1";
const { downloadFile } = await import("../index.js");

async function withServer(handler, fn) {
  const server = createServer(handler);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  try {
    return await fn(port);
  } finally {
    await new Promise((r) => server.close(r));
  }
}

async function workDir() {
  return mkdtemp(join(tmpdir(), "nk-dl-"));
}

test("下载挂起期间事件循环不被阻塞（定时器照常触发）", { timeout: 30000 }, async () => {
  // 只 accept、永不响应：模拟慢/挂死的镜像源
  await withServer(() => {}, async (port) => {
    const dir = await workDir();
    const dest = join(dir, "sub", "niccore");
    let ticks = 0;
    const iv = setInterval(() => { ticks++; }, 50);
    let err = null;
    const p = downloadFile(`http://127.0.0.1:${port}/bin`, dest, { timeoutMs: 2500, retries: 0 })
      .catch((e) => { err = e; });
    await new Promise((r) => setTimeout(r, 1000));
    const ticksIn1s = ticks;
    await p;
    clearInterval(iv);
    assert.ok(ticksIn1s >= 10, `事件循环被阻塞：1s 内只触发 ${ticksIn1s} 次定时器`);
    assert.ok(err, "超时应抛错");
    await assert.rejects(stat(dest), undefined, "失败后不应留下半截文件");
    await rm(dir, { recursive: true, force: true });
  });
});

test("正常下载：内容与 minSize 校验通过", { timeout: 30000 }, async () => {
  const body = Buffer.alloc(1024 * 1024, 7);
  await withServer((req, res) => {
    res.writeHead(200, { "content-type": "application/octet-stream" });
    res.end(body);
  }, async (port) => {
    const dir = await workDir();
    const dest = join(dir, "niclink");
    await downloadFile(`http://127.0.0.1:${port}/bin`, dest, { minSize: 1024 });
    const got = await readFile(dest);
    assert.equal(got.length, body.length);
    assert.equal(got[0], 7);
    await rm(dir, { recursive: true, force: true });
  });
});

test("HTTP 404：抛错且不生成文件", { timeout: 30000 }, async () => {
  await withServer((req, res) => {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("nope");
  }, async (port) => {
    const dir = await workDir();
    const dest = join(dir, "niccore");
    await assert.rejects(
      downloadFile(`http://127.0.0.1:${port}/bin`, dest, { retries: 0 }),
      /fetch 404/
    );
    await assert.rejects(stat(dest));
    await rm(dir, { recursive: true, force: true });
  });
});

test("文件小于 minSize：删文件并报错（防半截包被当成完整二进制）", { timeout: 30000 }, async () => {
  await withServer((req, res) => { res.writeHead(200); res.end("tiny"); }, async (port) => {
    const dir = await workDir();
    const dest = join(dir, "niccore");
    await assert.rejects(
      downloadFile(`http://127.0.0.1:${port}/bin`, dest, { minSize: 1024 * 1024, retries: 0 }),
      /download incomplete/
    );
    await assert.rejects(stat(dest));
    await rm(dir, { recursive: true, force: true });
  });
});

test("首次 500 后重试成功", { timeout: 30000 }, async () => {
  let hits = 0;
  await withServer((req, res) => {
    hits++;
    if (hits === 1) {
      res.writeHead(500);
      res.end("boom");
      return;
    }
    res.writeHead(200);
    res.end(Buffer.alloc(2048, 1));
  }, async (port) => {
    const dir = await workDir();
    const dest = join(dir, "niccore");
    await downloadFile(`http://127.0.0.1:${port}/bin`, dest, { retries: 2, minSize: 1024 });
    assert.equal(hits, 2, "应先失败一次再重试");
    const st = await stat(dest);
    assert.equal(st.size, 2048);
    await rm(dir, { recursive: true, force: true });
  });
});
