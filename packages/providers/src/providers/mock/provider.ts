import type { Provider, ProviderDescriptor, ProviderInvokeArgs } from '../../contract/provider.js';
import type { ProviderBalanceSnapshot } from '../../contract/billing.js';
import type { ProviderInvokeResult } from '../../contract/result.js';
import { mockDescriptor } from './descriptor.js';
import { mockConfigSchema, type MockProviderConfig } from './config-schema.js';
import { mockRequestSchema, type MockProviderRequest } from './request-schema.js';
import { createMockImageEditEchoAssets } from './edit-echo.js';
import { createSyntheticAssets } from '../../shared/asset-normalizer.js';
import type { ProviderDiagnostic } from '../../contract/diagnostics.js';
import { canListenToAbort } from '../../shared/abort-signal.js';

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

function describeOutput(request: MockProviderRequest): string {
  const output = request.output;
  return [
    `size=${output?.sizePreset ?? 'default'}`,
    `format=${output?.outputFormat ?? 'default'}`,
    `aspect=${output?.aspectRatio ?? 'default'}`,
  ].join(' ');
}

function compactPrompt(prompt: string): string {
  const compact = prompt.trim().replace(/\s+/g, ' ');
  const chars = Array.from(compact);
  return chars.length > 8 ? `${chars.slice(0, 8).join('')}...` : compact;
}

function token(key: string, value: string): string {
  return `[${key}=${value}]`;
}

function createMockResponseText(
  request: MockProviderRequest,
  effectiveModel: string,
  assetCount: number,
  config: MockProviderConfig,
): string {
  const imageCount = request.images?.length ?? 0;
  const markers = [
    config.delayMs && config.delayMs > 0 ? `delay=${config.delayMs}ms` : undefined,
    config.failMode ? `failMode=${config.failMode.type}` : undefined,
  ].filter((item): item is string => item !== undefined);

  return [
    token('operation', request.operation),
    token('model', effectiveModel),
    token('prompt', compactPrompt(request.prompt)),
    token('output', describeOutput(request)),
    token('images', String(imageCount)),
    token('mask', request.maskImage ? 'yes' : 'no'),
    token('assets', String(assetCount)),
    ...markers.map((marker) => `[${marker}]`),
  ].join(' ');
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

      // Model selection: three-tier fallback chain
      // (`request.providerOptions.model` → `config.defaultModel` → 硬编码默认值)。
      // 注意：descriptor.defaultModels 仅供 listProfileModels
      // 等 model-discovery 命令使用，**不**参与此处 effective model 解析。
      const effectiveModel =
        (request.providerOptions?.model as string | undefined) ?? config.defaultModel ?? 'mock-image-v1';

      return new Promise((resolve, reject) => {
        const activeSignal = signal;
        const canListen = canListenToAbort(signal);
        const onAbort = () => {
          clearTimeout(timer);
          reject(
            createProviderInvokeError('Mock provider invocation was aborted.', {
              reason: activeSignal?.reason,
            }),
          );
        };
        const cleanup = () => {
          if (canListen && activeSignal) {
            activeSignal.removeEventListener('abort', onAbort);
          }
        };
        const timer = setTimeout(() => {
          cleanup();
          if (activeSignal?.aborted) {
            reject(
              createProviderInvokeError('Mock provider invocation was aborted.', {
                reason: activeSignal.reason,
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

          const syntheticOutputCount = request.output?.count ?? 1;
          const assets = createMockImageEditEchoAssets(request) ?? createSyntheticAssets(syntheticOutputCount);

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
          const result: { assets: typeof assets; text: string; raw: unknown; diagnostics?: ProviderDiagnostic[] } = {
            assets,
            text: createMockResponseText(request, effectiveModel, assets.length, config),
            raw: {
              mock: true,
              operation: request.operation,
              prompt: request.prompt,
              assetCount: assets.length,
              model: effectiveModel,
            },
          };
          if (diagnostics.length > 0) {
            result.diagnostics = diagnostics;
          }
          resolve(result);
        }, delayMs);

        if (activeSignal) {
          if (activeSignal.aborted) {
            onAbort();
            return;
          }

          if (canListen) {
            activeSignal.addEventListener('abort', onAbort, { once: true });
          }
        }
      });
    },

    async queryBalance(): Promise<ProviderBalanceSnapshot> {
      return {
        primary: {
          kind: 'money',
          remaining: '12.50',
          currency: 'USD',
        },
      };
    },
  };
}
