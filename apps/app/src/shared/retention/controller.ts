export type RetentionSweepReason = 'startup' | 'generation-success';

export interface RetentionPort {
  requestSweep(reason: RetentionSweepReason): Promise<void>;
}

/**
 * 保留策略调度器：
 * - best effort：失败吞掉，由调用方日志记录
 * - single-flight：同时只跑一轮
 * - coalesced：运行期间的新请求合并成下一轮
 */
export function createRetentionController(options: {
  readonly sweep: (reason: RetentionSweepReason) => Promise<void>;
  readonly onError?: (error: unknown, reason: RetentionSweepReason) => void;
}): RetentionPort {
  let running: Promise<void> | null = null;
  let rerunRequested = false;
  let latestReason: RetentionSweepReason = 'startup';

  async function executeLoop(reason: RetentionSweepReason): Promise<void> {
    let nextReason = reason;
    do {
      rerunRequested = false;
      latestReason = nextReason;
      try {
        await options.sweep(nextReason);
      } catch (error) {
        options.onError?.(error, nextReason);
      }
      nextReason = latestReason;
    } while (rerunRequested);
  }

  return {
    requestSweep(reason: RetentionSweepReason): Promise<void> {
      latestReason = reason;
      if (running) {
        rerunRequested = true;
        return running;
      }
      running = executeLoop(reason).finally(() => {
        running = null;
      });
      return running;
    },
  };
}
