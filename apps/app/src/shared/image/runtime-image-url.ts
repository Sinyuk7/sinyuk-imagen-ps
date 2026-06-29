export interface RuntimeImageUrl {
  readonly url: string;
  release(): void;
}

interface ImageBlobConstructor {
  new(data: ArrayBuffer, options: { readonly type: string }): Blob;
}

function copyToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

export function bytesToBase64(bytes: Uint8Array): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const chunks: string[] = [];
  let chunk = '';
  let index = 0;
  const append = (a: string, b: string, c: string, d: string): void => {
    chunk += `${a}${b}${c}${d}`;
    if (chunk.length >= 8192) {
      chunks.push(chunk);
      chunk = '';
    }
  };

  for (; index + 2 < bytes.length; index += 3) {
    const value = (bytes[index] << 16) | (bytes[index + 1] << 8) | bytes[index + 2];
    append(alphabet[(value >> 18) & 63], alphabet[(value >> 12) & 63], alphabet[(value >> 6) & 63], alphabet[value & 63]);
  }

  const remaining = bytes.length - index;
  if (remaining === 1) {
    const value = bytes[index] << 16;
    append(alphabet[(value >> 18) & 63], alphabet[(value >> 12) & 63], '=', '=');
  } else if (remaining === 2) {
    const value = (bytes[index] << 16) | (bytes[index + 1] << 8);
    append(alphabet[(value >> 18) & 63], alphabet[(value >> 12) & 63], alphabet[(value >> 6) & 63], '=');
  }

  if (chunk.length > 0) {
    chunks.push(chunk);
  }

  return chunks.join('');
}

export function dataUrlForImageBytes(bytes: Uint8Array, mimeType: string): string {
  return `data:${mimeType};base64,${bytesToBase64(bytes)}`;
}

function createBlobForImage(bytes: Uint8Array, mimeType: string): Blob | undefined {
  const data = copyToArrayBuffer(bytes);
  const imageBlob = (globalThis as { readonly ImageBlob?: ImageBlobConstructor }).ImageBlob;
  if (typeof imageBlob === 'function') {
    try {
      return new imageBlob(data, { type: mimeType });
    } catch {
      // 运行时 ImageBlob 兼容性失败时退回标准 Blob，避免 preview 直接空白。
    }
  }

  if (typeof Blob === 'function') {
    return new Blob([data], { type: mimeType });
  }

  return undefined;
}

export function createRuntimeImageUrl(bytes: Uint8Array, mimeType: string): RuntimeImageUrl | undefined {
  if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
    return undefined;
  }
  const blob = createBlobForImage(bytes, mimeType);
  if (!blob) {
    return undefined;
  }
  const url = URL.createObjectURL(blob);
  return {
    url,
    release() {
      URL.revokeObjectURL(url);
    },
  };
}

export function createRuntimeImageUrlOrDataUrl(bytes: Uint8Array, mimeType: string): RuntimeImageUrl {
  return createRuntimeImageUrl(bytes, mimeType) ?? {
    url: dataUrlForImageBytes(bytes, mimeType),
    release: () => undefined,
  };
}
