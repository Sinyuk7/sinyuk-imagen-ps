/**
 * trace_id / span_id 生成器。
 *
 * 不依赖任何 host API，保持纯函数且足够随机。
 */

let counter = 0;

/** 生成一个足够唯一的 ID字符串。 */
function makeId(prefix: string): string {
  const time = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 10);
  const seq = (counter = (counter + 1) % 1_000_000).toString(36);
  return `${prefix}_${time}_${random}_${seq}`;
}

/** 生成顶层 trace_id。 */
export function generateTraceId(): string {
  return makeId('tr');
}

/** 生成当前 span_id。 */
export function generateSpanId(): string {
  return makeId('sp');
}
