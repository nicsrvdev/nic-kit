// WSS 帧编解码单测：往返一致性、分片到达、粘包。
import test from "node:test";
import assert from "node:assert/strict";

process.env.NIC_SKIP_MAIN = "1";
const { wsFrameEncode, wsFrameDecodeOne } = await import("../index.js");

test("编解码往返：短/126 边界/64K/大载荷", () => {
  for (const len of [0, 5, 125, 126, 1000, 65535, 70000]) {
    const payload = Buffer.alloc(len);
    for (let i = 0; i < len; i++) payload[i] = i & 0xff;
    const frame = wsFrameEncode(0x1, payload);
    const r = wsFrameDecodeOne(frame);
    assert.equal(r.ok, true, `len=${len}`);
    assert.equal(r.fin, true);
    assert.equal(r.opcode, 0x1);
    assert.deepEqual(r.payload, payload);
    assert.equal(r.rest.length, 0);
  }
});

test("分片到达：首部不全返回 needMore", () => {
  const frame = wsFrameEncode(0x1, Buffer.from("hello"));
  const r = wsFrameDecodeOne(frame.slice(0, 3));
  assert.equal(r.ok, false);
  assert.equal(r.needMore, true);
});

test("粘包：一次读出多帧，rest 链式解析", () => {
  const a = wsFrameEncode(0x1, Buffer.from("hello"));
  const b = wsFrameEncode(0x2, Buffer.from("world"));
  const r1 = wsFrameDecodeOne(Buffer.concat([a, b]));
  assert.equal(r1.ok, true);
  assert.equal(r1.payload.toString(), "hello");
  const r2 = wsFrameDecodeOne(r1.rest);
  assert.equal(r2.ok, true);
  assert.equal(r2.opcode, 0x2);
  assert.equal(r2.payload.toString(), "world");
  assert.equal(r2.rest.length, 0);
});

test("超大帧直接抛错（防内存炸）", () => {
  const big = Buffer.alloc(10);
  big[0] = 0x82;
  big[1] = 127;
  big.writeBigUInt64BE(BigInt(16 * 1024 * 1024 * 1024), 2); // 16GiB
  assert.throws(() => wsFrameDecodeOne(big), /too large/);
});
