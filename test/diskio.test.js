import { test } from "node:test";
import assert from "node:assert/strict";

process.env.NIC_SKIP_MAIN = "1";
const { isWholeDisk } = await import("../index.js");

test("整盘识别：sda/vda", () => {
  assert.equal(isWholeDisk("sda"), true);
  assert.equal(isWholeDisk("vda"), true);
  assert.equal(isWholeDisk("nvme0n1"), true);
  assert.equal(isWholeDisk("mmcblk0"), true);
});

test("分区跳过：sda1/vda1/nvme0n1p1/mmcblk0p1", () => {
  assert.equal(isWholeDisk("sda1"), false);
  assert.equal(isWholeDisk("vda2"), false);
  assert.equal(isWholeDisk("nvme0n1p1"), false);
  assert.equal(isWholeDisk("mmcblk0p2"), false);
});

test("虚拟设备跳过：loop/dm/sr/ram", () => {
  assert.equal(isWholeDisk("loop0"), false);
  assert.equal(isWholeDisk("dm-0"), false);
  assert.equal(isWholeDisk("sr0"), false);
  assert.equal(isWholeDisk("ram0"), false);
});
