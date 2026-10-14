import { z } from 'zod';
import { providerConnectionCollectionSchema } from '../../contract/config-schema.js';
export const runningHubGenerateConfigSchema = z.object({
  providerId: z.literal('runninghub-generate'), displayName: z.string().min(1), family: z.literal('image-endpoint'), apiFormat: z.literal('openai-images'),
  connection: providerConnectionCollectionSchema, apiKey: z.string().min(1), paths: z.object({ generation: z.string().min(1), edit: z.string().optional() }).default({ generation: '/openapi/v2/rhart-image-n-g31-flash/image-to-image' }),
  timeoutMs: z.number().int().positive().optional(), extraHeaders: z.record(z.string(), z.string()).optional(),
});
export type RunningHubGenerateProviderConfig = z.infer<typeof runningHubGenerateConfigSchema>;
