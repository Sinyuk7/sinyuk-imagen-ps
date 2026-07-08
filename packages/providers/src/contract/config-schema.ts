import { z } from 'zod';
import { normalizeProviderConnection } from './config.js';
import { billingProtocolIds } from './billing.js';

const providerEndpointSchema = z.object({
  id: z.string().min(1),
  url: z.string().min(1),
  enabled: z.boolean().optional(),
});

export const providerConnectionCollectionSchema = z.object({
  selectionMode: z.enum(['manual', 'auto']).optional(),
  selectedEndpointId: z.string().min(1).optional(),
  endpoints: z.array(providerEndpointSchema).min(1),
}).transform((value, ctx) => {
  try {
    return normalizeProviderConnection({ connection: value });
  } catch (error) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: error instanceof Error ? error.message : 'Invalid provider connection.',
    });
    return z.NEVER;
  }
});

const billingPathSchema = z.string().trim().min(1).refine((value) => value.startsWith('/'), {
  message: 'Billing path must start with "/".',
});

export const providerBillingConfigSchema = z.union([
  z.object({
    source: z.literal('disabled'),
  }),
  z.object({
    source: z.literal('profile-api-key'),
    path: billingPathSchema,
    lastSuccessfulProtocolId: z.enum(billingProtocolIds).optional(),
  }),
  z.object({
    source: z.literal('billing-token'),
    path: billingPathSchema,
    tokenSecretRef: z.string().trim().min(1),
    userId: z.string().trim().min(1).optional(),
    lastSuccessfulProtocolId: z.enum(billingProtocolIds).optional(),
  }),
]).optional();
