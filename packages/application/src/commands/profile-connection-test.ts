import { createProviderError, createValidationError } from '@imagen-ps/core-engine';
import { generateTraceId } from '@imagen-ps/foundation';
import { getRuntimeLogger } from '../runtime.js';
import type {
  CommandResult,
  ProviderProfileConnectionTestResult,
  TestProviderProfileConnectionInput,
} from './types.js';
import { resolveDraftProviderContext } from './draft-provider-config.js';

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

/**
 * 对 draft-aware provider config 执行 provider 级连接测试。
 */
export async function testProviderProfileConnection(
  input: TestProviderProfileConnectionInput,
): Promise<CommandResult<ProviderProfileConnectionTestResult>> {
  const logger = getRuntimeLogger().child({
    trace_id: generateTraceId(),
    package: 'application',
    component: 'command',
    profile_id: input.profileId ?? 'draft',
    ...(input.apiFormat ? { apiFormat: input.apiFormat } : {}),
  });
  const span = logger.startSpan('command.profile.connection_test');

  try {
    const { provider, providerConfig, apiFormat } = await resolveDraftProviderContext(input);

    if (provider.describe().connectivity?.connectionTest === 'unsupported' || typeof provider.testConnection !== 'function') {
      span.finish({ supported: false });
      return {
        ok: true,
        value: {
          supported: false,
          message: `Provider implementation for apiFormat "${apiFormat}" does not support connection testing.`,
        },
      };
    }

    const tested = await provider.testConnection(
      providerConfig as never,
      logger.child({
        package: 'providers',
        component: 'provider',
        provider_id: provider.id,
      }),
    );
    const models = tested.models;
    const modelCount = tested.modelCount ?? models?.length;

    span.finish({
      supported: tested.supported,
      reachable: tested.reachable,
      ...(modelCount !== undefined ? { modelCount } : {}),
    });
    return {
      ok: true,
      value: {
        supported: tested.supported,
        ...(tested.reachable !== undefined ? { reachable: tested.reachable } : {}),
        ...(modelCount !== undefined ? { modelCount } : {}),
        ...(models ? { models } : {}),
        ...(tested.message ? { message: tested.message } : {}),
      },
    };
  } catch (error) {
    const message = errorMessage(error, 'Provider connection test failed.');
    span.fail(error);
    if (message.includes('Provider implementation "') && message.includes('" not found.')) {
      return {
        ok: false,
        error: createValidationError(message, { apiFormat: input.apiFormat }),
      };
    }
    return {
      ok: false,
      error: createProviderError(message, {
        apiFormat: input.apiFormat,
        profileId: input.profileId,
      }),
    };
  }
}
