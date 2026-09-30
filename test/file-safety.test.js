// 落盘安全回归（第四轮）：
// 1) 内部敏感文件 sb.json（vless UUID + 各直连密码）必须是 0600，不能世界可读；
// 2) 写文件必须原子（先 .tmp-* 再 rename）：进程被强杀/磁盘写满不会留下半截 JSON，
//    也不会残留临时文件；
// 3) nezha 配置的值必须加引号：裸标量下 `#`、`: `、前导 `[` 等字符会被 YAML
//    当成注释/映射/流序列，导致 key 被截断或 agent 起不来。
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.NIC_SKIP_MAIN = "1";
const { writeFileAtomic, writeSingBoxConfig, buildNezhaYaml, loadTraffic, saveTraffic, trafficState } =
  await import("../index.js");

const tmp = () => mkdtemp(join(tmpdir(), "nk-fs-"));

test("writeFileAtomic：内容完整、权限可控、无临时文件残留", { timeout: 30000 }, async () => {
  const dir = await tmp();
  try {
    const p = join(dir, "sub", "x.json");
    await writeFileAtomic(p, '{"a":1}');
    assert.equal(await readFile(p, "utf8"), '{"a":1}');

    const p2 = join(dir, "secret.json");
    await writeFileAtomic(p2, '{"pw":"s"}', { mode: 0o600 });
    const st = await stat(p2);
    assert.equal(st.mode & 0o777, 0o600, "mode 应为 0600");

    // 覆盖既有文件也要原子 + 保持目标权限
    await writeFileAtomic(p2, '{"pw":"t"}', { mode: 0o600 });
    assert.equal(await readFile(p2, "utf8"), '{"pw":"t"}');
    assert.equal((await stat(p2)).mode & 0o777, 0o600);

    const leftovers = (await readdir(dir)).filter((f) => f.includes(".tmp-"));
    assert.deepEqual(leftovers, [], "不应残留 .tmp-* 文件");
    const leftovers2 = (await readdir(join(dir, "sub"))).filter((f) => f.includes(".tmp-"));
    assert.deepEqual(leftovers2, []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("sb.json 必须是 0600 且为完整 JSON", { timeout: 30000 }, async () => {
  const dir = await tmp();
  try {
    const cfg = {
      binDir: dir,
      uuid: "123e4567-e89b-12d3-a456-426614174000",
      wsPath: "/link",
      corePort: 18000,
      directUdpEnabled: true,
      directUdpPort: 4443,
      directUdpPassword: "hy2pw",
      directTcpEnabled: true,
      directTcpPort: 4433,
      directTcpSni: "www.nvidia.com",
    };
    const p = await writeSingBoxConfig(cfg, dir, null);
    assert.equal(p, join(dir, ".run", "sb.json"));
    const st = await stat(p);
    assert.equal(st.mode & 0o777, 0o600, "sb.json 含密钥，权限必须是 0600");
    const obj = JSON.parse(await readFile(p, "utf8"));
    assert.ok(Array.isArray(obj.inbounds) && obj.inbounds.length >= 1);
    const leftovers = (await readdir(join(dir, ".run"))).filter((f) => f.includes(".tmp-"));
    assert.deepEqual(leftovers, []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("buildNezhaYaml：特殊字符的值必须加引号（不再被 YAML 截断/解析失败）", () => {
  const yaml = buildNezhaYaml({
    nezhaServer: "[::1]:8008",
    nezhaKey: "ab#cd: ef",
    nezhaTls: true,
    nezhaAllowCommand: false,
    nezhaUuid: 'q"uo\\te',
  });
  const get = (k) => {
    const line = yaml.split("\n").find((l) => l.startsWith(`${k}: `));
    assert.ok(line, `缺少 ${k} 行`);
    return JSON.parse(line.slice(k.length + 2)); // 引号标量 = JSON 字符串
  };
  assert.equal(get("server"), "[::1]:8008");
  assert.equal(get("client_secret"), "ab#cd: ef");
  assert.equal(get("uuid"), 'q"uo\\te');
  // 非字符串值保持裸标量
  assert.match(yaml, /^tls: true$/m);
  assert.match(yaml, /^disable_command_execute: true$/m);
  assert.match(yaml, /^disable_auto_update: true$/m);
  // 没有 uuid 时不输出该行
  assert.ok(!buildNezhaYaml({ nezhaServer: "a", nezhaKey: "b" }).includes("uuid:"));
});

test("traffic.json 原子写：无残留、内容可解析；文件损坏时安全归零", { timeout: 30000 }, async () => {
  const dir = await tmp();
  try {
    await loadTraffic({ binDir: dir });
    trafficState.month = { rx: 11, tx: 22 };
    trafficState.monthKey = "2026-09";
    await saveTraffic();
    const p = join(dir, ".run", "traffic.json");
    const obj = JSON.parse(await readFile(p, "utf8"));
    assert.equal(obj.month_rx, 11);
    assert.deepEqual((await readdir(join(dir, ".run"))).filter((f) => f.includes(".tmp-")), []);

    // 模拟旧版本留下的半截文件：解析失败 → 归零但不抛异常
    await writeFile(p, '{"month_key":"2026-09","month_rx":1');
    await loadTraffic({ binDir: dir });
    assert.deepEqual(trafficState.month, { rx: 0, tx: 0 });
    assert.equal(trafficState.monthKey, "");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
