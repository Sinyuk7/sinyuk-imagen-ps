import type { RgbaImage } from '../../shared/image/resize';

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;
const PNG_IHDR = 'IHDR';
const PNG_IDAT = 'IDAT';
const PNG_IEND = 'IEND';
const DEFLATE_STORED_BLOCK_MAX = 0xffff;

export type PngEncoderName = 'stored-deflate';

export interface PngEncodeResult {
  readonly bytes: Uint8Array;
  readonly encoder: PngEncoderName;
  readonly rgbaBytes: number;
}

function writeUint16LE(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
}

function writeUint32BE(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = (value >>> 24) & 0xff;
  bytes[offset + 1] = (value >>> 16) & 0xff;
  bytes[offset + 2] = (value >>> 8) & 0xff;
  bytes[offset + 3] = value & 0xff;
}

function crc32(bytes: Uint8Array, offset = 0, length = bytes.byteLength - offset): number {
  let crc = 0xffffffff;
  for (let index = offset; index < offset + length; index += 1) {
    crc ^= bytes[index];
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function adler32(bytes: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (const byte of bytes) {
    a = (a + byte) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

function asciiBytes(value: string): Uint8Array {
  const bytes = new Uint8Array(value.length);
  for (let index = 0; index < value.length; index += 1) {
    bytes[index] = value.charCodeAt(index);
  }
  return bytes;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = asciiBytes(type);
  const bytes = new Uint8Array(12 + data.byteLength);
  writeUint32BE(bytes, 0, data.byteLength);
  bytes.set(typeBytes, 4);
  bytes.set(data, 8);
  writeUint32BE(bytes, 8 + data.byteLength, crc32(bytes, 4, 4 + data.byteLength));
  return bytes;
}

function zlibStoredDeflate(data: Uint8Array): Uint8Array {
  const blockCount = Math.max(1, Math.ceil(data.byteLength / DEFLATE_STORED_BLOCK_MAX));
  const bytes = new Uint8Array(2 + blockCount * 5 + data.byteLength + 4);
  let offset = 0;
  bytes[offset++] = 0x78;
  bytes[offset++] = 0x01;
  let source = 0;
  for (let block = 0; block < blockCount; block += 1) {
    const remaining = data.byteLength - source;
    const length = Math.min(DEFLATE_STORED_BLOCK_MAX, remaining);
    bytes[offset++] = block === blockCount - 1 ? 0x01 : 0x00;
    writeUint16LE(bytes, offset, length);
    writeUint16LE(bytes, offset + 2, (~length) & 0xffff);
    offset += 4;
    bytes.set(data.subarray(source, source + length), offset);
    source += length;
    offset += length;
  }
  writeUint32BE(bytes, offset, adler32(data));
  return bytes;
}

function encodeStoredDeflateBytes(image: RgbaImage): Uint8Array {
  const expected = image.width * image.height * 4;
  if (image.width <= 0 || image.height <= 0 || image.data.byteLength < expected) {
    throw new Error(`PNG encoding requires complete RGBA data: ${image.width}x${image.height}.`);
  }
  const scanlineSize = 1 + image.width * 4;
  const raw = new Uint8Array(scanlineSize * image.height);
  for (let y = 0; y < image.height; y += 1) {
    const rawOffset = y * scanlineSize;
    raw[rawOffset] = 0;
    raw.set(image.data.subarray(y * image.width * 4, (y + 1) * image.width * 4), rawOffset + 1);
  }

  const ihdr = new Uint8Array(13);
  writeUint32BE(ihdr, 0, image.width);
  writeUint32BE(ihdr, 4, image.height);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const chunks = [
    Uint8Array.from(PNG_SIGNATURE),
    pngChunk(PNG_IHDR, ihdr),
    pngChunk(PNG_IDAT, zlibStoredDeflate(raw)),
    pngChunk(PNG_IEND, new Uint8Array()),
  ];
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

/** 使用无压缩 deflate 生成 UXP 安全的 RGBA PNG。 */
export function encodeRgbaPngStoredDeflate(image: RgbaImage): PngEncodeResult {
  const rgbaBytes = image.width * image.height * 4;
  return {
    bytes: encodeStoredDeflateBytes(image),
    encoder: 'stored-deflate',
    rgbaBytes,
  };
}
