/**
 * 日志红化逻辑。
 *
 * 目标：确保 secret、token、cookie、authorization header、
 * 本机绝对路径、provider 原始请求/响应整包不会泄露到默认日志。
 *
 * 红化必须是纯函数：同一输入、同一规则、同一输出。
 */

const SECRET_KEY_PATTERNS = [
  /api[_-]?key/i,
  /apikey/i,
  /auth/i,
  /authorization/i,
  /bearer/i,
  /cookie/i,
  /password/i,
  /secret/i,
  /token/i,
  /private[_-]?key/i,
  /x[-_]?api[-_]?key/i,
];

const FORBIDDEN_ATTR_KEYS = new Set([
  'authorization',
  'raw',
  'request',
  'response',
  'requestBody',
  'responseBody',
  'headers',
  'env',
  'secretValues',
  'apiKey',
  'api_key',
  'token',
  'secret',
  'cookie',
  'password',
]);

const SECRET_VALUE_PATTERNS = [
  /^Bearer\s+.+$/i,
  /^Basic\s+[A-Za-z0-9+/=]+$/i,
  /^(sk|pk)_[A-Za-z0-9_-]+$/,
  /^[A-Za-z0-9_-]{32,}$/,
];

const ABSOLUTE_PATH_PATTERN = /(^|\s)(\/Users\/[^\s]+|\\?[A-Za-z]:\\[^\s]+)/;

/** 判断 key 是否应被红化。 */
function isSecretKey(key: string): boolean {
  return SECRET_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

/** 判断字符串值是否看起来是 secret。 */
function looksLikeSecret(value: string): boolean {
  return SECRET_VALUE_PATTERNS.some((pattern) => pattern.test(value));
}

/** 判断字符串是否包含本机绝对路径。 */
function containsAbsolutePath(value: string): boolean {
  return ABSOLUTE_PATH_PATTERN.test(value);
}

/** 红化单个字符串值。 */
function redactString(value: string): string {
  if (looksLikeSecret(value)) {
    return '[REDACTED_SECRET]';
  }
  if (containsAbsolutePath(value)) {
    return '[REDACTED_PATH]';
  }
  return value;
}

/** 红化任意值，递归处理对象和数组。 */
export function redactValue(value: unknown): unknown {
  if (typeof value === 'string') {
    return redactString(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item));
  }

  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(record)) {
      if (FORBIDDEN_ATTR_KEYS.has(key) || isSecretKey(key)) {
        result[key] = '[REDACTED]';
        continue;
      }
      result[key] = redactValue(val);
    }
    return result;
  }

  return value;
}

/** 红化一组 attrs，返回新对象（不 mutate 原对象）。 */
export function redactAttrs(attrs: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (attrs === undefined) {
    return undefined;
  }
  return redactValue(attrs) as Record<string, unknown>;
}

/** 红化错误上下文，保留 message/category/kind/statusCode，只红化 details。 */
export function redactErrorDetails(details: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (details === undefined) {
    return undefined;
  }
  return redactValue(details) as Record<string, unknown>;
}
