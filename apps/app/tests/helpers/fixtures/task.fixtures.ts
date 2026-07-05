import type { DurableJobRecord, Job, TaskRecord } from '@imagen-ps/application';
import { fakeOutputAsset } from './assets.fixtures';

export const fakeDurableRecord: DurableJobRecord = {
  schemaVersion: 1,
  jobId: 'job-history-1',
  status: 'completed',
  workflow: 'provider-generate',
  input: {
    profileId: 'mock-profile',
    prompt: 'history prompt',
  },
  outputs: [{ kind: 'hostObject', ref: 'history-asset-1', mimeType: 'image/png', byteSize: 16 }],
  createdAt: '2026-06-15T00:00:00.000Z',
  updatedAt: '2026-06-15T00:00:01.000Z',
};

export const fakeTaskRecord: TaskRecord = {
  schemaVersion: 1,
  taskId: 'task-history-1',
  status: 'completed',
  operation: 'text-to-image',
  prompt: 'history prompt',
  attachments: [],
  outputs: [{
    outputId: 'task-history-1:output:0',
    index: 0,
    kind: 'image',
    asset: {
      ref: {
        kind: 'hostObject',
        ref: 'history-asset-1',
        name: 'history.png',
        mimeType: 'image/png',
        byteSize: 16,
      },
    },
  }],
  placement: { kind: 'unbound', reason: 'no-photoshop-source' },
  execution: {
    profileId: 'mock-profile',
    profileName: 'Mock Profile',
  },
  createdAt: '2026-06-15T00:00:00.000Z',
  updatedAt: '2026-06-15T00:00:01.000Z',
  finishedAt: '2026-06-15T00:00:01.000Z',
};

export function completedJob(input: Record<string, unknown>): Job {
  return {
    id: 'job-1',
    status: 'completed',
    input,
    output: {
      image: {
        assets: [fakeOutputAsset],
        text: [
          '[operation=text_to_image]',
          '[model=gpt-image-2]',
          `[prompt=${String(input.prompt ?? 'make an image')}]`,
          '[output=size=2k format=png aspect=auto providerInputSize=1k]',
          '[images=0]',
          '[mask=no]',
          '[assets=1]',
        ].join(' '),
        metadata: {
          size: '1024x1024',
          outputFormat: 'png',
        },
      },
    },
    error: undefined,
    createdAt: '2026-06-15T00:00:00.000Z',
    updatedAt: '2026-06-15T00:00:01.000Z',
  };
}
