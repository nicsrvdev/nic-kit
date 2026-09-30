// 日志脱敏回归：debug 级会整体转储 cfg，任何密钥字段都不能明文落日志。
import test from "node:test";
import assert from "node:assert/strict";
import { inspect } from "node:util";

process.env.NIC_SKIP_MAIN = "1";
const { loadConfig } = await import("../index.js");

const UUID = "123e4567-e89b-12d3-a456-426614174000";
const SECRETS = {
  SUB_TOKEN: "sub-token-plaintext",
  CF_SECRET: "cf-secret-plaintext",
  CF_WORKER_URL: "https://probe.example.com",
  NEZHA_SERVER: "nezha.example.com:5555",
  NEZHA_KEY: "nezha-key-plaintext",
};

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

// 捕获 loadConfig 在 LOG_LEVEL=debug 下打印的配置转储
function captureConfigDump(env) {
  const logs = [];
  const orig = console.log;
  console.log = (...args) => { logs.push(args.map((a) => (typeof a === "string" ? a : inspect(a, { depth: 4 }))).join(" ")); };
  try {
    withEnv({ UUID, LOG_LEVEL: "debug", ...env }, () => loadConfig());
  } finally {
    console.log = orig;
  }
  return logs.join("\n");
}

test("debug 转储里不出现明文密钥（含 SUB_TOKEN）", () => {
  const dump = captureConfigDump(SECRETS);
  assert.ok(dump.includes("config loaded"), "应打印配置转储");
  for (const [name, value] of Object.entries(SECRETS)) {
    if (name === "CF_WORKER_URL" || name === "NEZHA_SERVER") continue; // 非密钥
    assert.ok(!dump.includes(value), `${name} 明文出现在日志里`);
  }
  assert.match(dump, /subToken: '\*\*\*'/);
  assert.match(dump, /cfSecret: '\*\*\*'/);
  assert.match(dump, /nezhaKey: '\*\*\*'/);
  assert.ok(!dump.includes(UUID), "UUID 不应完整出现");
});
