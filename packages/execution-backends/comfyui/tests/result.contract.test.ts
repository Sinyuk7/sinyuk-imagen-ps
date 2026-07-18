import type { StoredAssetRef } from '@imagen-ps/core-engine';
import { describe, expect, it } from 'vitest';
import {
  createComfyUiExecutionError,
  downloadAndStoreComfyUiOutputs,
  isComfyUiExecutionError,
  observeKnownComfyUiPrompt,
  parseComfyUiWorkflowContract,
  validateComfyUiExecutionResult,
  type ComfyUiHttpResponse,
} from '../src/index.js';
import { pngBytes } from './harness.js';

const multiOutputContract = parseComfyUiWorkflowContract({
  schemaVersion: 1,
  bindings: [
    { role: 'prompt', slot: 0, locator: { nodeId: 'prompt', fieldName: 'text' } },
    { role: 'output-image', slot: 0, locator: { nodeId: 'save-a', fieldName: 'images' } },
    { role: 'output-image', slot: 1, locator: { nodeId: 'save-b', fieldName: 'images' } },
  ],
}, {
  schemaVersion: 1,
  operation: 'text-to-image',
  entries: [
    { role: 'prompt', slot: 0, required: true, dataType: 'text' },
    { role: 'output-image', slot: 0, required: true, dataType: 'image' },
    { role: 'output-image', slot: 1, required: true, dataType: 'image' },
  ],
});

const connection = {
  connectionId: 'connection-1',
  origin: 'https://comfy.example',
  requestTimeoutMs: 5_000,
  observationTimeoutMs: 1_000,
} as const;

function jsonResponse(value: unknown, status = 200): ComfyUiHttpResponse {
  return {
    status,
    headers: { 'content-type': 'application/json' },
    body: new TextEncoder().encode(JSON.stringify(value)),
  };
}

describe('known-prompt history and queue authority', () => {
  it('ignores unrelated prompts and preserves contract/node/image order', async () => {
    let now = 0;
    let historyCalls = 0;
    const requestedPaths: string[] = [];
    const observed = await observeKnownComfyUiPrompt({
      connection,
      promptId: 'known-prompt',
      contract: multiOutputContract,
    }, {
      transport: {
        async request(request) {
          requestedPaths.push(request.path);
          if (request.path.startsWith('/history/')) {
            historyCalls += 1;
            if (historyCalls === 1) {
              return jsonResponse({
                unrelated: {
                  status: { completed: true },
                  outputs: { 'save-a': { images: [{ filename: 'wrong.png', subfolder: '', type: 'output' }] } },
                },
              });
            }
            return jsonResponse({
              'known-prompt': {
                status: { completed: true, status_str: 'success' },
                outputs: {
                  'save-b': { images: [{ filename: 'b-1.png', subfolder: '', type: 'output' }] },
                  'save-a': {
                    images: [
                      { filename: 'a-1.png', subfolder: '', type: 'output' },
                      { filename: 'a-2.png', subfolder: 'nested', type: 'output' },
                    ],
                  },
                },
              },
            });
          }
          return jsonResponse({
            queue_running: [[1, 'unrelated']],
            queue_pending: [],
          });
        },
      },
      hintSource: {
        async waitForHint(promptId) {
          expect(promptId).toBe('known-prompt');
        },
        dispose() {},
      },
      clock: {
        now: () => now,
        async sleep(ms) {
          now += ms;
        },
      },
    });
    expect(observed.descriptors.map((descriptor) => descriptor.filename)).toEqual([
      'a-1.png',
      'a-2.png',
      'b-1.png',
    ]);
    expect(requestedPaths).toContain('/queue');
    expect(requestedPaths).not.toContain('/history/unrelated');
  });

  it('maps remote failure and bounded timeout without global identity guessing', async () => {
    const failed = await Promise.resolve({
      async request() {
        return jsonResponse({
          known: {
            status: { completed: true, status_str: 'error', messages: [['execution_error', {}]] },
            outputs: {},
          },
        });
      },
    });
    await expect(observeKnownComfyUiPrompt({
      connection,
      promptId: 'known',
      contract: multiOutputContract,
    }, { transport: failed })).rejects.toMatchObject({
      details: { stage: 'observe', code: 'execution-failed', retryDisposition: 'new-task-only' },
    });

    let now = 0;
    const timeoutConnection = { ...connection, observationTimeoutMs: 500 };
    await expect(observeKnownComfyUiPrompt({
      connection: timeoutConnection,
      promptId: 'known',
      contract: multiOutputContract,
    }, {
      transport: {
        async request(request) {
          return request.path === '/queue'
            ? jsonResponse({ queue_running: [[1, 'unrelated']], queue_pending: [] })
            : jsonResponse({});
        },
      },
      clock: {
        now: () => now,
        async sleep(ms) {
          now += ms;
        },
      },
    })).rejects.toMatchObject({
      details: { code: 'history-timeout', remoteMayContinue: true },
    });
  });

  it('rejects unsafe descriptors before any view request', async () => {
    const paths: string[] = [];
    await expect(observeKnownComfyUiPrompt({
      connection,
      promptId: 'known',
      contract: multiOutputContract,
    }, {
      transport: {
        async request(request) {
          paths.push(request.path);
          return jsonResponse({
            known: {
              status: { completed: true },
              outputs: {
                'save-a': { images: [{ filename: '../secret.png', subfolder: '', type: 'output' }] },
                'save-b': { images: [{ filename: 'ok.png', subfolder: '', type: 'output' }] },
              },
            },
          });
        },
      },
    })).rejects.toMatchObject({ details: { code: 'unsafe-output' } });
    expect(paths.some((path) => path.startsWith('/view'))).toBe(false);
  });
});

describe('view download, AssetStore and bounded result', () => {
  it('downloads ordered outputs and stores only validated image bytes', async () => {
    const paths: string[] = [];
    const refs: StoredAssetRef[] = [];
    const outputs = await downloadAndStoreComfyUiOutputs({
      connection,
      descriptors: [
        { filename: 'a.png', subfolder: '', type: 'output' },
        { filename: 'b.png', subfolder: 'nested', type: 'output' },
      ],
    }, {
      transport: {
        async request(request) {
          paths.push(request.path);
          return { status: 200, headers: { 'Content-Type': 'image/png' }, body: pngBytes.slice() };
        },
      },
      sink: {
        async put(bytes, meta) {
          const ref: StoredAssetRef = {
            kind: 'inline',
            ref: `asset-${refs.length + 1}`,
            mimeType: meta.mimeType,
            byteSize: bytes.byteLength,
          };
          refs.push(ref);
          return ref;
        },
      },
    });
    expect(outputs).toEqual(refs);
    expect(paths).toEqual([
      '/view?filename=a.png&subfolder=&type=output',
      '/view?filename=b.png&subfolder=nested&type=output',
    ]);
  });

  it('fails on MIME/signature mismatch and AssetStore projection failure', async () => {
    let sinkCalls = 0;
    await expect(downloadAndStoreComfyUiOutputs({
      connection,
      descriptors: [{ filename: 'a.png', subfolder: '', type: 'output' }],
    }, {
      transport: {
        async request() {
          return { status: 200, headers: { 'content-type': 'image/jpeg' }, body: pngBytes.slice() };
        },
      },
      sink: {
        async put() {
          sinkCalls += 1;
          return { kind: 'inline', ref: 'never' };
        },
      },
    })).rejects.toMatchObject({ details: { stage: 'download', code: 'download-failed' } });
    expect(sinkCalls).toBe(0);

    await expect(downloadAndStoreComfyUiOutputs({
      connection,
      descriptors: [{ filename: 'a.png', subfolder: '', type: 'output' }],
    }, {
      transport: {
        async request() {
          return { status: 200, headers: { 'content-type': 'image/png' }, body: pngBytes.slice() };
        },
      },
      sink: {
        async put() {
          throw new Error('host path must stay private');
        },
      },
    })).rejects.toMatchObject({ details: { stage: 'project', code: 'projection-failed' } });
  });

  it('accepts only bounded result/error vocabulary and retry disposition', () => {
    const valid = validateComfyUiExecutionResult({
      outputs: [{ kind: 'inline', ref: 'asset-1', mimeType: 'image/png', byteSize: 8 }],
      warnings: [],
    });
    expect(valid.outputs).toHaveLength(1);
    expect(() => validateComfyUiExecutionResult({ ...valid, promptId: 'forbidden' })).toThrow();
    expect(() => validateComfyUiExecutionResult({ outputs: valid.outputs, warnings: [{ code: 'raw', messageKey: 'raw' }] })).toThrow();

    const preSubmit = createComfyUiExecutionError('upload', 'upload-failed');
    const unknown = createComfyUiExecutionError('submit', 'submission-unknown', { remoteMayContinue: true });
    expect(preSubmit.details.retryDisposition).toBe('same-task-new-job');
    expect(unknown.details.retryDisposition).toBe('new-task-only');
    expect(unknown.details.remoteMayContinue).toBe(true);
    expect(isComfyUiExecutionError({
      ...unknown,
      details: { ...unknown.details, endpoint: 'https://private.example' },
    })).toBe(false);
  });
});
