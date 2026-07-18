/** Workflow contract 支持的角色。 */
export type ContractRole = 'prompt' | 'image' | 'mask' | 'output-image';

/** Workflow contract 支持的数据类型。 */
export type ContractDataType = 'text' | 'image' | 'mask';

/** Mask 上传前使用的显式编码。 */
export type ContractMaskEncoding = 'grayscale' | 'alpha' | 'inverted-alpha';

/** Workflow contract 支持的生成操作。 */
export type ContractOperation = 'text-to-image' | 'image-edit';

/** Contract role 与连续 slot 组成的稳定键。 */
export interface ContractKey {
  readonly role: ContractRole;
  readonly slot: number;
}

/** API input 或 Canvas widget 的统一定位符。 */
export interface ContractLocator {
  readonly nodeId: string;
  readonly fieldName: string;
}

/** Binding contract 中的单个 locator 声明。 */
export interface BindingContractEntry extends ContractKey {
  readonly locator: ContractLocator;
}

/** Type contract 中的单个类型声明。 */
export interface TypeContractEntry extends ContractKey {
  readonly required: boolean;
  readonly dataType: ContractDataType;
  readonly maskEncoding?: ContractMaskEncoding;
}

/** `ImagenWorkflowBindingContract` V1 文档。 */
export interface ImagenWorkflowBindingContract {
  readonly schemaVersion: 1;
  readonly bindings: readonly BindingContractEntry[];
}

/** `ImagenWorkflowTypeContract` V1 文档。 */
export interface ImagenWorkflowTypeContract {
  readonly schemaVersion: 1;
  readonly operation: ContractOperation;
  readonly entries: readonly TypeContractEntry[];
}

/** 合并并验证后的 canonical contract entry。 */
export interface ComfyUiWorkflowContractEntry extends BindingContractEntry, TypeContractEntry {}

/** 所有 consumers 唯一可使用的 canonical workflow contract。 */
export interface ComfyUiWorkflowContract {
  readonly schemaVersion: 1;
  readonly operation: ContractOperation;
  readonly entries: readonly ComfyUiWorkflowContractEntry[];
}

/** Authoritative contract validator 的 bounded error code。 */
export type ComfyUiContractErrorCode =
  | 'malformed-schema'
  | 'malformed'
  | 'oversized'
  | 'unsupported-version'
  | 'invalid-operation'
  | 'invalid-cardinality'
  | 'duplicate-key'
  | 'key-mismatch'
  | 'invalid-type'
  | 'invalid-encoding';

/** Authoritative contract validator 的安全错误。 */
export class ComfyUiContractValidationError extends Error {
  readonly code: ComfyUiContractErrorCode;
  readonly messageKey: string;

  constructor(code: ComfyUiContractErrorCode, messageKey = `contract.${code}`) {
    super('ComfyUI workflow contract is invalid.');
    this.name = 'ComfyUiContractValidationError';
    this.code = code;
    this.messageKey = messageKey;
  }
}
