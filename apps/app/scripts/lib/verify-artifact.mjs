// Production artifact verifier。
//
// 合约：
//   1. 检查真实 staging 目录文件，不只检查配置。
//   2. 失败时返回非零 exit code；报错时只显示安全摘要，不打印完整 secret。
//   3. allowlist 为主、denylist scanner 为辅。
//   4. 覆盖：文件类型、source map、路径泄漏、secret、dev 泄漏、manifest 完整性、banner、产物报告。
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, sep, posix, extname } from 'node:path';
import { createHash } from 'node:crypto';
import { scanForbiddenEnvAccess, scanUnknownViteVars } from './build-env-allowlist.mjs';

/** 允许进入 staging 的文件 allowlist（相对 staging 根的 glob 风格）。 */
export const STAGING_ALLOWLIST = [
  'manifest.json',
  'index.html',
  'BUILD_INFO.json',
  'ARTIFACT_MANIFEST.json',
  'LICENSE.txt',
  'THIRD_PARTY_NOTICES.txt',
  'assets/**',
];

/** 明确禁止的扩展名/文件名（denylist 辅助扫描）。 */
export const STAGING_DENYLIST_PATTERNS = [
  /\.map$/i,
  /\.env/i,
  /\.env\.[A-Za-z0-9_-]+/i,
  /\.ts$/i,
  /\.tsx$/i,
  /\.spec\./i,
  /\.test\./i,
  /\.snap$/i,
  /\.tsbuildinfo$/i,
];

/** 明确禁止的目录名。 */
export const STAGING_DENYLIST_DIRS = [
  'src',
  'tests',
  'test',
  '__tests__',
  'fixtures',
  'coverage',
  'docs',
  'scripts',
  'node_modules',
  '.turbo',
  '.git',
];

/** 高置信 secret pattern（精确匹配，避免宽泛误伤）。 */
const SECRET_PATTERNS = [
  { name: 'private-key-header', pattern: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/ },
  { name: 'bearer-token', pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]{20,}/i },
  { name: 'generic-api-key-sk', pattern: /\bsk-[A-Za-z0-9_-]{20,}/ },
  { name: 'generic-api-key-pk', pattern: /\bpk-[A-Za-z0-9_-]{20,}/ },
];

/** 绝对路径泄漏 pattern。 */
const PATH_LEAK_PATTERNS = [
  { name: 'unix-users-path', pattern: /\/Users\/[A-Za-z0-9._-]+\// },
  { name: 'unix-home-path', pattern: /\/home\/[A-Za-z0-9._-]+\// },
  { name: 'windows-drive-path', pattern: /\b[A-Za-z]:\\[A-Za-z0-9._-]+/ },
];

/** Dev 泄漏 pattern。注：__REACT_DEVTOOLS_GLOBAL_HOOK__ 在 React production build 中
 * 也存在（用于探测 devtools），不是 dev build 标记，故不列入。 */
export const DEV_LEAK_PATTERNS = [
  { name: 'react-development-build', pattern: /development\.react\.js|react-dom\.development/i },
  { name: 'vite-hmr-runtime', pattern: /__vite__hmr|hot-update|importMetaHot/i },
];

/**
 * 递归收集目录下所有文件相对路径（posix）。
 * @param {string} root
 * @returns {string[]}
 */
export function collectFiles(root) {
  const out = [];
  function walk(dir, relBase) {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const rel = relBase ? `${relBase}/${entry.name}` : entry.name;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full, rel);
      } else if (entry.isFile()) {
        out.push(rel);
      }
    }
  }
  walk(root, '');
  return out.sort();
}

/**
 * 把 posix glob (assets/**, *.js) 匹配到相对路径。
 * 支持 `**` 跨任意层级、`*` 单段内通配。
 * @param {string} pattern
 * @param {string} relPath
 * @returns {boolean}
 */
export function matchGlob(pattern, relPath) {
  const regexStr = pattern
    .split('/')
    .map((seg) => {
      if (seg === '**') return '.*';
      return seg.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*');
    })
    .join('/');
  return new RegExp('^' + regexStr + '$').test(relPath);
}

/**
 * 校验文件是否在 allowlist 内。
 * @param {string[]} files  相对路径列表
 * @returns {string[]} 违规文件列表
 */
export function checkAllowlist(files) {
  const violations = [];
  for (const f of files) {
    const matched = STAGING_ALLOWLIST.some((p) => matchGlob(p, f));
    if (!matched) {
      violations.push(f);
    }
  }
  return violations;
}

/**
 * 扫描 denylist：禁止扩展名、禁止目录。
 * @param {string[]} files
 * @returns {string[]} 违规列表
 */
export function checkDenylist(files) {
  const violations = [];
  for (const f of files) {
    for (const re of STAGING_DENYLIST_PATTERNS) {
      if (re.test(f)) {
        violations.push(`${f} (matched ${re})`);
      }
    }
    for (const dir of STAGING_DENYLIST_DIRS) {
      if (f === dir || f.startsWith(dir + '/') || f.startsWith(dir + '\\')) {
        violations.push(`${f} (forbidden dir ${dir})`);
      }
    }
  }
  return violations;
}

/**
 * 扫描 JS/CSS/HTML 文本中的 sourceMappingURL / inline source map / sourcesContent。
 * @param {string} text
 * @returns {string[]} 违规原因
 */
export function scanSourceMap(text) {
  const v = [];
  if (/\/\/[#]\s*sourceMappingURL=/.test(text)) v.push('sourceMappingURL comment');
  if (/\/\*\s*#\s*sourceMappingURL=/.test(text)) v.push('sourceMappingURL css comment');
  if (/data:application\/json;base64,/.test(text) && /sourceMappingURL|sourcesContent/.test(text)) {
    v.push('inline source map data uri');
  }
  if (/sourcesContent/.test(text)) v.push('sourcesContent');
  return v;
}

/**
 * 扫描文本中的路径泄漏。避免误伤正常 URL（要求路径后跟路径分隔符 + 用户名段）。
 * @param {string} text
 * @returns {string[]} 违规原因
 */
export function scanPathLeak(text) {
  const v = [];
  for (const { name, pattern } of PATH_LEAK_PATTERNS) {
    if (pattern.test(text)) v.push(name);
  }
  return v;
}

/**
 * 扫描文本中的 secret。返回违规名称列表（不返回 secret 原值）。
 * @param {string} text
 * @returns {string[]} 违规名称
 */
export function scanSecret(text) {
  const v = [];
  for (const { name, pattern } of SECRET_PATTERNS) {
    if (pattern.test(text)) v.push(name);
  }
  return v;
}

/**
 * 扫描 dev 泄漏 marker。
 * @param {string} text
 * @returns {string[]}
 */
export function scanDevLeak(text) {
  const v = [];
  for (const { name, pattern } of DEV_LEAK_PATTERNS) {
    if (pattern.test(text)) v.push(name);
  }
  // localhost/dev-server URL：只标记，不直接失败（可能属用户可配置 Provider 场景）
  if (/\/\/localhost:\d+\//.test(text) || /\/\/127\.0\.0\.1:\d+\//.test(text)) {
    v.push('localhost-url (audit only)');
  }
  return v;
}

/**
 * 校验 manifest 完整性。
 * @param {string} stagingRoot
 * @param {string} manifestPath
 * @returns {{violations:string[], manifest?:any}}
 */
export function checkManifest(stagingRoot, manifestPath) {
  const violations = [];
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch (e) {
    return { violations: [`manifest.json unparseable: ${e.message}`] };
  }
  if (!manifest.id) violations.push('manifest missing id');
  if (!manifest.version || !/^\d+\.\d+\.\d+/.test(manifest.version)) {
    violations.push('manifest version invalid');
  }
  if (manifest.manifestVersion !== 5) violations.push('manifest version not 5');
  if (manifest.host?.app !== 'PS') violations.push('manifest host.app not PS');
  if (!manifest.host?.minVersion) violations.push('manifest host.minVersion missing');
  if (manifest.main && !existsSync(join(stagingRoot, manifest.main))) {
    violations.push(`manifest main not found: ${manifest.main}`);
  }
  const entryIds = new Set();
  if (Array.isArray(manifest.entrypoints)) {
    for (const ep of manifest.entrypoints) {
      if (!ep.id) violations.push('entrypoint missing id');
      if (entryIds.has(ep.id)) violations.push(`duplicate entrypoint id: ${ep.id}`);
      entryIds.add(ep.id);
    }
  } else {
    violations.push('manifest entrypoints missing');
  }
  return { violations, manifest };
}

/**
 * 计算文件 SHA-256。
 * @param {string} absPath
 * @returns {string}
 */
export function sha256File(absPath) {
  const buf = readFileSync(absPath);
  return createHash('sha256').update(buf).digest('hex');
}

/**
 * 生成产物体积报告。
 * @param {string} stagingRoot
 * @returns {{files:number, totalBytes:number, largest:{name:string,bytes:number}, jsBytes:number, cssBytes:number, chunks:number, tree:string}}
 */
export function reportArtifact(stagingRoot) {
  const files = collectFiles(stagingRoot);
  let totalBytes = 0;
  let jsBytes = 0;
  let cssBytes = 0;
  let chunks = 0;
  let largest = { name: '', bytes: 0 };
  const tree = files.map((f) => `  ${f}`).join('\n');
  for (const f of files) {
    const abs = join(stagingRoot, f);
    const sz = statSync(abs).size;
    totalBytes += sz;
    if (f.endsWith('.js')) {
      jsBytes += sz;
      chunks += 1;
    }
    if (f.endsWith('.css')) cssBytes += sz;
    if (sz > largest.bytes) largest = { name: f, bytes: sz };
  }
  return { files: files.length, totalBytes, largest, jsBytes, cssBytes, chunks, tree };
}

/**
 * 读取文件文本（小写扩展名集合）。
 * @param {string} absPath
 * @returns {string|null}
 */
function readTextIfScannable(absPath) {
  const ext = extname(absPath).toLowerCase();
  if (!['.js', '.css', '.html', '.json', '.txt', '.mjs'].includes(ext)) return null;
  try {
    return readFileSync(absPath, 'utf8');
  } catch {
    return null;
  }
}

/**
 * 主验证入口。返回所有违规。
 * @param {{stagingRoot:string, expectedVersion?:string, copyrightBanner?:string, aiNotice?:string}} opts
 * @returns {{violations:string[], report:object, aiNoticeCount:number, bannerCoverage:number, bannerTotal:number}}
 */
export function verifyArtifact({ stagingRoot, expectedVersion, copyrightBanner, aiNotice }) {
  const violations = [];
  if (!existsSync(stagingRoot)) {
    return { violations: [`staging root not found: ${stagingRoot}`], report: {}, aiNoticeCount: 0, bannerCoverage: 0, bannerTotal: 0 };
  }
  const files = collectFiles(stagingRoot);

  // 1. allowlist
  for (const f of checkAllowlist(files)) violations.push(`allowlist violation: ${f}`);
  // 2. denylist
  for (const f of checkDenylist(files)) violations.push(`denylist violation: ${f}`);

  // 3. .map 文件
  for (const f of files) {
    if (f.endsWith('.map')) violations.push(`source map file present: ${f}`);
  }

  // 4. 扫描每个文本文件
  let aiNoticeCount = 0;
  let bannerCoverage = 0;
  let bannerTotal = 0;
  for (const f of files) {
    const abs = join(stagingRoot, f);
    const text = readTextIfScannable(abs);
    if (!text) continue;

    // source map
    for (const reason of scanSourceMap(text)) violations.push(`${f}: ${reason}`);
    // secret
    for (const reason of scanSecret(text)) violations.push(`${f}: ${reason} (value redacted)`);
    // path leak
    for (const reason of scanPathLeak(text)) violations.push(`${f}: ${reason}`);
    // dev leak (localhost 仅审计不失败)
    for (const reason of scanDevLeak(text)) {
      if (!reason.includes('audit only')) violations.push(`${f}: ${reason}`);
    }
    // build-env 注入审计：禁止 process.env / 未知 VITE_ 变量
    for (const reason of scanForbiddenEnvAccess(text)) violations.push(`${f}: ${reason}`);
    for (const unknown of scanUnknownViteVars(text)) {
      violations.push(`${f}: unknown VITE_ var ${unknown} (not in client env allowlist)`);
    }

    // banner 覆盖：JS/CSS 必须含 copyright banner
    const ext = extname(f).toLowerCase();
    if (ext === '.js' || ext === '.css') {
      bannerTotal += 1;
      if (copyrightBanner && text.includes(copyrightBanner)) bannerCoverage += 1;
      else if (!copyrightBanner) bannerTotal -= 1;
    }
    // AI notice 计数（全文件扫描）
    if (aiNotice && text.includes(aiNotice)) {
      aiNoticeCount += countOccurrences(text, aiNotice);
    }
  }

  // 5. AI notice 恰好一次
  if (aiNotice) {
    if (aiNoticeCount === 0) violations.push('AI notice missing from staging');
    else if (aiNoticeCount > 1) violations.push(`AI notice injected ${aiNoticeCount} times (expected 1)`);
  }

  // 6. copyright banner 覆盖
  if (copyrightBanner && bannerTotal > 0 && bannerCoverage < bannerTotal) {
    violations.push(`copyright banner missing in ${bannerTotal - bannerCoverage} JS/CSS file(s)`);
  }

  // 7. manifest 完整性
  const manifestPath = join(stagingRoot, 'manifest.json');
  if (existsSync(manifestPath)) {
    const { violations: mv, manifest } = checkManifest(stagingRoot, manifestPath);
    violations.push(...mv);
    if (expectedVersion && manifest?.version && manifest.version !== expectedVersion) {
      violations.push(`manifest version ${manifest.version} != expected ${expectedVersion}`);
    }
  } else {
    violations.push('manifest.json missing from staging');
  }

  // 8. legal 文件
  if (!existsSync(join(stagingRoot, 'LICENSE.txt')) && !existsSync(join(stagingRoot, 'EULA.txt'))) {
    violations.push('LICENSE.txt / EULA.txt missing');
  }
  if (!existsSync(join(stagingRoot, 'THIRD_PARTY_NOTICES.txt'))) {
    violations.push('THIRD_PARTY_NOTICES.txt missing');
  }
  // 9. BUILD_INFO
  const buildInfoPath = join(stagingRoot, 'BUILD_INFO.json');
  if (existsSync(buildInfoPath)) {
    try {
      const info = JSON.parse(readFileSync(buildInfoPath, 'utf8'));
      if (expectedVersion && info.version !== expectedVersion) {
        violations.push(`BUILD_INFO version ${info.version} != expected ${expectedVersion}`);
      }
    } catch (e) {
      violations.push(`BUILD_INFO.json unparseable: ${e.message}`);
    }
  } else {
    violations.push('BUILD_INFO.json missing');
  }

  const report = reportArtifact(stagingRoot);
  return { violations, report, aiNoticeCount, bannerCoverage, bannerTotal };
}

/**
 * 计算子串出现次数。
 * @param {string} text
 * @param {string} needle
 * @returns {number}
 */
function countOccurrences(text, needle) {
  if (!text || !needle) return 0;
  let count = 0;
  let idx = text.indexOf(needle);
  while (idx >= 0) {
    count += 1;
    idx = text.indexOf(needle, idx + needle.length);
  }
  return count;
}

/**
 * 校验 staging 目录文件树是否只含预期文件（用于打包后检查）。
 * @param {string} stagingRoot
 * @returns {{files:string[], violations:string[]}}
 */
export function inspectStaging(stagingRoot) {
  const files = collectFiles(stagingRoot);
  const violations = [];
  for (const f of checkAllowlist(files)) violations.push(`allowlist violation: ${f}`);
  for (const f of checkDenylist(files)) violations.push(`denylist violation: ${f}`);
  return { files, violations };
}

/**
 * 生成 ARTIFACT_MANIFEST.json：每个文件的相对路径、size、SHA-256。
 * 不包含 ARTIFACT_MANIFEST.json 自身（避免自引用）。
 * @param {string} stagingRoot
 * @returns {{version:string, files:{path:string,size:number,sha256:string}[]}}
 */
export function generateArtifactManifest(stagingRoot) {
  const files = collectFiles(stagingRoot);
  const entries = [];
  for (const f of files) {
    if (f === 'ARTIFACT_MANIFEST.json') continue;
    const abs = join(stagingRoot, f);
    const stat = statSync(abs);
    entries.push({ path: f, size: stat.size, sha256: sha256File(abs) });
  }
  entries.sort((a, b) => a.path.localeCompare(b.path));
  return { version: '1', files: entries };
}

/**
 * 序列化 ARTIFACT_MANIFEST 为稳定 JSON。
 * @param {{version:string, files:{path:string,size:number,sha256:string}[]}} manifest
 * @returns {string}
 */
export function serializeArtifactManifest(manifest) {
  return JSON.stringify(manifest, null, 2) + '\n';
}

/**
 * 校验 staging 当前文件与已存在的 ARTIFACT_MANIFEST.json 是否一致。
 * 用于 .ccx 解压后比对：package 内容是否与 staging 一致。
 * @param {string} stagingRoot
 * @returns {{violations:string[], checked:number}}
 */
export function verifyAgainstManifest(stagingRoot) {
  const manifestPath = join(stagingRoot, 'ARTIFACT_MANIFEST.json');
  const violations = [];
  if (!existsSync(manifestPath)) {
    return { violations: ['ARTIFACT_MANIFEST.json missing'], checked: 0 };
  }
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch (e) {
    return { violations: [`ARTIFACT_MANIFEST.json unparseable: ${e.message}`], checked: 0 };
  }
  const current = generateArtifactManifest(stagingRoot);
  const currentMap = new Map(current.files.map((e) => [e.path, e]));
  const manifestMap = new Map((manifest.files ?? []).map((e) => [e.path, e]));
  let checked = 0;
  // 检查 manifest 中的每个条目仍在 staging 中且 hash 一致
  for (const entry of manifest.files ?? []) {
    checked += 1;
    const cur = currentMap.get(entry.path);
    if (!cur) {
      violations.push(`manifest references missing file: ${entry.path}`);
      continue;
    }
    if (cur.size !== entry.size) violations.push(`${entry.path}: size mismatch (manifest ${entry.size}, actual ${cur.size})`);
    if (cur.sha256 !== entry.sha256) violations.push(`${entry.path}: sha256 mismatch (staging modified after manifest generation)`);
  }
  // 检查 staging 中有 manifest 未记录的文件
  for (const entry of current.files) {
    if (!manifestMap.has(entry.path)) {
      violations.push(`${entry.path}: present in staging but not in ARTIFACT_MANIFEST`);
    }
  }
  return { violations, checked };
}
