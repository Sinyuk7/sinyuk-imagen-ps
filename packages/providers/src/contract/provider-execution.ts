import type { ProviderId } from './provider-routing.js';
import type { ProviderModelExecution } from './request.js';
import { getProviderCatalogModel } from '../catalog.js';

/** Provider-native raster Mask 能力。 */
export interface MaskCapability {
  readonly canonicalEncoding: 'grayscale-png';
  readonly canonicalPolarity: 'white-edit';
  readonly target: 'first-input';
  readonly wireFormat: 'png';
  readonly wirePolarity: 'alpha-zero-edit';
  readonly requiresSameDimensions: true;
  readonly maxBytes: number;
}

export type MaskExecutionPlan =
  | { readonly kind: 'none' }
  | { readonly kind: 'provider-native'; readonly transport: 'openai'; readonly capability: MaskCapability }
  | { readonly kind: 'comfyui-separate-image-input'; readonly inputRef: string; readonly polarity: 'white-edit' | 'black-edit' }
  | { readonly kind: 'semantic-only'; readonly reason: string }
  | { readonly kind: 'unsupported'; readonly reason: string };

/** 从统一 JSON catalog 解析 Mask 执行边界。 */
export function resolveMaskExecutionPlan(args: {
  readonly providerId: 'openai' | 'google-gemini' | 'grsai';
  readonly capabilityModelId: string;
  readonly hasReadyMask: boolean;
}): MaskExecutionPlan {
  if (!args.hasReadyMask) return { kind: 'none' };
  const model = getProviderCatalogModel(args.providerId, args.capabilityModelId)
    ?? getProviderCatalogModel(args.providerId, args.capabilityModelId.replace(/^models\//, ''));
  if (!model?.input?.mask) {
    return args.providerId === 'google-gemini' || args.providerId === 'grsai'
      ? { kind: 'semantic-only', reason: 'transport-has-no-separate-raster-mask-field' }
      : { kind: 'unsupported', reason: 'selected-model-has-no-raster-mask-capability' };
  }
  if (args.providerId !== 'openai') return { kind: 'semantic-only', reason: 'transport-has-no-separate-raster-mask-field' };
  return {
    kind: 'provider-native',
    transport: 'openai',
    capability: {
      canonicalEncoding: 'grayscale-png', canonicalPolarity: 'white-edit', target: 'first-input',
      wireFormat: 'png', wirePolarity: 'alpha-zero-edit', requiresSameDimensions: true,
      maxBytes: 20 * 1024 * 1024,
    },
  };
}

/** 校验已解析的 Provider execution 只属于当前 Provider。 */
export function assertProviderModelExecution(args: {
  readonly execution: ProviderModelExecution | undefined;
  readonly providerId: ProviderId;
}): ProviderModelExecution {
  if (!args.execution) throw new Error('Provider request requires resolved model execution.');
  if (args.execution.providerId !== args.providerId) {
    throw new Error(`Provider execution providerId "${args.execution.providerId}" is not valid for providerId "${args.providerId}".`);
  }
  return args.execution;
}
