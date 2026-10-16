import { z } from 'zod';
import { providerBillingConfigSchema, providerConnectionCollectionSchema } from '../../contract/config-schema.js';
import { normalizeProviderIdPaths } from '../../contract/provider-routing.js';
import type { OpenAiImagesPaths } from '../../contract/provider-routing.js';

/**
 * Image endpoint provider config 的 Zod schema。
 *
 * 与 `src/contract/config.ts` 中的 `OpenAiProviderConfig` 对齐。
 */
export const openAiConfigSchema = z.object({
  providerId: z.literal('openai'),
  displayName: z.string().min(1),
  family: z.literal('openai'),
  connection: providerConnectionCollectionSchema,
  paths: z.unknown().optional().transform((value, ctx) => {
    try {
      return normalizeProviderIdPaths('openai', value) as OpenAiImagesPaths;
    } catch (error) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: error instanceof Error ? error.message : 'Invalid OpenAI Images paths.',
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

/** 从 schema 推导的 OpenAiProviderConfig 类型。 */
export type OpenAiProviderConfig = z.infer<typeof openAiConfigSchema>;
