import type { ProbeProfileEndpointsResult, ProviderProfileTestResult } from '@imagen-ps/application';
import type { NoticeOptions, NoticeTone } from './components/notice';
import type { AppMessages } from './i18n/messages';

export interface ProviderStatus extends NoticeOptions {
  readonly tone: NoticeTone;
  readonly message: string;
}

export function statusFromProviderTestResult(
  result: ProviderProfileTestResult,
  messages: AppMessages,
): ProviderStatus {
  if (result.connectivity?.reachable === false) {
    return {
      tone: 'negative',
      copyable: true,
      durationMs: null,
      dismissible: false,
      message: result.connectivity.errorMessage
        ? `${messages.settings.connectionFailed}: ${result.connectivity.errorMessage}`
        : messages.settings.connectionFailed,
    };
  }

  const modelCount = result.connectivity?.modelCount ?? result.connectivity?.models?.length;
  if (modelCount === 0) {
    return { tone: 'warning', durationMs: null, dismissible: false, copyable: false, message: messages.settings.configValidProviderNoModels };
  }

  return { tone: 'positive', durationMs: 2200, dismissible: false, copyable: false, message: messages.settings.testSuccess };
}

export function statusFromEndpointProbeResult(
  result: ProbeProfileEndpointsResult,
  messages: AppMessages,
): ProviderStatus {
  const negative = result.results.find((item) => item.status === 'unreachable' || item.status === 'incompatible');
  if (negative) {
    return {
      tone: 'negative',
      copyable: true,
      durationMs: null,
      dismissible: false,
      message: negative.errorMessage
        ? `${messages.settings.connectionFailed}: ${negative.errorMessage}`
        : messages.settings.connectionFailed,
    };
  }

  const unsupported = result.results.find((item) => item.status === 'unsupported');
  if (unsupported) {
    return {
      tone: 'warning',
      copyable: false,
      durationMs: null,
      dismissible: false,
      message: unsupported.errorMessage ?? messages.settings.configValidProviderNoModels,
    };
  }

  const healthy = result.results.filter((item) => item.status === 'healthy');
  if (healthy.length === 0) {
    return { tone: 'warning', durationMs: null, dismissible: false, copyable: false, message: messages.settings.configValidProviderNoModels };
  }

  return { tone: 'positive', durationMs: 2200, dismissible: false, copyable: false, message: messages.settings.testSuccess };
}
