import { describe, expect, it } from 'vitest';
import { detectAndAdmitComfyUiWorkflowDocument } from '../src/graph.js';
import { convertComfyUiApiWorkflowToForm, convertComfyUiFrontendWorkflowToForm, projectWorkflowParameters } from '../src/form.js';
import { validateComfyUiExecutionResult } from '../src/execution-types.js';
import { downloadAndStoreComfyUiOutputs, observeKnownComfyUiPrompt } from '../src/observation.js';
import { executeComfyUiApiGraph, executeComfyUiFrontendQueue } from '../src/drivers.js';
import { COMFYUI_BRIDGE_LIMITS } from '../src/bridge.js';
import { createComfyUiExecutionAdapter } from '../src/adapter.js';
import { prepareComfyUiUploads } from '../src/assets.js';

const encoder = new TextEncoder();
const connection = { baseUrl: 'https://example.test', requestTimeoutMs: 1_000, observationTimeoutMs: 1_000 };

function writeUint16LE(bytes: Uint8Array, offset: number, value: number): void { bytes[offset] = value & 0xff; bytes[offset + 1] = (value >>> 8) & 0xff; }
function writeUint32BE(bytes: Uint8Array, offset: number, value: number): void { bytes[offset] = value >>> 24; bytes[offset + 1] = value >>> 16; bytes[offset + 2] = value >>> 8; bytes[offset + 3] = value; }
function crc32(bytes: Uint8Array, offset = 0, length = bytes.byteLength - offset): number { let crc = 0xffffffff; for (let index = offset; index < offset + length; index += 1) { crc ^= bytes[index]; for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0); } return (crc ^ 0xffffffff) >>> 0; }
function adler32(bytes: Uint8Array): number { let a = 1; let b = 0; for (const byte of bytes) { a = (a + byte) % 65521; b = (b + a) % 65521; } return ((b << 16) | a) >>> 0; }
function chunk(type: string, data: Uint8Array): Uint8Array { const value = new Uint8Array(data.byteLength + 12); writeUint32BE(value, 0, data.byteLength); for (let index = 0; index < 4; index += 1) value[index + 4] = type.charCodeAt(index); value.set(data, 8); writeUint32BE(value, data.byteLength + 8, crc32(value, 4, data.byteLength + 4)); return value; }
function canonicalMask(values: readonly number[]): Uint8Array {
  const raw = Uint8Array.of(0, ...values); const zlib = new Uint8Array(raw.byteLength + 11); zlib.set([0x78, 0x01, 1], 0); writeUint16LE(zlib, 3, raw.byteLength); writeUint16LE(zlib, 5, (~raw.byteLength) & 0xffff); zlib.set(raw, 7); writeUint32BE(zlib, raw.byteLength + 7, adler32(raw));
  const ihdr = new Uint8Array(13); writeUint32BE(ihdr, 0, values.length); writeUint32BE(ihdr, 4, 1); ihdr[8] = 8;
  const parts = [Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10), chunk('IHDR', ihdr), chunk('IDAT', zlib), chunk('IEND', new Uint8Array())]; const result = new Uint8Array(parts.reduce((total, part) => total + part.byteLength, 0)); let offset = 0; for (const part of parts) { result.set(part, offset); offset += part.byteLength; } return result;
}

describe('ComfyUI internal runtime', () => {
  it('admits API graph and exposes only # primitive widgets', () => {
    const graph = { '1': { class_type: 'Text', inputs: { text: 'saved' }, _meta: { title: '# Prompt 2' } } };
    const document = detectAndAdmitComfyUiWorkflowDocument(graph);
    expect(document.kind).toBe('api');
    const form = convertComfyUiApiWorkflowToForm(document.graph, { Text: { input: { required: { text: ['STRING'] } } } });
    expect(projectWorkflowParameters(form).map((item) => item.label)).toEqual(['text']);
  });

  it('admits custom and mask nodes but rejects mixed workflow shapes', () => {
    expect(detectAndAdmitComfyUiWorkflowDocument({
      '1': { class_type: 'CustomMaskNode', inputs: { mask: ['source', 0], config: { preserve: true } } },
    }).kind).toBe('api');
    expect(() => detectAndAdmitComfyUiWorkflowDocument({
      nodes: [{ id: 1, type: 'FrontendNode' }],
      '1': { class_type: 'ApiNode', inputs: {} },
    })).toThrow();
    expect(() => detectAndAdmitComfyUiWorkflowDocument({
      '1': { class_type: 'Huge', inputs: { text: 'x'.repeat(2_000_001) } },
    })).toThrow();
    const cyclic: Record<string, unknown> = { '1': { class_type: 'Cycle', inputs: {} } };
    (cyclic['1'] as Record<string, unknown>).inputs = cyclic;
    expect(() => detectAndAdmitComfyUiWorkflowDocument(cyclic)).toThrow();
  });

  it('accepts completed execution with no image outputs', () => {
    expect(validateComfyUiExecutionResult({ outputs: [], warnings: [] }).outputs).toEqual([]);
  });

  it('sorts exposed nodes naturally and skips linked or unsupported widgets', () => {
    const graph = {
      '1': { class_type: 'Params', inputs: { linked: ['9', 0], object: { unsafe: true }, enabled: true }, _meta: { title: '# Section 10' } },
      '2': { class_type: 'Params', inputs: { text: 'saved', seed: 7 }, _meta: { title: '# Section 2' } },
      '3': { class_type: 'Params', inputs: { text: 'hidden' }, _meta: { title: '. Hidden' } },
    };
    const objectInfo = { Params: { input: { required: { text: ['STRING'], seed: ['INT', { min: 0, max: 99 }], enabled: ['BOOLEAN'], linked: ['STRING'], object: ['CUSTOM'] } } } };
    const parameters = projectWorkflowParameters(convertComfyUiApiWorkflowToForm(graph, objectInfo));
    expect(parameters.map((item) => [item.sectionLabel, item.label, item.kind])).toEqual([
      ['Section 2', 'text', 'string'],
      ['Section 2', 'seed', 'seed'],
      ['Section 10', 'enabled', 'boolean'],
    ]);
  });

  it('keeps unmarked, dot-prefixed, muted, bypassed, read-only, and complex widgets hidden', () => {
    const form = convertComfyUiFrontendWorkflowToForm({ nodes: [
      { id: 1, title: 'Plain', widgets: [{ name: 'plain', type: 'string', value: 'saved' }] },
      { id: 2, title: '. Hidden', widgets: [{ name: 'hidden', type: 'string', value: 'saved' }] },
      { id: 3, title: '# Muted', mode: 2, widgets: [{ name: 'muted', type: 'string', value: 'saved' }] },
      { id: 4, title: '# Bypassed', bypassed: true, widgets: [{ name: 'bypassed', type: 'string', value: 'saved' }] },
      { id: 5, title: '# Same', widgets: [{ name: 'first', type: 'multiline', value: 'a' }, { name: 'locked', type: 'string', value: 'b', readOnly: true }, { name: 'custom', type: 'json', value: { keep: true } }] },
      { id: 6, title: '# Same', widgets: [{ name: 'second', type: 'number', value: 2 }, { name: 'enabled', type: 'boolean', value: true }, { name: 'choice', options: ['a', 'b'], value: 'a' }, { name: 'seed', type: 'seed', value: 7 }] },
    ] });
    expect(projectWorkflowParameters(form).map((item) => [item.sectionLabel, item.label, item.kind])).toEqual([
      ['Same', 'first', 'multiline-string'],
      ['Same', 'second', 'number'],
      ['Same', 'enabled', 'boolean'],
      ['Same', 'choice', 'combo'],
      ['Same', 'seed', 'seed'],
    ]);
    expect(form.nodes.find((node) => node.nodeId === '5')?.widgets.find((widget) => widget.label === 'custom')?.workflowValue).toBeUndefined();
  });

  it('collects multiple history images while skipping unsafe descriptors', async () => {
    const body = encoder.encode(JSON.stringify({
      prompt: {
        status: { status_str: 'success', completed: true },
        outputs: {
          PreviewImage: { images: [{ filename: 'preview.png', subfolder: '', type: 'temp' }] },
          SaveImage: { images: [{ filename: 'saved-node.png', subfolder: '', type: 'output' }] },
          custom: { images: [{ filename: '../unsafe.png', subfolder: '', type: 'output' }, { filename: 'saved.png', subfolder: 'folder', type: 'output' }] },
        },
      },
    }));
    const result = await observeKnownComfyUiPrompt(
      { connection, promptId: 'prompt' },
      { transport: { request: async () => ({ status: 200, headers: {}, body }) }, clock: { now: () => 0, sleep: async () => {} } },
    );
    expect(result.descriptors.map((item) => item.filename)).toEqual(['preview.png', 'saved-node.png', 'saved.png']);
    expect(result.warnings.map((item) => item.code)).toContain('unsafe-output-skipped');
  });

  it('keeps safe downloaded siblings when one image response is unsafe', async () => {
    const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
    const stored = await downloadAndStoreComfyUiOutputs(
      { connection, descriptors: [{ filename: 'good.png', subfolder: '', type: 'output' }, { filename: 'bad.png', subfolder: '', type: 'output' }] },
      {
        transport: { request: async (request) => request.path.includes('good.png') ? { status: 200, headers: { 'content-type': 'image/png' }, body: png } : { status: 200, headers: { 'content-type': 'text/plain' }, body: encoder.encode('bad') } },
        sink: { put: async (_bytes, meta) => ({ kind: 'inline', ref: meta.name ?? 'image', mimeType: meta.mimeType }) },
      },
    );
    expect(stored.outputs).toHaveLength(1);
    expect(stored.warnings).toEqual([{ code: 'unsafe-output-skipped', messageKey: 'comfyui.warning.unsafe-output-skipped' }]);
  });

  it('maps native node_errors without replaying prompt submission', async () => {
    let prompts = 0;
    const graph = { '1': { class_type: 'PreviewImage', inputs: { images: ['2', 0] }, _meta: { title: 'Preview' } } };
    await expect(executeComfyUiApiGraph(
      { connection, source: { kind: 'api-graph', workflowId: 'wf', revision: 'r1', graph }, images: [] },
      { imageValues: [] },
      {
        transport: { request: async () => { prompts += 1; return { status: 400, headers: { 'content-type': 'application/json' }, body: encoder.encode(JSON.stringify({ error: 'invalid prompt', node_errors: { '1': { errors: [] } } })) }; } },
        sink: { put: async () => ({ kind: 'inline', ref: 'unused' }) },
      },
    )).rejects.toMatchObject({ details: { code: 'prompt-no-outputs', remoteMayContinue: false } });
    expect(prompts).toBe(1);
  });

  it('injects uploaded image into the resolved image mapping only', async () => {
    let postedPrompt: Record<string, unknown> | undefined;
    const graph = {
      '1': { class_type: 'LoadImage', inputs: { image: 'first.png' }, _meta: { title: 'First' } },
      '2': { class_type: 'LoadImage', inputs: { image: 'second.png' }, _meta: { title: 'Second' } },
      '3': { class_type: 'PreviewImage', inputs: { images: ['2', 0] }, _meta: { title: 'Preview' } },
    };
    await executeComfyUiApiGraph(
      {
        connection,
        source: {
          kind: 'api-graph',
          workflowId: 'wf',
          revision: 'r1',
          graph,
          objectInfo: { LoadImage: { input: { required: { image: ['STRING', { image_upload: true }] } } } },
        },
        images: [],
        imageInputRef: { nodeId: '2', inputName: 'image' },
      },
      { imageValues: ['uploaded.png'] },
      {
        transport: {
          request: async (request) => {
            if (request.method === 'POST') {
              postedPrompt = JSON.parse(new TextDecoder().decode(request.body)) as Record<string, unknown>;
              return { status: 200, headers: {}, body: encoder.encode(JSON.stringify({ prompt_id: 'prompt' })) };
            }
            return { status: 200, headers: {}, body: encoder.encode(JSON.stringify({ prompt: { status: { status_str: 'success', completed: true }, outputs: {} } })) };
          },
        },
        sink: { put: async () => ({ kind: 'inline', ref: 'unused' }) },
      },
    );
    const prompt = postedPrompt?.prompt as Record<string, { readonly inputs: Record<string, unknown> }>;
    expect(prompt['1'].inputs.image).toBe('first.png');
    expect(prompt['2'].inputs.image).toBe('uploaded.png');
  });

  it('injects Mask only into explicit binding and preserves unrelated image values', async () => {
    let postedPrompt: Record<string, unknown> | undefined;
    const graph = {
      '1': { class_type: 'LoadImage', inputs: { image: 'saved-mask.png' }, _meta: { title: 'Mask' } },
      '2': { class_type: 'LoadImage', inputs: { image: 'saved-primary.png' }, _meta: { title: 'Primary' } },
      '3': { class_type: 'LoadImage', inputs: { image: 'untouched.png' }, _meta: { title: 'Other' } },
      '4': { class_type: 'PreviewImage', inputs: { images: ['2', 0] }, _meta: { title: 'Preview' } },
    };
    await executeComfyUiApiGraph(
      {
        connection,
        source: { kind: 'api-graph', workflowId: 'wf', revision: 'r1', graph, objectInfo: { LoadImage: { input: { required: { image: ['STRING', { image_upload: true }] } } } } },
        images: [],
        imageInputRef: { nodeId: '2', inputName: 'image' },
        mask: { asset: { storedRef: { kind: 'inline', ref: 'mask' }, width: 2, height: 1 }, binding: { transport: 'separate-image-input', inputRef: { nodeId: '1', inputName: 'image' }, polarity: 'white-edit' } },
      },
      { imageValues: ['uploaded-primary.png'], maskValue: 'uploaded-mask.png' },
      {
        transport: { request: async (request) => {
          if (request.method === 'POST') { postedPrompt = JSON.parse(new TextDecoder().decode(request.body)) as Record<string, unknown>; return { status: 200, headers: {}, body: encoder.encode(JSON.stringify({ prompt_id: 'prompt' })) }; }
          return { status: 200, headers: {}, body: encoder.encode(JSON.stringify({ prompt: { status: { status_str: 'success', completed: true }, outputs: {} } })) };
        } },
        sink: { put: async () => ({ kind: 'inline', ref: 'unused' }) },
      },
    );
    const prompt = postedPrompt?.prompt as Record<string, { readonly inputs: Record<string, unknown> }>;
    expect(prompt['1'].inputs.image).toBe('uploaded-mask.png');
    expect(prompt['2'].inputs.image).toBe('uploaded-primary.png');
    expect(prompt['3'].inputs.image).toBe('untouched.png');
  });

  it('inverts canonical grayscale Mask only for black-edit binding', async () => {
    const uploadedBodies: Uint8Array[] = [];
    const result = await prepareComfyUiUploads(
      { connection, images: [], mask: { asset: { storedRef: { kind: 'inline', ref: 'mask' }, width: 2, height: 1 }, polarity: 'black-edit' } },
      {
        resolver: { resolve: async () => ({ bytes: canonicalMask([0, 255]), mimeType: 'image/png' }) },
        transport: { request: async (request) => { uploadedBodies.push(request.body ?? new Uint8Array()); return { status: 200, headers: {}, body: encoder.encode(JSON.stringify({ name: 'mask.png', subfolder: '', type: 'input' })) }; } },
      },
    );
    expect(result).toEqual({ imageValues: [], maskValue: 'mask.png' });
    expect(uploadedBodies).toHaveLength(1);
    expect(uploadedBodies[0].some((value, index, values) => values[index] === 0 && values[index + 1] === 255 && values[index + 2] === 0)).toBe(true);
  });

  it('sends frontend Mask only through explicit widget binding', async () => {
    let submit: Record<string, unknown> | undefined;
    const identity = { origin: 'https://example.test', sourceId: 'source', loadId: 'load' };
    await executeComfyUiFrontendQueue(
      {
        connection,
        source: { kind: 'frontend-workflow', workflowId: 'wf', revision: 'r1', remotePath: 'workflow.json' },
        images: [],
        imageInputRef: { nodeId: 'primary', widgetIndex: 0 },
        mask: { asset: { storedRef: { kind: 'inline', ref: 'mask' }, width: 1, height: 1 }, binding: { transport: 'separate-image-input', inputRef: { nodeId: 'mask', widgetIndex: 1 }, polarity: 'white-edit' } },
      },
      { imageValues: ['primary.png'], maskValue: 'mask.png' },
      {
        bridgeResolver: { resolve: async () => ({ identity, exchange: async (request) => {
          if (request.command === 'handshake') return { requestId: request.requestId, ok: true, payload: { identity, protocolVersion: 1, bridgeVersion: 'test', frontendVersion: 'test', coreVersion: 'test', capabilities: { nativeQueue: true, workflowDiscovery: true, receiptObserver: true }, limits: COMFYUI_BRIDGE_LIMITS } };
          submit = request.payload as Record<string, unknown>;
          return { requestId: request.requestId, ok: true, payload: { operationId: (request.payload as { operationId: string }).operationId, promptId: 'prompt', acknowledgedAt: 1 } };
        } }) },
        transport: { request: async () => ({ status: 200, headers: {}, body: encoder.encode(JSON.stringify({ prompt: { status: { status_str: 'success', completed: true }, outputs: {} } })) }) },
        sink: { put: async () => ({ kind: 'inline', ref: 'unused' }) },
      },
    );
    expect(submit?.mutations).toEqual([
      { ref: { nodeId: 'primary', widgetIndex: 0 }, value: 'primary.png' },
      { ref: { nodeId: 'mask', widgetIndex: 1 }, value: 'mask.png' },
    ]);
  });

  it('stops before /prompt when Mask upload barrier fails', async () => {
    const paths: string[] = [];
    let bridgeResolves = 0;
    const adapter = createComfyUiExecutionAdapter({
      assetResolver: { resolve: async () => undefined },
      assetSink: { put: async () => ({ kind: 'inline', ref: 'unused' }) },
      httpTransport: { request: async (request) => { paths.push(request.path); return { status: 200, headers: {}, body: encoder.encode(JSON.stringify({ prompt_id: 'must-not-submit' })) }; } },
      frontendBridgeResolver: { resolve: async () => { bridgeResolves += 1; return undefined; } },
    });
    await expect(adapter.dispatch({ request: {
      connection,
      source: { kind: 'frontend-workflow', workflowId: 'wf', revision: 'r1', remotePath: 'workflow.json' },
      images: [],
      mask: { asset: { storedRef: { kind: 'inline', ref: 'missing-mask' }, width: 1, height: 1 }, binding: { transport: 'separate-image-input', inputRef: { nodeId: '1', inputName: 'image' }, polarity: 'white-edit' } },
    } })).rejects.toMatchObject({ details: { stage: 'prepare', code: 'asset-unavailable' } });
    expect(paths).not.toContain('/prompt');
    expect(bridgeResolves).toBe(0);
  });

  it('fast-fails known no-output metadata without native submission', async () => {
    let requests = 0;
    const adapter = createComfyUiExecutionAdapter({
      assetResolver: { resolve: async () => undefined },
      assetSink: { put: async () => ({ kind: 'inline', ref: 'unused' }) },
      httpTransport: { request: async () => { requests += 1; throw new Error('must not submit'); } },
    });
    await expect(adapter.dispatch({ request: {
      connection,
      source: { kind: 'api-graph', workflowId: 'wf', revision: 'r1', graph: { '1': { class_type: 'Text', inputs: { text: 'saved' } } }, objectInfo: { Text: { output_node: false } } },
      images: [],
    } })).rejects.toMatchObject({ details: { code: 'prompt-no-outputs' } });
    expect(requests).toBe(0);
  });

  it('defers unknown custom-node output metadata to native validation once', async () => {
    let prompts = 0;
    const paths: string[] = [];
    const adapter = createComfyUiExecutionAdapter({
      assetResolver: { resolve: async () => undefined },
      assetSink: { put: async () => ({ kind: 'inline', ref: 'unused' }) },
      httpTransport: {
        request: async (request) => {
          paths.push(request.path);
          if (request.method === 'POST') {
            prompts += 1;
            return { status: 200, headers: {}, body: encoder.encode(JSON.stringify({ prompt_id: 'prompt' })) };
          }
          return { status: 200, headers: {}, body: encoder.encode(JSON.stringify({ prompt: { status: { status_str: 'success', completed: true }, outputs: {} } })) };
        },
      },
    });
    await expect(adapter.dispatch({ request: {
      connection,
      source: { kind: 'api-graph', workflowId: 'wf', revision: 'r1', graph: { '1': { class_type: 'CustomOutput', inputs: {} } }, objectInfo: {} },
      images: [],
    } })).resolves.toMatchObject({ outputs: [] });
    expect(prompts).toBe(1);
    expect(paths.some((path) => path.includes('/upload/image'))).toBe(false);
  });
});
