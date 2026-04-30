/**
 * Smoke 测试 setup 模块。
 *
 * 提供 env var 检查与条件跳过逻辑。
 * 所有 smoke 测试文件应 import 本模块的 helper 来控制是否执行。
 */

/**
 * 检查是否应运行 smoke 测试。
 *
 * 需要同时满足：
 * 1. `IMAGEN_RUN_SMOKE` 环境变量设置为 `'1'`
 * 2. `IMAGEN_SMOKE_OPENAI_API_KEY` 环境变量已设置且非空
 */
export function shouldRunSmoke(): boolean {
  return process.env.IMAGEN_RUN_SMOKE === '1';
}

/**
 * 检查是否具备真实网络测试所需的凭证。
 */
export function hasSmokeCredentials(): boolean {
  const apiKey = process.env.IMAGEN_SMOKE_OPENAI_API_KEY;
  return typeof apiKey === 'string' && apiKey.trim().length > 0;
}

/**
 * 获取 smoke 测试的 API 凭证。
 * 返回 undefined 表示凭证不完整。
 */
export function getSmokeCredentials(): { apiKey: string; baseURL: string } | undefined {
  const apiKey = process.env.IMAGEN_SMOKE_OPENAI_API_KEY;
  const baseURL = process.env.IMAGEN_SMOKE_OPENAI_BASE_URL ?? 'https://api.openai.com';

  if (typeof apiKey !== 'string' || apiKey.trim().length === 0) {
    return undefined;
  }

  return { apiKey: apiKey.trim(), baseURL };
}

/**
 * 检查是否具备 n1n.ai 真实网络测试所需的凭证。
 */
export function hasN1nSmokeCredentials(): boolean {
  const apiKey = process.env.IMAGEN_SMOKE_N1N_API_KEY;
  return typeof apiKey === 'string' && apiKey.trim().length > 0;
}

/**
 * 获取 n1n.ai smoke 测试的 API 凭证。
 * 返回 undefined 表示凭证不完整。
 */
export function getN1nSmokeCredentials(): { apiKey: string; baseURL: string } | undefined {
  const apiKey = process.env.IMAGEN_SMOKE_N1N_API_KEY;
  const baseURL = process.env.IMAGEN_SMOKE_N1N_BASE_URL ?? 'https://api.n1n.ai';

  if (typeof apiKey !== 'string' || apiKey.trim().length === 0) {
    return undefined;
  }

  return { apiKey: apiKey.trim(), baseURL };
}

/**
 * Vitest describe.skipIf 条件：未设置 IMAGEN_RUN_SMOKE 时跳过。
 */
export const skipIfNotSmokeRun = !shouldRunSmoke();

/**
 * Vitest describe.skipIf 条件：缺少凭证时跳过。
 */
export const skipIfNoCredentials = !hasSmokeCredentials();

/**
 * Vitest describe.skipIf 条件：缺少 n1n.ai 凭证时跳过。
 */
export const skipIfNoN1nCredentials = !hasN1nSmokeCredentials();
