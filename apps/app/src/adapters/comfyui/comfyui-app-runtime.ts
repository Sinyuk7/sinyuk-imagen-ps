import {
  createComfyUiGenerationBackend,
  createComfyUiManagementHostPorts,
  createComfyUiManagementService,
  getGenerationBackends,
  setComfyUiExecutionHostPorts,
  type ComfyUiExecutionHostPorts,
  type ComfyUiStateRepository,
  type ComfyUiWorkflowRuntimeCache,
  type ComfyUiWorkflowDraftStore,
} from '@imagen-ps/application';
import type { ExternalUrlPort } from '../../shared/ports/external-url';

type FrontendBridgeResolver = NonNullable<ComfyUiExecutionHostPorts['frontendBridgeResolver']>;

export interface ComfyUiAppRuntimeRepositories {
  readonly state: ComfyUiStateRepository;
  readonly cache: ComfyUiWorkflowRuntimeCache;
  readonly drafts: ComfyUiWorkflowDraftStore;
}

/** 组合 Application management、generation backend 与 host execution ports。 */
export function createComfyUiAppRuntime(options: {
  readonly repositories: ComfyUiAppRuntimeRepositories;
  readonly httpTransport: ComfyUiExecutionHostPorts['httpTransport'];
  readonly frontendBridgeResolver?: FrontendBridgeResolver;
  readonly externalUrl: ExternalUrlPort;
}) {
  const hostPorts = {
    httpTransport: options.httpTransport,
    ...(options.frontendBridgeResolver === undefined
      ? {}
      : { frontendBridgeResolver: options.frontendBridgeResolver }),
  } satisfies ComfyUiExecutionHostPorts;
  const managementHost = {
    ...createComfyUiManagementHostPorts(hostPorts),
    async open(baseUrl: string, identity: { readonly workflowId: string; readonly nativeWorkflowId?: string }): Promise<void> {
      const target = new URL(baseUrl);
      target.hash = identity.nativeWorkflowId ?? identity.workflowId;
      await options.externalUrl.open(target.href, 'Open workflow in ComfyUI');
    },
  };
  const management = createComfyUiManagementService({
    state: options.repositories.state,
    ports: managementHost,
    cache: options.repositories.cache,
    drafts: options.repositories.drafts,
  });
  const backend = createComfyUiGenerationBackend({
    runtime: {
      async getExecution(workflowId, revision) {
        const runtime = await management.selectWorkflow(workflowId);
        if (revision !== undefined && runtime.identity.revision !== revision) {
          throw new Error('ComfyUI workflow revision changed.');
        }
        const state = await management.loadState();
        if (!state?.baseUrl) throw new Error('ComfyUI server is not configured.');
        if (runtime.document.kind !== 'api') {
          return {
            connection: { baseUrl: state.baseUrl, requestTimeoutMs: 30_000, observationTimeoutMs: 300_000 },
            source: { kind: 'frontend-workflow', workflowId, revision: runtime.identity.revision, remotePath: runtime.identity.remotePath },
            prompt: undefined,
            images: [],
          } as never;
        }
        return {
          connection: { baseUrl: state.baseUrl, requestTimeoutMs: 30_000, observationTimeoutMs: 300_000 },
          source: { kind: 'api-graph', workflowId, revision: runtime.identity.revision, graph: runtime.document.graph },
          prompt: undefined,
          images: [],
        } as never;
      },
    },
  });
  setComfyUiExecutionHostPorts(hostPorts);
  let disposed = false;
  return {
    management,
    generationBackends: [...getGenerationBackends(), backend],
    dispose() {
      if (disposed) return;
      disposed = true;
      setComfyUiExecutionHostPorts(undefined);
    },
  };
}
