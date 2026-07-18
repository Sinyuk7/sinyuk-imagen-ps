import { describe, expect, it } from 'vitest';
import {
  COMFYUI_BRIDGE_COMPATIBILITY,
  COMFYUI_BRIDGE_LIMITS,
  createComfyUiBridgeHandshakeRequest,
  isComfyUiExecutionError,
  validateComfyUiExecutionResult,
  type ComfyUiBridgeRequest,
} from '../src/index.js';
import { createTestHarness } from './harness.js';

function requestBody(call: { readonly body?: Uint8Array }): Record<string, unknown> {
  if (call.body === undefined) throw new Error('request body missing');
  return JSON.parse(new TextDecoder().decode(call.body)) as Record<string, unknown>;
}

function handshakeResponse(request: ComfyUiBridgeRequest, identity: unknown): unknown {
  return {
    requestId: request.requestId,
    ok: true,
    payload: {
      identity,
      ...COMFYUI_BRIDGE_COMPATIBILITY,
      capabilities: { nativeQueue: true, workflowDiscovery: true, receiptObserver: true },
      limits: { ...COMFYUI_BRIDGE_LIMITS },
    },
  };
}

describe('API Graph driver contract', () => {
  it('waits for uploads, mutates only literals and POSTs once with server receipt', async () => {
    const harness = createTestHarness();
    const result = await harness.adapter.dispatch({ request: harness.request });
    expect(validateComfyUiExecutionResult(result).outputs).toHaveLength(1);

    const uploads = harness.httpCalls.filter((call) => call.path === '/upload/image');
    const prompts = harness.httpCalls.filter((call) => call.path === '/prompt');
    expect(uploads).toHaveLength(2);
    expect(prompts).toHaveLength(1);
    expect(harness.httpCalls.indexOf(prompts[0])).toBeGreaterThan(harness.httpCalls.indexOf(uploads[1]));

    const body = requestBody(prompts[0]);
    expect(body).not.toHaveProperty('prompt_id');
    expect(body.client_id).toBe('comfy-client-1');
    const graph = body.prompt as Record<string, { readonly inputs: Record<string, unknown> }>;
    expect(graph.prompt.inputs.text).toBe('make a portrait');
    expect(graph.image.inputs.image).toBe('remote-1.png');
    expect(graph.mask.inputs.image).toBe('remote-2.png');
  });

  it('preserves an omitted optional mask default', async () => {
    const harness = createTestHarness({ includeMask: false });
    await harness.adapter.dispatch({ request: harness.request });
    expect(harness.httpCalls.filter((call) => call.path === '/upload/image')).toHaveLength(1);
    const prompt = harness.httpCalls.find((call) => call.path === '/prompt');
    if (prompt === undefined) throw new Error('prompt missing');
    const graph = requestBody(prompt).prompt as Record<string, { readonly inputs: Record<string, unknown> }>;
    expect(graph.mask.inputs.image).toBe('default-mask.png');
  });

  it('keeps submission count zero when a required upload fails', async () => {
    let uploadCount = 0;
    const harness = createTestHarness({
      onRequest(request) {
        if (request.path !== '/upload/image') return undefined;
        uploadCount += 1;
        return uploadCount === 2
          ? { status: 500, headers: {}, body: new Uint8Array() }
          : undefined;
      },
    });
    await expect(harness.adapter.dispatch({ request: harness.request })).rejects.toMatchObject({
      category: 'execution',
      details: {
        stage: 'upload',
        code: 'upload-failed',
        remoteMayContinue: false,
        retryDisposition: 'same-task-new-job',
      },
    });
    expect(harness.httpCalls.filter((call) => call.path === '/prompt')).toHaveLength(0);
  });

  it('treats a malformed second descriptor as a partial remote orphan without submission', async () => {
    let uploadCount = 0;
    const harness = createTestHarness({
      onRequest(request) {
        if (request.path !== '/upload/image') return undefined;
        uploadCount += 1;
        if (uploadCount !== 2) return undefined;
        return {
          status: 200,
          headers: { 'content-type': 'application/json' },
          body: new TextEncoder().encode(JSON.stringify({ name: 'missing-fields.png' })),
        };
      },
    });
    await expect(harness.adapter.dispatch({ request: harness.request })).rejects.toMatchObject({
      details: { stage: 'upload', code: 'upload-failed', retryDisposition: 'same-task-new-job' },
    });
    expect(harness.httpCalls.filter((call) => call.path === '/upload/image')).toHaveLength(2);
    expect(harness.httpCalls.filter((call) => call.path === '/prompt')).toHaveLength(0);
  });

  it('rejects missing assets, MIME mismatch and pre-submit abort without submission', async () => {
    const missing = createTestHarness({ resolveAsset: async () => undefined });
    await expect(missing.adapter.dispatch({ request: missing.request })).rejects.toMatchObject({
      details: { stage: 'prepare', code: 'asset-unavailable', retryDisposition: 'same-task-new-job' },
    });
    expect(missing.httpCalls).toHaveLength(0);

    const mismatch = createTestHarness({
      resolveAsset: async () => ({ bytes: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), mimeType: 'image/jpeg' }),
    });
    await expect(mismatch.adapter.dispatch({ request: mismatch.request })).rejects.toMatchObject({
      details: { code: 'asset-unavailable' },
    });
    expect(mismatch.httpCalls).toHaveLength(0);

    const aborted = createTestHarness();
    const controller = new AbortController();
    controller.abort();
    await expect(aborted.adapter.dispatch({ request: aborted.request }, { signal: controller.signal }))
      .rejects.toMatchObject({ details: { stage: 'prepare', retryDisposition: 'same-task-new-job' } });
    expect(aborted.httpCalls).toHaveLength(0);
  });

  it('rejects image/mask geometry mismatch before resolving bytes', async () => {
    const harness = createTestHarness();
    if (harness.request.mask === undefined) throw new Error('mask missing');
    const request = {
      ...harness.request,
      mask: { ...harness.request.mask, height: 512 },
    };
    await expect(harness.adapter.dispatch({ request })).rejects.toMatchObject({
      details: { stage: 'prepare', code: 'invalid-workflow' },
    });
    expect(harness.httpCalls).toHaveLength(0);
  });

  it('never replays timeout or invalid acknowledgement after POST starts', async () => {
    const timedOut = createTestHarness({
      onRequest(request) {
        if (request.path === '/prompt') throw new Error('network timeout');
        return undefined;
      },
    });
    await expect(timedOut.adapter.dispatch({ request: timedOut.request })).rejects.toMatchObject({
      details: {
        stage: 'submit',
        code: 'submission-unknown',
        remoteMayContinue: true,
        retryDisposition: 'new-task-only',
      },
    });
    expect(timedOut.httpCalls.filter((call) => call.path === '/prompt')).toHaveLength(1);

    const mismatched = createTestHarness({
      onRequest(request) {
        if (request.path === '/prompt') {
          return {
            status: 200,
            headers: { 'content-type': 'application/json' },
            body: new TextEncoder().encode(JSON.stringify({ prompt_id: 'server-prompt', client_id: 'wrong-client' })),
          };
        }
        return undefined;
      },
    });
    await expect(mismatched.adapter.dispatch({ request: mismatched.request })).rejects.toMatchObject({
      details: { code: 'submission-unknown', remoteMayContinue: true },
    });
    expect(mismatched.httpCalls.filter((call) => call.path === '/prompt')).toHaveLength(1);
  });

  it('accepts only the exact adapter params envelope', async () => {
    const harness = createTestHarness();
    await expect(harness.adapter.dispatch({ request: harness.request, promptId: 'forbidden' }))
      .rejects.toSatisfy((error: unknown) => isComfyUiExecutionError(error));
    expect(harness.httpCalls).toHaveLength(0);
  });
});

describe('Frontend Queue driver contract', () => {
  it('accepts canonical Chrome origins and bounded UXP plugin ids', () => {
    expect(() => createComfyUiBridgeHandshakeRequest({
      origin: 'https://app.example',
      sourceId: 'iframe-source',
      loadId: 'load-1',
    }, 'request-http')).not.toThrow();
    expect(() => createComfyUiBridgeHandshakeRequest({
      origin: 'com.imagen-ps.panel',
      sourceId: 'uxp-host',
      loadId: 'load-1',
    }, 'request-uxp')).not.toThrow();
    expect(() => createComfyUiBridgeHandshakeRequest({
      origin: 'com..imagen/ps',
      sourceId: 'uxp-host',
      loadId: 'load-1',
    }, 'request-invalid')).toThrow();
  });

  it('uses fixed handshake and one native submit while App POST count stays zero', async () => {
    const harness = createTestHarness({ source: 'frontend-workflow' });
    const result = await harness.adapter.dispatch({ request: harness.request });
    expect(validateComfyUiExecutionResult(result).outputs).toHaveLength(1);
    expect(harness.bridgeCalls.map((call) => call.command)).toEqual(['handshake', 'submit-workflow']);
    expect(harness.httpCalls.filter((call) => call.path === '/prompt')).toHaveLength(0);
    const submit = harness.bridgeCalls[1];
    expect(submit.payload).toMatchObject({
      batchCount: 1,
      remotePath: 'workflows/d01.json',
      operationId: 'comfy-operation-3',
    });
    expect(submit.payload).not.toHaveProperty('promptId');
    expect(submit.payload).not.toHaveProperty('graph');
    expect(submit.payload).not.toHaveProperty('bytes');
    expect(submit.payload).not.toHaveProperty('clientId');
    expect(submit.payload.mutations).toHaveLength(3);
  });

  it('rejects receipt operation mismatch without replay', async () => {
    const harness = createTestHarness({
      source: 'frontend-workflow',
      onBridgeExchange(request, _index, bridge) {
        if (request.command === 'handshake') return handshakeResponse(request, bridge.identity);
        return {
          requestId: request.requestId,
          ok: true,
          payload: { operationId: 'other-operation', promptId: 'frontend-prompt', acknowledgedAt: 1_000 },
        };
      },
    });
    await expect(harness.adapter.dispatch({ request: harness.request })).rejects.toMatchObject({
      details: { stage: 'submit', code: 'submission-unknown', remoteMayContinue: true },
    });
    expect(harness.bridgeCalls.filter((call) => call.command === 'submit-workflow')).toHaveLength(1);
    expect(harness.httpCalls.filter((call) => call.path === '/prompt')).toHaveLength(0);
  });

  it('fails closed on stale load identity and incompatible tuple', async () => {
    const stale = createTestHarness({
      source: 'frontend-workflow',
      onBridgeExchange(request, _index, bridge) {
        if (request.command === 'handshake') return handshakeResponse(request, bridge.identity);
        (bridge.identity as { loadId: string }).loadId = 'load-2';
        return {
          requestId: request.requestId,
          ok: true,
          payload: { operationId: request.payload.operationId, promptId: 'frontend-prompt', acknowledgedAt: 1_000 },
        };
      },
    });
    await expect(stale.adapter.dispatch({ request: stale.request })).rejects.toMatchObject({
      details: { code: 'submission-unknown', remoteMayContinue: true },
    });

    const incompatible = createTestHarness({
      source: 'frontend-workflow',
      onBridgeExchange(request, _index, bridge) {
        if (request.command !== 'handshake') throw new Error('submit must not run');
        const response = handshakeResponse(request, bridge.identity) as {
          payload: { frontendVersion: string };
        };
        response.payload.frontendVersion = '0.0.0';
        return response;
      },
    });
    await expect(incompatible.adapter.dispatch({ request: incompatible.request })).rejects.toMatchObject({
      details: { stage: 'prepare', code: 'bridge-incompatible' },
    });
    expect(incompatible.bridgeCalls.filter((call) => call.command === 'submit-workflow')).toHaveLength(0);
  });

  it('rejects encoded traversal and non-json workflow paths before uploads', async () => {
    const harness = createTestHarness({ source: 'frontend-workflow' });
    const request = {
      ...harness.request,
      source: { ...harness.request.source, remotePath: 'workflows/%2e%2e/secret.json' },
    };
    await expect(harness.adapter.dispatch({ request })).rejects.toMatchObject({
      details: { stage: 'prepare', code: 'invalid-workflow' },
    });
    expect(harness.httpCalls).toHaveLength(0);
    expect(harness.bridgeCalls).toHaveLength(0);
  });
});
