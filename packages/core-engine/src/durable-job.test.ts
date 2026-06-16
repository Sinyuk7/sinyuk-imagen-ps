import { describe, expect, it } from 'vitest';
import { assertNoSecrets, type DurableJobRecord, type StoredAssetRef } from './types/durable-job.js';

describe('durable job shared contract', () => {
  it('models host-neutral stored asset refs without native paths', () => {
    const refs: readonly StoredAssetRef[] = [
      {
        kind: 'inline',
        ref: 'asset-inline',
        mimeType: 'image/png',
        sha256: 'sha-inline',
        byteSize: 12,
      },
      {
        kind: 'url',
        ref: 'https://example.com/image.png',
      },
      {
        kind: 'hostObject',
        ref: 'cache/images/job-1/output.png',
      },
      {
        kind: 'externalToken',
        ref: 'persistent-token',
      },
    ];

    expect(refs.map((ref) => ref.kind)).toEqual(['inline', 'url', 'hostObject', 'externalToken']);
    expect(refs.every((ref) => !('path' in ref))).toBe(true);
  });

  it('keeps durable job records separate from binary artifact bytes', () => {
    const record: DurableJobRecord = {
      schemaVersion: 1,
      jobId: 'job-1',
      status: 'completed',
      workflow: 'provider-generate',
      input: {
        profileId: 'mock-dev',
        prompt: 'simple blue square icon',
        secretRefs: {
          apiKey: 'secret:provider-profile:mock-dev:apiKey',
        },
      },
      outputs: [
        {
          kind: 'hostObject',
          ref: 'jobs/job-1/image.png',
          mimeType: 'image/png',
        },
      ],
      createdAt: '2026-06-16T00:00:00.000Z',
      updatedAt: '2026-06-16T00:00:01.000Z',
    };

    expect(record.outputs[0].kind).toBe('hostObject');
    expect('output' in record).toBe(false);
    expect(JSON.stringify(record)).not.toContain('data:image');
    expect(JSON.stringify(record)).not.toContain('base64');
  });

  it('allows secret references but rejects secret values before persistence', () => {
    expect(() =>
      assertNoSecrets({
        profileId: 'mock-dev',
        secretRefs: {
          apiKey: 'secret:provider-profile:mock-dev:apiKey',
        },
      }),
    ).not.toThrow();

    expect(() =>
      assertNoSecrets({
        profileId: 'mock-dev',
        secretValues: {
          apiKey: 'sk-live-secret',
        },
      }),
    ).toThrow(/secret value/i);
  });

  it('rejects common credential-shaped fields recursively', () => {
    expect(() =>
      assertNoSecrets({
        providerOptions: {
          headers: {
            authorization: 'Bearer token',
          },
        },
      }),
    ).toThrow(/secret value/i);

    expect(() =>
      assertNoSecrets({
        input: [
          {
            refreshToken: 'refresh-token',
          },
        ],
      }),
    ).toThrow(/secret value/i);
  });
});
