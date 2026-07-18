import {
  type ComfyUiWorkflowContract,
} from '@imagen-ps/execution-backend-comfyui';
import { createValidationError, type JobError } from '@imagen-ps/core-engine';

/** 当前 ComfyUI runtime 不支持 mask-entry workflow。 */
export function hasComfyUiMaskEntry(contract: ComfyUiWorkflowContract): boolean {
  return contract.entries.some((entry) => entry.role === 'mask');
}

/** 构造稳定的 image-only workflow readiness 错误。 */
export function createComfyUiWorkflowNotReadyError(): JobError {
  return createValidationError('ComfyUI mask workflows are not ready in this runtime.', {
    code: 'not-ready/workflow',
  });
}

/** 在任何 execution side effect 前阻断 mask-entry workflow。 */
export function assertComfyUiImageOnlyWorkflow(contract: ComfyUiWorkflowContract): void {
  if (hasComfyUiMaskEntry(contract)) {
    throw createComfyUiWorkflowNotReadyError();
  }
}
