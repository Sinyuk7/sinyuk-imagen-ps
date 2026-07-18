import type {
  BoundedApiWorkflow,
  ComfyUiExecutionAssetInput,
  ComfyUiWorkflowContract,
} from '@imagen-ps/execution-backend-comfyui';
import type { TaskRecord } from '../task.js';

/** ComfyUI connection 的最小持久化配置。 */
export interface ComfyUiConnection {
  readonly connectionId: string;
  readonly displayName: string;
  readonly origin: string;
  readonly requestTimeoutMs: number;
  readonly configureTimeoutMs: number;
  readonly observationTimeoutMs: number;
  readonly lastTest?: ComfyUiConnectionTestEvidence;
}

/** ComfyUI connection 保存命令的 caller 输入。 */
export interface ComfyUiConnectionDraft {
  readonly connectionId: string;
  readonly displayName: string;
  readonly origin: string;
  readonly requestTimeoutMs?: number;
  readonly configureTimeoutMs?: number;
  readonly observationTimeoutMs?: number;
}

/** Bridge handshake 的 bounded capability evidence。 */
export interface ComfyUiBridgeEvidence {
  readonly status: 'compatible' | 'incompatible' | 'unavailable';
  readonly protocolVersion?: number;
  readonly bridgeVersion?: string;
  readonly frontendVersion?: string;
  readonly coreVersion?: string;
  readonly contractSchemaVersion?: number;
  readonly contractSchemaDigest?: string;
  readonly nativeQueue?: boolean;
}

/** Connection test 的持久化安全摘要。 */
export interface ComfyUiConnectionTestEvidence {
  readonly checkedAt: string;
  readonly api: 'ready' | 'unavailable';
  readonly bridge?: ComfyUiBridgeEvidence;
}

/** ComfyUI workflow 的 source-specific 持久化配置。 */
export type ComfyUiWorkflowSource =
  | { readonly kind: 'api-graph'; readonly graph: BoundedApiWorkflow }
  | { readonly kind: 'frontend-workflow'; readonly remotePath: string };

/** Application-owned ComfyUI workflow record。 */
export interface ComfyUiWorkflowConfig {
  readonly workflowId: string;
  readonly displayName: string;
  readonly connectionId: string;
  readonly source: ComfyUiWorkflowSource;
  readonly contract: ComfyUiWorkflowContract;
}

/** Frontend discovery 返回的 canonical workflow identity。 */
export interface ComfyUiDiscoveredWorkflow {
  readonly displayName: string;
  readonly remotePath: string;
  readonly contract: ComfyUiWorkflowContract;
}

/** UI 可消费的 bounded workflow readiness。 */
export type ComfyUiWorkflowReadiness =
  | { readonly status: 'ready' }
  | { readonly status: 'not-ready'; readonly reason: 'connection' | 'api' | 'bridge' | 'workflow' };

/** ComfyUI connection repository port。 */
export interface ComfyUiConnectionRepository {
  list(): Promise<readonly ComfyUiConnection[]>;
  get(connectionId: string): Promise<ComfyUiConnection | undefined>;
  save(connection: ComfyUiConnection): Promise<void>;
  delete(connectionId: string): Promise<void>;
}

/** ComfyUI workflow repository port。 */
export interface ComfyUiWorkflowRepository {
  list(connectionId?: string): Promise<readonly ComfyUiWorkflowConfig[]>;
  get(workflowId: string): Promise<ComfyUiWorkflowConfig | undefined>;
  save(workflow: ComfyUiWorkflowConfig): Promise<void>;
  delete(workflowId: string): Promise<void>;
  deleteConnection(connectionId: string): Promise<void>;
}

/** Provider 与 ComfyUI 共用的最小 generation target selection。 */
export type GenerationTargetSelection =
  | { readonly kind: 'provider'; readonly profileId: string; readonly modelId?: string }
  | { readonly kind: 'comfyui'; readonly workflowId: string };

/** Generation target selection repository port。 */
export interface GenerationTargetSelectionRepository {
  get(): Promise<GenerationTargetSelection | undefined>;
  save(selection: GenerationTargetSelection): Promise<void>;
  clear(): Promise<void>;
}

/** Host-owned connection test port；Application 不执行 raw transport。 */
export interface ComfyUiConnectionTester {
  test(connection: ComfyUiConnection, signal?: AbortSignal): Promise<ComfyUiConnectionTestEvidence>;
}

/** Host-owned Frontend workflow discovery port。 */
export interface ComfyUiWorkflowDiscoveryPort {
  list(connection: ComfyUiConnection, signal?: AbortSignal): Promise<readonly ComfyUiDiscoveredWorkflow[]>;
}

/** ComfyUI backend admission 的 bounded payload。 */
export interface ComfyUiGenerationPayload {
  readonly workflowId: string;
  readonly prompt: string;
  readonly images: readonly ComfyUiExecutionAssetInput[];
  readonly mask?: ComfyUiExecutionAssetInput;
  readonly runningTask: TaskRecord;
}

/** ComfyUI repository 与 host capability 的组合 owner。 */
export interface ComfyUiManagementDependencies {
  readonly connections: ComfyUiConnectionRepository;
  readonly workflows: ComfyUiWorkflowRepository;
  readonly selection: GenerationTargetSelectionRepository;
  readonly tester: ComfyUiConnectionTester;
  readonly discovery: ComfyUiWorkflowDiscoveryPort;
}
