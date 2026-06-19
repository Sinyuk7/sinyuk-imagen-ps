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

function decodeArrayBufferUtf8(buffer: ArrayBuffer): string {
  if (typeof TextDecoder !== 'undefined') {
    return new TextDecoder().decode(buffer);
  }

  // UXP 环境缺少 TextDecoder 时的降级解码（UTF-8）。
  const bytes = new Uint8Array(buffer);
  const out: number[] = [];
  let i = 0;
  while (i < bytes.length) {
    const byte1 = bytes[i];
    if (byte1 < 0x80) {
      out.push(byte1);
      i += 1;
    } else if ((byte1 & 0xe0) === 0xc0 && i + 1 < bytes.length) {
      const code = ((byte1 & 0x1f) << 6) | (bytes[i + 1] & 0x3f);
      out.push(code);
      i += 2;
    } else if ((byte1 & 0xf0) === 0xe0 && i + 2 < bytes.length) {
      const code = ((byte1 & 0x0f) << 12) | ((bytes[i + 1] & 0x3f) << 6) | (bytes[i + 2] & 0x3f);
      out.push(code);
      i += 3;
    } else if ((byte1 & 0xf8) === 0xf0 && i + 3 < bytes.length) {
      let code =
        ((byte1 & 0x07) << 18) |
        ((bytes[i + 1] & 0x3f) << 12) |
        ((bytes[i + 2] & 0x3f) << 6) |
        (bytes[i + 3] & 0x3f);
      // 辅助平面：4 字节 UTF-8 分解为 surrogate pair。
      code -= 0x10000;
      out.push(0xd800 + (code >> 10));
      out.push(0xdc00 + (code & 0x3ff));
      i += 4;
    } else {
      // 无效序列，跳过当前字节避免无限循环。
      i += 1;
    }
  }
  return String.fromCharCode(...out);
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
      return decodeArrayBufferUtf8(value);
    },
    async setSecret(key: string, value: string): Promise<void> {
      await secureStorage.setItem(key, value);
    },
    async deleteSecret(key: string): Promise<void> {
      await secureStorage.removeItem(key);
    },
  };
}
