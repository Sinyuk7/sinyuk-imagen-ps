import { describe, expect, it } from 'vitest';

import { createWorkflowRegistry } from './registry.js';
import type { Workflow } from './types/workflow.js';

describe('createWorkflowRegistry', () => {
  it('registers and looks up workflows by name', () => {
    const registry = createWorkflowRegistry();
    const workflow: Workflow = {
      name: 'provider-generate',
      steps: [
        {
          name: 'generate',
          kind: 'provider',
          input: { prompt: 'hello' },
          outputKey: 'image',
        },
      ],
    };

    const registered = registry.register(workflow);

    expect(registry.get('provider-generate')).toBe(registered);
    expect(registry.list()).toEqual([registered]);
    expect(Object.isFrozen(registered)).toBe(true);
  });

  it('registers initial workflows on creation', () => {
    const registry = createWorkflowRegistry([
      {
        name: 'builtin-a',
        steps: [{ name: 'step-a', kind: 'provider' }],
      },
      {
        name: 'builtin-b',
        steps: [{ name: 'step-b', kind: 'provider' }],
      },
    ]);

    expect(registry.list()).toHaveLength(2);
    expect(registry.get('builtin-a')?.name).toBe('builtin-a');
    expect(registry.get('builtin-b')?.name).toBe('builtin-b');
  });

  it('rejects duplicate workflow names', () => {
    const registry = createWorkflowRegistry([
      {
        name: 'provider-generate',
        steps: [],
      },
    ]);

    expect(() =>
      registry.register({
        name: 'provider-generate',
        steps: [],
      }),
    ).toThrow(/already registered/);
  });

  it('rejects empty workflow name', () => {
    const registry = createWorkflowRegistry();

    expect(() =>
      registry.register({
        name: '  ',
        steps: [],
      }),
    ).toThrow(/non-empty string/);
  });

  it('rejects empty step name', () => {
    const registry = createWorkflowRegistry();

    expect(() =>
      registry.register({
        name: 'bad-step',
        steps: [{ name: '  ', kind: 'provider' }],
      }),
    ).toThrow(/empty or invalid name/);
  });

  it('rejects invalid step kind', () => {
    const registry = createWorkflowRegistry();

    expect(() =>
      registry.register({
        name: 'bad-kind',
        steps: [{ name: 'step1', kind: 'invalid' as 'provider' }],
      }),
    ).toThrow(/invalid kind/);
  });

  it('rejects empty outputKey when provided', () => {
    const registry = createWorkflowRegistry();

    expect(() =>
      registry.register({
        name: 'bad-output-key',
        steps: [
          {
            name: 'step1',
            kind: 'provider',
            outputKey: '  ',
          },
        ],
      }),
    ).toThrow(/empty outputKey/);
  });

  it('rejects non-serializable step input', () => {
    const registry = createWorkflowRegistry();

    expect(() =>
      registry.register({
        name: 'bad-input',
        steps: [
          {
            name: 'step1',
            kind: 'provider',
            input: { fn: () => {} } as unknown as Record<string, unknown>,
          },
        ],
      }),
    ).toThrow(/function/);
  });

  it('returns immutable workflow snapshots', () => {
    const registry = createWorkflowRegistry();
    const registered = registry.register({
      name: 'immutable-test',
      steps: [
        {
          name: 'step1',
          kind: 'provider',
          input: { value: 1 },
        },
      ],
    });

    expect(Object.isFrozen(registered)).toBe(true);
    expect(Object.isFrozen(registered.steps)).toBe(true);
    expect(Object.isFrozen(registered.steps[0])).toBe(true);
    expect(Object.isFrozen(registered.steps[0].input)).toBe(true);
  });
});
