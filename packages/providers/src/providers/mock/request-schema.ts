import { z } from 'zod';

/**
 * Canonical image request 的 Zod schema。
 *
 * 只校验最小意图结构，不校验 provider-specific 透传字段。
 *
 * 字段集合与
 * `docs/dev-memory/memories/architecture/provider-openapi-reference/`
 * 中 create-image / create-image-edit 快照的 body parameters 对齐；与
 * `packages/providers/src/contract/request.ts` 中的 `ProviderOutputOptions`
 * 保持一一对应。
 */
const assetRefSchema = z.object({
  type: z.literal('image'),
  name: z.string().optional(),
  url: z.string().optional(),
  data: z.union([z.string(), z.instanceof(Uint8Array)]).optional(),
  mimeType: z.string().optional(),
  fileId: z.string().optional(),
  storedRef: z.object({
    kind: z.union([z.literal('inline'), z.literal('url'), z.literal('hostObject'), z.literal('externalToken')]),
    ref: z.string(),
    name: z.string().optional(),
    mimeType: z.string().optional(),
    sha256: z.string().optional(),
    byteSize: z.number().optional(),
  }).optional(),
});

/**
 * 把非 plain-object 的占位符/字面量输入归一化为 undefined。
 *
 * workflow runner 对未解析的占位符（例如未提供 `${output}`）保留字符串字面量，
 * 这里统一吞掉，保持 provider schema 对"未提供"语义的正确判定。
 */
const coerceOptionalObject = (val: unknown): unknown =>
  typeof val === 'object' && val !== null && !Array.isArray(val) ? val : undefined;

const coerceOptionalArray = (val: unknown): unknown => (Array.isArray(val) ? val : undefined);

export const mockRequestSchema = z.object({
  operation: z.union([z.literal('text_to_image'), z.literal('image_edit')]),
  prompt: z.string().min(1),
  images: z.preprocess(coerceOptionalArray, z.array(assetRefSchema).optional()),
  maskImage: z.preprocess(coerceOptionalObject, assetRefSchema.optional()),
  output: z.preprocess(
    coerceOptionalObject,
    z
      .object({
        count: z.number().int().positive().optional(),
        width: z.number().int().positive().optional(),
        height: z.number().int().positive().optional(),
        sizePreset: z.union([z.literal('512'), z.literal('1k'), z.literal('2k'), z.literal('4k')]).optional(),
        aspectRatio: z.string().optional(),
        background: z.union([z.literal('auto'), z.literal('transparent'), z.literal('opaque')]).optional(),
        quality: z
          .union([z.literal('auto'), z.literal('low'), z.literal('medium'), z.literal('high')])
          .optional(),
        outputFormat: z.union([z.literal('png'), z.literal('jpeg'), z.literal('webp')]).optional(),
        outputCompression: z.number().int().min(0).max(100).optional(),
        moderation: z.union([z.literal('auto'), z.literal('low')]).optional(),
        inputFidelity: z.union([z.literal('high'), z.literal('low')]).optional(),
      })
      .optional(),
  ),
  providerOptions: z.preprocess(coerceOptionalObject, z.record(z.string(), z.unknown()).optional()),
});

/** 从 schema 推导的 MockProviderRequest 类型。 */
export type MockProviderRequest = z.infer<typeof mockRequestSchema>;
