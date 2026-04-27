import type { Provider, ProviderDescriptor, ProviderInvokeArgs } from '../../contract/provider.js';
import type { ProviderInvokeResult } from '../../contract/result.js';
import { mockDescriptor } from './descriptor.js';
import { mockConfigSchema, type MockProviderConfig } from './config-schema.js';
import { mockRequestSchema, type MockProviderRequest } from './request-schema.js';
import { createSyntheticAssets } from '../../shared/asset-normalizer.js';
import type { ProviderDiagnostic } from '../../contract/diagnostics.js';

/** Provider 层可映射的结构化错误。 */
interface ProviderValidationError extends Error {
  details?: Record<string, unknown>;
}

/** mock provider 的可测试性选项。 */
export interface MockProviderOptions {
  /** 可注入的随机源，用于概率失败模式测试。 */
  random?: () => number;
}

function createValidationError(message: string, details?: Record<string, unknown>): ProviderValidationError {
  const err = new Error(message) as ProviderValidationError;
  err.details = details;
  err.name = 'ProviderValidationError';
  return err;
}

function createProviderInvokeError(message: string, details?: Record<string, unknown>): ProviderValidationError {
  const err = new Error(message) as ProviderValidationError;
  err.details = details;
  err.name = 'ProviderInvokeError';
  return err;
}

/** 创建 mock provider 实例。 */
export function createMockProvider(
  options: MockProviderOptions = {},
): Provider<MockProviderConfig, MockProviderRequest> {
  const random = options.random ?? Math.random;

  return {
    id: mockDescriptor.id,
    family: mockDescriptor.family,

    describe(): ProviderDescriptor {
      return mockDescriptor;
    },

    validateConfig(input: unknown): MockProviderConfig {
      const result = mockConfigSchema.safeParse(input);
      if (!result.success) {
        const issues = result.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        }));
        throw createValidationError(
          `Mock provider config validation failed: ${issues.map((i) => `${i.path}: ${i.message}`).join('; ')}`,
          { issues },
        );
      }
      return result.data;
    },

    validateRequest(input: unknown): MockProviderRequest {
      const result = mockRequestSchema.safeParse(input);
      if (!result.success) {
        const issues = result.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        }));
        throw createValidationError(
          `Mock provider request validation failed: ${issues.map((i) => `${i.path}: ${i.message}`).join('; ')}`,
          { issues },
        );
      }
      return result.data;
    },

    async invoke(args: ProviderInvokeArgs<MockProviderConfig, MockProviderRequest>): Promise<ProviderInvokeResult> {
      const { config, request, signal } = args;
      const delayMs = config.delayMs ?? 0;

      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          if (signal?.aborted) {
            reject(
              createProviderInvokeError('Mock provider invocation was aborted.', {
                reason: signal.reason,
              }),
            );
            return;
          }

          // Failure mode handling
          if (config.failMode) {
            if (config.failMode.type === 'always') {
              reject(
                createProviderInvokeError('Mock provider forced failure (always).', {
                  failMode: config.failMode.type,
                }),
              );
              return;
            }

            if (config.failMode.type === 'probability') {
              if (random() < config.failMode.rate) {
                reject(
                  createProviderInvokeError(`Mock provider random failure triggered (rate=${config.failMode.rate}).`, {
                    failMode: config.failMode.type,
                    rate: config.failMode.rate,
                  }),
                );
                return;
              }
            }
          }

          const outputCount = request.output?.count ?? 1;
          const assets = createSyntheticAssets(outputCount);

          const diagnostics: ProviderDiagnostic[] = [];
          if (delayMs > 0) {
            diagnostics.push({
              code: 'mock.delay',
              message: `Simulated delay of ${delayMs}ms`,
              level: 'info',
              details: { delayMs },
            });
          }

          // 契约：无诊断时**省略** `diagnostics` 字段（不写 `undefined`），
          // 与 ProviderInvokeResult 的 optional 语义对齐，避免序列化边界
          // 出现 `{ diagnostics: undefined }` 形状（参见 contract/result.ts）。
          const result: { assets: typeof assets; raw: unknown; diagnostics?: ProviderDiagnostic[] } = {
            assets,
            raw: {
              mock: true,
              operation: request.operation,
              prompt: request.prompt,
              assetCount: outputCount,
            },
          };
          if (diagnostics.length > 0) {
            result.diagnostics = diagnostics;
          }
          resolve(result);
        }, delayMs);

        if (signal) {
          const onAbort = () => {
            clearTimeout(timer);
            reject(
              createProviderInvokeError('Mock provider invocation was aborted.', {
                reason: signal.reason,
              }),
            );
          };

          if (signal.aborted) {
            onAbort();
            return;
          }

          signal.addEventListener('abort', onAbort, { once: true });
        }
      });
    },
  };
}
