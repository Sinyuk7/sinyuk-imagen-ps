/**
 * 轻量唯一 ID 生成辅助。
 */

let _counter = 0;

/** 生成一个带有前缀的唯一标识符。 */
export function generateId(prefix = 'id'): string {
  _counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${_counter.toString(36)}`;
}
