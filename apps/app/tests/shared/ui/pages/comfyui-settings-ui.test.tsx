import { act } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { createFakeServices } from '../../../helpers/fakes';
import {
  fakeComfyUiConnection,
  fakeComfyUiWorkflow,
} from '../../../helpers/harness/comfyui-management.fake';
import {
  changeTextarea,
  cleanupMainPageRoot,
  flush,
  renderMainPage,
} from '../../../helpers/main-page-harness';

const API_GRAPH_JSON = JSON.stringify({
  binding: {
    class_type: 'ImagenWorkflowBindingContract',
    inputs: {
      contract: {
        schemaVersion: 1,
        bindings: [
          { role: 'prompt', slot: 0, locator: { nodeId: 'prompt', fieldName: 'text' } },
          { role: 'output-image', slot: 0, locator: { nodeId: 'output', fieldName: 'images' } },
        ],
      },
    },
  },
  type: {
    class_type: 'ImagenWorkflowTypeContract',
    inputs: {
      contract: {
        schemaVersion: 1,
        operation: 'text-to-image',
        entries: [
          { role: 'prompt', slot: 0, required: true, dataType: 'text' },
          { role: 'output-image', slot: 0, required: true, dataType: 'image' },
        ],
      },
    },
  },
  prompt: { class_type: 'Prompt', inputs: { text: '' } },
  output: { class_type: 'Output', inputs: { images: '' } },
});

async function settle(): Promise<void> {
  await flush();
  await flush();
  await flush();
}

async function openSettings(container: HTMLElement): Promise<void> {
  await act(async () => {
    container.querySelector<HTMLElement>('[data-testid="main-providers-button"]')?.click();
  });
  await settle();
}

async function openComfyUiSettings(container: HTMLElement): Promise<void> {
  await act(async () => {
    container.querySelector<HTMLElement>('[data-testid="settings-backend-comfyui"]')?.click();
  });
  await settle();
}

function changeInput(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'x' }));
}

describe('ComfyUI settings UI', () => {
  afterEach(async () => {
    await cleanupMainPageRoot();
    document.body.innerHTML = '';
  });

  it('routes through the existing Settings surface and keeps workflow selection explicit', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const fake = createFakeServices({
      generationSettings: { settingsOnboardingSeenVersion: 1 },
      comfyUi: {
        connections: [fakeComfyUiConnection],
        workflows: [fakeComfyUiWorkflow],
        selection: { kind: 'provider', profileId: 'profile-a', modelId: 'model-a' },
      },
    });
    await renderMainPage(container, fake);

    await openSettings(container);
    expect(container.querySelector('[data-testid="provider-row-mock-profile"]')).not.toBeNull();

    await openComfyUiSettings(container);
    expect(container.querySelector('[data-testid="provider-row-mock-profile"]')).toBeNull();
    expect(container.querySelector(`[data-testid="comfyui-connection-row-${fakeComfyUiConnection.connectionId}"]`)).not.toBeNull();
    await expect(fake.services.comfyUi.reconcileSelection()).resolves.toBeUndefined();

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="comfyui-workflow-target-selector"]')?.click();
    });
    await settle();
    await act(async () => {
      document.querySelector<HTMLElement>(`[data-testid="comfyui-workflow-target-selector-option-${fakeComfyUiWorkflow.workflowId}"]`)?.click();
    });
    await settle();
    await expect(fake.services.comfyUi.reconcileSelection()).resolves.toEqual({
      kind: 'comfyui',
      workflowId: fakeComfyUiWorkflow.workflowId,
    });

    await act(async () => {
      container.querySelector<HTMLElement>(`[data-testid="comfyui-connection-row-${fakeComfyUiConnection.connectionId}"]`)?.click();
    });
    await settle();
    expect(container.querySelector('[data-testid="comfyui-connection-save-button"]')).not.toBeNull();

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="comfyui-test-connection-button"]')?.click();
    });
    await settle();
    expect(fake.spies.testConnection).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[data-testid="comfyui-connection-test-status"]')?.textContent).toContain('API');

    await act(async () => {
      changeInput(container.querySelector<HTMLInputElement>('[data-testid="comfyui-connection-name"]')!, 'Edited ComfyUI');
      changeInput(container.querySelector<HTMLInputElement>('[data-testid="comfyui-connection-origin"]')!, 'https://edited.example.test');
    });
    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="comfyui-connection-save-button"]')?.click();
    });
    await settle();
    await expect(fake.services.comfyUi.getConnection(fakeComfyUiConnection.connectionId)).resolves.toMatchObject({
      displayName: 'Edited ComfyUI',
      origin: 'https://edited.example.test',
    });

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="comfyui-connection-delete-button"]')?.click();
    });
    await settle();
    expect(container.querySelector('[data-testid="settings-backend-comfyui"]')).not.toBeNull();
    await expect(fake.services.comfyUi.listConnections()).resolves.toEqual([]);
    await expect(fake.services.comfyUi.reconcileSelection()).resolves.toBeUndefined();
  });

  it('imports API Graph JSON and saves Frontend discovery without auto-selecting it', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const fake = createFakeServices({
      generationSettings: { settingsOnboardingSeenVersion: 1 },
      comfyUi: { connections: [fakeComfyUiConnection] },
    });
    await renderMainPage(container, fake);

    await openSettings(container);
    await openComfyUiSettings(container);
    await act(async () => {
      container.querySelector<HTMLElement>(`[data-testid="comfyui-connection-row-${fakeComfyUiConnection.connectionId}"]`)?.click();
    });
    await settle();

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="comfyui-api-import-open-button"]')?.click();
    });
    await act(async () => {
      changeInput(container.querySelector<HTMLInputElement>('[data-testid="comfyui-api-workflow-name"]')!, 'Imported API');
      changeTextarea(container.querySelector<HTMLTextAreaElement>('[data-testid="comfyui-api-graph-json"]')!, API_GRAPH_JSON);
    });
    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="comfyui-api-import-button"]')?.click();
    });
    await settle();

    const [imported] = await fake.services.comfyUi.listWorkflows();
    expect(imported).toMatchObject({ displayName: 'Imported API', source: { kind: 'api-graph' } });
    expect(container.querySelector(`[data-testid="comfyui-workflow-row-${imported!.workflowId}"]`)).not.toBeNull();

    await act(async () => {
      container.querySelector<HTMLElement>(`[data-testid="comfyui-workflow-row-${imported!.workflowId}"]`)?.click();
    });
    await settle();
    await expect(fake.services.comfyUi.reconcileSelection()).resolves.toEqual({
      kind: 'comfyui',
      workflowId: imported!.workflowId,
    });

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="comfyui-frontend-discover-button"]')?.click();
    });
    await settle();
    expect(fake.spies.discoverFrontendWorkflows).toHaveBeenCalledTimes(1);
    const discoveredRow = container.querySelector<HTMLElement>('[data-testid^="comfyui-discovered-workflow-"]');
    expect(discoveredRow).not.toBeNull();
    await act(async () => discoveredRow?.click());
    await settle();

    const afterDiscovery = await fake.services.comfyUi.listWorkflows();
    expect(afterDiscovery).toHaveLength(2);
    expect(afterDiscovery.some((workflow) => workflow.source.kind === 'frontend-workflow')).toBe(true);
    await expect(fake.services.comfyUi.reconcileSelection()).resolves.toEqual({
      kind: 'comfyui',
      workflowId: imported!.workflowId,
    });

    await act(async () => {
      container.querySelector<HTMLElement>(`[data-testid="comfyui-workflow-delete-${imported!.workflowId}"]`)?.click();
    });
    await settle();
    await expect(fake.services.comfyUi.reconcileSelection()).resolves.toBeUndefined();
    expect((await fake.services.comfyUi.listWorkflows()).some((workflow) => workflow.workflowId === imported!.workflowId)).toBe(false);
  });
});
