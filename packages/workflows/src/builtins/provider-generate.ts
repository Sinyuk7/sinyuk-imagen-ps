import type { Workflow } from '@imagen-ps/core-engine';

const generateStep = Object.freeze({
  name: 'generate',
  kind: 'provider',
  input: Object.freeze({
    provider: '${provider}',
    providerProfileId: '${providerProfileId}',
    profileId: '${profileId}',
    request: Object.freeze({
      operation: 'generate',
      prompt: '${prompt}',
      output: '${output}',
      providerOptions: '${providerOptions}',
    }),
  }),
  outputKey: 'image',
}) satisfies Workflow['steps'][number];

/**
 * 最小 image generation workflow。
 *
 * 当前 contract：
 * - 输入：`provider`（必需，provider id 字符串）、`prompt`（必需，文本）
 * - 输入：`providerProfileId`、`profileId` — 支持 profile-based dispatch
 * - 输入：`providerOptions` — 通过 `request.providerOptions` 绑定，支持 model selection 及 provider-specific 选项透传
 * - 输入：`output` — 通过 `request.output` 绑定，支持 count、width、height 等输出选项
 * - 输出 key：`image`（指向 provider 返回的 `ProviderInvokeResult`）
 * 只负责把 job input 绑定到单个 provider step，不承载 provider 语义或执行逻辑。
 */
export const providerGenerateWorkflow = Object.freeze({
  name: 'provider-generate',
  version: '1',
  steps: Object.freeze([generateStep]),
}) satisfies Workflow;
