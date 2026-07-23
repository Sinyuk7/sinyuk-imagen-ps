import type {
  MeasureProfileEndpointsResult,
  ProviderProfileConnectionTestResult,
  ProviderProfileTestResult,
} from '@imagen-ps/application';
import type { NoticeTone } from './components/notice';
import type { AppMessages } from './i18n/messages';

export interface ProviderStatus {
  readonly tone: NoticeTone;
  readonly message: string;
  readonly copyable: boolean;
}

export function statusFromProviderTestResult(
  result: ProviderProfileTestResult,
  messages: AppMessages,
): ProviderStatus {
  if (result.connectivity?.status === 'failed') {
    return {
      tone: 'negative',
      copyable: true,
      message: result.connectivity.message
        ? `${messages.settings.connectionFailed}: ${result.connectivity.message}`
        : messages.settings.connectionFailed,
    };
  }

  if (result.connectivity?.status === 'partial') {
    return {
      tone: 'warning',
      copyable: false,
      message: result.connectivity.message ?? messages.settings.providerConnectionUnsupported,
    };
  }

  return { tone: 'positive', copyable: false, message: messages.settings.testSuccess };
}

export function statusFromProviderConnectionTestResult(
  result: ProviderProfileConnectionTestResult,
  messages: AppMessages,
): ProviderStatus {
  if (result.status === 'partial') {
    return {
      tone: 'warning',
      copyable: false,
      message: result.message ?? messages.settings.providerConnectionUnsupported,
    };
  }
  if (result.status === 'failed') {
    return {
      tone: 'negative',
      copyable: true,
      message: result.message
        ? `${messages.settings.connectionFailed}: ${result.message}`
        : messages.settings.connectionFailed,
    };
  }
  return { tone: 'positive', copyable: false, message: messages.settings.testSuccess };
}

export function statusFromEndpointMeasurementResult(
  result: MeasureProfileEndpointsResult,
  messages: AppMessages,
): ProviderStatus {
  if (result.supported === false) {
    return {
      tone: 'warning',
      copyable: false,
      message: result.message ?? messages.settings.endpointMeasurementUnsupported,
    };
  }
  const failed = result.results.find((item) => item.status === 'failed');
  if (failed) {
    return {
      tone: 'negative',
      copyable: true,
      message: failed.errorMessage
        ? `${messages.settings.connectionFailed}: ${failed.errorMessage}`
        : messages.settings.connectionFailed,
    };
  }
  const healthy = result.results.filter((item) => item.status === 'success');
  if (healthy.length === 0) {
    return { tone: 'warning', copyable: false, message: messages.settings.configValidProviderNoModels };
  }
  return { tone: 'positive', copyable: false, message: messages.settings.speedTestSuccess };
}
