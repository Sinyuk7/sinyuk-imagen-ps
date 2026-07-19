import {
  createComfyUiManagementHost as createExecutionComfyUiManagementHost,
  type ComfyUiManagementHostConnection,
  type CreateComfyUiManagementHostOptions,
} from '@imagen-ps/execution-backend-comfyui';
import type {
  ComfyUiRuntimePorts,
  ComfyUiServerCapabilities,
  LoadedWorkflowRuntime,
  WorkflowIdentity,
  WorkflowForm,
} from './types.js';
import { createComfyUiBridgeHandshakeRequest, validateComfyUiBridgeHandshake } from '@imagen-ps/execution-backend-comfyui';

export interface CreateComfyUiManagementHostPortsOptions extends CreateComfyUiManagementHostOptions {
  readonly now?: () => Date;
}

function connection(baseUrl: string): ComfyUiManagementHostConnection {
  return { baseUrl, requestTimeoutMs: 30_000, observationTimeoutMs: 300_000 };
}

/** 将 execution host 的 bounded facts 映射为 Application runtime ports。 */
export function createComfyUiManagementHostPorts(
  options: CreateComfyUiManagementHostPortsOptions,
): ComfyUiRuntimePorts {
  const host = createExecutionComfyUiManagementHost({
    httpTransport: options.httpTransport,
    ...(options.frontendBridgeResolver === undefined ? {} : { frontendBridgeResolver: options.frontendBridgeResolver }),
  });
  return {
    async probe(baseUrl, signal): Promise<ComfyUiServerCapabilities> {
      const evidence = await host.testConnection(connection(baseUrl), signal);
      return {
        api: evidence.api,
        frontend: evidence.frontend,
        bridge: evidence.bridge.status,
      };
    },
    async discover(baseUrl, signal): Promise<readonly WorkflowIdentity[]> {
      const workflows = await host.discoverFrontendWorkflows(connection(baseUrl), signal);
      return workflows.map((workflow) => ({
        workflowId: workflow.workflowId,
        displayName: workflow.displayName,
        remotePath: workflow.remotePath,
        groupPath: workflow.remotePath.split('/').slice(0, -1),
        revision: workflow.revision,
      }));
    },
    async load(_baseUrl, identity, signal): Promise<LoadedWorkflowRuntime> {
      const bridge = options.frontendBridgeResolver === undefined
        ? undefined
        : await options.frontendBridgeResolver.resolve(identity.workflowId);
      if (bridge === undefined) throw new Error('ComfyUI Bridge is unavailable.');
      const handshake = createComfyUiBridgeHandshakeRequest(bridge.identity, `management-handshake-${Date.now()}`);
      validateComfyUiBridgeHandshake(await bridge.exchange(handshake, signal), handshake.requestId, bridge.identity);
      const openRequest = {
        requestId: `management-open-${Date.now()}`,
        identity: bridge.identity,
        command: 'open-workflow' as const,
        payload: { workflowId: identity.workflowId, revision: identity.revision ?? 'remote', remotePath: identity.remotePath },
      };
      const opened = await bridge.exchange(openRequest, signal);
      if (!isRecord(opened) || opened.ok !== true) throw new Error('ComfyUI workflow could not be opened.');
      const formRequest = {
        requestId: `management-form-${Date.now()}`,
        identity: bridge.identity,
        command: 'form-values' as const,
        payload: { workflowId: identity.workflowId, revision: identity.revision ?? 'remote' },
      };
      const values = await bridge.exchange(formRequest, signal);
      const form = parseBridgeForm(values);
      return {
        identity: { ...identity, revision: identity.revision ?? 'remote' },
        document: { kind: 'frontend', workflow: { nodes: form.nodes } },
        form,
      };
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function primitive(value: unknown): value is string | number | boolean {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

function parseBridgeForm(value: unknown): WorkflowForm {
  if (!isRecord(value) || value.ok !== true || !isRecord(value.payload) || !isRecord(value.payload.values) || !Array.isArray(value.payload.values.nodes)) throw new Error('ComfyUI Bridge returned an invalid Form.');
  const nodes = value.payload.values.nodes;
  if (nodes.length > 2_000) throw new Error('ComfyUI Bridge Form exceeded bounds.');
  return {
    nodes: nodes.map((node) => {
      if (!isRecord(node) || typeof node.nodeId !== 'string' || typeof node.title !== 'string' || typeof node.label !== 'string' || !Number.isInteger(node.order) || typeof node.active !== 'boolean' || typeof node.visible !== 'boolean' || !Array.isArray(node.widgets) || node.widgets.length > 256) throw new Error('ComfyUI Bridge returned an invalid Form node.');
      return {
        nodeId: node.nodeId,
        title: node.title,
        label: node.label,
        order: Number(node.order),
        active: node.active,
        visible: node.visible,
        widgets: node.widgets.map((widget) => {
          if (!isRecord(widget) || !isRecord(widget.ref) || typeof widget.ref.nodeId !== 'string' || (typeof widget.ref.inputName !== 'string' && !Number.isInteger(widget.ref.widgetIndex)) || typeof widget.kind !== 'string' || typeof widget.label !== 'string' || typeof widget.writable !== 'boolean' || typeof widget.visible !== 'boolean' || !Number.isInteger(widget.order)) throw new Error('ComfyUI Bridge returned an invalid Form widget.');
          const ref = typeof widget.ref.inputName === 'string'
            ? { nodeId: widget.ref.nodeId, inputName: widget.ref.inputName }
            : { nodeId: widget.ref.nodeId, widgetIndex: Number(widget.ref.widgetIndex) };
          return {
            ref,
            kind: widget.kind,
            label: widget.label,
            ...(primitive(widget.workflowValue) ? { workflowValue: widget.workflowValue } : {}),
            writable: widget.writable,
            visible: widget.visible,
            order: Number(widget.order),
            ...(Array.isArray(widget.options) ? { options: widget.options.filter((item): item is string => typeof item === 'string').slice(0, 512) } : {}),
            ...(typeof widget.min === 'number' ? { min: widget.min } : {}),
            ...(typeof widget.max === 'number' ? { max: widget.max } : {}),
            ...(typeof widget.step === 'number' ? { step: widget.step } : {}),
          };
        }),
      };
    }),
  };
}
