import { createProviderError, createValidationError } from '@imagen-ps/core-engine';
import { generateTraceId } from '@imagen-ps/foundation';
import type { ProviderSafeProbeResult } from '@imagen-ps/providers';
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

function resolvedModelId(input: {
  readonly defaultModelId?: string;
  readonly selectedModelIds: readonly string[];
  readonly providerConfig: unknown;
}): string | undefined {
  const explicit = input.defaultModelId?.trim();
  if (explicit) {
    return explicit;
  }
  const selected = input.selectedModelIds.find((modelId) => modelId.trim().length > 0);
  if (selected) {
    return selected.trim();
  }
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

function normalizeProbeResult(result: ProviderSafeProbeResult): ProviderProfileConnectionTestResult {
  return {
    status: result.status,
    ...(result.message ? { message: result.message } : {}),
  };
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
      selectedModelIds,
      defaultModelId,
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

    const tested = await provider.safeProbe(
      providerConfig as never,
      {
        modelId: resolvedModelId({ defaultModelId, selectedModelIds, providerConfig }),
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
