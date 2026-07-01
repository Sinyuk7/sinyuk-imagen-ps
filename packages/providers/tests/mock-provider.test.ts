import { describe, expect, it } from 'vitest';
import { createMockProvider } from '../src/providers/mock/provider.js';

function bytesEqual(bytes: Uint8Array, offset: number, expected: readonly number[]): boolean {
  if (offset + expected.length > bytes.byteLength) {
    return false;
  }
  return expected.every((byte, index) => bytes[offset + index] === byte);
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

function expectValidPng(bytes: Uint8Array): void {
  expect(bytesEqual(bytes, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])).toBe(true);

  let offset = 8;
  const chunkTypes: string[] = [];
  while (offset + 12 <= bytes.byteLength) {
    const length = readUint32(bytes, offset);
    const typeOffset = offset + 4;
    const dataOffset = offset + 8;
    const crcOffset = dataOffset + length;
    expect(crcOffset + 4).toBeLessThanOrEqual(bytes.byteLength);
    const type = Array.from(bytes.slice(typeOffset, dataOffset), (byte) => String.fromCharCode(byte)).join('');
    const expectedCrc = readUint32(bytes, crcOffset);
    expect(crc32(bytes, typeOffset, 4 + length), `${type} CRC`).toBe(expectedCrc);
    chunkTypes.push(type);
    offset = crcOffset + 4;
    if (type === 'IEND') {
      break;
    }
  }

  expect(chunkTypes).toContain('IHDR');
  expect(chunkTypes).toContain('IDAT');
  expect(chunkTypes.at(-1)).toBe('IEND');
  expect(offset).toBe(bytes.byteLength);
}

describe('mock provider', () => {
  it('accepts AbortSignal-like values without listener methods', async () => {
    const provider = createMockProvider();
    const config = provider.validateConfig({
      providerId: 'mock',
      displayName: 'Mock',
      family: 'image-endpoint',
      baseURL: 'https://mock.local',
      apiKey: 'test-key',
      delayMs: 0,
    });
    const request = provider.validateRequest({ operation: 'text_to_image', prompt: '一张蓝色玻璃香水瓶' });

    const result = await provider.invoke({
      config,
      request,
      signal: { aborted: false } as AbortSignal,
    });

    expect(result.assets).toHaveLength(1);
    expect(result.text).toContain('[operation=text_to_image] [model=mock-image-v1]');
    expect(result.text).toContain('[prompt=一张蓝色玻璃香水...]');
    expect(result.text).not.toContain('prompt=一张蓝色玻璃香水瓶');
  });

  it('returns a structurally valid PNG asset for Photoshop host smoke tests', async () => {
    const provider = createMockProvider();
    const config = provider.validateConfig({
      providerId: 'mock',
      displayName: 'Mock',
      family: 'image-endpoint',
      baseURL: 'https://mock.local',
      apiKey: 'test-key',
      delayMs: 0,
    });
    const request = provider.validateRequest({ operation: 'text_to_image', prompt: 'test' });

    const result = await provider.invoke({ config, request });
    const asset = result.assets[0];

    expect(asset.mimeType).toBe('image/png');
    expect(asset.data).toBeInstanceOf(Uint8Array);
    expectValidPng(asset.data as Uint8Array);
  });

  it('echoes image_edit input images as result assets in input order', async () => {
    const provider = createMockProvider();
    const config = provider.validateConfig({
      providerId: 'mock',
      displayName: 'Mock',
      family: 'image-endpoint',
      baseURL: 'https://mock.local',
      apiKey: 'test-key',
      delayMs: 0,
    });
    const firstBytes = new Uint8Array([1, 2, 3]);
    const request = provider.validateRequest({
      operation: 'image_edit',
      prompt: 'echo uploaded images',
      images: [
        { type: 'image', name: 'first.png', data: firstBytes, mimeType: 'image/png' },
        { type: 'image', name: 'second.png', url: 'https://example.com/second.png', mimeType: 'image/png' },
        { type: 'image', name: 'third.png', fileId: 'file-third', mimeType: 'image/png' },
      ],
      output: { count: 5 },
    });

    const result = await provider.invoke({ config, request });

    expect(result.assets).toEqual([
      { type: 'image', name: 'first.png', data: firstBytes, mimeType: 'image/png' },
      { type: 'image', name: 'second.png', url: 'https://example.com/second.png', mimeType: 'image/png' },
      { type: 'image', name: 'third.png', fileId: 'file-third', mimeType: 'image/png' },
    ]);
    expect((result.raw as { assetCount: number }).assetCount).toBe(3);
  });

  it('keeps synthetic output for image_edit requests without images', async () => {
    const provider = createMockProvider();
    const config = provider.validateConfig({
      providerId: 'mock',
      displayName: 'Mock',
      family: 'image-endpoint',
      baseURL: 'https://mock.local',
      apiKey: 'test-key',
      delayMs: 0,
    });
    const request = provider.validateRequest({
      operation: 'image_edit',
      prompt: 'generate fallback image',
      output: { count: 2 },
    });

    const result = await provider.invoke({ config, request });

    expect(result.assets).toHaveLength(2);
    expect(result.assets[0]?.name).toBe('mock-image-1.png');
    expect(result.assets[1]?.name).toBe('mock-image-2.png');
    expect(result.text).toContain('[operation=image_edit] [model=mock-image-v1]');
    expect(result.text).toContain('[images=0] [mask=no] [assets=2]');
    expectValidPng(result.assets[0]?.data as Uint8Array);
    expectValidPng(result.assets[1]?.data as Uint8Array);
  });
});
