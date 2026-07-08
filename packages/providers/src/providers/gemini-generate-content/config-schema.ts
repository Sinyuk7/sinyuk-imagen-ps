import { z } from 'zod';
import { providerBillingConfigSchema, providerConnectionCollectionSchema } from '../../contract/config-schema.js';
import { normalizeApiFormatPaths } from '../../contract/api-format.js';
import type { GeminiGenerateContentPaths } from '../../contract/api-format.js';

function authHeaderOverrideKeys(extraHeaders: Readonly<Record<string, string>> | undefined): readonly string[] {
  return Object.keys(extraHeaders ?? {}).filter((key) => {
    const normalized = key.toLowerCase();
    return normalized === 'authorization' || normalized === 'x-goog-api-key';
  });
}

/**
 * Gemini Generate Content provider config 的 Zod schema。
 *
 * 与 `src/contract/config.ts` 中的 `GeminiGenerateContentProviderConfig` 对齐。
 */
export const geminiGenerateContentConfigSchema = z.object({
  providerId: z.string().min(1),
  displayName: z.string().min(1),
  family: z.literal('gemini-generate-content'),
  apiFormat: z.literal('gemini-generate-content').default('gemini-generate-content'),
  connection: providerConnectionCollectionSchema,
  paths: z.unknown().optional().transform((value, ctx) => {
    try {
      return normalizeApiFormatPaths('gemini-generate-content', value) as GeminiGenerateContentPaths;
    } catch (error) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: error instanceof Error ? error.message : 'Invalid Gemini GenerateContent paths.',
      });
      return z.NEVER;
    }
  }),
  apiKey: z.string().optional(),
  authMode: z.enum(['x-goog-api-key', 'bearer', 'none']).default('x-goog-api-key'),
  defaultModel: z.string().optional(),
  billing: providerBillingConfigSchema,
  extraHeaders: z.record(z.string(), z.string()).optional(),
  timeoutMs: z.number().int().positive().optional(),
}).superRefine((value, ctx) => {
  if (value.authMode !== 'none' && (typeof value.apiKey !== 'string' || value.apiKey.length === 0)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Gemini Generate Content apiKey is required unless authMode is "none".',
      path: ['apiKey'],
    });
  }

  const overriddenHeaders = authHeaderOverrideKeys(value.extraHeaders);
  if (overriddenHeaders.length > 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Gemini Generate Content auth headers are provider-owned and must not be supplied through extraHeaders: ${overriddenHeaders.join(', ')}`,
      path: ['extraHeaders'],
    });
  }

  if (value.billing?.source === 'profile-api-key' && (typeof value.apiKey !== 'string' || value.apiKey.length === 0)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Billing query with current API key requires apiKey.',
      path: ['billing'],
    });
  }
});

/** 从 schema 推导的 GeminiGenerateContentProviderConfig 类型。 */
export type GeminiGenerateContentProviderConfig = z.infer<typeof geminiGenerateContentConfigSchema>;
