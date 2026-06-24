import { describe, expect, it } from 'vitest';
import {
  CHROME_PROVIDER_CAPABILITY_MATRIX,
  runChromeFeasibilityRuntime,
} from '../src/composition/chrome/chrome-feasibility-runtime';

describe('Chrome feasibility runtime', () => {
  it('initializes the application command path with a mock provider profile', async () => {
    const result = await runChromeFeasibilityRuntime();

    expect(result.runtime).toBe('chrome');
    expect(result.providerIds).toContain('mock');
    expect(result.providerIds).toContain('image-endpoint');
    expect(result.providerIds).toContain('chat-image');
    expect(result.generatedAssetCount).toBe(1);
  });

  it('freezes browser provider compatibility decisions for Slice 0', () => {
    expect(CHROME_PROVIDER_CAPABILITY_MATRIX).toEqual([
      expect.objectContaining({ family: 'mock', directBrowserSupport: 'supported' }),
      expect.objectContaining({ family: 'image-endpoint', directBrowserSupport: 'conditional' }),
      expect.objectContaining({ family: 'chat-image', directBrowserSupport: 'conditional' }),
    ]);
  });
});
