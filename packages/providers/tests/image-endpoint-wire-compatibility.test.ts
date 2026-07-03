import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProviderDescriptor } from '../src/contract/provider.js';
import {
  createImageEditCompatibilityFingerprint,
  digestImageEditCompatibilityFingerprint,
  imageEditCompatibilityTesting,
  isImageEditCodecCompatible,
  rememberSuccessfulImageEditCodec,
  resetImageEditCompatibilityCacheForTesting,
  resolveImageEditCodec,
  serializeImageEditCompatibilityFingerprint,
} from '../src/transport/image-endpoint/wire-compatibility.js';

const descriptorWithWire: ProviderDescriptor = {
  id: 'image-endpoint',
  family: 'image-endpoint',
  displayName: 'Image Endpoint',
  operations: ['text_to_image', 'image_edit'],
  invokeMode: 'sync',
  transport: {
    wire: {
      supportedEditCodecs: ['multipart-bracket', 'multipart-plain', 'json-reference'],
      defaultEditCodecOrder: ['multipart-bracket', 'json-reference', 'multipart-plain'],
      responseCodecs: ['json'],
    },
  },
};

const descriptorWithoutWire: ProviderDescriptor = {
  id: 'image-endpoint',
  family: 'image-endpoint',
  displayName: 'Image Endpoint',
  operations: ['text_to_image', 'image_edit'],
  invokeMode: 'sync',
};

function baseConfig() {
  return {
    providerId: 'profile-image-endpoint',
    displayName: 'Profile',
    family: 'image-endpoint' as const,
    connection: {
      selectionMode: 'manual' as const,
      failoverEnabled: false,
      preferredEndpointId: 'primary',
      endpoints: [{ id: 'primary', url: 'https://api.example.com/', enabled: true }],
    },
    apiKey: 'sk-test',
    defaultModel: 'gpt-image-2',
    extraHeaders: {
      Authorization: 'Bearer custom',
      'X-Relay-Token': 'secret-token',
    },
  };
}

beforeEach(() => {
  resetImageEditCompatibilityCacheForTesting();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('image endpoint wire compatibility', () => {
  it('uses descriptor default order when no cache exists', () => {
    const resolution = resolveImageEditCodec({
      descriptor: descriptorWithWire,
      config: baseConfig(),
      targetPath: '/v1/images/edits',
      request: {
        operation: 'image_edit',
        prompt: 'edit',
        images: [{ type: 'image', url: 'https://example.com/input.png' }],
      },
    });

    expect(resolution).toMatchObject({
      codec: 'json-reference',
      source: 'descriptor-default',
    });
  });

  it('falls back to legacy default order when descriptor leaves wire undeclared', () => {
    const resolution = resolveImageEditCodec({
      descriptor: descriptorWithoutWire,
      config: baseConfig(),
      targetPath: '/v1/images/edits',
      request: {
        operation: 'image_edit',
        prompt: 'edit',
        images: [{ type: 'image', data: 'iVBORw0KGgo=', mimeType: 'image/png' }],
      },
    });

    expect(resolution).toMatchObject({
      codec: 'multipart-bracket',
      source: 'legacy-default',
    });
  });

  it('prefers a compatible cache hit over descriptor defaults', () => {
    const args = {
      descriptor: descriptorWithWire,
      config: baseConfig(),
      targetPath: '/v1/images/edits',
      request: {
        operation: 'image_edit' as const,
        prompt: 'edit',
        images: [{ type: 'image', data: 'iVBORw0KGgo=', mimeType: 'image/png' }],
      },
    };
    const first = resolveImageEditCodec(args);
    rememberSuccessfulImageEditCodec(first.cacheKey, 'multipart-plain');

    const second = resolveImageEditCodec(args);

    expect(second).toMatchObject({
      codec: 'multipart-plain',
      source: 'cache',
    });
  });

  it('treats request-shape changes as a different cache key', () => {
    const shared = {
      descriptor: descriptorWithWire,
      config: baseConfig(),
      targetPath: '/v1/images/edits',
    };
    const urlResolution = resolveImageEditCodec({
      ...shared,
      request: {
        operation: 'image_edit',
        prompt: 'edit',
        images: [{ type: 'image', url: 'https://example.com/input.png' }],
      },
    });
    const inlineResolution = resolveImageEditCodec({
      ...shared,
      request: {
        operation: 'image_edit',
        prompt: 'edit',
        images: [{ type: 'image', data: 'iVBORw0KGgo=', mimeType: 'image/png' }],
      },
    });

    expect(urlResolution.cacheKey).not.toBe(inlineResolution.cacheKey);
  });

  it('expires cached entries after the fixed TTL', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-04T00:00:00.000Z'));
    const args = {
      descriptor: descriptorWithWire,
      config: baseConfig(),
      targetPath: '/v1/images/edits',
      request: {
        operation: 'image_edit' as const,
        prompt: 'edit',
        images: [{ type: 'image', data: 'iVBORw0KGgo=', mimeType: 'image/png' }],
      },
    };

    const first = resolveImageEditCodec(args);
    rememberSuccessfulImageEditCodec(first.cacheKey, 'multipart-plain');
    vi.advanceTimersByTime(imageEditCompatibilityTesting.cacheTtlMs + 1);

    const second = resolveImageEditCodec(args);

    expect(second.source).toBe('descriptor-default');
  });

  it('evicts the least-recently-used cache entry when max entries is exceeded', () => {
    const config = baseConfig();
    for (let index = 0; index < imageEditCompatibilityTesting.cacheMaxEntries; index += 1) {
      const resolution = resolveImageEditCodec({
        descriptor: descriptorWithWire,
        config: {
          ...config,
          defaultModel: `gpt-image-${index}`,
        },
        targetPath: '/v1/images/edits',
        request: {
          operation: 'image_edit',
          prompt: `edit-${index}`,
          images: [{ type: 'image', data: 'iVBORw0KGgo=', mimeType: 'image/png' }],
        },
      });
      rememberSuccessfulImageEditCodec(resolution.cacheKey, 'multipart-bracket');
    }

    const newestArgs = {
      descriptor: descriptorWithWire,
      config: {
        ...config,
        defaultModel: `gpt-image-${imageEditCompatibilityTesting.cacheMaxEntries}`,
      },
      targetPath: '/v1/images/edits',
      request: {
        operation: 'image_edit' as const,
        prompt: `edit-${imageEditCompatibilityTesting.cacheMaxEntries}`,
        images: [{ type: 'image', data: 'iVBORw0KGgo=', mimeType: 'image/png' }],
      },
    };
    const newestResolution = resolveImageEditCodec(newestArgs);
    rememberSuccessfulImageEditCodec(newestResolution.cacheKey, 'multipart-plain');

    const oldestResolution = resolveImageEditCodec({
      descriptor: descriptorWithWire,
      config: {
        ...config,
        defaultModel: 'gpt-image-0',
      },
      targetPath: '/v1/images/edits',
      request: {
        operation: 'image_edit',
        prompt: 'edit-0',
        images: [{ type: 'image', data: 'iVBORw0KGgo=', mimeType: 'image/png' }],
      },
    });
    const latestResolution = resolveImageEditCodec(newestArgs);

    expect(oldestResolution.source).toBe('descriptor-default');
    expect(latestResolution.source).toBe('cache');
  });

  it('serializes header names and digests header values without leaking secrets', () => {
    const fingerprint = createImageEditCompatibilityFingerprint({
      descriptor: descriptorWithWire,
      config: baseConfig(),
      targetPath: '/v1/images/edits',
      request: {
        operation: 'image_edit',
        prompt: 'edit',
        images: [{ type: 'image', url: 'https://example.com/input.png' }],
      },
    });
    const serialized = serializeImageEditCompatibilityFingerprint(fingerprint);

    expect(fingerprint.connection.extraHeaderNames).toEqual(['authorization', 'x-relay-token']);
    expect(fingerprint.connection.extraHeadersFingerprint).toMatch(/^fnv1a64:[0-9a-f]{16}$/);
    expect(serialized).not.toContain('secret-token');
    expect(serialized).not.toContain('Bearer custom');
    expect(digestImageEditCompatibilityFingerprint(fingerprint)).toMatch(/^fnv1a64:[0-9a-f]{16}$/);
  });

  it('distinguishes compatible codec shapes explicitly', () => {
    expect(
      isImageEditCodecCompatible(
        {
          operation: 'image_edit',
          prompt: 'edit',
          images: [{ type: 'image', url: 'https://example.com/input.png' }],
        },
        'json-reference',
      ),
    ).toBe(true);
    expect(
      isImageEditCodecCompatible(
        {
          operation: 'image_edit',
          prompt: 'edit',
          images: [{ type: 'image', url: 'https://example.com/input.png' }],
        },
        'multipart-bracket',
      ),
    ).toBe(false);
    expect(
      isImageEditCodecCompatible(
        {
          operation: 'image_edit',
          prompt: 'edit',
          images: [{ type: 'image', data: new Uint8Array([1, 2, 3]), mimeType: 'image/png' }],
        },
        'json-reference',
      ),
    ).toBe(false);
  });
});
