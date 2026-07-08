import type { Asset } from '@imagen-ps/application';
import UPNG from 'upng-js';

export type ImageTransparencyState = 'transparent' | 'opaque' | 'unknown';

function arrayBufferFromBytes(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function readUint32BigEndian(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] * 0x1000000) + ((bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3])) >>> 0;
}

function readUint32LittleEndian(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset + 3] * 0x1000000) + ((bytes[offset + 2] << 16) | (bytes[offset + 1] << 8) | bytes[offset])) >>> 0;
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.slice(offset, offset + length));
}

function base64ToBytes(value: string): Uint8Array {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const clean = value.replace(/\s+/g, '').replace(/=+$/, '');
  const out: number[] = [];
  let buffer = 0;
  let bits = 0;

  for (const char of clean) {
    const index = alphabet.indexOf(char);
    if (index === -1) {
      continue;
    }
    buffer = (buffer << 6) | index;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((buffer >> bits) & 0xff);
    }
  }

  return new Uint8Array(out);
}

function bytesFromAssetData(data: string): Uint8Array {
  const commaIndex = data.startsWith('data:') ? data.indexOf(',') + 1 : 0;
  return base64ToBytes(data.slice(commaIndex));
}

function pngCanCarryTransparency(bytes: Uint8Array): boolean | undefined {
  if (bytes.byteLength < 33 || ascii(bytes, 0, 8) !== '\x89PNG\r\n\x1a\n') {
    return undefined;
  }

  const colorType = bytes[25];
  if (colorType === 4 || colorType === 6) {
    return true;
  }

  let offset = 8;
  while (offset + 8 <= bytes.byteLength) {
    const chunkLength = readUint32BigEndian(bytes, offset);
    const chunkType = ascii(bytes, offset + 4, 4);
    const chunkDataEnd = offset + 8 + chunkLength;
    if (chunkDataEnd + 4 > bytes.byteLength) {
      return undefined;
    }
    if (chunkType === 'tRNS') {
      return true;
    }
    if (chunkType === 'IDAT') {
      return false;
    }
    offset = chunkDataEnd + 4;
  }

  return false;
}

function pngTransparencyState(bytes: Uint8Array): ImageTransparencyState {
  const canCarryTransparency = pngCanCarryTransparency(bytes);
  if (canCarryTransparency === undefined) {
    return 'unknown';
  }
  if (!canCarryTransparency) {
    return 'opaque';
  }

  try {
    const decoded = UPNG.decode(arrayBufferFromBytes(bytes));
    const frames = UPNG.toRGBA8(decoded);
    const hasTransparentPixels = frames.some((frame) => {
      const rgba = new Uint8Array(frame);
      for (let index = 3; index < rgba.byteLength; index += 4) {
        if (rgba[index] !== 255) {
          return true;
        }
      }
      return false;
    });
    return hasTransparentPixels ? 'transparent' : 'opaque';
  } catch {
    return 'unknown';
  }
}

function webpTransparencyState(bytes: Uint8Array): ImageTransparencyState {
  if (
    bytes.byteLength < 16 ||
    ascii(bytes, 0, 4) !== 'RIFF' ||
    ascii(bytes, 8, 4) !== 'WEBP'
  ) {
    return 'unknown';
  }

  let offset = 12;
  let vp8xAlpha = false;
  while (offset + 8 <= bytes.byteLength) {
    const chunkType = ascii(bytes, offset, 4);
    const chunkLength = readUint32LittleEndian(bytes, offset + 4);
    const chunkDataOffset = offset + 8;
    const paddedLength = chunkLength + (chunkLength % 2);
    if (chunkDataOffset + chunkLength > bytes.byteLength) {
      return vp8xAlpha ? 'transparent' : 'opaque';
    }
    if (chunkType === 'ALPH') {
      return 'transparent';
    }
    if (chunkType === 'VP8X' && chunkLength >= 1) {
      vp8xAlpha = (bytes[chunkDataOffset] & 0x10) !== 0;
    }
    offset = chunkDataOffset + paddedLength;
  }

  return vp8xAlpha ? 'transparent' : 'opaque';
}

export function transparencyStateFromImageBytes(bytes: Uint8Array, mimeType: string): ImageTransparencyState {
  const normalized = mimeType.toLowerCase();
  if (normalized.includes('jpeg') || normalized.includes('jpg')) {
    return 'opaque';
  }
  if (normalized.includes('png')) {
    return pngTransparencyState(bytes);
  }
  if (normalized.includes('webp')) {
    return webpTransparencyState(bytes);
  }
  return 'unknown';
}

export function transparencyStateFromAsset(asset: Pick<Asset, 'data' | 'mimeType'>): ImageTransparencyState {
  const mimeType = asset.mimeType ?? 'image/png';
  if (asset.data instanceof Uint8Array) {
    return transparencyStateFromImageBytes(asset.data, mimeType);
  }
  if (typeof asset.data === 'string') {
    return transparencyStateFromImageBytes(bytesFromAssetData(asset.data), mimeType);
  }
  if (mimeType.toLowerCase().includes('jpeg') || mimeType.toLowerCase().includes('jpg')) {
    return 'opaque';
  }
  return 'unknown';
}

export function hasImageTransparency(bytes: Uint8Array, mimeType: string): boolean {
  return transparencyStateFromImageBytes(bytes, mimeType) === 'transparent';
}

export function assetHasTransparency(asset: Pick<Asset, 'data' | 'mimeType'>): boolean {
  return transparencyStateFromAsset(asset) === 'transparent';
}
