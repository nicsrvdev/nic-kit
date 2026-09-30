// 订阅链接回归：
// 1) ws 路径只做必要编码，/link 不应变成 %2Flink（个别老客户端不解码会连不上）
// 2) 直连链接与节点名前缀保持原格式
import test from "node:test";
import assert from "node:assert/strict";

process.env.NIC_SKIP_MAIN = "1";
const { buildSubEntries } = await import("../index.js");

function makeState(over = {}) {
  return {
    getDomain: () => "https://abc.trycloudflare.com",
    isDirectUdpActive: () => false,
    isDirectTcpActive: () => false,
    getDirectUdpHost: () => "",
    getDirectTcpHost: () => "",
    getNodePrefix: () => "JP",
    ...over,
  };
}

const baseCfg = {
  uuid: "123e4567-e89b-12d3-a456-426614174000",
  wsPath: "/link",
  optDomain: "staticdelivery.nexusmods.com",
};

test("vless-link：path=/link 保留斜杠，不做 %2F 编码", () => {
  const [link] = buildSubEntries(baseCfg, makeState());
  assert.match(link, /path=\/link/);
  assert.ok(!link.includes("%2F"), `不应出现 %2F：${link}`);
  assert.match(link, /sni=abc\.trycloudflare\.com/);
  assert.match(link, /#JP-vless-link$/);
});

test("含空格的 ws 路径做必要编码", () => {
  const [link] = buildSubEntries({ ...baseCfg, wsPath: "/my link" }, makeState());
  assert.match(link, /path=\/my%20link/);
});

test("含 & # ? 的 ws 路径：保留 /，其余字符转义（不能破坏查询串）", () => {
  const cases = [
    ["/a&b", "path=/a%26b"],
    ["/a#b", "path=/a%23b"],
    ["/a?b", "path=/a%3Fb"],
    ["/deep/path/x", "path=/deep/path/x"],
  ];
  for (const [wsPath, expect] of cases) {
    const [link] = buildSubEntries({ ...baseCfg, wsPath }, makeState());
    assert.ok(link.includes(expect), `wsPath=${wsPath} 期望包含 ${expect}，实际 ${link}`);
    // 链接里的 path 参数不能被 & 提前截断：path 必须是最后一个查询参数
    const query = link.slice(link.indexOf("?") + 1, link.indexOf("#"));
    const pathVal = new URLSearchParams(query).get("path");
    assert.equal(pathVal, wsPath, `解析回来的 path 应等于原值（wsPath=${wsPath}）`);
  }
});

test("域名未就绪：返回占位行（安全兜底）", () => {
  const links = buildSubEntries(baseCfg, makeState({ getDomain: () => null }));
  assert.equal(links[0], "# link domain not ready yet");
});

test("直连链接：hy2 与 vless-direct 同时存在", () => {
  const cfg = {
    ...baseCfg,
    directUdpPort: 4443,
    directUdpPassword: "pw1234",
    directUdpObfs: "",
    directTcpPort: 4433,
    directTcpSni: "www.nvidia.com",
    directUdpHost: "",
    directTcpHost: "",
  };
  const state = makeState({
    isDirectUdpActive: () => true,
    isDirectTcpActive: () => true,
    getDirectUdpHost: () => "203.0.113.7",
    getDirectTcpHost: () => "203.0.113.7",
  });
  const links = buildSubEntries(cfg, state);
  assert.equal(links.length, 3);
  assert.match(links[1], /^vless:\/\/.*@203\.0\.113\.7:4433\?.*flow=xtls-rprx-vision/);
  assert.match(links[2], /^hysteria2:\/\/pw1234@203\.0\.113\.7:4443\?/);
});
