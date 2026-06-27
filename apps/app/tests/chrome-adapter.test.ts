import { describe, expect, it } from 'vitest';
import type { DurableJobRecord, ProviderProfile } from '@imagen-ps/application';
import { createChromeHostPort } from '../src/adapters/chrome/chrome-host-port';
import { createChromeIndexedDbStorage, createMemoryIndexedDbBackend } from '../src/adapters/chrome/indexed-db-storage';
import { runChromeFeasibilityRuntime } from '../src/composition/chrome/chrome-feasibility-runtime';
import { createPhotoshopSimulator } from '../src/simulators/photoshop/simulator';

function sampleProfile(): ProviderProfile {
  return {
    profileId: 'chrome-profile',
    providerId: 'mock',
    displayName: 'Chrome Profile',
    enabled: true,
    config: { providerId: 'mock', displayName: 'Chrome Profile', family: 'image-endpoint', baseURL: 'https://mock.local' },
    createdAt: '2026-06-25T00:00:00.000Z',
    updatedAt: '2026-06-25T00:00:00.000Z',
  };
}

describe('Chrome adapter contracts', () => {
  it('persists profiles, history, secrets, and binary assets through the IndexedDB adapter boundary', async () => {
    const storage = createChromeIndexedDbStorage({ backend: createMemoryIndexedDbBackend() });
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

    expect(await storage.profiles.get(profile.profileId)).toEqual(profile);
    expect(await storage.secrets.getSecret('secret:chrome-profile:apiKey')).toBe('mock-key');
    expect(new Uint8Array((await storage.assets.resolve(assetRef)) ?? new ArrayBuffer(0))).toEqual(new Uint8Array([1, 2, 3]));
    expect(await storage.history.list()).toEqual([record]);
  });

  it('uses File API upload to create a HostImageAsset accepted by the shared submit flow', async () => {
    const file = new File([new Uint8Array([137, 80, 78, 71])], 'upload.png', { type: 'image/png' });
    const host = createChromeHostPort({
      simulator: createPhotoshopSimulator('seeded-document'),
      filePicker: { pick: async () => file },
    });

    const image = await host.pickImageFile();
    expect(image?.asset.name).toBe('upload.png');
    expect(image?.asset.data).toBeInstanceOf(Uint8Array);
    expect(image?.metadata.source).toBe('file');
  });

  it('provides a seeded Photoshop simulator with ten fixed image-backed layers', async () => {
    const simulator = createPhotoshopSimulator('seeded-document');
    const layers = simulator.listLayers();
    expect(layers).toHaveLength(10);
    expect(layers.map((layer) => layer.name)).toContain('sim-layer-10.svg');
    expect((await simulator.readLayerAsAsset(10)).preview.url).toContain('data:image/svg+xml;base64,');
  });

  it('runs the Chrome provider command path with mock provider state and simulator layers', async () => {
    const result = await runChromeFeasibilityRuntime({ backend: createMemoryIndexedDbBackend() });
    expect(result.providerIds).toEqual(['chat-image', 'image-endpoint', 'mock', 'prompt-optimize']);
    expect(result.generatedAssetCount).toBe(1);
    expect(result.simulatorLayerCount).toBe(10);
  });
});
