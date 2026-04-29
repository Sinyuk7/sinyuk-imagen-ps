import type { ProviderDescriptor } from '../../contract/provider.js';

/**
 * Mock provider 的静态 descriptor。
 *
 * 关于 `defaultModels` / `discoverModels` 的设计决策：
 * - 声明 `defaultModels: [{ id: 'mock-image-v1' }]` 作为 implementation 自带的
 *   fallback model 候选清单，供 `listProfileModels` 在 profile 没有 discovery
 *   缓存时兜底；该字段不参与 `MockProvider.invoke()` 的 model 解析（model 解析
 *   仍由 `model-selection` 三级优先级负责）。
 * - **不**实现 `discoverModels`：mock 没有可询问的远端来源；
 *   `refreshProfileModels` 针对 mock 时应当返回 `validation` 错误，这是设计意图，
 *   用以验证 "implementation 不支持 discovery" 路径。
 */
export const mockDescriptor: ProviderDescriptor = {
  id: 'mock',
  family: 'openai-compatible',
  displayName: 'Mock Provider',
  capabilities: {
    imageGenerate: true,
    imageEdit: true,
    multiImageInput: false,
    transparentBackground: false,
    customSize: false,
    aspectRatio: false,
    syncInvoke: true,
  },
  operations: ['generate', 'edit'],
  defaultModels: [{ id: 'mock-image-v1' }],
};
