import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ComfyUiConnection,
  ComfyUiConnectionDraft,
  ComfyUiConnectionTestEvidence,
  ComfyUiDiscoveredWorkflow,
  ComfyUiWorkflowConfig,
  ComfyUiWorkflowReadiness,
  GenerationTargetSelection,
} from '@imagen-ps/application';
import type { ComfyUiManagementPort } from '../../ports/comfyui-management';

export type ComfyUiBackendMode = 'provider' | 'comfyui';

export interface ComfyUiManagementController {
  readonly connections: readonly ComfyUiConnection[];
  readonly workflows: readonly ComfyUiWorkflowConfig[];
  readonly selection: GenerationTargetSelection | undefined;
  readonly readiness: ReadonlyMap<string, ComfyUiWorkflowReadiness>;
  readonly backendMode: ComfyUiBackendMode;
  readonly loading: boolean;
  readonly busy: boolean;
  readonly error: string | null;
  readonly reload: () => Promise<void>;
  readonly selectBackend: (
    mode: ComfyUiBackendMode,
    providerTarget?: { readonly profileId: string; readonly modelId?: string },
  ) => Promise<void>;
  readonly selectWorkflow: (workflowId: string) => Promise<void>;
  readonly saveConnection: (draft: ComfyUiConnectionDraft) => Promise<ComfyUiConnection>;
  readonly deleteConnection: (connectionId: string) => Promise<void>;
  readonly testConnection: (connectionId: string) => Promise<ComfyUiConnectionTestEvidence>;
  readonly importApiGraphJson: (input: {
    readonly workflowId: string;
    readonly displayName: string;
    readonly connectionId: string;
    readonly json: string;
  }) => Promise<ComfyUiWorkflowConfig>;
  readonly discoverFrontendWorkflows: (connectionId: string) => Promise<readonly ComfyUiDiscoveredWorkflow[]>;
  readonly saveFrontendWorkflow: (input: {
    readonly workflowId: string;
    readonly displayName: string;
    readonly connectionId: string;
    readonly remotePath: string;
    readonly contract: ComfyUiWorkflowConfig['contract'];
  }) => Promise<ComfyUiWorkflowConfig>;
  readonly deleteWorkflow: (workflowId: string) => Promise<void>;
  readonly clearError: () => void;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** 只通过 Application management service 驱动 ComfyUI 设置状态。 */
export function useComfyUiManagement(service: ComfyUiManagementPort): ComfyUiManagementController {
  const [connections, setConnections] = useState<readonly ComfyUiConnection[]>([]);
  const [workflows, setWorkflows] = useState<readonly ComfyUiWorkflowConfig[]>([]);
  const [selection, setSelection] = useState<GenerationTargetSelection>();
  const [readiness, setReadiness] = useState<ReadonlyMap<string, ComfyUiWorkflowReadiness>>(new Map());
  const [backendMode, setBackendMode] = useState<ComfyUiBackendMode>('provider');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sequenceRef = useRef(0);
  const hydratedRef = useRef(false);

  const reload = useCallback(async (): Promise<void> => {
    const sequence = sequenceRef.current + 1;
    sequenceRef.current = sequence;
    setLoading(true);
    try {
      const [nextConnections, nextWorkflows, nextSelection] = await Promise.all([
        service.listConnections(),
        service.listWorkflows(),
        service.reconcileSelection(),
      ]);
      const readinessEntries = await Promise.all(nextWorkflows.map(async (workflow) => (
        [workflow.workflowId, await service.getWorkflowReadiness(workflow.workflowId)] as const
      )));
      if (sequenceRef.current !== sequence) {
        return;
      }
      setConnections(nextConnections);
      setWorkflows(nextWorkflows);
      setSelection(nextSelection);
      setReadiness(new Map(readinessEntries));
      if (nextSelection) {
        setBackendMode(nextSelection.kind);
      } else if (!hydratedRef.current) {
        setBackendMode('provider');
      }
      hydratedRef.current = true;
      setError(null);
    } catch (loadError) {
      if (sequenceRef.current === sequence) {
        setError(errorMessage(loadError));
      }
    } finally {
      if (sequenceRef.current === sequence) {
        setLoading(false);
      }
    }
  }, [service]);

  useEffect(() => {
    void reload();
    return () => {
      sequenceRef.current += 1;
    };
  }, [reload]);

  const mutate = useCallback(async <T,>(action: () => Promise<T>, refresh = true): Promise<T> => {
    setBusy(true);
    setError(null);
    try {
      const result = await action();
      if (refresh) {
        await reload();
      }
      return result;
    } catch (mutationError) {
      setError(errorMessage(mutationError));
      throw mutationError;
    } finally {
      setBusy(false);
    }
  }, [reload]);

  const selectBackend = useCallback(async (
    mode: ComfyUiBackendMode,
    providerTarget?: { readonly profileId: string; readonly modelId?: string },
  ): Promise<void> => {
    if (mode === backendMode) {
      return;
    }
    await mutate(async () => {
      if (mode === 'comfyui' || providerTarget === undefined) {
        await service.clearSelection();
        return;
      }
      await service.setSelection({ kind: 'provider', ...providerTarget });
    });
    setBackendMode(mode);
  }, [backendMode, mutate, service]);

  const selectWorkflow = useCallback(async (workflowId: string): Promise<void> => {
    await mutate(() => service.setSelection({ kind: 'comfyui', workflowId }));
    setBackendMode('comfyui');
  }, [mutate, service]);

  const saveConnection = useCallback((draft: ComfyUiConnectionDraft) => (
    mutate(() => service.saveConnection(draft))
  ), [mutate, service]);

  const deleteConnection = useCallback((connectionId: string) => (
    mutate(() => service.deleteConnection(connectionId))
  ), [mutate, service]);

  const testConnection = useCallback((connectionId: string) => (
    mutate(() => service.testConnection(connectionId))
  ), [mutate, service]);

  const importApiGraphJson = useCallback((input: {
    readonly workflowId: string;
    readonly displayName: string;
    readonly connectionId: string;
    readonly json: string;
  }) => mutate(() => service.importApiGraphJson(input)), [mutate, service]);

  const discoverFrontendWorkflows = useCallback((connectionId: string) => (
    mutate(() => service.discoverFrontendWorkflows(connectionId), false)
  ), [mutate, service]);

  const saveFrontendWorkflow = useCallback((input: {
    readonly workflowId: string;
    readonly displayName: string;
    readonly connectionId: string;
    readonly remotePath: string;
    readonly contract: ComfyUiWorkflowConfig['contract'];
  }) => mutate(() => service.saveFrontendWorkflow(input)), [mutate, service]);

  const deleteWorkflow = useCallback((workflowId: string) => (
    mutate(() => service.deleteWorkflow(workflowId))
  ), [mutate, service]);

  return {
    connections,
    workflows,
    selection,
    readiness,
    backendMode,
    loading,
    busy,
    error,
    reload,
    selectBackend,
    selectWorkflow,
    saveConnection,
    deleteConnection,
    testConnection,
    importApiGraphJson,
    discoverFrontendWorkflows,
    saveFrontendWorkflow,
    deleteWorkflow,
    clearError: () => setError(null),
  };
}
