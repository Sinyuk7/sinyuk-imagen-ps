import { describe, expect, it } from 'vitest';
import {
  chatImageConfigSchema,
  imageEndpointConfigSchema,
  mockConfigSchema,
} from '../src/index.js';

describe('provider config boundary', () => {
  it('keeps app-local provider input bucket fields out of provider config schemas', () => {
    const forbiddenKeys = [
      ['image', 'MaxSide'].join(''),
      ['provider', 'MaxSide'].join(''),
      ['provider', 'Input', 'Size', 'Preset'].join(''),
    ];
    for (const schema of [imageEndpointConfigSchema, chatImageConfigSchema, mockConfigSchema]) {
      const baseShape = (schema._def as { readonly schema?: { readonly shape?: Record<string, unknown> } }).schema?.shape;
      expect(Object.keys(baseShape ?? {})).not.toEqual(
        expect.arrayContaining(forbiddenKeys),
      );
    }
  });
});
