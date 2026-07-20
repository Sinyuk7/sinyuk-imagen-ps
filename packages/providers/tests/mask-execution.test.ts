import { decode as decodePng, encode as encodePng } from 'fast-png';
import { describe, expect, it } from 'vitest';
import {
  resolveMaskExecutionPlan,
  type CanonicalImageJobRequest,
  type CanonicalMaskImage,
} from '../src/index.js';
import { buildChatImageRequest } from '../src/transport/chat-image/build-request.js';
import { buildGeminiGenerateContentRequest } from '../src/transport/gemini-generate-content/build-request.js';
import { buildImageEditHttpRequest, type OpenAIImageEditBody } from '../src/transport/image-endpoint/build-request.js';
import { mockRequestSchema } from '../src/providers/mock/request-schema.js';

function base64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

function decodeBase64(dataUrl: string): Uint8Array {
  const payload = dataUrl.slice(dataUrl.indexOf(';base64,') + ';base64,'.length);
  return new Uint8Array(Buffer.from(payload, 'base64'));
}

function pngFromCoverage(width: number, height: number, coverage: (index: number) => number): Uint8Array {
  const rgba = new Uint8Array(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    const value = coverage(index);
    const offset = index * 4;
    rgba[offset] = value;
    rgba[offset + 1] = value;
    rgba[offset + 2] = value;
    rgba[offset + 3] = 255;
  }
  return encodePng({ width, height, data: rgba, channels: 4, depth: 8 });
}

function canonicalMask(width = 3, height = 1, coverage = (index: number) => [0, 128, 255][index] ?? 0): CanonicalMaskImage {
  return {
    asset: {
      type: 'image',
      name: 'canonical-mask.png',
      mimeType: 'image/png',
      data: base64(pngFromCoverage(width, height, coverage)),
    },
    targetAttachmentId: 'primary',
    dimensions: { width, height },
    encoding: 'grayscale-png',
    bitDepth: 8,
    polarity: 'white-edit',
  };
}

function openAiEditRequest(maskImage: CanonicalMaskImage = canonicalMask()): CanonicalImageJobRequest {
  return {
    operation: 'image_edit',
    prompt: 'replace selected pixels',
    primaryAttachmentId: 'primary',
    images: [{ type: 'image', mimeType: 'image/png', data: base64(pngFromCoverage(3, 1, () => 0)) }],
    inputContext: { primaryEditInput: { width: 3, height: 1 } },
    capabilityModelId: 'gpt-image-2',
    model: { modelId: 'gpt-image-2', apiFormat: 'openai-images', requestStrategyId: 'image-endpoint-default' },
    maskImage,
    maskExecutionPlan: resolveMaskExecutionPlan({
      providerId: 'image-endpoint',
      capabilityModelId: 'gpt-image-2',
      hasReadyMask: true,
    }),
  };
}

describe('Mask execution planner', () => {
  it('uses only an exact native image-endpoint preset and fails closed for unknown OpenAI-compatible models', () => {
    expect(resolveMaskExecutionPlan({
      providerId: 'image-endpoint',
      capabilityModelId: 'gpt-image-2',
      hasReadyMask: true,
    })).toMatchObject({
      kind: 'provider-native',
      transport: 'image-endpoint',
      capability: {
        target: 'first-input',
        requiresSameDimensions: true,
        canonicalPolarity: 'white-edit',
        wirePolarity: 'alpha-zero-edit',
      },
    });
    expect(resolveMaskExecutionPlan({
      providerId: 'image-endpoint',
      capabilityModelId: 'third-party-openai-compatible',
      hasReadyMask: true,
    })).toEqual({ kind: 'unsupported', reason: 'no-explicit-raster-mask-capability' });
  });

  it('returns semantic-only for Gemini and chat-image transports, never native by model family', () => {
    expect(resolveMaskExecutionPlan({
      providerId: 'gemini-generate-content',
      capabilityModelId: 'gemini-3.1-flash-image',
      hasReadyMask: true,
    })).toMatchObject({ kind: 'semantic-only' });
    expect(resolveMaskExecutionPlan({
      providerId: 'chat-image',
      capabilityModelId: 'openai/gpt-image-2',
      hasReadyMask: true,
    })).toMatchObject({ kind: 'semantic-only' });
  });
});

describe('OpenAI native Mask preflight and conversion', () => {
  it('binds valid first-input Mask and converts white-edit grayscale to alpha-zero-edit PNG', () => {
    const built = buildImageEditHttpRequest(openAiEditRequest(), 'json-reference');
    const body = built.body as OpenAIImageEditBody;
    expect(body.images).toHaveLength(1);
    expect(body.mask?.image_url).toMatch(/^data:image\/png;base64,/);

    const decoded = decodePng(decodeBase64(body.mask!.image_url!));
    expect([decoded.width, decoded.height]).toEqual([3, 1]);
    const rgba = new Uint8Array(decoded.data.buffer, decoded.data.byteOffset, decoded.data.byteLength);
    expect([rgba[3], rgba[7], rgba[11]]).toEqual([255, 127, 0]);
    expect([rgba[0], rgba[1], rgba[2]]).toEqual([0, 0, 0]);
  });

  it('rejects non-primary targets and mismatched canonical dimensions without resize or crop', () => {
    expect(() => buildImageEditHttpRequest(openAiEditRequest({
      ...canonicalMask(),
      targetAttachmentId: 'reference',
    }), 'json-reference')).toThrow('Native Mask must target the primary input attachment.');

    expect(() => buildImageEditHttpRequest(openAiEditRequest(canonicalMask(1000, 1000)), 'json-reference'))
      .toThrow('Native Mask dimensions must exactly match the primary provider input.');
  });

  it('requires an explicit exact native plan and rejects forged capability facts', () => {
    const request = openAiEditRequest();
    expect(() => buildImageEditHttpRequest({ ...request, maskExecutionPlan: undefined }, 'json-reference'))
      .toThrow('Native Mask dispatch requires an admitted provider-native maskExecutionPlan.');
    expect(() => buildImageEditHttpRequest({
      ...request,
      maskExecutionPlan: {
        ...request.maskExecutionPlan!,
        capability: { ...request.maskExecutionPlan!.capability, maxBytes: 1 },
      },
    }, 'json-reference')).toThrow('Admitted native Mask plan does not match the selected model capability.');
  });

  it('rejects unplanned, non-primary, and different-dimension native Mask requests during provider validation', () => {
    const request = openAiEditRequest();
    expect(mockRequestSchema.safeParse({ ...request, maskExecutionPlan: undefined }).success).toBe(false);
    expect(mockRequestSchema.safeParse({ ...request, primaryAttachmentId: 'reference' }).success).toBe(false);
    expect(mockRequestSchema.safeParse({
      ...request,
      inputContext: { primaryEditInput: { width: 1000, height: 1000 } },
    }).success).toBe(false);
  });

  it('rejects converted PNGs that exceed the declared provider byte limit', () => {
    let state = 0x12345678;
    const randomCoverage = () => {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      return state & 0xff;
    };
    const size = 2048;
    const mask = canonicalMask(size, size, randomCoverage);
    const request: CanonicalImageJobRequest = {
      ...openAiEditRequest(mask),
      images: [{ type: 'image', mimeType: 'image/png', data: base64(pngFromCoverage(size, size, () => 0)) }],
      inputContext: { primaryEditInput: { width: size, height: size } },
    };
    expect(() => buildImageEditHttpRequest(request, 'json-reference'))
      .toThrow('Converted OpenAI native Mask exceeds the provider byte limit.');
  }, 30_000);
});

describe('Mask-less Gemini-compatible builders', () => {
  const mask = canonicalMask();
  const image = { type: 'image' as const, mimeType: 'image/png', data: base64(pngFromCoverage(3, 1, () => 0)) };

  it('omits canonical Mask from Gemini Generate Content parts', () => {
    const built = buildGeminiGenerateContentRequest({
      request: {
        operation: 'image_edit', prompt: 'edit', images: [image], maskImage: mask,
        capabilityModelId: 'gemini-3.1-flash-image',
        model: { modelId: 'gemini-3.1-flash-image', apiFormat: 'gemini-generate-content', requestStrategyId: 'gemini-generate-content-image-config' },
      },
    });
    expect(built.body.contents[0]?.parts).toHaveLength(2);
    expect(built.diagnostics.map((diagnostic) => diagnostic.code)).toContain('gemini-generate-content.request.mask-omitted');
  });

  it('omits canonical Mask from chat-image content and never adds Mask prompt text', () => {
    const built = buildChatImageRequest({
      operation: 'image_edit', prompt: 'edit', images: [image], maskImage: mask,
      capabilityModelId: 'openai/gpt-image-2',
      model: { modelId: 'openai/gpt-image-2', apiFormat: 'openai-chat-completions', requestStrategyId: 'chat-image-default' },
    });
    const content = built.body.messages[0]?.content;
    expect(Array.isArray(content) ? content.filter((part) => part.type === 'image_url') : []).toHaveLength(1);
    expect(JSON.stringify(content)).not.toContain('edit mask');
    expect(built.diagnostics.map((diagnostic) => diagnostic.code)).toContain('chat-image.request.mask-omitted');
  });
});
