import { z } from 'zod';
import { providerBillingConfigSchema, providerConnectionCollectionSchema } from '../../contract/config-schema.js';
import { normalizeApiFormatPaths } from '../../contract/api-format.js';
import type { OpenAiChatCompletionsPaths } from '../../contract/api-format.js';

/**
 * Chat image provider config 的 Zod schema。
 *
 * 与 `src/contract/config.ts` 中的 `ChatImageProviderConfig` 对齐。
 */
export const chatImageConfigSchema = z.object({
  providerId: z.string().min(1),
  displayName: z.string().min(1),
  family: z.literal('chat-image'),
  apiFormat: z.literal('openai-chat-completions').default('openai-chat-completions'),
  connection: providerConnectionCollectionSchema,
  paths: z.unknown().optional().transform((value, ctx) => {
    try {
      return normalizeApiFormatPaths('openai-chat-completions', value) as OpenAiChatCompletionsPaths;
    } catch (error) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: error instanceof Error ? error.message : 'Invalid OpenAI Chat Completions paths.',
      });
      return z.NEVER;
    }
  }),
  apiKey: z.string().min(1),
  defaultModel: z.string().optional(),
  billing: providerBillingConfigSchema,
  extraHeaders: z.record(z.string(), z.string()).optional(),
  timeoutMs: z.number().int().positive().optional(),
});

/** 从 schema 推导的 ChatImageProviderConfig 类型。 */
export type ChatImageProviderConfig = z.infer<typeof chatImageConfigSchema>;
