/**
 * 边界守卫 —— serializable / immutable 校验与保护。
 *
 * 本文件所有函数均为 host-agnostic，不引用 DOM / UXP / FileSystem 类型。
 * 校验失败时统一抛出 `JobError`（`category: 'validation'`）。
 */

import { createValidationError } from './errors.js';

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
 * - 循环引用
 *
 * 对于对象属性值为 `undefined` 的情况，按 `JSON.stringify` 语义忽略
 * （与 `JSON.stringify({x: undefined}) === '{}'` 行为一致），不视为错误。
 * 这避免对 provider 返回的可选字段（如 `diagnostics`）做侵入式归一化。
 *
 * 对于 typed array（`ArrayBuffer.isView`），视为不可分解的二进制载荷直通，
 * 不再深入其数值索引——序列化层（如 host bridge）需自行处理 typed array 编码。
 *
 * @param value 待校验的值
 * @throws `JobError`（`category: 'validation'`）当校验失败时
 */
export function assertSerializable(value: unknown): void {
  const seen = new WeakSet<object>();
  visit(value, seen, 'root', /* isObjectProperty */ false);
}

function visit(value: unknown, seen: WeakSet<object>, path: string, isObjectProperty: boolean): void {
  if (value === null) return;

  const t = typeof value;

  if (t === 'function') {
    throw createValidationError(`Value at "${path}" is a function and not serializable.`, { path });
  }

  if (t === 'symbol') {
    throw createValidationError(`Value at "${path}" is a symbol and not serializable.`, { path });
  }

  if (t === 'undefined') {
    // 对象的可选属性值为 undefined 时，按 JSON.stringify 语义忽略；
    // 顶层值或数组元素为 undefined 时仍视为非法。
    if (isObjectProperty) {
      return;
    }
    throw createValidationError(`Value at "${path}" is undefined and not serializable.`, { path });
  }

  if (t !== 'object') {
    // string, number, boolean, bigint —— 序列化安全
    return;
  }

  // typed array / DataView 视为二进制载荷直通，不递归其数值索引
  if (ArrayBuffer.isView(value)) {
    return;
  }

  if (seen.has(value as object)) {
    throw createValidationError(`Circular reference detected at "${path}".`, { path });
  }

  seen.add(value as object);

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      visit(value[i], seen, `${path}[${i}]`, /* isObjectProperty */ false);
    }
  } else {
    for (const key of Object.keys(value as Record<string, unknown>)) {
      visit((value as Record<string, unknown>)[key], seen, `${path}.${key}`, /* isObjectProperty */ true);
    }
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
