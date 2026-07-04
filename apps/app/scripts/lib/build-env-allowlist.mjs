// Build environment injection allowlist 与 audit。
//
// 合约：
//   1. 客户端 bundle 允许注入的 build-time define 只有明确 allowlist 中的项。
//   2. 当前唯一允许的客户端 define 是 __IMAGEN_PS_DEV__（boolean dev flag）。
//   3. VITE_ 前缀变量默认禁止进入客户端；任何 VITE_* 必须在 ALLOWED_VITE_VARS 中。
//   4. 禁止：process.env、import.meta.env、JSON.stringify(process.env)、envPrefix:''。
//   5. Secret pattern scanner 只是第二道防线；本 allowlist 是第一道。
//
// 这不是安全边界（客户端 bundle 一律视为用户可读），而是防止误把 secret 注入产物。

/** 允许注入客户端的 define 常量名。 */
export const ALLOWED_CLIENT_DEFINES = Object.freeze(['__IMAGEN_PS_DEV__']);

/** 允许出现在客户端 bundle 的 VITE_ 变量名（当前为空，未启用任何公开配置注入）。 */
export const ALLOWED_VITE_VARS = Object.freeze([]);

/** 禁止在客户端 bundle 中出现的 env 访问模式。 */
const FORBIDDEN_ENV_PATTERNS = [
  { name: 'process.env reference', pattern: /\bprocess\.env\b/ },
  { name: 'import.meta.env reference', pattern: /\bimport\.meta\.env\b/ },
  { name: 'JSON.stringify(process.env)', pattern: /JSON\.stringify\s*\(\s*process\.env\b/ },
];

/**
 * 扫描文本中禁止的 env 访问模式。
 * @param {string} text
 * @returns {string[]} 违规原因
 */
export function scanForbiddenEnvAccess(text) {
  const v = [];
  for (const { name, pattern } of FORBIDDEN_ENV_PATTERNS) {
    if (pattern.test(text)) v.push(name);
  }
  return v;
}

/**
 * 扫描文本中出现的 VITE_ 变量 token，返回不在 allowlist 中的未知变量名。
 * 匹配 VITE_ 后跟大写字母/数字/下划线的标识符。
 * @param {string} text
 * @param {string[]} [allowlist]
 * @returns {string[]} 未知 VITE_ 变量名列表
 */
export function scanUnknownViteVars(text, allowlist = ALLOWED_VITE_VARS) {
  if (!text) return [];
  const found = new Set();
  const re = /\bVITE_[A-Z][A-Z0-9_]*\b/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    found.add(m[0]);
  }
  const allowed = new Set(allowlist);
  return [...found].filter((name) => !allowed.has(name)).sort();
}

/**
 * 审计 Vite 配置对象是否禁用了 envPrefix 或注入了整块 process.env。
 * @param {{envPrefix?: string|undefined, define?: Record<string, unknown>}} config
 * @returns {string[]} 违规原因
 */
export function auditViteEnvConfig(config) {
  const v = [];
  if (config && config.envPrefix === '') {
    v.push('envPrefix is empty string — Vite will inject ALL env vars into client');
  }
  if (config && config.define) {
    for (const [key, value] of Object.entries(config.define)) {
      if (!ALLOWED_CLIENT_DEFINES.includes(key)) {
        v.push(`define injects non-allowlisted key: ${key}`);
      }
      if (typeof value === 'string' && /process\.env/.test(value)) {
        v.push(`define ${key} references process.env — may leak env vars`);
      }
    }
  }
  return v;
}

/**
 * 对 staging 目录做完整 build-env 审计：扫描所有 JS/CSS/HTML 文本。
 * @param {{files: {rel: string, text: string}[]}} opts
 * @returns {{violations: string[], unknownViteVars: string[]}}
 */
export function auditBuildEnvInStaging({ files }) {
  const violations = [];
  const allUnknownVite = new Set();
  for (const { rel, text } of files) {
    for (const reason of scanForbiddenEnvAccess(text)) {
      violations.push(`${rel}: ${reason}`);
    }
    const unknown = scanUnknownViteVars(text);
    for (const u of unknown) allUnknownVite.add(u);
    for (const u of unknown) {
      violations.push(`${rel}: unknown VITE_ var ${u} (not in allowlist)`);
    }
  }
  return { violations, unknownViteVars: [...allUnknownVite].sort() };
}
