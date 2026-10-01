// 第七轮回归：子进程日志的 chunk 边界处理。
// 历史问题：日志按"到达的块"拆行时不保留残行 —— 管道按 64KB 分块、与行边界无关，
// 一行被切开时：前半段被当成完整行处理（噪音行漏成 WARN、计数器漏计），
// 后半段静默丢弃；另外整块在 2000 字符处截断会把大块尾部的真错误丢掉。
// 现在改为流式分行（makeLineSplitter），残行跨块拼回、不再整块截断。
// 同一个坑还影响 watchLinkOutput：域名横幅 URL 跨块时永远扫不到 → 这里一并回归。
import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";

process.env.NIC_SKIP_MAIN = "1";
const { makeLineSplitter, watchLinkOutput, isLinkInboundNoise, linkNoise } = await import("../index.js");

// niccore 的真实原始行（未经 cleanLog 中性化，带 ANSI 色码）
const NOISE_LINE =
  "\u001b[31mERROR\u001b[0m[0045] [\u001b[38;5;32m2688473616\u001b[0m 239ms] inbound/vless[vless-link]: process connection from 136.69.241.252:55514: EOF";

test("流式分行：完整行即时回调，残行留到下一块拼回", () => {
  const seen = [];
  const sp = makeLineSplitter((l) => seen.push(l));
  sp.push("line-a\nline-b\npartial");
  assert.deepEqual(seen, ["line-a", "line-b"], "残行不能当完整行提前处理");
  sp.push("-cont\nline-c\n");
  assert.deepEqual(seen, ["line-a", "line-b", "partial-cont", "line-c"]);
  sp.flush();
  assert.deepEqual(seen, ["line-a", "line-b", "partial-cont", "line-c"], "没有残行时 flush 不重复输出");
});

test("流式分行：flush 吐出最后一段无换行结尾的内容", () => {
  const seen = [];
  const sp = makeLineSplitter((l) => seen.push(l));
  sp.push("tail-without-newline");
  assert.deepEqual(seen, []);
  sp.flush();
  assert.deepEqual(seen, ["tail-without-newline"]);
  sp.flush();
  assert.deepEqual(seen, ["tail-without-newline"], "flush 应幂等");
});

test("噪音行被 chunk 边界切开：拼回后仍判定为噪音并计数（第七轮修复点）", () => {
  const cut = 80;
  const seen = [];
  const before = linkNoise.count;
  const sp = makeLineSplitter((l) => {
    seen.push(l);
    isLinkInboundNoise(l); // 与 _spawn 内 handleLine 相同的判定顺序
  });
  sp.push(NOISE_LINE.slice(0, cut));
  assert.equal(seen.length, 0, "前半段是残行，不得提前处理（旧实现会漏成 WARN）");
  sp.push(NOISE_LINE.slice(cut) + "\n");
  assert.equal(seen.length, 1);
  assert.equal(seen[0], NOISE_LINE, "两段必须拼回成原始整行");
  assert.equal(linkNoise.count, before + 1, "拼回后应正常计数");
});

test("单个 chunk 超过 2000 字符：尾部行不再被截断丢弃", () => {
  const seen = [];
  const sp = makeLineSplitter((l) => seen.push(l));
  sp.push("x".repeat(2100) + "\nFATAL error: bind udp 0.0.0.0:4433: address already in use\n");
  assert.equal(seen.length, 2);
  assert.equal(seen[0].length, 2100);
  assert.match(seen[1], /FATAL error/, "大块尾部的真错误必须保留（旧实现在 2000 字符处截断）");
});

test("无换行的畸形数据不会撑爆残行缓冲（上限保尾部）", () => {
  const seen = [];
  const sp = makeLineSplitter((l) => seen.push(l), 64);
  sp.push("A".repeat(500));
  sp.push("\n");
  assert.equal(seen.length, 1);
  assert.equal(seen[0].length, 64, "超长残行只保留最后 64 字符");
});

test("域名横幅跨 chunk：滚动缓冲拼回后仍能扫到（临时模式核心路径）", () => {
  const child = { stdout: new EventEmitter(), stderr: new EventEmitter() };
  const got = [];
  watchLinkOutput(child, (d) => got.push(d));
  child.stdout.emit("data", "INF |  Your quick link is created! Visit it at https://pretty-cloud-");
  assert.deepEqual(got, [], "URL 没拼全时不应误报");
  child.stdout.emit("data", "agent-foo.trycloudflare.com  |\n");
  assert.deepEqual(got, ["https://pretty-cloud-agent-foo.trycloudflare.com"]);
  // 命中后解绑：后续再出现域名不重复回调
  child.stdout.emit("data", "https://another-name.trycloudflare.com\n");
  assert.equal(got.length, 1);
});

test("域名横幅从 stderr 到达、且与 stdout 缓冲互不污染", () => {
  const child = { stdout: new EventEmitter(), stderr: new EventEmitter() };
  const got = [];
  watchLinkOutput(child, (d) => got.push(d));
  child.stdout.emit("data", "INF 无关输出，不含域名");
  child.stderr.emit("data", "ERR ... https://split-name-");
  child.stderr.emit("data", "tail.trycloudflare.com\n");
  assert.deepEqual(got, ["https://split-name-tail.trycloudflare.com"]);
});
