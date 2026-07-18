import type { Workflow } from '@imagen-ps/core-engine';

const comfyUiStep = Object.freeze({
  name: 'generate',
  kind: 'execution',
  adapter: 'comfyui',
  input: Object.freeze({
    request: '${request}',
  }),
  outputKey: 'comfyui',
}) satisfies Workflow['steps'][number];

/** ComfyUI backend 的最小 opaque execution workflow。 */
export const comfyUiGenerationWorkflow = Object.freeze({
  name: 'comfyui-generation',
  version: '1',
  steps: Object.freeze([comfyUiStep]),
}) satisfies Workflow;
