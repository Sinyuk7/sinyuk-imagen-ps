// Bundled-packages 收集 Vite 插件。
//
// 合约：
//   1. 在 generateBundle 阶段从 Rollup chunk.modules 收集真实被打入 bundle 的 module id。
//   2. 从 module id 反查其所属 npm package（name + version）。
//   3. 写入 bundled-packages.json，作为 THIRD_PARTY_NOTICES 的 source of truth。
//   4. 只收集 node_modules 内的 package；workspace 包不在第三方声明范围内。
//   5. 区分同一 package 的不同版本。
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/**
 * 从 module id 反查其所属 npm package 的 name 与 version。
 * 沿目录向上找最近的、父目录为 node_modules/<pkg> 的 package.json。
 * @param {string} moduleId  模块文件绝对路径
 * @returns {{name:string, version:string}|null}
 */
export function resolvePackageFromModuleId(moduleId) {
  if (!moduleId || typeof moduleId !== 'string') return null;
  if (!moduleId.includes('node_modules')) return null;
  let dir = dirname(moduleId);
  let guard = 0;
  while (guard < 30) {
    guard += 1;
    const parent = dirname(dir);
    // dir 形如 .../node_modules/<pkg> 或 .../node_modules/@scope/<pkg>
    const parentBase = parent.split('/').pop();
    const dirBase = dir.split('/').pop();
    if (parentBase === 'node_modules') {
      const pkgJsonPath = join(dir, 'package.json');
      try {
        const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf8'));
        if (pkg.name && pkg.version) {
          return { name: pkg.name, version: pkg.version };
        }
      } catch {
        return null;
      }
    }
    // @scope 子目录：dirBase 是 pkg 名，parentBase 是 @scope，grandparent 是 node_modules
    if (parentBase.startsWith('@') && dirname(parent) && dirname(parent).split('/').pop() === 'node_modules') {
      const pkgJsonPath = join(dir, 'package.json');
      try {
        const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf8'));
        if (pkg.name && pkg.version) {
          return { name: pkg.name, version: pkg.version };
        }
      } catch {
        return null;
      }
    }
    if (dir === parent) break;
    dir = parent;
  }
  return null;
}

/**
 * 从 Rollup bundle 收集所有被 bundle 的第三方 package（去重，保留多版本）。
 * @param {Record<string, any>} bundle
 * @returns {{name:string, version:string}[]}
 */
export function collectBundledPackages(bundle) {
  const seen = new Set();
  const out = [];
  for (const chunk of Object.values(bundle)) {
    if (chunk.type !== 'chunk') continue;
    const moduleIds = Object.keys(chunk.modules ?? {});
    // facadeModuleId 也算
    if (chunk.facadeModuleId) moduleIds.push(chunk.facadeModuleId);
    for (const id of moduleIds) {
      const pkg = resolvePackageFromModuleId(id);
      if (!pkg) continue;
      // 排除 workspace 包（@imagen-ps/*）
      if (pkg.name.startsWith('@imagen-ps/')) continue;
      const key = `${pkg.name}@${pkg.version}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(pkg);
    }
  }
  out.sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
  return out;
}

/**
 * Vite 插件：写 bundled-packages.json 到产物目录。
 * @param {{outPath?: string}} [opts]
 * @returns {any}
 */
export function bundledPackagesPlugin(opts = {}) {
  const outPath = opts.outPath ?? 'bundled-packages.json';
  return {
    name: 'imagen-ps-bundled-packages',
    enforce: 'post',
    generateBundle(options, bundle) {
      const packages = collectBundledPackages(bundle);
      const text = JSON.stringify({ packages }, null, 2) + '\n';
      const outDir = options.dir ?? 'dist';
      writeFileSync(resolve(outDir, outPath), text);
    },
  };
}
