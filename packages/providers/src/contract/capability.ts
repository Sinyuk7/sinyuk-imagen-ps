/**
 * Provider capability 契约。
 *
 * 这些类型只描述 provider 自身公开的能力，不携带 host 或 transport 细节。
 */

/** 当前阶段允许的 provider family。按 wire shape 分类，仅作展示/分组标签。 */
export type ProviderFamily = 'image-endpoint' | 'chat-image' | 'gemini-generate-content' | 'prompt-optimize';

/** 当前阶段允许的 provider operation。 */
export type ProviderOperation = 'text_to_image' | 'image_edit' | 'prompt_optimize';
