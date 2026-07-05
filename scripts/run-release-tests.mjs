#!/usr/bin/env node
// Release test runner — the single entry that turns on real-interface tests.
//
// 合约：
//   1. 仅由 `pnpm test:release` 调用；脚本内部设置 IMAGEN_TEST_LEVEL=release。
//   2. 从仓库根 .test.env 读取凭证；文件缺失或必需变量缺失立即失败（只报变量名）。
//   3. 发现规则：packages/**/tests/release/*.release.test.ts 与 apps/**/tests/release/*.release.test.ts(x)。
//      命中 0 个时打印提示并成功退出；当前仓库可暂时没有 release suite。
//   4. 不走 Turbo；每个命中包用本地 vitest --no-cache 运行，禁止缓存复用真实调用。
//   5. 绝不打印 API Key、Authorization header 或任何 secret value。
import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ENV_PATH = join(REPO_ROOT, '.test.env');
const ENV_EXAMPLE_PATH = join(REPO_ROOT, '.test.env.example');
const RELEASE_LEVEL = 'release';

/**
 * 解析 .env 文本为键值表；忽略注释行与空行；不展开变量插值。
 * @param {string} text
 * @returns {Record<string, string>}
 */
export function parseEnvFile(text) {
  const out = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    if (!key) continue;
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

/**
 * 从 .test.env.example 推导出必需变量名（所有出现的 KEY 即必需）。
 * @param {string} text
 * @returns {string[]}
 */
export function deriveRequiredVars(text) {
  return Object.keys(parseEnvFile(text)).sort();
}

/**
 * 校验必需变量全部已在 .test.env 中提供且非空；缺失时抛出，错误信息只列变量名。
 * @param {Record<string, string>} env
 * @param {string[]} required
 */
export function validateReleaseEnv(env, required) {
  const missing = required.filter((name) => !env[name] || env[name].length === 0);
  if (missing.length > 0) {
    throw new Error(
      `Release env incomplete. Missing required variables in .test.env (names only, values redacted):\n  - ${missing.join('\n  - ')}\nFill them from .test.env.example. Never commit real secrets.`,
    );
  }
}

/**
 * 在仓库内递归发现 release 测试文件。
 * @param {string} root
 * @returns {Promise<string[]>} 相对仓库根的路径列表
 */
export async function discoverReleaseTests(root) {
  const results = [];
  const SKIP = new Set(['node_modules', 'dist', '.turbo', '.git', '.codegraph', 'check-results', '.test-output', '.artifacts']);
  async function walk(dir, relBase) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (SKIP.has(entry.name)) continue;
      const rel = relBase ? `${relBase}/${entry.name}` : entry.name;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full, rel);
      } else if (
        /(^|\/)tests\/release\/[^/]+\.release\.test\.(ts|tsx)$/.test(rel) ||
        /\.release\.test\.(ts|tsx)$/.test(entry.name)
      ) {
        results.push(rel);
      }
    }
  }
  await walk(root, '');
  return results.sort();
}

/**
 * 把 release 测试文件按其所属 workspace package 分组。
 * @param {string[]} files
 * @returns {Map<string, string[]>}
 */
export function groupByPackage(files) {
  const groups = new Map();
  for (const file of files) {
    const pkgDir = file.startsWith('apps/') ? file.split('/').slice(0, 2).join('/')
      : file.startsWith('packages/') ? file.split('/').slice(0, 2).join('/')
      : '.';
    if (!groups.has(pkgDir)) groups.set(pkgDir, []);
    groups.get(pkgDir).push(file);
  }
  return groups;
}

function fail(msg, code = 1) {
  console.error(`\x1b[31m[release]\x1b[0m ${msg}`);
  process.exit(code);
}

async function exists(path) {
  try { await stat(path); return true; } catch { return false; }
}

async function runVitestInPackage(pkgDir, files) {
  const cwd = join(REPO_ROOT, pkgDir);
  // 用包本地的 vitest 二进制（pnpm isolated 下每个包有自己的 node_modules/.bin）。
  const bin = join(cwd, 'node_modules', '.bin', 'vitest');
  if (!(await exists(bin))) {
    throw new Error(
      `vitest binary not found at ${bin}.\n` +
        `Ensure ${pkgDir} has vitest as a devDependency and a vitest.release.config.ts. See docs/TESTING.md "Adding release tests".`,
    );
  }
  const args = ['run', '--no-cache', '--config', 'vitest.release.config.ts'];
  return new Promise((resolveP, rejectP) => {
    const child = spawn(bin, args, { cwd, env: { ...process.env }, stdio: 'inherit' });
    child.on('error', (err) => rejectP(new Error(`vitest spawn failed in ${pkgDir}: ${err.message}`)));
    child.on('exit', (code) => (code === 0 ? resolveP() : rejectP(new Error(`vitest exited ${code} in ${pkgDir}`))));
  });
}

async function main() {
  // 双重开关 (2)：进程内确认 Release 级别。
  process.env.IMAGEN_TEST_LEVEL = RELEASE_LEVEL;

  const files = await discoverReleaseTests(REPO_ROOT);
  if (files.length === 0) {
    console.error(
      `\x1b[33m[release]\x1b[0m no *.release.test.ts(x) files registered; skipping release vitest suites.`,
    );
    return;
  }

  if (!(await exists(ENV_PATH))) {
    fail(`Release mode requires credentials at ${ENV_PATH}, but .test.env is missing.\nCopy .test.env.example to .test.env and fill in real keys. .test.env is gitignored.`);
  }
  if (!(await exists(ENV_EXAMPLE_PATH))) {
    fail(`.test.env.example is missing at ${ENV_EXAMPLE_PATH}; cannot derive required release variables.`);
  }

  const envText = await readFile(ENV_PATH, 'utf8');
  const exampleText = await readFile(ENV_EXAMPLE_PATH, 'utf8');
  const env = parseEnvFile(envText);
  const required = deriveRequiredVars(exampleText);
  try {
    validateReleaseEnv(env, required);
  } catch (err) {
    fail(err.message);
  }

  // 注入凭证到进程环境（只在此进程内；不打印）。
  for (const [k, v] of Object.entries(env)) process.env[k] = v;

  console.error(`\x1b[36m[release]\x1b[0m IMAGEN_TEST_LEVEL=${process.env.IMAGEN_TEST_LEVEL}`);
  console.error(`\x1b[36m[release]\x1b[0m discovered ${files.length} release test file(s):`);
  for (const f of files) console.error(`  - ${f}`);

  const groups = groupByPackage(files);
  try {
    for (const [pkgDir, pkgFiles] of groups) {
      console.error(`\x1b[36m[release]\x1b[0m running ${pkgFiles.length} file(s) in ${pkgDir} (no cache)`);
      await runVitestInPackage(pkgDir, pkgFiles);
    }
  } catch (err) {
    fail(err.message);
  }
  console.error(`\x1b[32m[release]\x1b[0m release tests passed.`);
}

// 仅在直接执行时运行 main（被 import 做单测时不跑）。
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => fail(err.stack || err.message));
}
