import { describe, expect, it } from 'vitest';
import { defaultRuntimePolicy, resolveRuntimePolicy } from './runtime-policy.js';

describe('runtime policy resolution', () => {
  it('uses the validated remote policy when available', async () => {
    const result = await resolveRuntimePolicy({ remote: { load: async () => ({ asyncTask: { pollIntervalMs: 5000, timeoutMs: 120000, maxPolls: null } }) } });
    expect(result.source).toBe('remote');
    expect(result.policy.asyncTask.pollIntervalMs).toBe(5000);
  });

  it('falls back to the local default when remote data is invalid', async () => {
    const result = await resolveRuntimePolicy({ remote: { load: async () => ({ invalid: true }) } });
    expect(result.source).toBe('local');
    expect(result.fallbackReason).toContain('requires asyncTask');
    expect(result.policy).toBe(defaultRuntimePolicy);
  });
});
