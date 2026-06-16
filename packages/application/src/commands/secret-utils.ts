/**
 * Secret value resolution。
 *
 * secret 存储层只存原始字符串（如 `"env:MY_KEY"` 字面量），不解释语义。
 * 消费侧（构建 provider config 前）调用本函数把引用解析为真实值：
 *
 * - `env:VAR_NAME` 前缀 → 读取 `process.env[VAR_NAME]`，缺失或空串时抛错。
 * - 其他 → 原样返回（兼容明文密钥）。
 *
 * 设计意图：apiKey 等敏感值可只以 `env:` 引用形式落盘，明文永不写入
 * `provider-secrets.json`，CI/共享机更安全。
 */
const ENV_PREFIX = 'env:';

/**
 * 最小 `process.env` 声明，避免在本（host-agnostic）包引入整套 `@types/node`。
 * CLI/Node 运行时下 `process` 必然存在；非 Node host 下若使用 `env:` 引用会按
 * "变量未设置" 抛错，语义一致。
 */
declare const process: { readonly env: Record<string, string | undefined> };

export function resolveSecretValue(raw: string): string {
  if (!raw.startsWith(ENV_PREFIX)) {
    return raw;
  }
  const varName = raw.slice(ENV_PREFIX.length);
  const value = process.env[varName];
  if (value === undefined || value === '') {
    throw new Error(`Secret env reference unresolved: environment variable "${varName}" is not set.`);
  }
  return value;
}
