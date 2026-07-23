import {
  createComfyUiGenerationBackend,
  createComfyUiActiveRoutingResolver,
  createComfyUiManagementHostPorts,
  createComfyUiManagementService,
  getGenerationBackends,
  setComfyUiExecutionHostPorts,
  type ComfyUiExecutionHostPorts,
  type ComfyUiFrontendBridgeGenerationFactory,
  type ComfyUiStateRepository,
  type ComfyUiWorkflowRuntimeCache,
  type ComfyUiWorkflowDraftStore,
} from '@imagen-ps/application';
import type { ExternalUrlPort } from '../../shared/ports/external-url';

export interface ComfyUiAppRuntimeRepositories {
  readonly state: ComfyUiStateRepository;
  readonly cache: ComfyUiWorkflowRuntimeCache;
  readonly drafts: ComfyUiWorkflowDraftStore;
}

/** 组合 Application management、generation backend 与 host execution ports。 */
export function createComfyUiAppRuntime(options: {
  readonly repositories: ComfyUiAppRuntimeRepositories;
  readonly httpTransport: ComfyUiExecutionHostPorts['httpTransport'];
  readonly generationFactory: ComfyUiFrontendBridgeGenerationFactory;
  readonly externalUrl: ExternalUrlPort;
}) {
  const activeResolver = createComfyUiActiveRoutingResolver();
  const executionResolver = {
    resolve(
      workflowId: string,
      signal?: AbortSignal,
      affinity?: { readonly baseUrl: string; readonly token?: string },
    ) {
      const active = activeResolver.getActive();
      if (active === undefined) return Promise.resolve(undefined);
      if (affinity !== undefined && !executionResolver.matchesAffinity(affinity)) {
        throw new Error('invalid-connection');
      }
      return active.generation.resolve(workflowId, signal);
    },
    matchesAffinity(affinity: { readonly baseUrl: string; readonly token?: string }) {
      const active = activeResolver.getActive();
      return active !== undefined
        && active.target.baseUrl === affinity.baseUrl
        && (affinity.token === undefined || String(active.attemptId) === affinity.token);
    },
  } satisfies NonNullable<ComfyUiExecutionHostPorts['frontendBridgeResolver']>;
  const hostPorts = {
    httpTransport: options.httpTransport,
    frontendBridgeResolver: executionResolver,
  } satisfies ComfyUiExecutionHostPorts;
  const executionManagementHost = createComfyUiManagementHostPorts(hostPorts);
  const managementHost = {
    ...executionManagementHost,
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
    generationFactory: options.generationFactory,
    validateApi: executionManagementHost.validateApi,
    validateBridge: executionManagementHost.validateBridge,
    activeResolver,
  });
  const backend = createComfyUiGenerationBackend({
    runtime: {
      async getExecution(workflowId, revision) {
        await management.loadState();
        const admittedTarget = activeResolver.getActive();
        if (admittedTarget === undefined) throw new Error('ComfyUI server is not configured.');
        const targetAffinity = {
          baseUrl: admittedTarget.target.baseUrl,
          token: String(admittedTarget.attemptId),
        };
        const runtime = await management.selectWorkflow(workflowId);
        if (!executionResolver.matchesAffinity(targetAffinity)) {
          throw new Error('invalid-connection');
        }
        if (revision !== undefined && runtime.identity.revision !== revision) {
          throw new Error('ComfyUI workflow revision changed.');
        }
        const connection = {
          baseUrl: admittedTarget.target.baseUrl,
          requestTimeoutMs: admittedTarget.target.requestTimeoutMs,
          observationTimeoutMs: admittedTarget.target.observationTimeoutMs,
          targetAffinity,
        };
        if (runtime.document.kind !== 'api') {
          return {
            connection,
            source: { kind: 'frontend-workflow', workflowId, revision: runtime.identity.revision, remotePath: runtime.identity.remotePath },
            prompt: undefined,
            images: [],
          } as never;
        }
        return {
          connection,
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
      management.dispose();
      setComfyUiExecutionHostPorts(undefined);
    },
  };
}
