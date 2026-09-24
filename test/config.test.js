// 配置解析单测：覆盖曾经出过 TDZ 崩溃的非法 CF_CONNECTION_MODE 路径。
import test from "node:test";
import assert from "node:assert/strict";

process.env.NIC_SKIP_MAIN = "1";
const { loadConfig } = await import("../index.js");

const UUID = "123e4567-e89b-12d3-a456-426614174000";

function withEnv(env, fn) {
  const saved = {};
  for (const k of Object.keys(env)) saved[k] = process.env[k];
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    return fn();
  } finally {
    for (const k of Object.keys(env)) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
}

test("非法 CF_CONNECTION_MODE：警告并回退 auto，不抛 ReferenceError", () => {
  const cfg = withEnv({ UUID, CF_CONNECTION_MODE: "bogus-value" }, () => loadConfig());
  assert.equal(cfg.cfConnectionMode, "auto");
  assert.ok(cfg.warnings.some((w) => w.includes("CF_CONNECTION_MODE unknown")));
});

test("合法 CF_CONNECTION_MODE：原样保留", () => {
  const cfg = withEnv({ UUID, CF_CONNECTION_MODE: "http" }, () => loadConfig());
  assert.equal(cfg.cfConnectionMode, "http");
  assert.ok(!cfg.warnings.some((w) => w.includes("CF_CONNECTION_MODE")));
});

test("缺 UUID：抛 ECONFIG", () => {
  withEnv({ UUID: undefined }, () => {
    assert.throws(() => loadConfig(), (e) => e.code === "ECONFIG");
  });
});

test("UUID 格式非法：抛 ECONFIG", () => {
  withEnv({ UUID: "not-a-uuid" }, () => {
    assert.throws(() => loadConfig(), (e) => e.code === "ECONFIG");
  });
});
