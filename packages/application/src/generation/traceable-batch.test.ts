import { describe, expect, it } from 'vitest';
import { ActiveSlotAdmission, redactSignedUrl, selectRecoveryCandidates } from '../traceable-generation.js';
import { createBatchExecution } from './traceable-batch.js';

describe('traceable generation contracts', () => {
  it('reserves a whole batch atomically', () => {
    const admission = new ActiveSlotAdmission(2);
    expect(() => createBatchExecution({ batchId: 'b', inputs: [{ taskId: 'a', input: 1 }, { taskId: 'b', input: 2 }, { taskId: 'c', input: 3 }], admission, dispatch: async () => 1 })).toThrow(/capacity/i);
    expect(admission.activeCount).toBe(0);
  });

  it('cancels only the selected child', async () => {
    const batch = createBatchExecution({ batchId: 'b', inputs: [{ taskId: 'a', input: 1 }, { taskId: 'b', input: 2 }], dispatch: async (input, signal) => new Promise<number>((resolve, reject) => { const timer = setTimeout(() => resolve(input), 5); signal.addEventListener('abort', () => { clearTimeout(timer); reject(new Error('aborted')); }); }) });
    expect(batch.cancel('a')).toBe(true);
    expect(batch.cancel('missing')).toBe(false);
    batch.release();
    await expect(batch.children[0]!.promise).rejects.toThrow('aborted');
    await expect(batch.children[1]!.promise).resolves.toBe(2);
  });

  it('redacts signed URLs and selects only recoverable running tasks', () => {
    expect(redactSignedUrl('https://cdn.example/a.png?sig=secret#x')).toBe('https://cdn.example/a.png');
    expect(selectRecoveryCandidates([{ task: { status: 'running' } as never, remoteTaskId: 'r' }, { task: { status: 'failed' } as never, remoteTaskId: 'r2' }, { task: { status: 'running' } as never }])).toHaveLength(1);
  });
});
