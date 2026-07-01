import { describe, expect, it } from 'vitest';
import { resolveModelAvatarIcon } from '../src/shared/ui/components/model-avatar-rules';

describe('model avatar rules', () => {
  it('matches mock provider before model rules', () => {
    expect(resolveModelAvatarIcon({
      providerId: 'mock',
      providerName: 'Mock Provider',
      modelId: 'gpt-4o-mini',
    })).toBe('debug-mock');
  });

  it('matches nano banana on banana and gemini fragments', () => {
    expect(resolveModelAvatarIcon({ modelId: 'nano-banana-preview' })).toBe('nano-banana');
    expect(resolveModelAvatarIcon({ modelId: 'gemini-2.5-flash-image' })).toBe('nano-banana');
  });

  it('matches gpt case-insensitively', () => {
    expect(resolveModelAvatarIcon({ modelId: 'GPT-IMAGE-1' })).toBe('gpt');
  });

  it('falls back to default when nothing matches', () => {
    expect(resolveModelAvatarIcon({ modelId: 'mystery-model-v1' })).toBe('default');
  });
});
