// 公网 IP 探测回归：旧实现用宽松正则抓取，错误页里的十六进制碎片（如 "ea"）
// 会被当成 IPv6 上报；IPv4 也没有做八位组范围校验。
import test from "node:test";
import assert from "node:assert/strict";

process.env.NIC_SKIP_MAIN = "1";
const { createCfProbe, isIpv4, isIpv6 } = await import("../index.js");

function makeProbe() {
  return createCfProbe({
    cfNodeId: "n", cfSecret: "s", cfWorkerUrl: "https://example.com",
    cfInterval: 60, cfConnectionMode: "http", cfPingMode: "tcp",
    cfPingCt: "", cfPingCu: "", cfPingCm: "", cfPingBgp: "",
    cfNode1: "", cfNode2: "", cfNode3: "", cfNode4: "", cfIface: "",
  });
}

async function withFetchStub(text, fn) {
  const orig = globalThis.fetch;
  const seen = [];
  globalThis.fetch = async (url) => {
    seen.push(String(url));
    return { ok: true, status: 200, text: async () => text };
  };
  try {
    return await fn(seen);
  } finally {
    globalThis.fetch = orig;
  }
}

test("isIpv6：合法/非法判定", () => {
  for (const v of ["2001:db8::1", "::1", "fe80::1%eth0".replace("%eth0", ""), "::ffff:1.2.3.4", "2001:0db8:0000:0000:0000:0000:0000:0001"]) {
    assert.equal(isIpv6(v), true, `${v} 应合法`);
  }
  for (const v of ["ea", "zz::1", "1:2:3:4:5:6:7:8:9", "1.2.3.4", "2001:db8::1::2", ":", "abcd", ""]) {
    assert.equal(isIpv6(v), false, `${v} 应非法`);
  }
});

test("isIpv4：八位组范围校验", () => {
  assert.equal(isIpv4("1.2.3.4"), true);
  assert.equal(isIpv4("999.1.2.3"), false);
  assert.equal(isIpv4("1.2.3"), false);
  assert.equal(isIpv4("1.2.3.4.5"), false);
});

test("v6 探测：错误页里的 hex 碎片不会被采纳", async () => {
  const p = makeProbe();
  await withFetchStub("<html><body>ea</body></html>", async () => {
    assert.equal(await p._publicIp("v6"), "");
  });
  await withFetchStub("2001:db8::1234\n", async () => {
    assert.equal(await p._publicIp("v6"), "2001:db8::1234");
  });
});

test("v4 探测：越界地址不会被采纳，合法地址可用", async () => {
  const p = makeProbe();
  await withFetchStub("999.1.1.1", async () => {
    assert.equal(await p._publicIp("v4"), "");
  });
  await withFetchStub("ip=203.0.113.9\nloc=JP\n", async () => {
    assert.equal(await p._publicIp("v4"), "203.0.113.9");
  });
});
