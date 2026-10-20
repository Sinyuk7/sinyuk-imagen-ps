import { afterEach, describe, expect, it, vi } from 'vitest';
import { createGrsaiProvider } from '../src/providers/grsai/provider.js';

const config = {
  providerId: 'grsai' as const,
  displayName: 'GRSAI',
  family: 'grsai' as const,
  connection: { selectionMode: 'manual' as const, selectedEndpointId: 'main', endpoints: [{ id: 'main', url: 'https://grsai.example', enabled: true }] },
  paths: { submit: '/v1/api/generate', result: '/v1/api/result' },
  apiKey: 'test-key',
};
const request = { operation: 'text_to_image' as const, prompt: 'test prompt', modelId: 'nano-banana-2' };

function json(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
}

function installFetch(balanceResponses: Array<Response | Error>) {
  let taskSequence = 0;
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.pathname === '/client/openapi/getAPIKeyCredits') {
      const item = balanceResponses.shift();
      if (item instanceof Error) throw item;
      return item ?? json({ code: 0, data: { credits: 100 } });
    }
    if (url.pathname === '/v1/api/generate') return json({ code: 0, data: { taskId: `task-${++taskSequence}` } });
    if (url.pathname === '/v1/api/result') return json({ status: 'succeeded', results: [{ url: 'https://cdn.example/result.png' }] });
    throw new Error(`Unexpected request: ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

async function submit(provider: ReturnType<typeof createGrsaiProvider>) {
  return provider.asyncLifecycle!.submit({ config, request });
}

async function complete(provider: ReturnType<typeof createGrsaiProvider>, remoteRef: string) {
  return provider.asyncLifecycle!.poll({ remoteRef });
}

afterEach(() => vi.unstubAllGlobals());

describe('GRSAI task usage observation', () => {
  it('does not report usage when the initial balance baseline is unavailable', async () => {
    installFetch([new Error('no initial baseline'), json({ code: 0, data: { credits: 90 } })]);
    const provider = createGrsaiProvider();
    const first = await submit(provider);
    expect(first.status).toBe('pending');
    const result = await complete(provider, first.remoteRef);
    expect(result.status).toBe('completed');
    if (result.status === 'completed') expect(result.result.taskUsage).toBeUndefined();
  });

  it('reports a sequential observed balance decrease after a prior task establishes a baseline', async () => {
    installFetch([
      json({ code: 0, data: { credits: 100 } }), json({ code: 0, data: { credits: 100 } }),
      json({ code: 0, data: { credits: 100 } }), json({ code: 0, data: { credits: 92.5 } }),
    ]);
    const provider = createGrsaiProvider();
    const first = await submit(provider);
    await complete(provider, first.remoteRef);
    const second = await submit(provider);
    const result = await complete(provider, second.remoteRef);
    expect(result.status).toBe('completed');
    if (result.status === 'completed') expect(result.result.taskUsage).toEqual({ metrics: [{ id: 'grsai-balance-change', value: '-7.5', unit: 'credits' }] });
  });

  it('suppresses balance attribution for overlapping tasks', async () => {
    installFetch(Array.from({ length: 4 }, () => json({ code: 0, data: { credits: 100 } })));
    const provider = createGrsaiProvider();
    const [first, second] = await Promise.all([submit(provider), submit(provider)]);
    expect(first.status).toBe('pending');
    expect(second.status).toBe('pending');
    const results = await Promise.all([complete(provider, first.remoteRef), complete(provider, second.remoteRef)]);
    for (const result of results) {
      expect(result.status).toBe('completed');
      if (result.status === 'completed') expect(result.result.taskUsage).toBeUndefined();
    }
  });

  it('keeps generation successful and omits usage when balance reads fail', async () => {
    installFetch([new Error('balance endpoint unavailable'), new Error('balance endpoint unavailable')]);
    const provider = createGrsaiProvider();
    const submission = await submit(provider);
    const result = await complete(provider, submission.remoteRef);
    expect(result.status).toBe('completed');
    if (result.status === 'completed') expect(result.result.taskUsage).toBeUndefined();
  });

  it('retains lifecycle state across a transient poll failure so the task can be retried', async () => {
    const fetchMock = installFetch([json({ code: 0, data: { credits: 100 } }), json({ code: 0, data: { credits: 100 } })]);
    const provider = createGrsaiProvider();
    const submission = await submit(provider);
    fetchMock.mockImplementationOnce(async () => { throw new Error('temporary network failure'); });
    await expect(complete(provider, submission.remoteRef)).rejects.toThrow('temporary network failure');
    expect((await complete(provider, submission.remoteRef)).status).toBe('completed');
  });
});
