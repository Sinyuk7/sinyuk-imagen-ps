import type {
  ComfyUiExecutionAssetInput as BackendComfyUiExecutionAssetInput,
  ComfyUiExecutionMaskInput as BackendComfyUiExecutionMaskInput,
  ComfyUiMaskBinding as BackendComfyUiMaskBinding,
} from '@imagen-ps/execution-backend-comfyui';
import type { TaskRecord } from '../task.js';

export interface WorkflowInputRef { readonly nodeId: string; readonly inputName?: string; readonly widgetIndex?: number; }
export type WorkflowPrimitiveValue = string | number | boolean;
export interface WorkflowFormWidgetRef { readonly ref: WorkflowInputRef; readonly kind: string; readonly label: string; readonly workflowValue?: WorkflowPrimitiveValue; readonly writable: boolean; readonly visible: boolean; readonly order: number; readonly options?: readonly string[]; readonly min?: number; readonly max?: number; readonly step?: number; }
export interface WorkflowFormNode { readonly nodeId: string; readonly title: string; readonly label: string; readonly order: number; readonly active: boolean; readonly visible: boolean; readonly widgets: readonly WorkflowFormWidgetRef[]; }
export interface WorkflowForm { readonly nodes: readonly WorkflowFormNode[]; }
export interface WorkflowInputCandidate { readonly ref: WorkflowInputRef; readonly kind: 'text' | 'image'; readonly label: string; readonly sectionLabel: string; readonly workflowValue?: WorkflowPrimitiveValue; }
export interface ComfyUiWorkflowValueMutation { readonly ref: WorkflowInputRef; readonly value: WorkflowPrimitiveValue; }
export type ComfyUiExecutionAssetInput = BackendComfyUiExecutionAssetInput;
export type ComfyUiMaskBinding = BackendComfyUiMaskBinding;
export type ComfyUiExecutionMaskInput = BackendComfyUiExecutionMaskInput;
export type BoundedComfyUiApiWorkflow = Readonly<Record<string, Readonly<Record<string, unknown>>>>;
export type BoundedComfyUiWorkflowDocument = { readonly kind: 'api'; readonly graph: BoundedComfyUiApiWorkflow } | { readonly kind: 'frontend'; readonly workflow: Readonly<Record<string, unknown>> };

/** ComfyUI settings 唯一 durable allowlist。 */
export interface PersistedComfyUiState {
  readonly baseUrl: string;
  readonly selectedWorkflowId: string | null;
  readonly ambiguousMappingsByRevision: Readonly<Record<string, Readonly<{
    readonly text?: WorkflowInputRef;
    readonly image?: WorkflowInputRef;
    readonly mask?: ComfyUiMaskBinding;
  }>>>;
}

/** Application code-owned runtime policy；不得进入 settings persistence。 */
export interface ComfyUiRuntimePolicy {
  readonly requestTimeoutMs: number;
  readonly workflowLoadTimeoutMs: number;
  readonly observationTimeoutMs: number;
  readonly maxDiscoveryEntries: number;
  readonly maxWorkflowBytes: number;
  readonly maxWorkflowNodes: number;
  readonly numericLocale?: string;
}

export const DEFAULT_COMFYUI_RUNTIME_POLICY: ComfyUiRuntimePolicy = Object.freeze({
  requestTimeoutMs: 30_000,
  workflowLoadTimeoutMs: 30_000,
  observationTimeoutMs: 300_000,
  maxDiscoveryEntries: 1_000,
  maxWorkflowBytes: 2_000_000,
  maxWorkflowNodes: 2_000,
});

/** 三类 capability facts；只驻留当前 runtime。 */
export interface ComfyUiServerCapabilities {
  readonly api: 'ready' | 'unavailable' | 'unknown';
  readonly frontend: 'ready' | 'unavailable' | 'unknown';
  readonly bridge: 'compatible' | 'incompatible' | 'unavailable' | 'unknown';
}

/** Discovery identity。未加载 document 时 revision 可为空。 */
export interface WorkflowIdentity {
  readonly workflowId: string;
  readonly displayName: string;
  readonly remotePath: string;
  readonly groupPath: readonly string[];
  readonly revision: string | null;
}

/** 已打开 remote document 的 identity；revision 必填。 */
export interface LoadedWorkflowIdentity extends Omit<WorkflowIdentity, 'revision'> {
  readonly revision: string;
}

/** 已选择 workflow 的 runtime-only document/driver representation。 */
export interface LoadedWorkflowRuntime {
  readonly identity: LoadedWorkflowIdentity;
  readonly document: BoundedComfyUiWorkflowDocument;
  readonly form?: WorkflowForm;
  readonly capabilities?: ComfyUiServerCapabilities;
}

/** Current workflow deferred open state。 */
export type WorkflowLoadState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading'; readonly workflowId: string; readonly requestId: string }
  | { readonly status: 'ready'; readonly runtime: LoadedWorkflowRuntime }
  | { readonly status: 'error'; readonly workflowId: string; readonly message: string };

/** Runtime-only Form draft, scoped by workflow revision. */
export interface WorkflowRuntimeDraft {
  readonly workflowId: string;
  readonly revision: string;
  readonly values: Readonly<Record<string, string | number | boolean>>;
}

/** Prompt/image mapping selection. `null` means explicit Do not map. */
export type WorkflowMapping = WorkflowInputRef | null;

/** Runtime composer input snapshot. */
export interface ComfyUiComposerInputs {
  readonly prompt?: string;
  readonly attachments?: readonly ComfyUiExecutionAssetInput[];
}

/** Generic runtime-facing execution intent. */
export interface ComfyUiExecutionIntent {
  readonly connection: {
    readonly baseUrl: string;
    readonly requestTimeoutMs: number;
    readonly observationTimeoutMs: number;
  };
  readonly source:
    | { readonly kind: 'api-graph'; readonly workflowId: string; readonly revision: string; readonly graph: BoundedComfyUiApiWorkflow; readonly objectInfo?: unknown }
    | { readonly kind: 'frontend-workflow'; readonly workflowId: string; readonly revision: string; readonly remotePath: string };
  readonly mutations?: readonly ComfyUiWorkflowValueMutation[];
  readonly imageInputRef?: WorkflowInputRef;
  readonly prompt?: string;
  readonly images: readonly ComfyUiExecutionAssetInput[];
  /** Primary-bound canonical Mask；由 explicit Workflow binding 消费。 */
  readonly mask?: ComfyUiExecutionMaskInput;
}

/** Public payload accepted by ComfyUI generation backend. */
export interface ComfyUiGenerationPayload {
  readonly workflowId: string;
  readonly prompt?: string;
  readonly images?: readonly ComfyUiExecutionAssetInput[];
  readonly runningTask: TaskRecord;
  readonly revision?: string;
  readonly formValues?: Readonly<Record<string, string | number | boolean>>;
  readonly mutations?: readonly ComfyUiWorkflowValueMutation[];
  readonly imageInputRef?: WorkflowInputRef;
  /** Primary-bound canonical Mask；只可来自 immutable Task snapshot。 */
  readonly mask?: ComfyUiExecutionMaskInput;
}

/** Runtime ports used by management service; all documents stay in memory. */
export interface ComfyUiRuntimePorts {
  readonly probe?: (baseUrl: string, signal?: AbortSignal) => Promise<ComfyUiServerCapabilities>;
  readonly discover: (baseUrl: string, signal?: AbortSignal) => Promise<readonly (Omit<WorkflowIdentity, 'groupPath'> & { readonly groupPath?: readonly string[] })[]>;
  readonly load: (baseUrl: string, identity: WorkflowIdentity, signal?: AbortSignal) => Promise<LoadedWorkflowRuntime>;
  readonly open?: (baseUrl: string, identity: LoadedWorkflowIdentity, signal?: AbortSignal) => Promise<void>;
}

/** Durable state repository. Implementations MUST reject extra fields. */
export interface ComfyUiStateRepository {
  load(): Promise<PersistedComfyUiState | undefined>;
  save(state: PersistedComfyUiState): Promise<void>;
  clear(): Promise<void>;
}

/** Runtime-only selected workflow cache. */
export interface ComfyUiWorkflowRuntimeCache {
  get(workflowId: string, revision?: string): LoadedWorkflowRuntime | undefined;
  set(runtime: LoadedWorkflowRuntime): void;
  invalidate(workflowId?: string): void;
  clear(): void;
}

/** Runtime-only revision-scoped form drafts. */
export interface ComfyUiWorkflowDraftStore {
  get(workflowId: string, revision: string): WorkflowRuntimeDraft | undefined;
  set(draft: WorkflowRuntimeDraft): void;
  invalidate(workflowId?: string, revision?: string): void;
  clear(): void;
}

/** Runtime candidate projection used by settings and send composer. */
export interface WorkflowMappingProjection {
  readonly textCandidates: readonly WorkflowInputCandidate[];
  readonly imageCandidates: readonly WorkflowInputCandidate[];
  readonly maskCandidates: readonly WorkflowInputCandidate[];
  readonly text: { readonly resolved: WorkflowMapping; readonly notice?: string; readonly ambiguous: boolean };
  readonly image: { readonly resolved: WorkflowMapping; readonly notice?: string; readonly ambiguous: boolean };
  /** Mask 不自动映射；只有显式保存的当前 revision binding 可用。 */
  readonly mask: { readonly binding?: ComfyUiMaskBinding; readonly requiresExplicitSelection: boolean };
  readonly showSection: boolean;
}
