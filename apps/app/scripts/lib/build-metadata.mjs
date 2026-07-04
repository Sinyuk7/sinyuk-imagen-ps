// Production build metadata 生成模块。
//
// 合约：
//   1. 版本唯一来源 = apps/app/public/manifest.json 的 version 字段。
//   2. commit/dirty 来自 `git rev-parse` / `git status`；无 Git 环境时 fallback 为 `unknown`。
//   3. 绝不写入开发者绝对路径、用户名、主机名、Git remote 或环境变量值。
//   4. 不在运行时执行 Git 命令；所有 metadata 在构建阶段静态生成。
//   5. 默认不写动态当前时间；如需可复现时间戳使用 SOURCE_DATE_EPOCH 注入。
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

/** @typedef {{name:string,version:string,buildId:string,commit:string,channel:string,dirty?:boolean,builtAt?:string}} BuildInfo */

export const CHANNEL = 'production';
export const PRODUCT_NAME = 'Imagen PS';

/**
 * 从 manifest.json 读取版本号（唯一版本来源）。
 * @param {string} manifestPath
 * @returns {string}
 */
export function readVersionFromManifest(manifestPath) {
  const raw = readFileSync(manifestPath, 'utf8');
  const manifest = JSON.parse(raw);
  const version = manifest?.version;
  if (typeof version !== 'string' || !/^\d+\.\d+\.\d+/.test(version)) {
    throw new Error(`manifest.json version is missing or invalid at ${manifestPath}`);
  }
  return version;
}

/**
 * 调用 git 获取短 commit SHA；无 Git 时返回 'unknown'。
 * @param {string} cwd
 * @returns {{commit:string,dirty:boolean}}
 */
export function readGitState(cwd) {
  const fallback = { commit: 'unknown', dirty: false };
  try {
    const commit = execSync('git rev-parse --short=10 HEAD', {
      cwd,
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf8',
    }).trim();
    if (!commit) return fallback;
    let dirty = false;
    try {
      const status = execSync('git status --porcelain', {
        cwd,
        stdio: ['ignore', 'pipe', 'ignore'],
        encoding: 'utf8',
      }).trim();
      dirty = status.length > 0;
    } catch {
      dirty = false;
    }
    return { commit, dirty };
  } catch {
    return fallback;
  }
}

/**
 * 把 SOURCE_DATE_EPOCH（秒）转为 ISO 日期字符串；无注入则返回 undefined。
 * @param {string|undefined} epoch
 * @returns {string|undefined}
 */
export function readBuiltAt(epoch) {
  if (!epoch) return undefined;
  const n = Number(epoch);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return new Date(n * 1000).toISOString();
}

/**
 * 组装 BuildInfo 对象。
 * @param {{manifestPath:string, repoRoot:string, sourceDateEpoch?:string}} opts
 * @returns {BuildInfo}
 */
export function buildBuildInfo({ manifestPath, repoRoot, sourceDateEpoch }) {
  const version = readVersionFromManifest(manifestPath);
  const git = readGitState(repoRoot);
  const builtAt = readBuiltAt(sourceDateEpoch);
  const buildId = `${version}+${git.commit.slice(0, 7)}`;
  /** @type {BuildInfo} */
  const info = {
    name: PRODUCT_NAME,
    version,
    buildId,
    commit: git.commit,
    channel: CHANNEL,
  };
  if (git.dirty) info.dirty = true;
  if (builtAt) info.builtAt = builtAt;
  return info;
}

/**
 * 把 BUILD_INFO 对象序列化为稳定排序的 JSON 字符串。
 * @param {BuildInfo} info
 * @returns {string}
 */
export function serializeBuildInfo(info) {
  return JSON.stringify(info, null, 2) + '\n';
}

/**
 * 校验 BUILD_INFO 不含绝对路径、用户名等敏感字段。
 * @param {BuildInfo} info
 * @returns {string[]} 违规原因列表（空表示通过）
 */
export function auditBuildInfo(info) {
  const violations = [];
  const text = serializeBuildInfo(info);
  if (/\/Users\//.test(text)) violations.push('absolute /Users/ path leaked into BUILD_INFO');
  if (/\/home\//.test(text)) violations.push('absolute /home/ path leaked into BUILD_INFO');
  if (/[A-Za-z]:\\/.test(text)) violations.push('Windows absolute path leaked into BUILD_INFO');
  return violations;
}

/**
 * 便捷入口：生成并写回 BUILD_INFO.json。
 * @param {{manifestPath:string, repoRoot:string, outPath:string, sourceDateEpoch?:string}} opts
 * @returns {BuildInfo}
 */
export function writeBuildInfoFile({ manifestPath, repoRoot, outPath, sourceDateEpoch }) {
  const info = buildBuildInfo({ manifestPath, repoRoot, sourceDateEpoch });
  const violations = auditBuildInfo(info);
  if (violations.length > 0) {
    throw new Error(`BUILD_INFO audit failed:\n  - ${violations.join('\n  - ')}`);
  }
  writeFileSync(outPath, serializeBuildInfo(info));
  return info;
}
