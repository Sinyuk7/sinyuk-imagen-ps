/**
 * Job lifecycle event bus 实现。
 *
 * Event bus 只做通知，不持有状态。
 * `emit` 为内部能力，不暴露于公共接口。
 * 监听器按注册顺序同步调用，但异常隔离，不污染 engine 主流程。
 */

import type { JobEventBus, JobEvent, JobEventType, Unsubscribe } from './types/events.js';

/** 内部 listener 结构。 */
type Listener = {
  handler: (event: JobEvent) => void;
  filter?: { jobId: string };
};

/**
 * 创建 job lifecycle event bus 实例。
 *
 * @returns `JobEventBus` 公共接口（运行时对象含内部 `emit`，供 runtime 集成使用）
 */
export function createJobEventBus(): JobEventBus {
  const listeners = new Map<JobEventType | '__any__', Set<Listener>>();

  function ensureSet(type: JobEventType | '__any__'): Set<Listener> {
    let set = listeners.get(type);
    if (!set) {
      set = new Set();
      listeners.set(type, set);
    }
    return set;
  }

  /** 内部 emit：同步调用所有匹配处理器，异常隔离。 */
  function emit(event: JobEvent): void {
    const typeSet = listeners.get(event.type);
    if (typeSet) {
      for (const listener of typeSet) {
        if (listener.filter && listener.filter.jobId !== event.job.id) {
          continue;
        }
        try {
          listener.handler(event);
        } catch {
          // 异常隔离：不污染 engine 主流程，不跳过后续处理器
        }
      }
    }

    const anySet = listeners.get('__any__');
    if (anySet) {
      for (const listener of anySet) {
        try {
          listener.handler(event);
        } catch {
          // 异常隔离
        }
      }
    }
  }

  const bus = {
    on(type: JobEventType, handler: (event: JobEvent) => void, filter?: { jobId: string }): Unsubscribe {
      const listener: Listener = { handler, filter };
      const set = ensureSet(type);
      set.add(listener);
      return () => {
        set.delete(listener);
      };
    },

    onAny(handler: (event: JobEvent) => void): Unsubscribe {
      const listener: Listener = { handler };
      const set = ensureSet('__any__');
      set.add(listener);
      return () => {
        set.delete(listener);
      };
    },

    off(type: JobEventType, handler: (event: JobEvent) => void): void {
      const set = listeners.get(type);
      if (!set) return;
      for (const listener of set) {
        if (listener.handler === handler) {
          set.delete(listener);
        }
      }
    },

    // `emit` 为内部能力，通过类型断言隐藏于公共接口
    emit,
  };

  return bus as JobEventBus;
}
