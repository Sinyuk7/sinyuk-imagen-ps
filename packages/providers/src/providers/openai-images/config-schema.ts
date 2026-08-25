import { z } from 'zod';
import { providerBillingConfigSchema, providerConnectionCollectionSchema } from '../../contract/config-schema.js';
import { normalizeApiFormatPaths } from '../../contract/api-format.js';
import type { OpenAiImagesPaths } from '../../contract/api-format.js';

/**
 * Image endpoint provider config 的 Zod schema。
 *
 * 与 `src/contract/config.ts` 中的 `ImageEndpointProviderConfig` 对齐。
 */
export const imageEndpointConfigSchema = z.object({
  providerId: z.string().min(1),
  displayName: z.string().min(1),
  family: z.literal('image-endpoint'),
  apiFormat: z.literal('openai-images').default('openai-images'),
  connection: providerConnectionCollectionSchema,
  paths: z.unknown().optional().transform((value, ctx) => {
    try {
      return normalizeApiFormatPaths('openai-images', value) as OpenAiImagesPaths;
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

/** 从 schema 推导的 ImageEndpointProviderConfig 类型。 */
export type ImageEndpointProviderConfig = z.infer<typeof imageEndpointConfigSchema>;
