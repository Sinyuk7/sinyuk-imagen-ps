import { describe, expect, it } from 'vitest';
import type { TaskRecord } from '@imagen-ps/application';
import { deriveHistoryItems } from '../../../../src/shared/ui/pages/history-view-model';
import { fakeTaskRecord } from '../../../helpers/fixtures/task.fixtures';

function record(input: {
  readonly taskId: string;
  readonly backendId: string;
  readonly backendLabel: string;
  readonly connectionLabel: string;
  readonly createdAt: string;
}): TaskRecord {
  return {
    ...fakeTaskRecord,
    taskId: input.taskId,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
    execution: {
      backend: { id: input.backendId, label: input.backendLabel },
      connection: { id: `${input.backendId}-connection`, label: input.connectionLabel },
      target: { id: `${input.backendId}-target`, label: `${input.backendLabel} target` },
    },
  };
}

describe('History generic backend projection', () => {
  it('renders Provider, API Graph, and Frontend Tasks with identical resource actions', () => {
    const provider = record({
      taskId: 'provider-task',
      backendId: 'provider',
      backendLabel: 'Provider',
      connectionLabel: 'Provider profile',
      createdAt: '2026-07-18T00:00:01.000Z',
    });
    const api = record({
      taskId: 'comfy-api-task',
      backendId: 'comfyui',
      backendLabel: 'ComfyUI',
      connectionLabel: 'ComfyUI API',
      createdAt: '2026-07-18T00:00:02.000Z',
    });
    const frontend = record({
      taskId: 'comfy-frontend-task',
      backendId: 'comfyui',
      backendLabel: 'ComfyUI',
      connectionLabel: 'ComfyUI Frontend',
      createdAt: '2026-07-18T00:00:03.000Z',
    });
    const previews = Object.fromEntries([provider, api, frontend].map((task) => [
      task.taskId,
      { url: `blob:${task.taskId}`, availability: 'available' as const },
    ]));

    const items = deriveHistoryItems({
      durableRecords: [provider, api, frontend],
      activeRounds: [],
      previews,
      canDownload: true,
      canPlace: true,
      noPrompt: 'No prompt',
      unknownProvider: 'Unknown',
    });

    expect(items.map((item) => item.executionLabel)).toEqual([
      'ComfyUI Frontend',
      'ComfyUI API',
      'Provider profile',
    ]);
    for (const item of items) {
      expect(item.actions).toEqual({ retry: 'disabled', download: 'enabled', place: 'enabled' });
    }
  });
});
