import { z } from 'zod';
import { providerConnectionCollectionSchema } from '../../contract/config-schema.js';

/**
 * Prompt optimize provider config 的 Zod schema。
 *
 * 与 `src/contract/config.ts` 中的 `PromptOptimizeProviderConfig` 对齐。
 */
export const promptOptimizeConfigSchema = z.object({
  providerId: z.string().min(1),
  displayName: z.string().min(1),
  family: z.literal('prompt-optimize'),
  connection: providerConnectionCollectionSchema,
  apiKey: z.string().min(1),
  defaultModel: z.string().optional(),
  instruction: z.string().min(1),
  testPrompt: z.string().optional(),
  extraHeaders: z.record(z.string(), z.string()).optional(),
  timeoutMs: z.number().int().positive().optional(),
});

/** 从 schema 推导的 PromptOptimizeProviderConfig 类型。 */
export type PromptOptimizeProviderConfig = z.infer<typeof promptOptimizeConfigSchema>;
