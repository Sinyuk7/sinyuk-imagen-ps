import { z } from 'zod';
import { providerConnectionCollectionSchema } from '../../contract/config-schema.js';

/**
 * Mock provider config 的 Zod schema。
 *
 * 复用 image-endpoint 基线字段，并追加 mock 特有的延迟与失败控制。
 */
export const mockConfigSchema = z.object({
  providerId: z.string().min(1),
  displayName: z.string().min(1),
  family: z.literal('image-endpoint'),
  connection: providerConnectionCollectionSchema,
  apiKey: z.string().min(1),
  defaultModel: z.string().optional(),
  extraHeaders: z.record(z.string(), z.string()).optional(),
  timeoutMs: z.number().int().positive().optional(),

  // mock-specific fields
  delayMs: z.number().int().nonnegative().default(0),
  failMode: z
    .union([
      z.object({ type: z.literal('always') }),
      z.object({ type: z.literal('probability'), rate: z.number().min(0).max(1) }),
    ])
    .optional(),
});

/** 从 schema 推导的 MockProviderConfig 类型。 */
export type MockProviderConfig = z.infer<typeof mockConfigSchema>;
