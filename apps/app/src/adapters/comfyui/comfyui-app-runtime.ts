import {
  createComfyUiGenerationBackend,
  createComfyUiManagementHostPorts,
  createComfyUiManagementService,
  getGenerationBackends,
  setComfyUiExecutionHostPorts,
  type ComfyUiConnectionRepository,
  type ComfyUiExecutionHostPorts,
  type ComfyUiWorkflowRepository,
  type GenerationTargetSelectionRepository,
} from '@imagen-ps/application';

type FrontendBridgeResolver = NonNullable<ComfyUiExecutionHostPorts['frontendBridgeResolver']>;

export interface ComfyUiAppRuntimeRepositories {
  readonly connections: ComfyUiConnectionRepository;
  readonly workflows: ComfyUiWorkflowRepository;
  readonly selection: GenerationTargetSelectionRepository;
}

/** 组合 Application management、generation backend 与 host execution ports。 */
export function createComfyUiAppRuntime(options: {
  readonly repositories: ComfyUiAppRuntimeRepositories;
  readonly httpTransport: ComfyUiExecutionHostPorts['httpTransport'];
  readonly frontendBridgeResolver?: FrontendBridgeResolver;
}) {
  const hostPorts = {
    httpTransport: options.httpTransport,
    ...(options.frontendBridgeResolver === undefined
      ? {}
      : { frontendBridgeResolver: options.frontendBridgeResolver }),
  } satisfies ComfyUiExecutionHostPorts;
  const managementHost = createComfyUiManagementHostPorts(hostPorts);
  const management = createComfyUiManagementService({
    ...options.repositories,
    tester: managementHost.tester,
    discovery: managementHost.discovery,
  });
  const backend = createComfyUiGenerationBackend({
    connections: options.repositories.connections,
    workflows: options.repositories.workflows,
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
