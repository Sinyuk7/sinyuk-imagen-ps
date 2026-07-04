import { z } from 'zod';
import { providerConnectionCollectionSchema } from '../../contract/config-schema.js';

function endpointOwnsVersion(url: string): boolean {
  const pathname = new URL(url).pathname.replace(/\/+$/, '');
  const segments = pathname.split('/').filter((segment) => segment.length > 0);
  const tail = segments[segments.length - 1];
  return tail === 'v1' || tail === 'v1beta';
}

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
  connection: providerConnectionCollectionSchema,
  apiKey: z.string().min(1),
  authMode: z.enum(['x-goog-api-key', 'bearer']).default('x-goog-api-key'),
  apiVersion: z.enum(['v1', 'v1beta']).default('v1'),
  defaultModel: z.string().optional(),
  extraHeaders: z.record(z.string(), z.string()).optional(),
  timeoutMs: z.number().int().positive().optional(),
}).superRefine((value, ctx) => {
  for (const endpoint of value.connection.endpoints) {
    if (endpointOwnsVersion(endpoint.url)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Gemini Generate Content endpoint "${endpoint.id}" must stay versionless; move "${value.apiVersion}" into apiVersion instead.`,
        path: ['connection', 'endpoints'],
      });
    }
  }

  const overriddenHeaders = authHeaderOverrideKeys(value.extraHeaders);
  if (overriddenHeaders.length > 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Gemini Generate Content auth headers are provider-owned and must not be supplied through extraHeaders: ${overriddenHeaders.join(', ')}`,
      path: ['extraHeaders'],
    });
  }
});

/** 从 schema 推导的 GeminiGenerateContentProviderConfig 类型。 */
export type GeminiGenerateContentProviderConfig = z.infer<typeof geminiGenerateContentConfigSchema>;
