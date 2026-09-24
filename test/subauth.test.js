// /sub、/kit 鉴权单测。
import test from "node:test";
import assert from "node:assert/strict";

process.env.NIC_SKIP_MAIN = "1";
const { checkSubAuth } = await import("../index.js");

const req = (url, authorization) => ({ url, headers: authorization ? { authorization } : {} });

test("未配置 SUB_TOKEN：全部放行（默认行为不变）", () => {
  assert.equal(checkSubAuth(req("/sub"), { subToken: "" }), true);
  assert.equal(checkSubAuth(req("/sub"), {}), true);
});

test("配置后：?token= 正确放行，错误拒绝", () => {
  const cfg = { subToken: "s3cr3t" };
  assert.equal(checkSubAuth(req("/sub?token=s3cr3t"), cfg), true);
  assert.equal(checkSubAuth(req("/sub?token=wrong"), cfg), false);
  assert.equal(checkSubAuth(req("/sub"), cfg), false);
});

test("配置后：Authorization: Bearer 放行（大小写不敏感）", () => {
  const cfg = { subToken: "s3cr3t" };
  assert.equal(checkSubAuth(req("/kit", "Bearer s3cr3t"), cfg), true);
  assert.equal(checkSubAuth(req("/kit", "bearer s3cr3t"), cfg), true);
  assert.equal(checkSubAuth(req("/kit", "Bearer wrong"), cfg), false);
  assert.equal(checkSubAuth(req("/kit", "Token s3cr3t"), cfg), false);
});
