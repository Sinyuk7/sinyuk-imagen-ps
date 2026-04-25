import type { Workflow } from '@imagen-ps/core-engine';

const editStep = Object.freeze({
  name: 'edit',
  kind: 'provider',
  input: Object.freeze({
    provider: '${provider}',
    request: Object.freeze({
      operation: 'edit',
      prompt: '${prompt}',
      inputAssets: '${inputAssets}',
    }),
  }),
  outputKey: 'image',
}) satisfies Workflow['steps'][number];

/**
 * 最小 image edit workflow。
 *
 * 当前将 `inputAssets` 视为 edit happy path 的必要输入，其余 provider 细节留在 provider 层处理。
 */
export const providerEditWorkflow = Object.freeze({
  name: 'provider-edit',
  version: '1',
  steps: Object.freeze([editStep]),
}) satisfies Workflow;
