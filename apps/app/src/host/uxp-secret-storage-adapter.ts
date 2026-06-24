import type { SecretStorageAdapter } from '@imagen-ps/application';
import { createInMemorySecretStorageAdapter } from './in-memory-host-storage';
import { createUxpFlightRecorder, type UxpFlightRecorder } from './uxp-log-sink';
import type { UxpModules } from './uxp-api';

interface UxpSecureStorage {
  getItem(key: string): Promise<string | ArrayBuffer | undefined>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

declare global {
  // eslint-disable-next-line no-var
  var __IMAGEN_PS_DIAGNOSTIC_SKIP_SECURE_STORAGE_GET__: boolean | undefined;
}

function secureStorageFrom(modules: UxpModules): UxpSecureStorage | undefined {
  const storage = modules.uxp?.storage as { readonly secureStorage?: UxpSecureStorage } | undefined;
  return storage?.secureStorage;
}

function hashSecretKey(key: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i += 1) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function secretAttrs(key: string): Record<string, unknown> {
  return {
    keyHash: hashSecretKey(key),
    keyLength: key.length,
  };
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
  const flightRecorder: UxpFlightRecorder = createUxpFlightRecorder(modules);

  return {
    async getSecret(key: string): Promise<string | undefined> {
      await flightRecorder.checkpoint('uxp.secret_storage.get.before_get_item', secretAttrs(key));
      if (globalThis.__IMAGEN_PS_DIAGNOSTIC_SKIP_SECURE_STORAGE_GET__ === true) {
        await flightRecorder.checkpoint('uxp.secret_storage.get.skipped_by_diagnostic', secretAttrs(key));
        return undefined;
      }
      const value = await secureStorage.getItem(key);
      await flightRecorder.checkpoint('uxp.secret_storage.get.after_get_item', {
        ...secretAttrs(key),
        found: value !== undefined,
        valueKind: value instanceof ArrayBuffer ? 'array-buffer' : typeof value,
      });
      if (value === undefined) {
        return undefined;
      }
      if (typeof value === 'string') {
        return value;
      }
      return decodeArrayBufferUtf8(value);
    },
    async setSecret(key: string, value: string): Promise<void> {
      await flightRecorder.checkpoint('uxp.secret_storage.set.before_set_item', {
        ...secretAttrs(key),
        valueLength: value.length,
      });
      await secureStorage.setItem(key, value);
      await flightRecorder.checkpoint('uxp.secret_storage.set.after_set_item', {
        ...secretAttrs(key),
        valueLength: value.length,
      });
    },
    async deleteSecret(key: string): Promise<void> {
      await flightRecorder.checkpoint('uxp.secret_storage.delete.before_remove_item', secretAttrs(key));
      await secureStorage.removeItem(key);
      await flightRecorder.checkpoint('uxp.secret_storage.delete.after_remove_item', secretAttrs(key));
    },
  };
}
