import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  ComfyUiConnectionResult,
  ComfyUiConnectionSnapshot,
  LoadedWorkflowRuntime,
  WorkflowIdentity,
  WorkflowInputRef,
  WorkflowMapping,
  WorkflowMappingProjection,
  WorkflowPrimitiveValue,
  ComfyUiMaskBinding,
} from '@imagen-ps/application';
import type { ComfyUiManagementPort } from '../../ports/comfyui-management';
import { deriveComfyUiConnectionUiState, type ComfyUiConnectionUiState } from './comfyui-connection-ui-state';

export interface ComfyUiManagementController {
  readonly baseUrl: string;
  readonly draftBaseUrl: string;
  readonly connectionSnapshot: ComfyUiConnectionSnapshot;
  readonly connectionUiState: ComfyUiConnectionUiState;
  readonly selectedWorkflowId: string | null;
  readonly loading: boolean;
  readonly busy: boolean;
  readonly error: string | null;
  readonly catalog: readonly WorkflowIdentity[];
  readonly runtime: LoadedWorkflowRuntime | undefined;
  readonly draftValues: Readonly<Record<string, WorkflowPrimitiveValue>>;
  readonly mappingProjection: WorkflowMappingProjection | undefined;
  readonly loadState: ComfyUiManagementPort['loadState'];
  readonly reload: () => Promise<void>;
  readonly selectWorkflow: (workflowId: string) => Promise<void>;
  readonly setDraftBaseUrl: (value: string) => void;
  readonly connect: () => Promise<ComfyUiConnectionResult | undefined>;
  readonly refresh: () => Promise<void>;
  readonly openInComfyUi: () => Promise<void>;
  readonly setParameter: (ref: WorkflowInputRef, value: WorkflowPrimitiveValue) => void;
  readonly setMapping: (kind: 'text' | 'image', value: WorkflowMapping) => Promise<void>;
  readonly setMaskBinding: (value: ComfyUiMaskBinding | undefined) => Promise<void>;
  readonly clearError: () => void;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null) {
    const value = error as { readonly message?: unknown; readonly details?: { readonly messageKey?: unknown } };
    if (typeof value.message === 'string') return value.message;
    if (typeof value.details?.messageKey === 'string') return value.details.messageKey;
  }
  return 'ComfyUI request failed.';
}

function refKey(ref: WorkflowInputRef): string {
  return `${ref.nodeId}\u0000${ref.inputName ?? ''}\u0000${ref.widgetIndex ?? ''}`;
}

/** 将 Application singleton management 投影为 UI controller。 */
export function useComfyUiManagement(service: ComfyUiManagementPort): ComfyUiManagementController {
  const [baseUrl, setBaseUrl] = useState('');
  const [draftBaseUrl, setDraftBaseUrlState] = useState('');
  const [connectionSnapshot, setConnectionSnapshot] = useState(() => service.getConnectionSnapshot());
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<readonly WorkflowIdentity[]>([]);
  const [runtime, setRuntime] = useState<LoadedWorkflowRuntime>();
  const [draftValues, setDraftValues] = useState<Readonly<Record<string, WorkflowPrimitiveValue>>>({});
  const [mappingProjection, setMappingProjection] = useState<WorkflowMappingProjection>();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sequence = useRef(0);
  const draftDirty = useRef(false);
  const connectionOwner = useRef<AbortController | undefined>(undefined);

  useEffect(() => service.subscribe(() => {
    setConnectionSnapshot(service.getConnectionSnapshot());
  }), [service]);

  const reload = useCallback(async () => {
    const token = ++sequence.current;
    setLoading(true);
    try {
      const state = await service.loadState();
      if (token !== sequence.current) return;
      setBaseUrl(state?.baseUrl ?? '');
      if (!draftDirty.current) setDraftBaseUrlState(state?.baseUrl ?? '');
      const found = state?.baseUrl ? await service.discover() : [];
      if (token !== sequence.current) return;
      setCatalog(found);
      if (state?.selectedWorkflowId && found.some((item) => item.workflowId === state.selectedWorkflowId)) {
        try {
          const selected = await service.selectWorkflow(state.selectedWorkflowId);
          if (token !== sequence.current) return;
          setSelectedWorkflowId(state.selectedWorkflowId);
          setRuntime(selected);
          setDraftValues(service.getDraft(selected.identity.workflowId, selected.identity.revision)?.values ?? {});
          setMappingProjection(service.getMappingProjection(selected));
        } catch (cause) {
          if (token !== sequence.current) return;
          setRuntime(undefined);
          setDraftValues({});
          setMappingProjection(undefined);
          throw cause;
        }
      } else {
        setSelectedWorkflowId(null);
        setRuntime(undefined);
        setDraftValues({});
        setMappingProjection(undefined);
      }
      setError(null);
    } catch (cause) {
      if (token === sequence.current) {
        setCatalog([]);
        setSelectedWorkflowId(null);
        setRuntime(undefined);
        setDraftValues({});
        setMappingProjection(undefined);
        setError(errorMessage(cause));
      }
    } finally {
      if (token === sequence.current) setLoading(false);
    }
  }, [service]);

  useEffect(() => {
    void reload();
    return () => {
      sequence.current += 1;
      connectionOwner.current?.abort();
      connectionOwner.current = undefined;
    };
  }, [reload]);

  const setDraftBaseUrl = useCallback((value: string) => {
    draftDirty.current = true;
    setDraftBaseUrlState(value);
    service.supersedeCurrentAttempt(value);
  }, [service]);

  const connectionUiState = useMemo(
    () => deriveComfyUiConnectionUiState(draftBaseUrl, connectionSnapshot),
    [connectionSnapshot, draftBaseUrl],
  );

  const connect = useCallback(async (): Promise<ComfyUiConnectionResult | undefined> => {
    const current = deriveComfyUiConnectionUiState(draftBaseUrl, service.getConnectionSnapshot());
    if (current.disabled) return undefined;
    const owner = new AbortController();
    connectionOwner.current?.abort();
    connectionOwner.current = owner;
    try {
      const result = await service.connect(draftBaseUrl, owner.signal);
      if (result.ok) {
        setBaseUrl(result.target.baseUrl);
        setSelectedWorkflowId(null);
        setCatalog([]);
        setRuntime(undefined);
        setDraftValues({});
        setMappingProjection(undefined);
        await reload();
      }
      return result;
    } finally {
      if (connectionOwner.current === owner) connectionOwner.current = undefined;
    }
  }, [draftBaseUrl, reload, service]);

  const mutate = useCallback(async <T,>(action: () => Promise<T>): Promise<T> => {
    setBusy(true);
    setError(null);
    try {
      const result = await action();
      await reload();
      return result;
    } catch (cause) {
      setError(errorMessage(cause));
      throw cause;
    } finally {
      setBusy(false);
    }
  }, [reload]);

  const selectWorkflow = useCallback(async (workflowId: string) => {
    await mutate(async () => {
      const next = await service.selectWorkflow(workflowId);
      setRuntime(next);
      setSelectedWorkflowId(workflowId);
      setDraftValues(service.getDraft(next.identity.workflowId, next.identity.revision)?.values ?? {});
      setMappingProjection(service.getMappingProjection(next));
    });
  }, [mutate, service]);

  return {
    baseUrl,
    draftBaseUrl,
    connectionSnapshot,
    connectionUiState,
    selectedWorkflowId,
    loading,
    busy,
    error,
    catalog,
    runtime,
    draftValues,
    mappingProjection,
    loadState: service.loadState.bind(service),
    reload,
    selectWorkflow,
    setDraftBaseUrl,
    connect,
    refresh: async () => {
      setRuntime(undefined);
      setDraftValues({});
      setMappingProjection(undefined);
      await mutate(async () => { await service.refresh(); });
    },
    openInComfyUi: async () => {
      setError(null);
      try {
        await service.openInComfyUi();
      } catch (cause) {
        setError(errorMessage(cause));
        throw cause;
      }
    },
    setParameter: (ref, value) => {
      if (!runtime) return;
      const values = { ...draftValues, [refKey(ref)]: value };
      setDraftValues(values);
      service.setDraft({ workflowId: runtime.identity.workflowId, revision: runtime.identity.revision, values });
    },
    setMapping: async (kind, value) => {
      if (!runtime) return;
      await service.setMapping(runtime.identity.workflowId, runtime.identity.revision, kind, value);
      setMappingProjection(service.getMappingProjection(runtime));
    },
    setMaskBinding: async (value) => {
      if (!runtime) return;
      await service.setMaskBinding(runtime.identity.workflowId, runtime.identity.revision, value);
      setMappingProjection(service.getMappingProjection(runtime));
    },
    clearError: () => setError(null),
  };
}
