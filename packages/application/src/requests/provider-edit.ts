import type { Workflow } from '@imagen-ps/core-engine';

const editStep = Object.freeze({
  name: 'edit',
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
 * 最小 image edit workflow。
 *
 * 当前 contract：
 * - 静态 adapter：`provider`
 * - 输入：`implementationId`、`profileId` 与 admission 已生成的 canonical `request`
 * - 输出 key：`image`
 *
 * 只负责把 admitted execution input 绑定到单个 provider adapter，不承载 provider 语义。
 */
export const providerEditWorkflow = Object.freeze({
  name: 'provider-edit',
  version: '1',
  steps: Object.freeze([editStep]),
}) satisfies Workflow;
