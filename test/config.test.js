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

test("AT_LINK_CONNECTIONS 默认 4", () => {
  const cfg = withEnv({ UUID, AT_LINK_CONNECTIONS: undefined }, () => loadConfig());
  assert.equal(cfg.atLinkConnections, 4);
});

test("AT_LINK_CONNECTIONS 自定义值生效", () => {
  const cfg = withEnv({ UUID, AT_LINK_CONNECTIONS: "1" }, () => loadConfig());
  assert.equal(cfg.atLinkConnections, 1);
});

test("AT_LINK_CONNECTIONS 非法值：抛 ECONFIG", () => {
  for (const v of ["0", "17"]) {
    withEnv({ UUID, AT_LINK_CONNECTIONS: v }, () => {
      assert.throws(() => loadConfig(), (e) => e.code === "ECONFIG", `value=${v}`);
    });
  }
  // 非数字：int() 直接抛普通 Error
  withEnv({ UUID, AT_LINK_CONNECTIONS: "abc" }, () => {
    assert.throws(() => loadConfig());
  });
});

// 面板里的 UUID 出错时的报错质量（真实案例：Pterodactyl 面板，值本身少 1 位）
test("第一段少 1 位（用户实际值）：报错带长度与分段，一眼看出哪段不对", () => {
  assert.throws(
    () => withEnv({ UUID: "ad515a0-7a6a-4475-b96d-e8076d969b8b" }, () => loadConfig()),
    (e) => {
      assert.match(e.message, /got 35 chars/);
      assert.match(e.message, /segments 7-4-4-4-12/);
      assert.match(e.message, /expected 36 chars \(8-4-4-4-12 hex\)/);
      // hint 必须说清正确格式，不能把问题引向"空白/引号"
      assert.match(e.message, /e\.g\. 2f8c1d47-9a3b-4e6c-8b21-7d5e0a9c4f13/);
      assert.match(e.message, /missing or extra character/);
      return true;
    }
  );
});

test("不做静默修复：值带引号/内部换行仍然明确报错（严格 fail-fast）", () => {
  // 外层引号：str() 只 trim 空白、不剥引号 → 依旧不合法
  assert.throws(
    () => withEnv({ UUID: '"123e4567-e89b-12d3-a456-426614174000"' }, () => loadConfig()),
    /UUID format invalid/
  );
  // 值内部带换行：str() 只去首尾空白，内部换行保留 → 报错，且报错能指出"多出一个字符"
  assert.throws(
    () => withEnv({ UUID: "123e4567-e89b-12d3-\na456-426614174000" }, () => loadConfig()),
    (e) => {
      assert.match(e.message, /UUID format invalid/);
      // 36 位十六进制 + 1 个换行 = 37；分段 8-4-4-5-12 直接把多余字符定位到第 4 段
      assert.match(e.message, /got 37 chars/);
      assert.match(e.message, /segments 8-4-4-5-12/);
      // 值里的换行必须被转义显示，日志里才看得见"这里有个多余字符"
      assert.ok(e.message.includes("12d3-\\na456"), "换行应转义成 \\n 显示");
      return true;
    }
  );
});

test("报错本身不会因为脏值而折行（日志里不会被误读成别的问题）", () => {
  assert.throws(
    () => withEnv({ UUID: "ad515a0-7a6a-4475\nb96d-e8076d969b8b\t  " }, () => loadConfig()),
    (e) => {
      const lines = e.message.split("\n").filter(Boolean);
      assert.equal(lines.length, 3, `应是 3 行（标题/错误/提示），实际 ${lines.length} 行：\n${e.message}`);
      assert.ok(lines[0].startsWith("Invalid config:"));
      assert.ok(lines[1].startsWith("- UUID format invalid"));
      assert.ok(lines[2].startsWith("hint:"));
      return true;
    }
  );
});
