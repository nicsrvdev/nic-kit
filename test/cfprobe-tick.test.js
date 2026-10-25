// cfprobe tick 定时器重排回归（第二轮 review）：修复前重建出来的回调里丢了重建逻辑，
// 面板下发新间隔后节拍冻结在首次值；修复后每次触发都按当前间隔重建。
import { test } from "node:test";
import assert from "node:assert/strict";

process.env.NIC_SKIP_MAIN = "1";
const { createCfProbe } = await import("../index.js");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(cond, ms, what) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (cond()) return;
    await sleep(200);
  }
  throw new Error(`timeout waiting for ${what}`);
}

test("tick 定时器：面板下发新间隔后，后续触发按新间隔重建", { timeout: 30000 }, async () => {
  const p = createCfProbe({
    cfNodeId: "test-node",
    cfSecret: "s",
    cfWorkerUrl: "http://127.0.0.1:9", // 闭端口：POST 快速失败，不 hang
    cfInterval: 60,
    cfConnectionMode: "http", // 不碰 WSS，只测 tick 节拍
    cfPingMode: "tcp",
    cfPingCt: "", cfPingCu: "", cfPingCm: "", cfPingBgp: "",
    cfNode1: "", cfNode2: "", cfNode3: "", cfNode4: "", cfIface: "",
  });
  p.start();
  try {
    // 初始节拍 2s（wss 默认间隔；http 模式下 collect 不参与归一）
    assert.equal(p._state.timer._idleTimeout, 2000);
    // 等一次定时器触发：timer 对象被换过，证明至少重建过一次
    const first = p._state.timer;
    await waitFor(() => p._state.timer !== first, 8000, "first timer recreation");
    assert.equal(p._state.timer._idleTimeout, 2000);
    // 面板下发新间隔 5s
    const r = p._applyDynConfig("wss_report_interval=5", "d41d8cd98f00b204e9800998ecf8427e");
    assert.equal(r.ok, true, JSON.stringify(r));
    // 下一次触发后，定时器应按新间隔重建（修复前永远停在 2000）
    await waitFor(() => p._state.timer._idleTimeout === 5000, 12000, "timer rescheduled to 5000");
  } finally {
    p.stop();
  }
});
