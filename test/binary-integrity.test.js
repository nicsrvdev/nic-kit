// 二进制完整性回归（第二轮审查新增）：
// 1) 下载走 .part-* 临时文件 + 原子 rename，中断时 dest 不会出现半截文件
// 2) 已有二进制被截断（半截下载残留）时视为损坏，重新下载而不是直接用
// 3) 启动清理遗留的 .part-*（正在写入的保留）
import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, readdir, rm, stat, writeFile, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.NIC_SKIP_MAIN = "1";
const { downloadFile, usableBinary, sweepStalePartials, MIN_SANE_BIN } = await import("../index.js");

async function workDir() {
  return mkdtemp(join(tmpdir(), "nk-bin-"));
}

test("下载中断：dest 不出现半截文件（先写 .part 再原子替换）", { timeout: 30000 }, async () => {
  // 声明 1MB 却只发一部分然后断连，模拟镜像中途挂掉
  const server = createServer((req, res) => {
    res.writeHead(200, { "content-length": String(1024 * 1024) });
    res.write(Buffer.alloc(64 * 1024, 1));
    setTimeout(() => res.destroy(), 50);
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  const dir = await workDir();
  const dest = join(dir, "niccore");
  await assert.rejects(
    downloadFile(`http://127.0.0.1:${port}/bin`, dest, { retries: 0, timeoutMs: 5000 }),
    "中断的下载应抛错"
  );
  await assert.rejects(stat(dest), "dest 不应存在（哪怕是半截）");
  const leftovers = (await readdir(dir)).filter((n) => n.includes(".part-"));
  assert.deepEqual(leftovers, [], `不应遗留临时文件：${leftovers}`);
  await new Promise((r) => server.close(r));
  await rm(dir, { recursive: true, force: true });
});

test("下载成功：文件完整且没有 .part 残留", { timeout: 30000 }, async () => {
  const body = Buffer.alloc(2 * 1024 * 1024, 3);
  const server = createServer((req, res) => {
    res.writeHead(200, { "content-length": String(body.length) });
    res.end(body);
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  const dir = await workDir();
  const dest = join(dir, "niclink");
  await downloadFile(`http://127.0.0.1:${port}/bin`, dest, { minSize: MIN_SANE_BIN });
  assert.equal((await stat(dest)).size, body.length);
  assert.deepEqual((await readdir(dir)).filter((n) => n.includes(".part-")), []);
  await new Promise((r) => server.close(r));
  await rm(dir, { recursive: true, force: true });
});

test("大小不合格：不会 rename 到 dest（失败即无残留）", { timeout: 30000 }, async () => {
  const server = createServer((req, res) => {
    res.writeHead(200);
    res.end(Buffer.alloc(1024, 5)); // 远小于 minSize
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  const dir = await workDir();
  const dest = join(dir, "niccore");
  await assert.rejects(
    downloadFile(`http://127.0.0.1:${port}/bin`, dest, { retries: 0, minSize: MIN_SANE_BIN }),
    /download incomplete/
  );
  await assert.rejects(stat(dest));
  assert.deepEqual((await readdir(dir)).filter((n) => n.includes(".part-")), []);
  await new Promise((r) => server.close(r));
  await rm(dir, { recursive: true, force: true });
});

test("usableBinary：半截二进制判为不可用并删除，完整文件保留", { timeout: 30000 }, async () => {
  const dir = await workDir();
  const truncated = join(dir, "niccore");
  await writeFile(truncated, Buffer.alloc(4096, 1)); // 半截下载（旧版本可能残留）
  assert.equal(await usableBinary(truncated), false, "截断文件应判为不可用");
  await assert.rejects(stat(truncated), "判为不可用后应删除，避免下次启动又被当成有效文件");

  const good = join(dir, "niclink");
  await writeFile(good, Buffer.alloc(MIN_SANE_BIN + 1, 2));
  assert.equal(await usableBinary(good), true, "大小正常的文件应保留");
  assert.equal((await stat(good)).size, MIN_SANE_BIN + 1);

  assert.equal(await usableBinary(join(dir, "missing")), false, "不存在的文件应判为不可用");
  await rm(dir, { recursive: true, force: true });
});

test("sweepStalePartials：清旧的 .part，保留正在写入的", { timeout: 30000 }, async () => {
  const dir = await workDir();
  const oldPart = join(dir, "niccore.part-111-aaaaaa");
  const freshPart = join(dir, "niclink.part-222-bbbbbb");
  const keep = join(dir, "niccore");
  await writeFile(oldPart, "x");
  await writeFile(freshPart, "y");
  await writeFile(keep, "z");
  const past = (Date.now() - 30 * 60 * 1000) / 1000;
  await utimes(oldPart, past, past); // 30 分钟前 -> 视为遗留

  const removed = await sweepStalePartials({ binDir: dir });
  assert.equal(removed, 1);
  const names = (await readdir(dir)).sort();
  assert.deepEqual(names, ["niccore", "niclink.part-222-bbbbbb"]);
  await rm(dir, { recursive: true, force: true });
});
