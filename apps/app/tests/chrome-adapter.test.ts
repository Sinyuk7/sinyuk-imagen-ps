import { describe, expect, it, vi } from 'vitest';
import type { DurableJobRecord, ProviderProfile, TaskRecord } from '@imagen-ps/application';
import { createChromeHostPort } from '../src/adapters/chrome/chrome-host-port';
import { createChromeIndexedDbStorage, createMemoryIndexedDbBackend } from '../src/adapters/chrome/indexed-db-storage';
import { runChromeFeasibilityRuntime } from '../src/composition/chrome/chrome-feasibility-runtime';
import { createPhotoshopSimulator } from '../src/simulators/photoshop/simulator';
import { withObjectUrlMock } from './host-bridge-harness';

function sampleProfile(): ProviderProfile {
  return {
    profileId: 'chrome-profile',
    providerId: 'mock',
    displayName: 'Chrome Profile',
    enabled: true,
    config: {
      providerId: 'mock',
      displayName: 'Chrome Profile',
      family: 'image-endpoint',
      connection: {
        selectionMode: 'manual',
        failoverEnabled: false,
        preferredEndpointId: 'primary',
        endpoints: [{ id: 'primary', url: 'https://mock.local', enabled: true }],
      },
    },
    createdAt: '2026-06-25T00:00:00.000Z',
    updatedAt: '2026-06-25T00:00:00.000Z',
  };
}

function sampleTask(overrides: Partial<TaskRecord> = {}): TaskRecord {
  return {
    schemaVersion: 1,
    taskId: 'task-1',
    status: 'completed',
    operation: 'text-to-image',
    prompt: 'history prompt',
    attachments: [],
    outputs: [{
      outputId: 'out-1',
      index: 0,
      kind: 'image',
      asset: { ref: { kind: 'hostObject', ref: 'history-asset-1', mimeType: 'image/png' } },
    }],
    placement: { kind: 'unbound', reason: 'no-photoshop-source' },
    createdAt: '2026-06-25T00:00:00.000Z',
    updatedAt: '2026-06-25T00:00:01.000Z',
    finishedAt: '2026-06-25T00:00:01.000Z',
    ...overrides,
  };
}

describe('Chrome adapter contracts', () => {
  it('persists profiles, history, secrets, and binary assets through the IndexedDB adapter boundary', async () => {
    const backend = createMemoryIndexedDbBackend();
    const storage = createChromeIndexedDbStorage({ backend });
    const profile = sampleProfile();
    await storage.profiles.save(profile);
    await storage.secrets.setSecret('secret:chrome-profile:apiKey', 'mock-key');
    const assetRef = await storage.assets.put(new Uint8Array([1, 2, 3]).buffer, { mimeType: 'image/png', name: 'a.png' });
    const record: DurableJobRecord = {
      schemaVersion: 1,
      jobId: 'job-1',
      status: 'completed',
      workflow: 'provider-generate',
      input: { prompt: 'x' },
      outputs: [assetRef],
      createdAt: '2026-06-25T00:00:00.000Z',
      updatedAt: '2026-06-25T00:00:01.000Z',
    };
    await storage.history.put(record);
    const task = sampleTask();
    await storage.tasks.put(task);
    await storage.tasks.put({ ...sampleTask({
      taskId: 'running-task',
      status: 'running',
      outputs: [],
      finishedAt: undefined,
      updatedAt: '2026-06-25T00:00:02.000Z',
    }) });
    await backend.put('tasks', 'bad-task', { ...sampleTask({ taskId: 'bad-task' }), schemaVersion: 999 });

    expect(await storage.profiles.get(profile.profileId)).toEqual(profile);
    expect(await storage.secrets.getSecret('secret:chrome-profile:apiKey')).toBe('mock-key');
    expect(new Uint8Array((await storage.assets.resolve(assetRef)) ?? new ArrayBuffer(0))).toEqual(new Uint8Array([1, 2, 3]));
    expect(await storage.history.list()).toEqual([record]);
    expect(await storage.tasks.get('task-1')).toEqual(task);
    expect((await storage.tasks.list()).map((item) => item.taskId)).toEqual(['running-task', 'task-1']);
    expect(await storage.tasks.list({ status: 'completed' })).toEqual([task]);
  });

  it('persists app generation settings separately from provider profiles', async () => {
    const storage = createChromeIndexedDbStorage({ backend: createMemoryIndexedDbBackend() });

    expect(await storage.generationSettings.load()).toEqual({
      outputSizePreset: '2k',
      outputFormat: 'png',
      aspectRatio: 'auto',
      providerInputSizePreset: '1k',
    });

    await storage.generationSettings.save({
      outputSizePreset: '4k',
      outputFormat: 'webp',
      aspectRatio: '9:16',
      providerInputSizePreset: '1k',
    });

    expect(await storage.generationSettings.load()).toEqual({
      outputSizePreset: '4k',
      outputFormat: 'webp',
      aspectRatio: '9:16',
      providerInputSizePreset: '1k',
    });
    expect(await storage.profiles.list()).toEqual([]);
  });

  it('persists active image profile separately from provider profiles and generation settings', async () => {
    const storage = createChromeIndexedDbStorage({ backend: createMemoryIndexedDbBackend() });

    expect(await storage.activeImageProfile.load()).toBeNull();

    await storage.activeImageProfile.save('chrome-profile');

    expect(await storage.activeImageProfile.load()).toBe('chrome-profile');
    expect(await storage.generationSettings.load()).toEqual({
      outputSizePreset: '2k',
      outputFormat: 'png',
      aspectRatio: 'auto',
      providerInputSizePreset: '1k',
    });
    expect(await storage.profiles.list()).toEqual([]);
  });

  it('continues asset refs after restart instead of reusing chrome-idb-asset keys', async () => {
    const backend = createMemoryIndexedDbBackend();
    const firstStorage = createChromeIndexedDbStorage({ backend });
    const first = await firstStorage.assets.put(new Uint8Array([1]).buffer, { mimeType: 'image/png' });
    const second = await firstStorage.assets.put(new Uint8Array([2]).buffer, { mimeType: 'image/png' });
    expect(first.ref).toBe('chrome-idb-asset-1');
    expect(second.ref).toBe('chrome-idb-asset-2');

    const restartedStorage = createChromeIndexedDbStorage({ backend });
    const third = await restartedStorage.assets.put(new Uint8Array([3]).buffer, { mimeType: 'image/png' });

    expect(third.ref).toBe('chrome-idb-asset-3');
    expect(new Uint8Array((await restartedStorage.assets.resolve(third)) ?? new ArrayBuffer(0))).toEqual(new Uint8Array([3]));
  });

  it('uses File API upload to create a HostImageAsset accepted by the shared submit flow', async () => {
    const pngHeader = new Uint8Array(24);
    pngHeader.set([137, 80, 78, 71], 0);
    pngHeader[18] = 4;
    pngHeader[22] = 4;
    const file = new File([pngHeader], 'upload.png', { type: 'image/png' });
    const storage = createChromeIndexedDbStorage({ backend: createMemoryIndexedDbBackend() });
    const host = createChromeHostPort({
      assetStore: storage.assets,
      simulator: createPhotoshopSimulator(storage.assets, 'seeded-document'),
      filePicker: { pick: async () => file },
    });

    const image = await host.pickImageFile({ maxSide: 2048 });
    expect(image?.asset.name).toBe('upload.png');
    expect(image?.asset.storedRef).toMatchObject({ kind: 'hostObject', name: 'upload.png', mimeType: 'image/png' });
    expect(image?.resource.derivatives.providerInput?.kind).toBe('ready');
    expect(image?.metadata.source).toBe('file');
    expect(new Uint8Array((await storage.assets.resolve(image!.asset.storedRef!)) ?? new ArrayBuffer(0))).toEqual(pngHeader);
  });

  it('saves resolved full-size asset bytes through the browser download bridge', async () => withObjectUrlMock(async ({ create, revoke, blobs }) => {
    const storage = createChromeIndexedDbStorage({ backend: createMemoryIndexedDbBackend() });
    const host = createChromeHostPort({
      assetStore: storage.assets,
      simulator: createPhotoshopSimulator(storage.assets, 'seeded-document'),
      filePicker: { pick: async () => undefined },
    });
    const bytes = new Uint8Array([11, 22, 33, 44, 55]);
    const storedRef = await storage.assets.put(bytes.buffer.slice(0), {
      mimeType: 'image/png',
      name: 'history-full.png',
    });
    const clicks: Array<{ readonly download: string; readonly href: string }> = [];
    const originalClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function click(this: HTMLAnchorElement): void {
      clicks.push({ download: this.download, href: this.href });
    };

    try {
      await host.saveAssetToFile({
        type: 'image',
        name: 'history-full.png',
        mimeType: 'image/png',
        storedRef,
      }, { suggestedName: 'saved-result' });
    } finally {
      HTMLAnchorElement.prototype.click = originalClick;
    }

    expect(create).toHaveBeenCalledTimes(1);
    expect(clicks).toEqual([{ download: 'saved-result.png', href: 'blob:thumb-1' }]);
    expect(revoke).toHaveBeenCalledWith('blob:thumb-1');
    expect(blobs).toHaveLength(1);
    expect(new Uint8Array(await blobs[0]!.arrayBuffer())).toEqual(bytes);
  }));

  it('provides a seeded Photoshop simulator with ten fixed image-backed layers', async () => {
    const storage = createChromeIndexedDbStorage({ backend: createMemoryIndexedDbBackend() });
    const simulator = createPhotoshopSimulator(storage.assets, 'seeded-document');
    const layers = simulator.listLayers();
    expect(layers).toHaveLength(10);
    expect(layers.map((layer) => layer.name)).toContain('sim-layer-10.svg');
    const layerAsset = await simulator.readLayerAsAsset(10, { maxSide: 2048 });
    expect(layerAsset.preview.url).toContain('data:image/svg+xml;base64,');
    expect(layerAsset.asset.storedRef).toMatchObject({ kind: 'hostObject', name: 'sim-layer-10.svg' });
    expect(layerAsset.resource.derivatives.providerInput?.kind).toBe('ready');
  });

  it('simulator places unbound local-file outputs into the active document contract', async () => {
    const storage = createChromeIndexedDbStorage({ backend: createMemoryIndexedDbBackend() });
    const simulator = createPhotoshopSimulator(storage.assets, 'seeded-document');

    await expect(simulator.placeAssetOnCanvas(
      { type: 'image', name: 'generated.png', data: new Uint8Array([1]), mimeType: 'image/png' },
      { kind: 'unbound', reason: 'no-photoshop-capture' },
    )).resolves.toBeUndefined();
  });

  it('simulator rejects unbound multiple-document placement and missing active documents', async () => {
    const storage = createChromeIndexedDbStorage({ backend: createMemoryIndexedDbBackend() });

    await expect(createPhotoshopSimulator(storage.assets, 'seeded-document').placeAssetOnCanvas(
      { type: 'image', name: 'generated.png', data: new Uint8Array([1]), mimeType: 'image/png' },
      { kind: 'unbound', reason: 'multiple-documents' },
    )).rejects.toThrow('ambiguous across multiple source documents');

    await expect(createPhotoshopSimulator(storage.assets, 'no-document').placeAssetOnCanvas(
      { type: 'image', name: 'generated.png', data: new Uint8Array([1]), mimeType: 'image/png' },
      { kind: 'unbound', reason: 'no-photoshop-capture' },
    )).rejects.toThrow('requires an active Photoshop document');
  });

  it('runs the Chrome provider command path with mock provider state and simulator layers', async () => {
    const result = await runChromeFeasibilityRuntime({ backend: createMemoryIndexedDbBackend() });
    expect(result.providerIds).toEqual([
      'chat-image',
      'gemini-generate-content',
      'image-endpoint',
      'mock',
      'prompt-optimize',
    ]);
    expect(result.generatedAssetCount).toBe(1);
    expect(result.simulatorLayerCount).toBe(10);
  });
});
