import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock shared-commands module
vi.mock('@imagen-ps/shared-commands', () => ({
  listProviders: vi.fn(() => [
    { id: 'mock', family: 'mock', displayName: 'Mock Provider', capabilities: {}, operations: [] },
  ]),
  describeProvider: vi.fn((id: string) => {
    if (id === 'mock') {
      return { id: 'mock', family: 'mock', displayName: 'Mock Provider', capabilities: {}, operations: [] };
    }
    return undefined;
  }),
  getProviderConfig: vi.fn(async (id: string) => {
    if (id === 'mock') {
      return { ok: true, value: { providerId: 'mock', apiKey: 'key' } };
    }
    return { ok: false, error: { category: 'validation', message: `Config not found: ${id}` } };
  }),
  saveProviderConfig: vi.fn(async () => ({ ok: true, value: undefined })),
  submitJob: vi.fn(async () => ({
    ok: true,
    value: {
      id: 'job-1',
      status: 'completed',
      input: {},
      output: {},
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    },
  })),
  getJob: vi.fn((id: string) => {
    if (id === 'job-1') {
      return {
        id: 'job-1',
        status: 'completed',
        input: {},
        output: {},
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };
    }
    return undefined;
  }),
  retryJob: vi.fn(async (id: string) => {
    if (id === 'job-1') {
      return {
        ok: true,
        value: {
          id: 'job-2',
          status: 'running',
          input: {},
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
          originJobId: 'job-1',
          retryAttempt: 1,
        },
      };
    }
    return { ok: false, error: { category: 'runtime', message: `Job not found: ${id}` } };
  }),
  setConfigAdapter: vi.fn(),
}));

import {
  listProviders,
  describeProvider,
  getProviderConfig,
  saveProviderConfig,
  submitJob,
  getJob,
  retryJob,
} from '@imagen-ps/shared-commands';

describe('Provider commands integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('listProviders returns array of providers', () => {
    const result = listProviders();
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('mock');
  });

  it('describeProvider returns descriptor for existing provider', () => {
    const result = describeProvider('mock');
    expect(result).toBeDefined();
    expect(result!.id).toBe('mock');
  });

  it('describeProvider returns undefined for non-existent provider', () => {
    const result = describeProvider('nonexistent');
    expect(result).toBeUndefined();
  });

  it('getProviderConfig returns config for saved provider', async () => {
    const result = await getProviderConfig('mock');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.providerId).toBe('mock');
    }
  });

  it('getProviderConfig returns error for unsaved provider', async () => {
    const result = await getProviderConfig('nonexistent');
    expect(result.ok).toBe(false);
  });

  it('saveProviderConfig succeeds', async () => {
    const result = await saveProviderConfig('mock', { providerId: 'mock', apiKey: 'key' });
    expect(result.ok).toBe(true);
  });
});

describe('Job commands integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('submitJob returns completed job', async () => {
    const result = await submitJob({ workflow: 'provider-generate' as never, input: {} as never });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.id).toBe('job-1');
      expect(result.value.status).toBe('completed');
    }
  });

  it('getJob returns job for existing id', () => {
    const result = getJob('job-1');
    expect(result).toBeDefined();
    expect(result!.id).toBe('job-1');
  });

  it('getJob returns undefined for non-existent id', () => {
    const result = getJob('nonexistent');
    expect(result).toBeUndefined();
  });

  it('retryJob returns new job for existing id', async () => {
    const result = await retryJob('job-1');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.originJobId).toBe('job-1');
      expect(result.value.retryAttempt).toBe(1);
    }
  });

  it('retryJob returns error for non-existent id', async () => {
    const result = await retryJob('nonexistent');
    expect(result.ok).toBe(false);
  });
});
