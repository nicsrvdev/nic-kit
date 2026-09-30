// CF 探针启动窗口回归：修复前 start() 后 1 秒内会发出 3 条完整 report
//（wssConnectOnce 首帧 + tick() 的 POST 兜底 + wssTickLoop 首轮重复帧）。
// 用本地 mock（HTTP POST + 原生 WebSocket，帧编解码复用项目自身实现）记录收包时序。
import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createHash } from "node:crypto";

process.env.NIC_SKIP_MAIN = "1";
const { createCfProbe, wsFrameEncode, wsFrameDecodeOne } = await import("../index.js");

const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

async function withMockWorker(fn) {
  const posts = [];
  const frames = [];
  const sockets = new Set();
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (d) => { body += d; });
    req.on("end", () => {
      posts.push(Date.now());
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("OK");
    });
  });
  // 跟踪所有 TCP 连接：WS 升级后的 socket 不属于普通连接，close() 等不到它
  server.on("connection", (sock) => {
    sockets.add(sock);
    sock.on("close", () => sockets.delete(sock));
  });
  server.on("upgrade", (req, sock) => {
    const accept = createHash("sha1").update(String(req.headers["sec-websocket-key"]) + GUID).digest("base64");
    sock.write(
      "HTTP/1.1 101 Switching Protocols\r\n" +
      "Upgrade: websocket\r\nConnection: Upgrade\r\n" +
      `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
    );
    sock.write(wsFrameEncode(0x1, Buffer.from(JSON.stringify({ type: "hello", protocol: "update", ts: Date.now() }))));
    let acc = Buffer.alloc(0);
    sock.on("data", (chunk) => {
      acc = Buffer.concat([acc, chunk]);
      for (;;) {
        let fr;
        try { fr = wsFrameDecodeOne(acc); } catch { return; }
        if (!fr.ok) return;
        acc = fr.rest;
        if (fr.opcode === 0x1) {
          frames.push(Date.now());
          sock.write(wsFrameEncode(0x1, Buffer.from(JSON.stringify({ type: "ack", ts: Date.now(), persisted: true }))));
        }
      }
    });
    sock.on("error", () => {});
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  try {
    return await fn(port, { posts, frames });
  } finally {
    // 直接销毁连接后关闭，不等待 close 回调（升级后的 socket 会让回调悬空，
    // 导致测试 promise 一直 pending 而被 runner 取消）
    for (const sock of sockets) {
      try { sock.destroy(); } catch {}
    }
    server.closeAllConnections?.();
    server.close();
  }
}

function makeProbe(port, mode = "auto") {
  return createCfProbe({
    cfNodeId: "test-node",
    cfSecret: "s",
    cfWorkerUrl: `http://127.0.0.1:${port}`,
    cfInterval: 60,
    cfConnectionMode: mode,
    cfPingMode: "tcp",
    cfPingCt: "", cfPingCu: "", cfPingCm: "", cfPingBgp: "",
    cfNode1: "", cfNode2: "", cfNode3: "", cfNode4: "", cfIface: "",
  });
}

test("auto/WSS 模式：启动 6s 内不重复上报（无 POST 兜底、无背靠背双首帧）", { timeout: 30000 }, async () => {
  await withMockWorker(async (port, { posts, frames }) => {
    const p = makeProbe(port, "auto");
    p.start();
    await new Promise((r) => setTimeout(r, 6000));
    p.stop();

    assert.ok(frames.length >= 2, `应至少上报两次，实际 ${frames.length}`);
    assert.ok(frames.length <= 4, `6s / 2s 间隔不应超过 4 次，实际 ${frames.length}`);
    assert.equal(posts.length, 0, `WSS 已连接时不应再走 POST 兜底，实际 ${posts.length} 次`);

    // 相邻上报间隔不得小于 1s（修复前出现 132ms / 1018ms 这种背靠背）
    const gaps = frames.slice(1).map((t, i) => t - frames[i]);
    for (const g of gaps) assert.ok(g >= 1000, `上报间隔过短：${g}ms`);
    assert.equal(p._state.wssReports, frames.length);
  });
});

test("http 模式：上报节流按 report_interval，不会每次节拍都发", { timeout: 30000 }, async () => {
  await withMockWorker(async (port, { posts }) => {
    const p = makeProbe(port, "http");
    p.start();
    await new Promise((r) => setTimeout(r, 6000));
    p.stop();
    // CF_INTERVAL=60：6 秒内只应有启动那一次
    assert.equal(posts.length, 1, `http 模式 6s 内应只上报 1 次，实际 ${posts.length}`);
    assert.equal(p._state.postReports, 1);
  });
});
