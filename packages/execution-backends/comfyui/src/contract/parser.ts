import {
  bridgeCompatibility,
  contractManifest,
  workflowContractSchema,
} from '../../contract/canonical-data.mjs';
import {
  validateCanonicalWorkflowContract,
  validateWorkflowContractDocuments,
} from '../../contract/runtime-validator.mjs';
import { deepFreeze } from '../internal/value.js';
import {
  ComfyUiContractValidationError,
  type ComfyUiContractErrorCode,
  type ComfyUiWorkflowContract,
  type ImagenWorkflowBindingContract,
  type ImagenWorkflowTypeContract,
} from './types.js';

/** Binding contract node 的 stable class id。 */
export const IMAGEN_WORKFLOW_BINDING_CLASS_ID = 'ImagenWorkflowBindingContract';

/** Type contract node 的 stable class id。 */
export const IMAGEN_WORKFLOW_TYPE_CLASS_ID = 'ImagenWorkflowTypeContract';

/** Canonical contract schema version。 */
export const COMFYUI_CONTRACT_SCHEMA_VERSION = 1;

/** Canonical contract schema 的 exact SHA-256。 */
export const COMFYUI_CONTRACT_SCHEMA_SHA256 = contractManifest.schemaSha256;

/** Browser、Python 与 TypeScript 共用的 canonical JSON schema。 */
export const COMFYUI_WORKFLOW_CONTRACT_SCHEMA: Readonly<Record<string, unknown>> = deepFreeze(
  workflowContractSchema as Record<string, unknown>,
);

/** Pinned Bridge/frontend/core/contract compatibility tuple。 */
export const COMFYUI_BRIDGE_COMPATIBILITY = deepFreeze({ ...bridgeCompatibility });

interface RuntimeValidationSuccess {
  readonly ok: true;
  readonly value: ComfyUiWorkflowContract;
}

interface RuntimeValidationFailure {
  readonly ok: false;
  readonly error: {
    readonly code: ComfyUiContractErrorCode;
    readonly messageKey: string;
  };
}

type RuntimeValidationResult = RuntimeValidationSuccess | RuntimeValidationFailure;

function unwrap(result: RuntimeValidationResult): ComfyUiWorkflowContract {
  if (!result.ok) throw new ComfyUiContractValidationError(result.error.code, result.error.messageKey);
  return deepFreeze(result.value);
}

/** 两个 node 文档合并为唯一 canonical workflow contract。 */
export function parseComfyUiWorkflowContract(
  binding: ImagenWorkflowBindingContract | string | unknown,
  type: ImagenWorkflowTypeContract | string | unknown,
): ComfyUiWorkflowContract {
  return unwrap(validateWorkflowContractDocuments(
    binding,
    type,
    COMFYUI_WORKFLOW_CONTRACT_SCHEMA,
  ) as RuntimeValidationResult);
}

/** 验证并重新冻结跨 package 传入的 canonical contract。 */
export function validateCanonicalComfyUiWorkflowContract(value: unknown): ComfyUiWorkflowContract {
  return unwrap(validateCanonicalWorkflowContract(
    value,
    COMFYUI_WORKFLOW_CONTRACT_SCHEMA,
  ) as RuntimeValidationResult);
}

/** 断言跨 package 值是 canonical workflow contract。 */
export function assertComfyUiWorkflowContract(value: unknown): asserts value is ComfyUiWorkflowContract {
  validateCanonicalComfyUiWorkflowContract(value);
}
