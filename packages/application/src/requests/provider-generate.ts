import type { Workflow } from '@imagen-ps/core-engine';

const generateStep = Object.freeze({
  name: 'generate',
  kind: 'execution',
  adapter: 'provider',
  input: Object.freeze({
    implementationId: '${implementationId}',
    profileId: '${profileId}',
    request: '${request}',
  }),
  outputKey: 'image',
}) satisfies Workflow['steps'][number];

/**
 * 最小 image generation workflow。
 *
 * 当前 contract：
 * - 静态 adapter：`provider`
 * - 输入：`implementationId`、`profileId` 与 admission 已生成的 canonical `request`
 * - 输出 key：`image`（指向 provider 返回的 `ProviderInvokeResult`）
 * 只负责把 admitted execution input 绑定到单个 provider adapter，不承载 provider 语义。
 */
export const providerGenerateWorkflow = Object.freeze({
  name: 'provider-generate',
  version: '1',
  steps: Object.freeze([generateStep]),
}) satisfies Workflow;
