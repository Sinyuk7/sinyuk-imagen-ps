import type { ImageModelCapability } from '../../image-model-capability.js';
import { IMAGE_ENDPOINT_DEFAULT_STRATEGY } from '../strategies.js';

export const IMAGE_ENDPOINT_MODEL_CAPABILITIES = Object.freeze([
  {
    ruleId: 'image-endpoint-gpt-image-2',
    match: {
      ids: ['gpt-image-2', 'chatgpt-image-latest'],
    },
    displayName: 'GPT Image 2',
    brand: 'openai',
    selection: {
      visibleInPicker: true,
      allowAsDefault: true,
    },
    appliesToProviders: ['image-endpoint'],
    constraintStrategy: IMAGE_ENDPOINT_DEFAULT_STRATEGY,
  },
  {
    ruleId: 'image-endpoint-gpt-image-1',
    match: {
      ids: ['gpt-image-1'],
    },
    displayName: 'GPT Image 1',
    brand: 'openai',
    selection: {
      visibleInPicker: true,
      allowAsDefault: true,
    },
    appliesToProviders: ['image-endpoint'],
    variants: [
      { operation: 'text_to_image', preset: '1k', aspectRatio: 'auto', wireSize: '1024x1024' },
      { operation: 'text_to_image', preset: '1k', aspectRatio: '1:1', wireSize: '1024x1024' },
      { operation: 'text_to_image', preset: '2k', aspectRatio: '16:9', wireSize: '1536x1024' },
      { operation: 'text_to_image', preset: '2k', aspectRatio: '9:16', wireSize: '1024x1536' },
    ],
  },
  {
    ruleId: 'image-endpoint-dall-e-3',
    match: {
      ids: ['dall-e-3'],
    },
    displayName: 'DALL-E 3',
    brand: 'openai',
    selection: {
      visibleInPicker: true,
      allowAsDefault: true,
    },
    appliesToProviders: ['image-endpoint'],
    variants: [
      { operation: 'text_to_image', preset: '1k', aspectRatio: 'auto', wireSize: '1024x1024' },
      { operation: 'text_to_image', preset: '1k', aspectRatio: '1:1', wireSize: '1024x1024' },
      { operation: 'text_to_image', preset: '2k', aspectRatio: '16:9', wireSize: '1792x1024' },
      { operation: 'text_to_image', preset: '2k', aspectRatio: '9:16', wireSize: '1024x1792' },
    ],
  },
  {
    ruleId: 'image-endpoint-grok-imagine-image-pro',
    match: {
      ids: ['grok-imagine-image-pro', 'grok-imagine-image-quality'],
      prefixes: ['grok-imagine-image-pro', 'grok-imagine-image-quality'],
    },
    displayName: 'Grok Pro',
    brand: 'xai',
    selection: {
      visibleInPicker: true,
      allowAsDefault: true,
    },
    appliesToProviders: ['image-endpoint'],
    constraintStrategy: IMAGE_ENDPOINT_DEFAULT_STRATEGY,
  },
  {
    ruleId: 'image-endpoint-grok-imagine-image',
    match: {
      ids: ['grok-imagine-image'],
      prefixes: ['grok-imagine-image'],
    },
    displayName: 'Grok',
    brand: 'xai',
    selection: {
      visibleInPicker: true,
      allowAsDefault: true,
    },
    appliesToProviders: ['image-endpoint'],
    constraintStrategy: IMAGE_ENDPOINT_DEFAULT_STRATEGY,
  },
  {
    ruleId: 'image-endpoint-doubao-seedream-5-0-260128',
    match: {
      ids: ['doubao-seedream-5-0-260128'],
      prefixes: ['doubao-seedream-5-0-260128'],
    },
    displayName: 'Doubao Seedream 5.0 Lite',
    brand: 'doubao',
    selection: {
      visibleInPicker: true,
      allowAsDefault: true,
    },
    appliesToProviders: ['image-endpoint'],
    constraintStrategy: IMAGE_ENDPOINT_DEFAULT_STRATEGY,
  },
  {
    ruleId: 'image-endpoint-qwen-image-2.0-2026-03-03',
    match: {
      ids: ['qwen-image-2.0-2026-03-03'],
      prefixes: ['qwen-image-2.0-2026-03-03'],
    },
    displayName: 'Qwen Image 2.0',
    brand: 'qwen',
    selection: {
      visibleInPicker: true,
      allowAsDefault: true,
    },
    appliesToProviders: ['image-endpoint'],
    constraintStrategy: IMAGE_ENDPOINT_DEFAULT_STRATEGY,
  },
  {
    ruleId: 'image-endpoint-default',
    match: {},
    displayName: 'Default Image Endpoint Rule',
    selection: {
      visibleInPicker: false,
      allowAsDefault: true,
    },
    appliesToProviders: ['image-endpoint'],
    constraintStrategy: IMAGE_ENDPOINT_DEFAULT_STRATEGY,
  },
] as const satisfies readonly ImageModelCapability[]);
