import type { Workflow } from '@imagen-ps/core-engine';

const editStep = Object.freeze({
  name: 'edit',
  kind: 'provider',
  input: Object.freeze({
    provider: '${provider}',
    providerProfileId: '${providerProfileId}',
    profileId: '${profileId}',
    request: Object.freeze({
      operation: 'edit',
      prompt: '${prompt}',
      inputAssets: '${inputAssets}',
      maskAsset: '${maskAsset}',
      output: '${output}',
      providerOptions: '${providerOptions}',
    }),
  }),
  outputKey: 'image',
}) satisfies Workflow['steps'][number];

/**
 * 最小 image edit workflow。
 *
 * 当前 contract：
 * - 输入：`provider`（必需，provider id 字符串）、`prompt`（必需，文本）、`inputAssets`（必需）
 * - 输入：`providerProfileId`、`profileId` — 支持 profile-based dispatch，与 `provider-generate` 对齐
 * - 输入：`maskAsset`、`output`、`providerOptions` — 通过 request 绑定，支持 edit API 的 mask、输出选项与 provider-specific 透传
 * - 输出 key：`image`
 *
 * 只负责把 job input 绑定到单个 provider step，不承载 provider 语义或执行逻辑。
 */
export const providerEditWorkflow = Object.freeze({
  name: 'provider-edit',
  version: '1',
  steps: Object.freeze([editStep]),
}) satisfies Workflow;
