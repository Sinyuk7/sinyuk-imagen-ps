import { z } from 'zod';

/**
 * Prompt optimize provider 的 request Zod schema。
 *
 * 只保留最小意图：prompt 文本。不携带 image、output 等图片生成字段，
 * 与 `CanonicalImageJobRequest` 区分。
 */
export const promptOptimizeRequestSchema = z.object({
  operation: z.literal('prompt_optimize'),
  prompt: z.string().min(1),
  providerOptions: z.record(z.string(), z.unknown()).optional(),
});

/** 从 schema 推导的 PromptOptimizeRequest 类型。 */
export type PromptOptimizeRequest = z.infer<typeof promptOptimizeRequestSchema>;
