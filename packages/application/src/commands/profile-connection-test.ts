import { createProviderError, createValidationError } from '@imagen-ps/core-engine';
import { generateTraceId } from '@imagen-ps/foundation';
import type { ProviderSafeProbeResult } from '@imagen-ps/providers';
import { getRuntimeLogger, getUserModelConfigRepository } from '../runtime.js';
import type {
  CommandResult,
  ProviderProfileConnectionTestResult,
  TestProviderProfileConnectionInput,
} from './types.js';
import { resolveDraftProviderContext } from './draft-provider-config.js';
import { resolveConfiguredModel } from './model-config-resolution.js';

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function normalizeUnsupported(message: string): ProviderProfileConnectionTestResult {
  return { status: 'partial', message };
}

async function effectiveOwnedWireModelId(input: {
  readonly profileId?: string;
  readonly apiFormat: TestProviderProfileConnectionInput['apiFormat'];
  readonly modelId: string;
}): Promise<string | undefined> {
  const profileId = input.profileId?.trim();
  if (!profileId || !input.apiFormat) {
    return input.modelId;
  }
  return (
    await resolveConfiguredModel({
      profileId,
      apiFormat: input.apiFormat,
      modelId: input.modelId,
      userModelConfigRepository: getUserModelConfigRepository(),
    })
  ).wireModelId;
}

function normalizeProbeResult(result: ProviderSafeProbeResult): ProviderProfileConnectionTestResult {
  return {
    status: result.status,
    ...(result.message ? { message: result.message } : {}),
  };
}

function isValidationError(error: unknown): error is ReturnType<typeof createValidationError> {
  return typeof error === 'object'
    && error !== null
    && (error as { readonly category?: unknown }).category === 'validation'
    && typeof (error as { readonly message?: unknown }).message === 'string';
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
    const modelId = input.modelId?.trim();
    if (!modelId) {
      throw createValidationError('Provider connection test requires modelId.', { profileId: input.profileId });
    }
    const {
      provider,
      providerConfig,
      apiFormat,
    } = await resolveDraftProviderContext(input);

    if (provider.describe().connectivity?.connectionTest === 'unsupported') {
      const message = `Provider implementation for apiFormat "${apiFormat}" does not support connection testing.`;
      span.finish({ status: 'partial' });
      return {
        ok: true,
        value: normalizeUnsupported(message),
      };
    }

    if (typeof provider.safeProbe !== 'function') {
      const message = `Provider implementation for apiFormat "${apiFormat}" does not support safe non-generation verification.`;
      span.finish({ status: 'partial' });
      return {
        ok: true,
        value: normalizeUnsupported(message),
      };
    }

    const probeModelId = await effectiveOwnedWireModelId({
      profileId: input.profileId,
      apiFormat,
      modelId,
    });

    const tested = await provider.safeProbe(
      providerConfig as never,
      {
        modelId: probeModelId,
      },
      logger.child({
        package: 'providers',
        component: 'provider',
        provider_id: provider.id,
      }),
    );

    span.finish({
      status: tested.status,
      reason: tested.reason,
    });
    return {
      ok: true,
      value: normalizeProbeResult(tested),
    };
  } catch (error) {
    const message = errorMessage(error, 'Provider connection test failed.');
    span.fail(error);
    if (isValidationError(error)) {
      return {
        ok: false,
        error,
      };
    }
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
