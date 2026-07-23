import { describe, expect, it } from 'vitest';
import { createComfyUiManagementHostPorts } from './management-host.js';

describe('ComfyUI management host', () => {
  it('rejects workflow load before Bridge exchange when active target mismatches frozen base URL', async () => {
    const affinities: unknown[] = [];
    let exchanges = 0;
    const host = createComfyUiManagementHostPorts({
      httpTransport: {
        request: async () => ({ status: 200, headers: {}, body: new Uint8Array() }),
      },
      frontendBridgeResolver: {
        resolve: async (_workflowId, _signal, affinity) => {
          affinities.push(affinity);
          if (affinity?.baseUrl !== 'https://b.example.test/proxy') throw new Error('invalid-connection');
          return {
            identity: { origin: 'https://b.example.test', sourceId: 'source-b', loadId: 'load-b' },
            exchange: async () => { exchanges += 1; return undefined; },
          };
        },
      },
    });

    await expect(host.load('https://a.example.test/proxy', {
      workflowId: 'workflow-id',
      displayName: 'Workflow',
      remotePath: 'workflow.json',
      groupPath: [],
      revision: 'r1',
    })).rejects.toThrow('invalid-connection');
    expect(affinities).toEqual([{ baseUrl: 'https://a.example.test/proxy' }]);
    expect(exchanges).toBe(0);
  });
});
