import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import fixtures from '../contract/contract-fixtures.json';
import {
  COMFYUI_CONTRACT_SCHEMA_SHA256,
  ComfyUiApiGraphValidationError,
  ComfyUiContractValidationError,
  IMAGEN_WORKFLOW_BINDING_CLASS_ID,
  IMAGEN_WORKFLOW_TYPE_CLASS_ID,
  admitComfyUiApiGraph,
  parseComfyUiWorkflowContract,
  parseComfyUiWorkflowContractFromApiGraph,
  validateCanonicalComfyUiWorkflowContract,
  validateComfyUiApiGraphTargets,
} from '../src/index.js';

describe('authoritative workflow contract', () => {
  it.each(fixtures.cases)('$id', (fixture) => {
    if (fixture.valid) {
      const contract = parseComfyUiWorkflowContract(fixture.binding, fixture.type);
      expect(validateCanonicalComfyUiWorkflowContract(contract)).toEqual(contract);
      expect(Object.isFrozen(contract)).toBe(true);
      expect(Object.isFrozen(contract.entries)).toBe(true);
      return;
    }
    expect(() => parseComfyUiWorkflowContract(fixture.binding, fixture.type))
      .toThrowError(ComfyUiContractValidationError);
  });

  it('canonicalizes role and slot order', () => {
    const fixture = fixtures.cases.find((item) => item.id === 'valid-image-edit-mask-and-ordered-outputs');
    if (fixture === undefined) throw new Error('fixture missing');
    const contract = parseComfyUiWorkflowContract(fixture.binding, fixture.type);
    expect(contract.entries.map((entry) => `${entry.role}:${entry.slot}`)).toEqual([
      'prompt:0',
      'image:0',
      'image:1',
      'mask:0',
      'output-image:0',
      'output-image:1',
    ]);
  });

  it('pins digest to exact canonical schema bytes', async () => {
    const bytes = await readFile(new URL('../contract/workflow-contract.schema.json', import.meta.url));
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(COMFYUI_CONTRACT_SCHEMA_SHA256);
  });

  it('extracts exactly two stable API Graph contract nodes', () => {
    const fixture = fixtures.cases.find((item) => item.id === 'valid-text-to-image');
    if (fixture === undefined) throw new Error('fixture missing');
    const graph = admitComfyUiApiGraph({
      binding: {
        class_type: IMAGEN_WORKFLOW_BINDING_CLASS_ID,
        inputs: { contract: fixture.binding },
      },
      type: {
        class_type: IMAGEN_WORKFLOW_TYPE_CLASS_ID,
        inputs: { contract: JSON.stringify(fixture.type) },
      },
      'prompt-node': { class_type: 'Text', inputs: { text: '' } },
      'save-node': { class_type: 'SaveImage', inputs: { images: '' } },
    });
    const contract = parseComfyUiWorkflowContractFromApiGraph(graph);
    expect(contract.operation).toBe('text-to-image');
    expect(() => validateComfyUiApiGraphTargets(graph, contract)).not.toThrow();
  });

  it('rejects frontend shape, cycles, prototypes, non-finite values and links', () => {
    expect(() => admitComfyUiApiGraph({ nodes: [] })).toThrowError(ComfyUiApiGraphValidationError);
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => admitComfyUiApiGraph(cyclic)).toThrowError(ComfyUiApiGraphValidationError);
    expect(() => admitComfyUiApiGraph(Object.create({ inherited: true }) as unknown))
      .toThrowError(ComfyUiApiGraphValidationError);
    expect(() => admitComfyUiApiGraph({ node: { class_type: 'Finite', inputs: { value: Number.NaN } } }))
      .toThrowError(ComfyUiApiGraphValidationError);

    const fixture = fixtures.cases.find((item) => item.id === 'valid-text-to-image');
    if (fixture === undefined) throw new Error('fixture missing');
    const contract = parseComfyUiWorkflowContract(fixture.binding, fixture.type);
    const linked = admitComfyUiApiGraph({
      binding: { class_type: IMAGEN_WORKFLOW_BINDING_CLASS_ID, inputs: { contract: fixture.binding } },
      type: { class_type: IMAGEN_WORKFLOW_TYPE_CLASS_ID, inputs: { contract: fixture.type } },
      'prompt-node': { class_type: 'Text', inputs: { text: ['other', 0] } },
      'save-node': { class_type: 'SaveImage', inputs: { images: '' } },
    });
    expect(() => validateComfyUiApiGraphTargets(linked, contract))
      .toThrowError(ComfyUiApiGraphValidationError);
  });

  it('enforces 64KB per-node and 128-char locator bounds', () => {
    const oversized = {
      schemaVersion: 1,
      bindings: [{
        role: 'prompt',
        slot: 0,
        locator: { nodeId: 'x'.repeat(129), fieldName: 'text' },
      }],
    };
    const type = {
      schemaVersion: 1,
      operation: 'text-to-image',
      entries: [{ role: 'prompt', slot: 0, required: true, dataType: 'text' }],
    };
    expect(() => parseComfyUiWorkflowContract(oversized, type)).toThrowError(ComfyUiContractValidationError);
    expect(() => parseComfyUiWorkflowContract('x'.repeat(65_537), type)).toThrowError(ComfyUiContractValidationError);
  });
});
