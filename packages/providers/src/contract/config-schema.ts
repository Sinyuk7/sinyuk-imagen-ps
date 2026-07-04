import { z } from 'zod';
import { normalizeProviderConnection } from './config.js';

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
