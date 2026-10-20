import { describe, expect, it } from 'vitest';
import { createUxpSecretStorageAdapter } from '../../../src/adapters/uxp/uxp-secret-storage-adapter';
import type { UxpModules } from '../../../src/adapters/uxp/uxp-api';

describe('createUxpSecretStorageAdapter', () => {
  it('treats a null secure-storage result as a missing secret', async () => {
    const modules = {
      uxp: {
        storage: {
          secureStorage: {
            getItem: async () => null,
            setItem: async () => undefined,
            removeItem: async () => undefined,
          },
        },
      },
    } as unknown as UxpModules;

    await expect(createUxpSecretStorageAdapter(modules).getSecret('missing')).resolves.toBeUndefined();
  });

  it('falls back to UTF-8 bytes and verifies the persisted value', async () => {
    let stored: string | Uint8Array | null = null;
    const modules = {
      uxp: {
        storage: {
          secureStorage: {
            getItem: async () => stored,
            setItem: async (_key: string, value: string | Uint8Array) => {
              if (typeof value === 'string') throw new Error('string values are rejected by this host');
              stored = value;
            },
            removeItem: async () => undefined,
          },
        },
      },
    } as unknown as UxpModules;
    const adapter = createUxpSecretStorageAdapter(modules);

    await expect(adapter.setSecret('api-key', '密钥-123')).resolves.toBeUndefined();
    await expect(adapter.getSecret('api-key')).resolves.toBe('密钥-123');
  });
});
