/**
 * 付费生成任务防重复提交端到端测试。
 *
 * 在真实 command → runtime → provider 路径上验证四层计数模型：
 * 用户意图（session.retryJob 调用数）→ 新建 Job（store.submitJob）→
 * provider.invoke → （传输层 HTTP attempt 见 providers 包测试）。
 *
 * 不连接任何真实 Provider / 网络，不产生真实费用。
 */

import { describe, expect, it } from 'vitest';
import { createRuntime } from '@imagen-ps/core-engine';
import { createDispatchAdapter, type Provider, type ProviderDescriptor, type ProviderInvokeResult } from '@imagen-ps/providers';
import {
  _resetForTesting,
  _setRuntimeInstanceForTesting,
  setJobHistoryStore,
  type ExtendedRuntime,
} from './runtime.js';
import { providerGenerateWorkflow } from './requests/index.js';
import { createImagenSession } from './session/session.js';
import type { DurableJobRecord, JobHistoryStore } from './commands/types.js';

interface CountingProviderState {
  invokeCount: number;
  mode: 'fail' | 'defer' | 'resolve';
  readonly deferred: {
    readonly promise: Promise<ProviderInvokeResult>;
    resolve: (value: ProviderInvokeResult) => void;
    reject: (error: unknown) => void;
  };
}

function createCountingProvider(): { readonly provider: Provider; readonly state: CountingProviderState } {
  let resolveFn: ((value: ProviderInvokeResult) => void) | undefined;
  let rejectFn: ((error: unknown) => void) | undefined;
  const deferredPromise = new Promise<ProviderInvokeResult>((resolve, reject) => {
    resolveFn = resolve;
    rejectFn = reject;
  });
  const state: CountingProviderState = {
    invokeCount: 0,
    mode: 'resolve',
    deferred: {
      promise: deferredPromise,
      resolve: (value: ProviderInvokeResult) => resolveFn?.(value),
      reject: (error: unknown) => rejectFn?.(error),
    },
  };
  const descriptor: ProviderDescriptor = {
    id: 'counting',
    family: 'image-endpoint',
    displayName: 'Counting',
    operations: ['text_to_image'],
    invokeMode: 'sync',
  };
  const provider: Provider = {
    id: 'counting',
    family: 'image-endpoint',
    describe: () => descriptor,
    validateConfig: (input) => input as never,
    validateRequest: (input) => input as never,
    async invoke() {
      state.invokeCount += 1;
      if (state.mode === 'fail') {
        throw new Error('counting provider forced failure');
      }
      if (state.mode === 'defer') {
        return await state.deferred.promise;
      }
      return { assets: [], raw: { ok: true } } as unknown as ProviderInvokeResult;
    },
  };
  return { provider, state };
}

function createCountingHistoryStore(records: DurableJobRecord[]): JobHistoryStore {
  return {
    async put(record) {
      records.push(record);
    },
    async get(jobId) {
      return records.find((record) => record.jobId === jobId);
    },
    async list() {
      return records;
    },
    async delete(jobId) {
      const index = records.findIndex((record) => record.jobId === jobId);
      if (index !== -1) {
        records.splice(index, 1);
      }
    },
  };
}

function setupCountingRuntime(): { readonly state: CountingProviderState; readonly records: DurableJobRecord[] } {
  _resetForTesting();
  const { provider, state } = createCountingProvider();
  const adapter = createDispatchAdapter({
    provider,
    config: { providerId: 'counting', displayName: 'Counting', family: 'image-endpoint' } as never,
  });
  const runtime = createRuntime({
    initialWorkflows: [providerGenerateWorkflow],
    adapters: [adapter],
  });
  _setRuntimeInstanceForTesting(runtime as unknown as ExtendedRuntime);

  const records: DurableJobRecord[] = [];
  setJobHistoryStore(createCountingHistoryStore(records));
  return { state, records };
}

async function submitFailingJob(session: ReturnType<typeof createImagenSession>, state: CountingProviderState) {
  state.mode = 'fail';
  const result = await session.submitJob({
    workflow: 'provider-generate',
    input: { provider: 'counting', prompt: 'will fail', __clientRoundId: 'round-fail' },
  });
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error('expected submit result');
  }
  expect(result.value.status).toBe('failed');
  return result.value;
}

describe('duplicate-submission prevention (end-to-end through real commands)', () => {
  it('5 concurrent retries of one failed job create 1 new job, 1 provider.invoke, 1 paid request', async () => {
    const { state, records } = setupCountingRuntime();
    const session = createImagenSession();

    const failedJob = await submitFailingJob(session, state);
    expect(state.invokeCount).toBe(1); // 1 paid request for the failed submit

    // retry in-flight：provider 挂起在 deferred 上，期间连续触发 5 次 retry。
    state.mode = 'defer';
    const attempts = Array.from({ length: 5 }, () => session.retryJob(failedJob.id));

    // 仅第 1 次 retry 穿透到 provider（同步前缀已执行 invokeCount++）。
    expect(state.invokeCount).toBe(2); // 1 submit + 1 retry

    state.deferred.resolve({ assets: [], raw: { ok: true } } as unknown as ProviderInvokeResult);
    const results = await Promise.all(attempts);

    expect(results).toHaveLength(5);
    expect(state.invokeCount).toBe(2); // 5 次意图 → 1 次 provider.invoke
    // 5 次都拿到同一个新 Job
    const ids = results.map((result) => (result.ok ? result.value.id : ''));
    expect(new Set(ids).size).toBe(1);
    // 新 Job 与原 failed Job 不同，且 originJobId/retryAttempt 正确
    const retryJob = results[0];
    expect(retryJob.ok).toBe(true);
    if (retryJob.ok) {
      expect(retryJob.value.id).not.toBe(failedJob.id);
    }
    // history：1 failed submit + 1 retry terminal
    expect(records).toHaveLength(2);
    expect(records[1]).toMatchObject({
      status: 'completed',
      workflow: 'provider-generate',
      originJobId: failedJob.id,
      retryAttempt: 1,
    });
  });

  it('releases the in-flight lock after a failed retry ({ok:true,value:failedJob}); next intent proceeds', async () => {
    const { state, records } = setupCountingRuntime();
    const session = createImagenSession();

    const failedJob = await submitFailingJob(session, state);

    // retry 也失败 → {ok:true, value:failedJob}；5 次复用同一 promise。
    state.mode = 'fail';
    const attempts = Array.from({ length: 5 }, () => session.retryJob(failedJob.id));
    const results = await Promise.all(attempts);

    expect(state.invokeCount).toBe(2); // 1 submit + 1 retry（5 次复用）
    expect(results.every((result) => result.ok && result.value.status === 'failed')).toBe(true);
    expect(records).toHaveLength(2); // failed submit + failed retry

    // 锁已释放：新的明确 retry 意图应正常执行（再次穿透到 provider）。
    state.mode = 'fail';
    const next = await session.retryJob(failedJob.id);
    expect(state.invokeCount).toBe(3); // 新意图 → 1 次额外 invoke
    expect(next.ok).toBe(true);
  });

  it('does not serialize unrelated submits (distinct __clientRoundId both proceed)', async () => {
    const { state } = setupCountingRuntime();
    const session = createImagenSession();

    state.mode = 'defer';
    const a = session.submitJob({
      workflow: 'provider-generate',
      input: { provider: 'counting', prompt: 'a', __clientRoundId: 'round-a' },
    });
    const b = session.submitJob({
      workflow: 'provider-generate',
      input: { provider: 'counting', prompt: 'b', __clientRoundId: 'round-b' },
    });

    // 两个不同 roundId 的 submit 各自穿透到 provider，互不串行化。
    expect(state.invokeCount).toBe(2);

    state.deferred.resolve({ assets: [], raw: { ok: true } } as unknown as ProviderInvokeResult);
    const [resultA, resultB] = await Promise.all([a, b]);

    expect(resultA.ok).toBe(true);
    expect(resultB.ok).toBe(true);
    if (resultA.ok && resultB.ok) {
      expect(resultA.value.id).not.toBe(resultB.value.id);
    }
  });
});
