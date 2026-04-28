/**
 * subscribeJobEvents 命令实现。
 *
 * 订阅所有 job lifecycle 事件。
 */

import type { Unsubscribe } from '@imagen-ps/core-engine';
import { getRuntime } from '../runtime.js';
import type { JobEventHandler } from './types.js';

/**
 * 订阅所有 job lifecycle 事件。
 *
 * 内部调用 `runtime.events.onAny(handler)`，接收所有事件类型
 * （`created` / `running` / `completed` / `failed`）。
 *
 * @param handler - 事件处理器，接收任意 `JobEvent`
 * @returns `unsubscribe` 函数，调用后取消订阅
 *
 * @example
 * ```ts
 * const unsubscribe = subscribeJobEvents((event) => {
 *   switch (event.type) {
 *     case 'created':
 *       console.log('Job created:', event.job.id);
 *       break;
 *     case 'completed':
 *       console.log('Job completed:', event.job.id);
 *       break;
 *   }
 * });
 *
 * // 取消订阅
 * unsubscribe();
 * ```
 */
export function subscribeJobEvents(handler: JobEventHandler): Unsubscribe {
  const runtime = getRuntime();
  return runtime.events.onAny(handler);
}
