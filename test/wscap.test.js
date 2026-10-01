// 第八轮回归：握手/读取路径的内存上限。
// 背景：对端只建连不发完整数据时，累积缓冲（acc/msgBuf）会无界增长。
// wsConnect 是存活拨测与 cfprobe 共用的握手实现，这里用真实 TCP server 验证上限生效。
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:net";

process.env.NIC_SKIP_MAIN = "1";
const { wsConnect } = await import("../index.js");

test("wsConnect：对端只发垃圾不发完整响应头 → 64KB 上限，快速失败（不无限吃内存）", async () => {
  let sent = 0;
  const socks = [];
  const srv = createServer((sock) => {
    socks.push(sock);
    // 永远不发送 \r\n\r\n，持续灌数据
    const timer = setInterval(() => {
      try {
        sock.write(Buffer.alloc(16 * 1024, 0x41)); // 'A' * 16KB
        sent += 16 * 1024;
      } catch {
        clearInterval(timer);
      }
    }, 5);
    sock.on("close", () => clearInterval(timer));
    sock.on("error", () => clearInterval(timer));
  });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const port = srv.address().port;
  const t0 = Date.now();
  try {
    await assert.rejects(
      () => wsConnect(`ws://127.0.0.1:${port}/link`, {}, 8000),
      /too large/,
      "应因超过 64KB 上限而失败，而不是一直累积"
    );
    const dt = Date.now() - t0;
    assert.ok(dt < 5000, `应远早于超时失败（实际 ${dt}ms）`);
    assert.ok(sent <= 1024 * 1024, `对端发送量应有界（实际 ${sent} 字节）`);
  } finally {
    for (const s of socks) { try { s.destroy(); } catch {} }
    await new Promise((r) => srv.close(() => r()));
  }
});

test("wsConnect：正常拒绝（非 101）仍然带 http 状态码", async () => {
  const socks = [];
  const srv = createServer((sock) => {
    socks.push(sock);
    sock.end("HTTP/1.1 404 Not Found\r\ncontent-length: 0\r\n\r\n");
  });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const port = srv.address().port;
  try {
    await assert.rejects(
      () => wsConnect(`ws://127.0.0.1:${port}/link`, {}, 4000),
      (e) => {
        assert.match(String(e.message), /http=404/);
        assert.equal(e.status, 404);
        return true;
      }
    );
  } finally {
    // wsConnect 失败时已销毁自己的 socket（客户端无 fd 泄漏）；
    // 这里显式关掉服务端一侧，避免 close() 在等一条不会收到 FIN 的连接。
    for (const s of socks) { try { s.destroy(); } catch {} }
    await new Promise((r) => srv.close(() => r()));
  }
});
