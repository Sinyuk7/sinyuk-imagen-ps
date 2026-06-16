/**
 * Job lifecycle event 类型定义。
 *
 * 本文件所有类型均为 serializable 且 host-agnostic。
 */

import type { Job } from './job.js';

/** Event bus 支持的生命周期事件类型。 */
export type JobEventType = 'created' | 'running' | 'completed' | 'failed';

/** Job lifecycle 事件的 discriminated union。
 *
 *  每种事件均携带当前 job 的 immutable snapshot，
 *  通过 `type` 字段区分事件类别。
 */
export type JobEvent =
  | { readonly type: 'created'; readonly job: Job }
  | { readonly type: 'running'; readonly job: Job }
  | { readonly type: 'completed'; readonly job: Job }
  | { readonly type: 'failed'; readonly job: Job };

/** 取消订阅函数。 */
export type Unsubscribe = () => void;

/** Job lifecycle event bus 的公共契约。
 *
 *  `emit` 不属于公共接口，由内部实现持有。
 */
export interface JobEventBus {
  /**
   * 订阅指定类型的 lifecycle 事件。
   *
   * @param type 事件类型
   * @param handler 事件处理器，接收 `JobEvent`
   * @param filter 可选过滤条件（当前支持 `jobId`）
   * @returns `unsubscribe` 函数，调用后移除该处理器
   */
  on(
    type: JobEventType,
    handler: (event: JobEvent) => void,
    filter?: { jobId: string },
  ): Unsubscribe;

  /**
   * 订阅所有 lifecycle 事件。
   *
   * @param handler 事件处理器，接收任意 `JobEvent`
   * @returns `unsubscribe` 函数，调用后移除该处理器
   */
  onAny(handler: (event: JobEvent) => void): Unsubscribe;

  /**
   * 精确移除指定处理器（低阶 API）。
   *
   * 推荐使用 `on` / `onAny` 返回的 `unsubscribe` 函数。
   */
  off(
    type: JobEventType,
    handler: (event: JobEvent) => void,
  ): void;
}
