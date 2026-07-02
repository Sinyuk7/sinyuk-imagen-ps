import { z } from 'zod';
import { providerConnectionCollectionSchema } from '../../contract/config-schema.js';

/**
 * Chat image provider config 的 Zod schema。
 *
 * 与 `src/contract/config.ts` 中的 `ChatImageProviderConfig` 对齐。
 */
export const chatImageConfigSchema = z.object({
  providerId: z.string().min(1),
  displayName: z.string().min(1),
  family: z.literal('chat-image'),
  connection: providerConnectionCollectionSchema,
  apiKey: z.string().min(1),
  defaultModel: z.string().optional(),
  extraHeaders: z.record(z.string(), z.string()).optional(),
  timeoutMs: z.number().int().positive().optional(),
});

/** 从 schema 推导的 ChatImageProviderConfig 类型。 */
export type ChatImageProviderConfig = z.infer<typeof chatImageConfigSchema>;
