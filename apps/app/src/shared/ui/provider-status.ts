import type {
  MeasureProfileEndpointsResult,
  ProviderProfileConnectionTestResult,
  ProviderProfileTestResult,
} from '@imagen-ps/application';
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
  if (result.connectivity?.status === 'failed') {
    return {
      tone: 'negative',
      copyable: true,
      durationMs: null,
      dismissible: false,
      message: result.connectivity.message
        ? `${messages.settings.connectionFailed}: ${result.connectivity.message}`
        : messages.settings.connectionFailed,
    };
  }

  if (result.connectivity?.status === 'partial') {
    return {
      tone: 'warning',
      copyable: false,
      durationMs: null,
      dismissible: false,
      message: result.connectivity.message ?? messages.settings.providerConnectionUnsupported,
    };
  }

  return { tone: 'positive', durationMs: 2200, dismissible: false, copyable: false, message: messages.settings.testSuccess };
}

export function statusFromProviderConnectionTestResult(
  result: ProviderProfileConnectionTestResult,
  messages: AppMessages,
): ProviderStatus {
  if (result.status === 'partial') {
    return {
      tone: 'warning',
      copyable: false,
      durationMs: null,
      dismissible: false,
      message: result.message ?? messages.settings.providerConnectionUnsupported,
    };
  }
  if (result.status === 'failed') {
    return {
      tone: 'negative',
      copyable: true,
      durationMs: null,
      dismissible: false,
      message: result.message
        ? `${messages.settings.connectionFailed}: ${result.message}`
        : messages.settings.connectionFailed,
    };
  }
  return { tone: 'positive', durationMs: 2200, dismissible: false, copyable: false, message: messages.settings.testSuccess };
}

export function statusFromEndpointMeasurementResult(
  result: MeasureProfileEndpointsResult,
  messages: AppMessages,
): ProviderStatus {
  if (result.supported === false) {
    return {
      tone: 'warning',
      copyable: false,
      durationMs: null,
      dismissible: false,
      message: result.message ?? messages.settings.endpointMeasurementUnsupported,
    };
  }
  const failed = result.results.find((item) => item.status === 'failed');
  if (failed) {
    return {
      tone: 'negative',
      copyable: true,
      durationMs: null,
      dismissible: false,
      message: failed.errorMessage
        ? `${messages.settings.connectionFailed}: ${failed.errorMessage}`
        : messages.settings.connectionFailed,
    };
  }
  const healthy = result.results.filter((item) => item.status === 'success');
  if (healthy.length === 0) {
    return { tone: 'warning', durationMs: null, dismissible: false, copyable: false, message: messages.settings.configValidProviderNoModels };
  }
  return { tone: 'positive', durationMs: 2200, dismissible: false, copyable: false, message: messages.settings.speedTestSuccess };
}
