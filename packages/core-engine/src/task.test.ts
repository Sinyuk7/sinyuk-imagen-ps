import { describe, expect, it } from 'vitest';
import {
  assertTaskRecord,
  decodeTaskRecord,
  sanitizeTaskEvidenceUrl,
  type TaskRecord,
  type TaskResourceRef,
} from './types/task.js';

const now = '2026-06-30T00:00:00.000Z';

const storedResource: TaskResourceRef = {
  ref: {
    kind: 'hostObject',
    ref: 'assets/output-1.png',
    mimeType: 'image/png',
    byteSize: 4,
  },
  width: 16,
  height: 16,
};

function task(overrides: Partial<TaskRecord> = {}): TaskRecord {
  return {
    schemaVersion: 1,
    taskId: 'task-1',
    status: 'completed',
    operation: 'text-to-image',
    prompt: 'simple blue square',
    attachments: [],
    outputs: [
      {
        outputId: 'out-1',
        index: 0,
        kind: 'image',
        asset: storedResource,
        source: { providerAssetKind: 'storedRef' },
      },
    ],
    placement: { kind: 'unbound', reason: 'no-photoshop-source' },
    createdAt: now,
    updatedAt: now,
    finishedAt: now,
    ...overrides,
  };
}

describe('task record shared contract', () => {
  it('accepts the allowed status matrix', () => {
    expect(() =>
      assertTaskRecord(task({ status: 'running', outputs: [], finishedAt: undefined })),
    ).not.toThrow();

    expect(() => assertTaskRecord(task({ status: 'completed' }))).not.toThrow();

    expect(() =>
      assertTaskRecord(
        task({
          status: 'failed',
          error: { category: 'provider', message: 'Provider failed.' },
          outputs: [{ ...task().outputs[0], partial: true }],
        }),
      ),
    ).not.toThrow();

    expect(() =>
      assertTaskRecord(
        task({
          status: 'interrupted',
          error: { category: 'interrupted', message: 'App restarted before completion.' },
          outputs: [],
        }),
      ),
    ).not.toThrow();
  });

  it('rejects invalid lifecycle combinations', () => {
    expect(() =>
      assertTaskRecord(task({ status: 'running', error: { category: 'validation', message: 'bad' }, outputs: [] })),
    ).toThrow(/forbidden/);

    expect(() => assertTaskRecord(task({ status: 'completed', error: { category: 'provider', message: 'bad' } }))).toThrow(
      /forbidden/,
    );

    expect(() => assertTaskRecord(task({ status: 'failed', error: { category: 'provider', message: 'bad' } }))).toThrow(
      /partial/,
    );

    expect(() =>
      assertTaskRecord({
        ...task({
          status: 'interrupted',
          error: { category: 'interrupted', message: 'App restarted before completion.' },
        }),
        outputs: task().outputs,
      }),
    ).toThrow(/empty/);
  });

  it('isolates malformed and unknown-schema reads', () => {
    expect(decodeTaskRecord(task()).ok).toBe(true);
    expect(decodeTaskRecord({ ...task(), schemaVersion: 999 })).toMatchObject({
      ok: false,
      reason: 'unknown-schema',
      taskId: 'task-1',
    });
    expect(decodeTaskRecord({ ...task(), status: 'completed', finishedAt: undefined })).toMatchObject({
      ok: false,
      reason: 'malformed',
      taskId: 'task-1',
    });
  });

  it('keeps task records secret-free and byte-free', () => {
    expect(() =>
      assertTaskRecord({
        ...task(),
        execution: {
          profileId: 'mock',
          providerOptions: { apiKey: 'sk-live-secret' },
        },
      }),
    ).toThrow(/secret|provider/i);

    expect(() =>
      assertTaskRecord({
        ...task(),
        attachments: [
          {
            kind: 'local-file',
            attachmentId: 'att-1',
            asset: { ref: { kind: 'hostObject', ref: 'input.png' } },
            rawBytes: new Uint8Array([1, 2, 3]),
          },
        ],
      }),
    ).toThrow(/binary/);
  });

  it('sanitizes source URL evidence and rejects query-bearing evidence', () => {
    expect(sanitizeTaskEvidenceUrl('https://example.test/image.png?X-Amz-Signature=secret#frag')).toBe(
      'https://example.test/image.png',
    );

    expect(() =>
      assertTaskRecord({
        ...task(),
        outputs: [
          {
            ...task().outputs[0],
            source: {
              providerAssetKind: 'url',
              sanitizedOriginalUrl: 'https://example.test/image.png?token=secret',
            },
          },
        ],
      }),
    ).toThrow(/sanitized/);
  });
});
