import { z } from 'zod';

/**
 * OpenAI-compatible provider config 的 Zod schema。
 *
 * 与 `src/contract/config.ts` 中的 `OpenAICompatibleProviderConfig` 对齐。
 */
export const openaiCompatibleConfigSchema = z.object({
  providerId: z.string().min(1),
  displayName: z.string().min(1),
  family: z.literal('openai-compatible'),
  baseURL: z.string().url(),
  apiKey: z.string().min(1),
  defaultModel: z.string().optional(),
  extraHeaders: z.record(z.string(), z.string()).optional(),
  capabilityHints: z
    .object({
      imageGenerate: z.boolean().optional(),
      imageEdit: z.boolean().optional(),
      multiImageInput: z.boolean().optional(),
      transparentBackground: z.boolean().optional(),
      customSize: z.boolean().optional(),
      aspectRatio: z.boolean().optional(),
      syncInvoke: z.boolean().optional(),
    })
    .optional(),
  timeoutMs: z.number().int().positive().optional(),
});

/** 从 schema 推导的 OpenAICompatibleProviderConfig 类型。 */
export type OpenAICompatibleProviderConfig = z.infer<typeof openaiCompatibleConfigSchema>;
