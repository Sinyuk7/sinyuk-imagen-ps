import {
  resolveMaskExecutionPlan,
  type FixedProviderId,
  type MaskExecutionPlan,
} from '@imagen-ps/providers';

/** 根据 selected Provider target 解析 ready Photoshop Mask 的执行路由。 */
export function resolveProviderMaskExecutionPlan(input: {
  readonly providerId: FixedProviderId;
  readonly capabilityModelId: string;
  readonly hasReadyMask: boolean;
}): MaskExecutionPlan {
  return resolveMaskExecutionPlan({
    providerId: input.providerId === 'grsai' ? 'grsai' : 'openai',
    capabilityModelId: input.capabilityModelId,
    hasReadyMask: input.hasReadyMask,
  });
}
