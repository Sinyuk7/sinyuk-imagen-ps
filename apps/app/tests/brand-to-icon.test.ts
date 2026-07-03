import { describe, expect, it, vi } from 'vitest';
import { resolveModelBrand, type ModelBrand } from '@imagen-ps/application';
import { BRAND_TO_ICON, brandToIconSlug, resolveModelAvatarIconSlug } from '../src/shared/ui/components/brand-to-icon';
import type { AppServices } from '../src/app-services/app-services';

function servicesWith(brand: ModelBrand | undefined): AppServices {
  return {
    commands: { resolveModelBrand: vi.fn(() => brand) },
  } as unknown as AppServices;
}

describe('BRAND_TO_ICON', () => {
  it('covers every ModelBrand variant', () => {
    const brands: readonly ModelBrand[] = [
      'openai',
      'google-gemini',
      'google-other',
      'xai',
      'qwen',
      'doubao',
    ];
    for (const brand of brands) {
      expect(BRAND_TO_ICON[brand], `brand ${brand} must map to an icon`).toBeDefined();
    }
  });
});

describe('brandToIconSlug', () => {
  it('maps each brand to its icon slug', () => {
    expect(brandToIconSlug('openai')).toBe('gpt');
    expect(brandToIconSlug('google-gemini')).toBe('nano-banana');
    expect(brandToIconSlug('google-other')).toBe('google');
    expect(brandToIconSlug('xai')).toBe('grok');
    expect(brandToIconSlug('qwen')).toBe('qwen');
    expect(brandToIconSlug('doubao')).toBe('doubao');
  });

  it('falls back to default for undefined brand', () => {
    expect(brandToIconSlug(undefined)).toBe('default');
  });
});

describe('resolveModelAvatarIconSlug', () => {
  it('returns default when providerId or modelId is missing', () => {
    const services = servicesWith('openai');
    expect(resolveModelAvatarIconSlug({ services })).toBe('default');
    expect(resolveModelAvatarIconSlug({ services, providerId: 'image-endpoint' })).toBe('default');
    expect(resolveModelAvatarIconSlug({ services, modelId: 'gpt-image-1' })).toBe('default');
  });

  it('maps the resolved brand to an icon slug', () => {
    expect(resolveModelAvatarIconSlug({ services: servicesWith('openai'), providerId: 'image-endpoint', modelId: 'gpt-image-1' })).toBe('gpt');
    expect(resolveModelAvatarIconSlug({ services: servicesWith('doubao'), providerId: 'image-endpoint', modelId: 'doubao-seedream-5-0-260128' })).toBe('doubao');
    expect(resolveModelAvatarIconSlug({ services: servicesWith('google-gemini'), providerId: 'chat-image', modelId: 'gemini-3-pro-image' })).toBe('nano-banana');
    expect(resolveModelAvatarIconSlug({ services: servicesWith(undefined), providerId: 'mock', modelId: 'mock-image-v1' })).toBe('default');
  });

  it('resolves real catalog models end-to-end via the application command', () => {
    const services: AppServices = {
      commands: { resolveModelBrand },
    } as unknown as AppServices;
    expect(resolveModelAvatarIconSlug({ services, providerId: 'image-endpoint', modelId: 'gpt-image-1' })).toBe('gpt');
    expect(resolveModelAvatarIconSlug({ services, providerId: 'image-endpoint', modelId: 'doubao-seedream-5-0-260128' })).toBe('doubao');
    expect(resolveModelAvatarIconSlug({ services, providerId: 'chat-image', modelId: 'gemini-3-pro-image' })).toBe('nano-banana');
    expect(resolveModelAvatarIconSlug({ services, providerId: 'mock', modelId: 'mock-image-v1' })).toBe('default');
    expect(resolveModelAvatarIconSlug({ services, providerId: 'image-endpoint', modelId: 'unknown-custom' })).toBe('default');
  });
});
