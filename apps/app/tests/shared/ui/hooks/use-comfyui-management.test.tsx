import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ComfyUiManagementPort } from '../../../../src/shared/ports/comfyui-management';
import {
  useComfyUiManagement,
  type ComfyUiManagementController,
} from '../../../../src/shared/ui/hooks/use-comfyui-management';
import {
  createComfyUiManagementFake,
  fakeComfyUiConnection,
  fakeComfyUiWorkflow,
} from '../../../helpers/harness/comfyui-management.fake';

let root: Root | undefined;
let controller: ComfyUiManagementController | undefined;

function HookHarness({ service }: { readonly service: ComfyUiManagementPort }) {
  const value = useComfyUiManagement(service);
  useEffect(() => {
    controller = value;
  }, [value]);
  return <div data-loading={value.loading ? 'true' : 'false'} />;
}

async function renderHook(service: ComfyUiManagementPort): Promise<ComfyUiManagementController> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(<HookHarness service={service} />);
  });
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  if (!controller) {
    throw new Error('ComfyUI hook did not mount.');
  }
  await act(async () => {
    await controller!.reload();
  });
  return controller!;
}

describe('useComfyUiManagement', () => {
  afterEach(async () => {
    if (root) {
      await act(async () => root!.unmount());
    }
    root = undefined;
    controller = undefined;
    document.body.innerHTML = '';
  });

  it('hydrates Application readiness and keeps target changes explicit', async () => {
    const fake = createComfyUiManagementFake({
      connections: [fakeComfyUiConnection],
      workflows: [fakeComfyUiWorkflow],
      selection: { kind: 'provider', profileId: 'profile-a', modelId: 'model-a' },
    });
    let state = await renderHook(fake.service);

    expect(state.backendMode).toBe('provider');
    expect(state.readiness.get(fakeComfyUiWorkflow.workflowId)).toEqual({ status: 'ready' });

    await act(async () => {
      await state.selectBackend('comfyui');
    });
    state = controller!;
    expect(state.backendMode).toBe('comfyui');
    await expect(fake.repositories.selection.get()).resolves.toBeUndefined();

    await act(async () => {
      await state.selectWorkflow(fakeComfyUiWorkflow.workflowId);
    });
    state = controller!;
    expect(state.selection).toEqual({ kind: 'comfyui', workflowId: fakeComfyUiWorkflow.workflowId });

    await act(async () => {
      await state.deleteWorkflow(fakeComfyUiWorkflow.workflowId);
    });
    state = controller!;
    expect(state.selection).toBeUndefined();
    expect(state.workflows).toEqual([]);
    expect(state.backendMode).toBe('comfyui');
    await expect(fake.repositories.selection.get()).resolves.toBeUndefined();

    await act(async () => {
      await state.selectBackend('provider', { profileId: 'profile-b', modelId: 'model-b' });
    });
    await expect(fake.repositories.selection.get()).resolves.toEqual({
      kind: 'provider',
      profileId: 'profile-b',
      modelId: 'model-b',
    });
  });

  it('clears an unready ComfyUI selection without selecting a replacement', async () => {
    const untestedConnection = { ...fakeComfyUiConnection, lastTest: undefined };
    const fake = createComfyUiManagementFake({
      connections: [untestedConnection],
      workflows: [fakeComfyUiWorkflow],
      selection: { kind: 'comfyui', workflowId: fakeComfyUiWorkflow.workflowId },
    });
    const state = await renderHook(fake.service);

    expect(state.selection).toBeUndefined();
    expect(state.readiness.get(fakeComfyUiWorkflow.workflowId)).toEqual({ status: 'not-ready', reason: 'api' });
    await expect(fake.repositories.selection.get()).resolves.toBeUndefined();
  });

  it('keeps the persisted backend mode when selection mutation fails', async () => {
    const fake = createComfyUiManagementFake({
      selection: { kind: 'provider', profileId: 'profile-a' },
    });
    const clearSelection = vi.fn(async () => {
      throw new Error('selection write failed');
    });
    const state = await renderHook({ ...fake.service, clearSelection });

    await act(async () => {
      await expect(state.selectBackend('comfyui')).rejects.toThrow('selection write failed');
    });

    expect(controller?.backendMode).toBe('provider');
    await expect(fake.repositories.selection.get()).resolves.toEqual({
      kind: 'provider',
      profileId: 'profile-a',
    });
  });
});
