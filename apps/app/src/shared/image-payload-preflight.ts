const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;
const JPEG_SOI = [0xff, 0xd8] as const;
const JPEG_EOI = [0xff, 0xd9] as const;
const WEBP_RIFF = [0x52, 0x49, 0x46, 0x46] as const;
const WEBP_WEBP = [0x57, 0x45, 0x42, 0x50] as const;
const PNG_IHDR = 0x49484452;
const PNG_IDAT = 0x49444154;
const PNG_IEND = 0x49454e44;

function bytesEqual(bytes: Uint8Array, offset: number, expected: readonly number[]): boolean {
  if (offset + expected.length > bytes.byteLength) {
    return false;
  }
  for (let i = 0; i < expected.length; i += 1) {
    if (bytes[offset + i] !== expected[i]) {
      return false;
    }
  }
  return true;
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset] * 0x1000000) +
    ((bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3])
  );
}

function crc32(bytes: Uint8Array, offset: number, length: number): number {
  let crc = 0xffffffff;
  for (let i = offset; i < offset + length; i += 1) {
    crc ^= bytes[i];
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function isSupportedPngColorType(colorType: number): boolean {
  return colorType === 0 || colorType === 2 || colorType === 3 || colorType === 4 || colorType === 6;
}

function ensureValidPng(bytes: Uint8Array): void {
  if (!bytesEqual(bytes, 0, PNG_SIGNATURE)) {
    throw new Error('PNG asset has an invalid signature.');
  }

  let offset: number = PNG_SIGNATURE.length;
  let sawIhdr = false;
  let sawIdat = false;
  while (offset + 12 <= bytes.byteLength) {
    const length = readUint32(bytes, offset);
    const type = readUint32(bytes, offset + 4);
    const dataOffset = offset + 8;
    const nextOffset = dataOffset + length + 4;
    if (nextOffset > bytes.byteLength) {
      throw new Error('PNG asset is truncated.');
    }
    const expectedCrc = readUint32(bytes, dataOffset + length);
    const actualCrc = crc32(bytes, offset + 4, 4 + length);
    if (expectedCrc !== actualCrc) {
      throw new Error('PNG asset chunk CRC is invalid.');
    }

    if (type === PNG_IHDR) {
      if (length !== 13) {
        throw new Error('PNG asset has an invalid IHDR length.');
      }
      const width = readUint32(bytes, dataOffset);
      const height = readUint32(bytes, dataOffset + 4);
      const bitDepth = bytes[dataOffset + 8];
      const colorType = bytes[dataOffset + 9];
      if (!width || !height || !isSupportedPngColorType(colorType) || bitDepth === 0) {
        throw new Error('PNG asset has unsupported image metadata.');
      }
      sawIhdr = true;
    } else if (type === PNG_IDAT) {
      sawIdat = true;
    } else if (type === PNG_IEND) {
      if (!sawIhdr || !sawIdat) {
        throw new Error('PNG asset is missing required chunks.');
      }
      if (nextOffset !== bytes.byteLength) {
        throw new Error('PNG asset has trailing bytes after IEND.');
      }
      return;
    }

    offset = nextOffset;
  }

  throw new Error('PNG asset is missing IEND.');
}

/** 在图片 bytes 进入 Photoshop native 解码/绘制前做结构预检。 */
export function ensurePlaceableImagePayload(data: ArrayBuffer, mimeType: string): void {
  const bytes = new Uint8Array(data);
  if (bytes.byteLength === 0) {
    throw new Error('Image asset is empty.');
  }

  const normalizedMimeType = mimeType.toLowerCase();
  if (normalizedMimeType.includes('png')) {
    ensureValidPng(bytes);
    return;
  }
  if (normalizedMimeType.includes('jpeg') || normalizedMimeType.includes('jpg')) {
    if (!bytesEqual(bytes, 0, JPEG_SOI) || !bytesEqual(bytes, bytes.byteLength - JPEG_EOI.length, JPEG_EOI)) {
      throw new Error('JPEG asset is missing SOI/EOI markers.');
    }
    return;
  }
  if (normalizedMimeType.includes('webp')) {
    if (!bytesEqual(bytes, 0, WEBP_RIFF) || !bytesEqual(bytes, 8, WEBP_WEBP)) {
      throw new Error('WEBP asset has an invalid RIFF/WEBP header.');
    }
  }
}
