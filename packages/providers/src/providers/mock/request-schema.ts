import { z } from 'zod';

/**
 * Canonical image request 的 Zod schema。
 *
 * 只校验最小意图结构，不校验 provider-specific 透传字段。
 */
export const mockRequestSchema = z.object({
  operation: z.union([z.literal('generate'), z.literal('edit')]),
  prompt: z.string().min(1),
  inputAssets: z
    .array(
      z.object({
        type: z.literal('image'),
        name: z.string().optional(),
        url: z.string().optional(),
        data: z.union([z.string(), z.instanceof(Uint8Array)]).optional(),
        mimeType: z.string().optional(),
      }),
    )
    .optional(),
  maskAsset: z
    .object({
      type: z.literal('image'),
      name: z.string().optional(),
      url: z.string().optional(),
      data: z.union([z.string(), z.instanceof(Uint8Array)]).optional(),
      mimeType: z.string().optional(),
    })
    .optional(),
  output: z
    .object({
      count: z.number().int().positive().optional(),
      width: z.number().int().positive().optional(),
      height: z.number().int().positive().optional(),
      aspectRatio: z.string().optional(),
      background: z.union([z.literal('auto'), z.literal('transparent'), z.literal('opaque')]).optional(),
      qualityHint: z.union([z.literal('speed'), z.literal('balanced'), z.literal('quality')]).optional(),
    })
    .optional(),
  providerOptions: z.preprocess(
    (val) => (typeof val === 'object' && val !== null && !Array.isArray(val) ? val : undefined),
    z.record(z.string(), z.unknown()).optional(),
  ),
});

/** 从 schema 推导的 MockProviderRequest 类型。 */
export type MockProviderRequest = z.infer<typeof mockRequestSchema>;
