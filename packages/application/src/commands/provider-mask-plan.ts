import {
  resolveMaskExecutionPlan,
  type ApiFormat,
  type MaskExecutionPlan,
} from '@imagen-ps/providers';
import { catalogProviderIdForApiFormat } from './api-format-profile.js';

/** 根据 selected Provider target 解析 ready Photoshop Mask 的执行路由。 */
export function resolveProviderMaskExecutionPlan(input: {
  readonly apiFormat: ApiFormat;
  readonly capabilityModelId: string;
  readonly hasReadyMask: boolean;
}): MaskExecutionPlan {
  return resolveMaskExecutionPlan({
    providerId: catalogProviderIdForApiFormat(input.apiFormat),
    capabilityModelId: input.capabilityModelId,
    hasReadyMask: input.hasReadyMask,
  });
}
