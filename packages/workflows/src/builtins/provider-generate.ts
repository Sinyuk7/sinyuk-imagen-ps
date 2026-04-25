import type { Workflow } from '@imagen-ps/core-engine';

const generateStep = Object.freeze({
  name: 'generate',
  kind: 'provider',
  input: Object.freeze({
    provider: '${provider}',
    request: Object.freeze({
      operation: 'generate',
      prompt: '${prompt}',
    }),
  }),
  outputKey: 'image',
}) satisfies Workflow['steps'][number];

/**
 * 最小 image generation workflow。
 *
 * 当前稳定 contract：
 * - 输入：`provider`（必需）、`prompt`（必需）
 * - 输出 key：`image`
 *
 * Tentative（未纳入当前稳定范围）：`maskAsset`、`output`、`providerOptions`
 *
 * 只负责把 job input 绑定到单个 provider step，不承载 provider 语义或执行逻辑。
 */
export const providerGenerateWorkflow = Object.freeze({
  name: 'provider-generate',
  version: '1',
  steps: Object.freeze([generateStep]),
}) satisfies Workflow;
