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

function legacyResolvedModelId(input: {
  readonly providerConfig: unknown;
}): string | undefined {
  if (typeof input.providerConfig === 'object' && input.providerConfig !== null && 'defaultModel' in input.providerConfig) {
    const value = (input.providerConfig as { readonly defaultModel?: unknown }).defaultModel;
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return undefined;
}

function normalizeUnsupported(message: string): ProviderProfileConnectionTestResult {
  return { status: 'partial', message };
}

async function effectiveOwnedWireModelId(input: {
  readonly profileId?: string;
  readonly apiFormat: TestProviderProfileConnectionInput['apiFormat'];
  readonly selectedModelId?: string;
}): Promise<string | undefined> {
  const profileId = input.profileId?.trim();
  if (!profileId || !input.apiFormat) {
    return undefined;
  }
  const configs = await getUserModelConfigRepository().list(profileId);
  const selectedModelId = input.selectedModelId?.trim();
  const effective = selectedModelId
    ? configs.find((config) => config.modelId === selectedModelId) ?? configs[0]
    : configs[0];
  if (!effective) {
    return undefined;
  }
  return (
    await resolveConfiguredModel({
      profileId,
      apiFormat: input.apiFormat,
      modelId: effective.modelId,
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
      selectedModelId: input.selectedModelId,
    })
      ?? legacyResolvedModelId({ providerConfig });

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
