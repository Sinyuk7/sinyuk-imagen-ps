// Third-party notices 生成模块（基于真实 bundle graph）。
//
// 合约：
//   1. source of truth = bundled-packages.json（由 Vite bundledPackagesPlugin 从
//      Rollup chunk.modules 收集的真实被打入 bundle 的 package）。
//   2. 不再从 package.json.dependencies 推导 —— 那会漏报 transitive、误报未 import 的 direct。
//   3. 区分同一 package 的不同版本。
//   4. 不伪造许可证内容；缺失则标记 UNKNOWN，release gate 中 hard fail（除非在 override 文件中标注）。
//   5. 稳定排序，方便 diff。
//   6. override 文件（可选）：apps/app/scripts/lib/license-overrides.json 允许为特定
//      name@version 标注人工 license 文本或显式 acknowledge UNKNOWN。
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

/** 已知的 LICENSE 文件候选名（优先用包自带）。 */
const KNOWN_LICENSE_FILES = [
  'LICENSE',
  'LICENSE.md',
  'LICENSE.txt',
  'LICENCE',
  'LICENCE.md',
  'COPYING',
  'COPYING.md',
];

/** 默认 override 文件路径。 */
export const DEFAULT_OVERRIDE_PATH = 'scripts/lib/license-overrides.json';

/**
 * 读取 bundled-packages.json。
 * @param {string} path
 * @returns {{packages:{name:string,version:string}[]}}
 */
export function readBundledPackages(path) {
  if (!existsSync(path)) {
    throw new Error(`bundled-packages.json not found at ${path}. Run the production build with bundledPackagesPlugin first.`);
  }
  const data = JSON.parse(readFileSync(path, 'utf8'));
  if (!Array.isArray(data.packages)) {
    throw new Error(`bundled-packages.json at ${path} has no packages array`);
  }
  return data;
}

/**
 * 读取 override 文件（可选）。
 * @param {string} path
 * @returns {Record<string,{licenseText?:string, allowUnknown?: boolean}>}
 */
export function readLicenseOverrides(path) {
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    throw new Error(`license-overrides.json at ${path} is unparseable: ${e.message}`);
  }
}

/**
 * 把 package name 转为 pnpm .pnpm 目录中的转义名（@scope/name → @scope+name）。
 * @param {string} name
 * @returns {string}
 */
function pnpmEscapedName(name) {
  return name.replace(/\//g, '+');
}

/**
 * 在 node_modules 中查找包的自带 LICENSE 文本；未找到返回 null。
 * 先查 app 本地 node_modules（直接依赖符号链接），再查 pnpm .pnpm 仓库根（传递依赖）。
 * @param {string} appDir  apps/app 目录
 * @param {string} name  包名
 * @param {string} [version]  版本（用于 pnpm .pnpm 精确定位）
 * @returns {string|null}
 */
export function findPackageLicenseText(appDir, name, version) {
  const candidates = [];
  // 1. app 本地 node_modules（直接依赖符号链接）
  candidates.push(resolve(appDir, 'node_modules', name));
  // 2. pnpm .pnpm 仓库根（传递依赖）
  if (version) {
    const repoRoot = resolve(appDir, '..', '..');
    candidates.push(resolve(repoRoot, 'node_modules', '.pnpm', `${pnpmEscapedName(name)}@${version}`, 'node_modules', name));
  }
  for (const dir of candidates) {
    let pkgRaw;
    try {
      pkgRaw = readFileSync(join(dir, 'package.json'), 'utf8');
    } catch {
      continue;
    }
    for (const candidate of KNOWN_LICENSE_FILES) {
      try {
        const text = readFileSync(join(dir, candidate), 'utf8');
        if (text && text.trim().length > 0) return text;
      } catch {
        // continue
      }
    }
    try {
      const pkg = JSON.parse(pkgRaw);
      const lic = pkg?.license ?? pkg?.licenses?.[0]?.type ?? pkg?.licenses;
      if (typeof lic === 'string' && lic.length > 0) return `SPDX-License-Identifier: ${lic}\n`;
    } catch {
      // ignore
    }
  }
  return null;
}

/**
 * 生成 THIRD_PARTY_NOTICES.txt 文本。
 * @param {{appDir:string, bundledPackagesPath:string, overridePath?:string}} opts
 * @returns {{text:string, entries:{name:string,version:string,license:string|null,fromOverride?:boolean}[], unresolved:{name:string,version:string}[]}}
 */
export function generateThirdPartyNotices({ appDir, bundledPackagesPath, overridePath }) {
  const { packages } = readBundledPackages(bundledPackagesPath);
  const overrides = readLicenseOverrides(overridePath ?? '');
  const entries = [];
  const unresolved = [];
  for (const pkg of packages) {
    const overrideKey = `${pkg.name}@${pkg.version}`;
    const override = overrides[overrideKey];
    let license = findPackageLicenseText(appDir, pkg.name, pkg.version);
    let fromOverride = false;
    if (!license && override?.licenseText) {
      license = override.licenseText;
      fromOverride = true;
    }
    if (!license && override?.allowUnknown) {
      license = `License: UNKNOWN (acknowledged by override ${overrideKey})\n`;
      fromOverride = true;
    }
    if (!license) {
      unresolved.push({ name: pkg.name, version: pkg.version });
    }
    entries.push({ name: pkg.name, version: pkg.version, license, fromOverride });
  }
  entries.sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
  const lines = [];
  lines.push('THIRD-PARTY NOTICES');
  lines.push('');
  lines.push('This product (Imagen PS) bundles third-party software distributed under');
  lines.push('their respective licenses. The following packages are included in the');
  lines.push('production runtime bundle of the Photoshop UXP plugin, derived from the');
  lines.push('actual Rollup module graph (not from package.json declarations).');
  lines.push('');
  lines.push('If a license could not be resolved automatically, it is marked UNKNOWN');
  lines.push('and must be resolved via license-overrides.json before release.');
  lines.push('');
  for (const entry of entries) {
    lines.push('========================================================================');
    lines.push(`Package: ${entry.name}`);
    lines.push(`Version: ${entry.version}`);
    if (entry.fromOverride) lines.push('Source: manual override (license-overrides.json)');
    lines.push('------------------------------------------------------------------------');
    if (entry.license) {
      lines.push(entry.license.trim());
    } else {
      lines.push('License: UNKNOWN (resolve manually or add to license-overrides.json)');
    }
    lines.push('');
  }
  const text = lines.join('\n');
  return { text, entries, unresolved };
}

/**
 * 便捷入口：生成并写回 THIRD_PARTY_NOTICES.txt。
 * @param {{appDir:string, bundledPackagesPath:string, overridePath?:string, outPath:string}} opts
 * @returns {{entries:number, unresolved:{name:string,version:string}[]}}
 */
export function writeThirdPartyNotices({ appDir, bundledPackagesPath, overridePath, outPath }) {
  const result = generateThirdPartyNotices({ appDir, bundledPackagesPath, overridePath });
  writeFileSync(outPath, result.text, 'utf8');
  return { entries: result.entries.length, unresolved: result.unresolved };
}
