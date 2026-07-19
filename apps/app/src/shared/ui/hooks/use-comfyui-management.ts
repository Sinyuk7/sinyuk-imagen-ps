import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  LoadedWorkflowRuntime,
  PersistedComfyUiState,
  WorkflowIdentity,
  WorkflowInputRef,
  WorkflowMapping,
  WorkflowMappingProjection,
  WorkflowPrimitiveValue,
} from '@imagen-ps/application';
import type { ComfyUiManagementPort } from '../../ports/comfyui-management';

export interface ComfyUiManagementController {
  readonly baseUrl: string;
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
  readonly saveBaseUrl: (value: string) => Promise<PersistedComfyUiState>;
  readonly refresh: () => Promise<void>;
  readonly openInComfyUi: () => Promise<void>;
  readonly setParameter: (ref: WorkflowInputRef, value: WorkflowPrimitiveValue) => void;
  readonly setMapping: (kind: 'text' | 'image', value: WorkflowMapping) => Promise<void>;
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
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<readonly WorkflowIdentity[]>([]);
  const [runtime, setRuntime] = useState<LoadedWorkflowRuntime>();
  const [draftValues, setDraftValues] = useState<Readonly<Record<string, WorkflowPrimitiveValue>>>({});
  const [mappingProjection, setMappingProjection] = useState<WorkflowMappingProjection>();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sequence = useRef(0);

  const reload = useCallback(async () => {
    const token = ++sequence.current;
    setLoading(true);
    try {
      const state = await service.loadState();
      if (token !== sequence.current) return;
      setBaseUrl(state?.baseUrl ?? '');
      setSelectedWorkflowId(state?.selectedWorkflowId ?? null);
      const found = state?.baseUrl ? await service.discover() : [];
      if (token !== sequence.current) return;
      setCatalog(found);
      if (state?.selectedWorkflowId && found.some((item) => item.workflowId === state.selectedWorkflowId)) {
        try {
          const selected = await service.selectWorkflow(state.selectedWorkflowId);
          setRuntime(selected);
          setDraftValues(service.getDraft(selected.identity.workflowId, selected.identity.revision)?.values ?? {});
          setMappingProjection(service.getMappingProjection(selected));
        } catch (cause) {
          setRuntime(undefined);
          setDraftValues({});
          setMappingProjection(undefined);
          throw cause;
        }
      } else {
        setRuntime(undefined);
        setDraftValues({});
        setMappingProjection(undefined);
      }
      setError(null);
    } catch (cause) {
      if (token === sequence.current) setError(errorMessage(cause));
    } finally {
      if (token === sequence.current) setLoading(false);
    }
  }, [service]);

  useEffect(() => {
    void reload();
    return () => { sequence.current += 1; };
  }, [reload]);

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
    saveBaseUrl: (value) => mutate(() => service.saveBaseUrl(value)),
    refresh: async () => { await mutate(async () => { await service.refresh(); }); },
    openInComfyUi: async () => { await service.openInComfyUi(); },
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
    clearError: () => setError(null),
  };
}
