import { z } from 'zod';
import { providerBillingConfigSchema, providerConnectionCollectionSchema } from '../../contract/config-schema.js';
import { normalizeProviderIdPaths, type GrsaiPaths } from '../../contract/provider-routing.js';

const GRSAI_API_KEY_CREDITS_PATH = '/client/openapi/getAPIKeyCredits';
const GRSAI_TOKEN_CREDITS_PATH = '/client/openapi/getCredits';

/** GRSAI Generate provider config 的 Zod schema。 */
export const grsaiConfigSchema = z.object({
  providerId: z.literal('grsai'),
  displayName: z.string().min(1),
  family: z.literal('grsai'),
  connection: providerConnectionCollectionSchema,
  paths: z.unknown().optional().transform((value, ctx) => {
    try { return normalizeProviderIdPaths('grsai', value) as GrsaiPaths; } catch (error) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: error instanceof Error ? error.message : 'Invalid GRSAI paths.' });
      return z.NEVER;
    }
  }),
  apiKey: z.string().min(1),
  billing: providerBillingConfigSchema,
  defaultModel: z.string().optional(),
  extraHeaders: z.record(z.string(), z.string()).optional(),
  timeoutMs: z.number().int().positive().optional(),
}).superRefine((value, ctx) => {
  if (Object.keys(value.extraHeaders ?? {}).some((key) => key.toLowerCase() === 'authorization')) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'GRSAI authorization header is provider-owned.', path: ['extraHeaders'] });
  }
  const billing = value.billing;
  if (billing && billing.source !== 'disabled' && billing.path) {
    const expected = billing.source === 'billing-token' ? GRSAI_TOKEN_CREDITS_PATH : GRSAI_API_KEY_CREDITS_PATH;
    if (billing.path !== expected) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `GRSAI billing path is provider-owned and must be "${expected}".`, path: ['billing', 'path'] });
    }
  }
});
export type GrsaiProviderConfig = z.infer<typeof grsaiConfigSchema>;
