import { test } from "node:test";
import assert from "node:assert/strict";

process.env.NIC_SKIP_MAIN = "1";
const { probeTempDomain } = await import("../index.js");

// 用 stub fetch 替换全局 fetch，记录请求头并返回预设响应
function stubFetch(handler) {
  const orig = globalThis.fetch;
  const seen = [];
  globalThis.fetch = async (url, opts = {}) => {
    seen.push({ url: String(url), headers: opts.headers || {}, method: opts.method });
    return handler(String(url), opts);
  };
  return { restore: () => { globalThis.fetch = orig; }, seen };
}
const okRes = (status) => ({ status });

test("probeTempDomain: 不发送 Upgrade/Connection 头（undici 会直接抛 invalid upgrade header）", async () => {
  const { restore, seen } = stubFetch(() => okRes(200));
  try {
    const r = await probeTempDomain("https://abc.trycloudflare.com", {}, 5000);
    assert.equal(r.ok, true);
    assert.equal(seen.length, 1);
    assert.match(seen[0].url, /^https:\/\/abc\.trycloudflare\.com\/$/);
    const keys = Object.keys(seen[0].headers).map((k) => k.toLowerCase());
    assert.ok(!keys.includes("upgrade"), "must not send Upgrade header");
    assert.ok(!keys.includes("connection"), "must not send Connection header");
  } finally {
    restore();
  }
});

test("probeTempDomain: 502/503 判死，其他状态判活", async () => {
  for (const [status, wantOk] of [[502, false], [503, false], [200, true], [404, true], [429, true], [530, true]]) {
    const { restore } = stubFetch(() => okRes(status));
    try {
      const r = await probeTempDomain("https://abc.trycloudflare.com", {}, 5000);
      assert.equal(r.ok, wantOk, `http=${status}`);
      assert.match(r.reason, new RegExp(`http=${status}`));
    } finally {
      restore();
    }
  }
});

test("probeTempDomain: fetch 抛异常判死且不向外抛", async () => {
  const { restore } = stubFetch(() => { throw new Error("boom"); });
  try {
    const r = await probeTempDomain("https://abc.trycloudflare.com", {}, 5000);
    assert.equal(r.ok, false);
    assert.equal(r.reason, "boom");
  } finally {
    restore();
  }
});

test("probeTempDomain: 空域名直接返回", async () => {
  const r = await probeTempDomain("", {}, 5000);
  assert.deepEqual(r, { ok: false, reason: "empty" });
});

test("probeTempDomain: 带 http 前缀和尾斜杠的域名能正确归一化", async () => {
  const { restore, seen } = stubFetch(() => okRes(200));
  try {
    const r = await probeTempDomain("http://abc.trycloudflare.com///", {}, 5000);
    assert.equal(r.ok, true);
    assert.equal(seen[0].url, "https://abc.trycloudflare.com/");
  } finally {
    restore();
  }
});
