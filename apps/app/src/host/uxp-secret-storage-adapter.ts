import type { SecretStorageAdapter } from '@imagen-ps/application';
import { createInMemorySecretStorageAdapter } from './in-memory-host-storage';
import type { UxpModules } from './uxp-api';

interface UxpSecureStorage {
  getItem(key: string): Promise<string | ArrayBuffer | undefined>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

function secureStorageFrom(modules: UxpModules): UxpSecureStorage | undefined {
  const storage = modules.uxp?.storage as { readonly secureStorage?: UxpSecureStorage } | undefined;
  return storage?.secureStorage;
}

export function createUxpSecretStorageAdapter(modules: UxpModules): SecretStorageAdapter {
  const secureStorage = secureStorageFrom(modules);
  if (!secureStorage) {
    return createInMemorySecretStorageAdapter();
  }

  return {
    async getSecret(key: string): Promise<string | undefined> {
      const value = await secureStorage.getItem(key);
      if (value === undefined) {
        return undefined;
      }
      if (typeof value === 'string') {
        return value;
      }
      return new TextDecoder().decode(value);
    },
    async setSecret(key: string, value: string): Promise<void> {
      await secureStorage.setItem(key, value);
    },
    async deleteSecret(key: string): Promise<void> {
      await secureStorage.removeItem(key);
    },
  };
}
