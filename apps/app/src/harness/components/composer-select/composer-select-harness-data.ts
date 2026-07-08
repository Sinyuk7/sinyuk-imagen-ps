import type { ComposerSelectOption } from '../../../shared/ui/components/composer-select';

export const MODEL_OPTIONS: readonly ComposerSelectOption[] = [
  { id: 'gpt-image-1', label: 'gpt-image-1' },
  { id: 'flux-kontext-max', label: 'Flux Kontext Max' },
  { id: 'imagen-4-ultra-long', label: 'Imagen Ultra Long Editorial Portrait Retouch And Scene Expansion Model v4' },
  { id: 'seedream-3.0', label: 'Seedream 3.0' },
  { id: 'qwen-image-edit', label: 'Qwen Image Edit' },
  { id: 'veo-shot-bridge', label: 'Veo Shot Bridge' },
  { id: 'fal-editorial-pro', label: 'Fal Editorial Pro' },
  { id: 'runway-reframe-xl', label: 'Runway Reframe XL' },
  { id: 'stability-concept', label: 'Stability Concept Blend' },
  { id: 'custom-ultra', label: 'Custom Fine Tuned Extremely Long Provider Model Name For Truncation Review' },
];

export const TARGET_OPTIONS: readonly ComposerSelectOption[] = [
  { id: 'layer', label: 'Layer', icon: 'ps-layers' },
  { id: 'selection', label: 'Selection', icon: 'selection' },
];

export const ASPECT_OPTIONS: readonly ComposerSelectOption[] = [
  { id: 'auto', label: 'Auto', icon: 'aspect-ratio' },
  { id: '1:1', label: '1:1' },
  { id: '4:5', label: '4:5' },
  { id: '16:9', label: '16:9' },
];
