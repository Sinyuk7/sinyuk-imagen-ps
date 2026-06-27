/** 默认的 prompt 优化指令，仅用于初始化内置 Profile 时写入 config。 */
export const DEFAULT_OPTIMIZER_INSTRUCTION =
  'You are an expert prompt engineer for image generation models. ' +
  'Rewrite the user prompt to be clearer, more vivid, and more detailed while preserving intent. ' +
  'Return only the optimized prompt text without explanations or quotes.';
