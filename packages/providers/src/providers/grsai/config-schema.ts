import { z } from 'zod';
import { providerConnectionCollectionSchema } from '../../contract/config-schema.js';
import { normalizeApiFormatPaths, type GrsaiGeneratePaths } from '../../contract/api-format.js';

/** GRSAI Generate provider config 的 Zod schema。 */
export const grsaiGenerateConfigSchema = z.object({
  providerId: z.literal('grsai-generate'),
  displayName: z.string().min(1),
  family: z.literal('grsai-generate'),
  apiFormat: z.literal('grsai'),
  connection: providerConnectionCollectionSchema,
  paths: z.unknown().optional().transform((value, ctx) => {
    try { return normalizeApiFormatPaths('grsai', value) as GrsaiGeneratePaths; } catch (error) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: error instanceof Error ? error.message : 'Invalid GRSAI paths.' });
      return z.NEVER;
    }
  }),
  apiKey: z.string().min(1),
  defaultModel: z.string().optional(),
  extraHeaders: z.record(z.string(), z.string()).optional(),
  timeoutMs: z.number().int().positive().optional(),
}).superRefine((value, ctx) => {
  if (Object.keys(value.extraHeaders ?? {}).some((key) => key.toLowerCase() === 'authorization')) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'GRSAI authorization header is provider-owned.', path: ['extraHeaders'] });
  }
});
export type GrsaiGenerateProviderConfig = z.infer<typeof grsaiGenerateConfigSchema>;
