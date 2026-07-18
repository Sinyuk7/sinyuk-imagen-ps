/**
 * 边界守卫 —— serializable / secret-free / immutable 校验与保护。
 *
 * 本文件所有函数均为 host-agnostic，不引用 DOM / UXP / FileSystem 类型。
 * 校验失败时统一抛出 `JobError`（`category: 'validation'`）。
 */

import { createValidationError } from './errors.js';

const SECRET_KEY_PATTERN =
  /(^|[._-])(apiKey|accessToken|refreshToken|secret|secretValue|secretValues|password|authorization|authToken)([._-]|$)/i;
const SECRET_VALUE_PATTERNS = [
  /^Bearer\s+\S+/i,
  /^Basic\s+[A-Za-z0-9+/=]+$/i,
  /^(?:sk|pk)[_-][A-Za-z0-9_-]{4,}$/,
  /[?&](?:api[_-]?key|access[_-]?token|auth(?:orization)?|password|secret|token)=[^&\s]+/i,
];
const SECRET_REFERENCE_KEYS = new Set(['secretRef', 'secretRefs']);

// ------------------------------------------------------------------
// assertSerializable
// ------------------------------------------------------------------

/**
 * 递归校验值是否为可安全跨包序列化的数据。
 *
 * 拒绝以下类型或结构：
 * - `function`
 * - `symbol`
 * - 顶层或数组元素为 `undefined`
 * - `bigint` 或非有限 number
 * - 循环引用
 * - 非 plain object（`ArrayBuffer` 与 typed array 除外）
 *
 * 对于对象属性值为 `undefined` 的情况，按 `JSON.stringify` 语义忽略
 * （与 `JSON.stringify({x: undefined}) === '{}'` 行为一致），不视为错误。
 * 这避免对 adapter 返回的可选字段（如 `diagnostics`）做侵入式归一化。
 *
 * `ArrayBuffer` 与 typed array 视为可复制的 host-neutral binary value。
 *
 * @param value 待校验的值
 * @throws `JobError`（`category: 'validation'`）当校验失败时
 */
export function assertSerializable(value: unknown): void {
  const ancestors = new WeakSet<object>();
  visit(value, ancestors, 'root', /* isObjectProperty */ false);
}

function visit(value: unknown, ancestors: WeakSet<object>, path: string, isObjectProperty: boolean): void {
  if (value === null) return;

  const t = typeof value;

  if (t === 'function') {
    throw createValidationError(`Value at "${path}" is a function and not serializable.`, { path });
  }

  if (t === 'symbol') {
    throw createValidationError(`Value at "${path}" is a symbol and not serializable.`, { path });
  }

  if (t === 'bigint') {
    throw createValidationError(`Value at "${path}" is a bigint and not serializable.`, { path });
  }

  if (t === 'undefined') {
    // 对象的可选属性值为 undefined 时，按 JSON.stringify 语义忽略；
    // 顶层值或数组元素为 undefined 时仍视为非法。
    if (isObjectProperty) {
      return;
    }
    throw createValidationError(`Value at "${path}" is undefined and not serializable.`, { path });
  }

  if (t === 'number' && !Number.isFinite(value)) {
    throw createValidationError(`Value at "${path}" is not a finite number.`, { path });
  }

  if (t !== 'object') {
    // string, finite number, boolean —— 序列化安全
    return;
  }

  // Binary value 由 snapshot helper 复制，不递归内部索引。
  if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
    return;
  }

  const prototype = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) {
    throw createValidationError(`Value at "${path}" is not a plain serializable object.`, { path });
  }

  if (ancestors.has(value as object)) {
    throw createValidationError(`Circular reference detected at "${path}".`, { path });
  }

  ancestors.add(value as object);

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      visit(value[i], ancestors, `${path}[${i}]`, /* isObjectProperty */ false);
    }
  } else {
    for (const key of Object.keys(value as Record<string, unknown>)) {
      visit((value as Record<string, unknown>)[key], ancestors, `${path}.${key}`, /* isObjectProperty */ true);
    }
  }

  ancestors.delete(value as object);
}

// ------------------------------------------------------------------
// assertNoSecrets
// ------------------------------------------------------------------

/**
 * 确保跨边界 payload 不包含 resolved secret value。
 *
 * 允许 `secretRef` / `secretRefs` 保存不透明 lookup ref；其它 secret-shaped
 * key 与可识别 credential value 一律拒绝。
 */
export function assertNoSecrets(value: unknown): void {
  const seen = new WeakSet<object>();
  visitNoSecrets(value, seen, 'root', false);
}

function visitNoSecrets(
  value: unknown,
  seen: WeakSet<object>,
  path: string,
  allowSecretReferenceKeys: boolean,
): void {
  if (typeof value === 'string') {
    if (SECRET_VALUE_PATTERNS.some((pattern) => pattern.test(value))) {
      throw createValidationError(`Payload contains a resolved secret value at "${path}".`, { path });
    }
    return;
  }

  if (value === null || typeof value !== 'object') {
    return;
  }

  if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
    return;
  }

  if (seen.has(value as object)) {
    return;
  }
  seen.add(value as object);

  if (Array.isArray(value)) {
    value.forEach((item, index) => visitNoSecrets(item, seen, `${path}[${index}]`, allowSecretReferenceKeys));
    return;
  }

  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const childPath = `${path}.${key}`;
    if (SECRET_REFERENCE_KEYS.has(key)) {
      visitNoSecrets(child, seen, childPath, true);
      continue;
    }
    if (!allowSecretReferenceKeys && SECRET_KEY_PATTERN.test(key)) {
      throw createValidationError(`Payload contains a secret value at "${childPath}".`, { path: childPath });
    }
    visitNoSecrets(child, seen, childPath, allowSecretReferenceKeys);
  }
}

// ------------------------------------------------------------------
// assertImmutable
// ------------------------------------------------------------------

/**
 * 对对象或数组执行浅层 `Object.freeze`，确保边界 handoff 被视为 immutable。
 *
 * @param value 待冻结的值
 * @returns 冻结后的值；primitive 值直接透传
 */
export function assertImmutable<T>(value: T): Readonly<T> {
  if (value === null || value === undefined) {
    return value as Readonly<T>;
  }

  const t = typeof value;
  if (t !== 'object') {
    // primitive —— 天然不可变，直接透传
    return value as Readonly<T>;
  }

  return Object.freeze(value) as Readonly<T>;
}

// ------------------------------------------------------------------
// createImmutableSnapshot
// ------------------------------------------------------------------

/**
 * 创建与 caller-owned state 隔离的深层 immutable snapshot。
 *
 * Plain object 与 array 会递归复制并冻结；binary value 会复制底层 bytes，
 * 避免外部 mutation 改写 store 或后续 handoff。
 */
export function createImmutableSnapshot<T>(value: T): Readonly<T> {
  assertSerializable(value);
  return cloneAndFreeze(value) as Readonly<T>;
}

function cloneAndFreeze(value: unknown): unknown {
  if (value === null || typeof value !== 'object') {
    return value;
  }

  if (value instanceof ArrayBuffer) {
    return value.slice(0);
  }

  if (value instanceof DataView) {
    const buffer = value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
    return new DataView(buffer);
  }

  if (ArrayBuffer.isView(value)) {
    const bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    const buffer = bytes.slice().buffer;
    const View = value.constructor as new (buffer: ArrayBuffer) => ArrayBufferView;
    return new View(buffer);
  }

  if (Array.isArray(value)) {
    return Object.freeze(value.map((item) => cloneAndFreeze(item)));
  }

  const clone: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    clone[key] = cloneAndFreeze(child);
  }
  return Object.freeze(clone);
}

// ------------------------------------------------------------------
// safeStringify
// ------------------------------------------------------------------

/**
 * 安全的 JSON 序列化辅助函数，用于日志 / 调试。
 *
 * 对循环引用降级为 `"[Circular]"`，对 `BigInt` 转为字符串。
 * 不替代 `assertSerializable` 的校验职责。
 *
 * @param value 待序列化的值
 * @param space 格式化缩进空格数（默认 `2`）
 * @returns JSON 字符串
 */
export function safeStringify(value: unknown, space = 2): string {
  const seen = new WeakSet<object>();

  return JSON.stringify(
    value,
    (_key, val) => {
      if (typeof val === 'bigint') {
        return String(val);
      }

      if (val !== null && typeof val === 'object') {
        if (seen.has(val)) {
          return '[Circular]';
        }
        seen.add(val);
      }

      return val;
    },
    space,
  );
}
