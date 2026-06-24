import type { ProviderProfileTestResult } from '@imagen-ps/application';
import type { StatusTone } from './components/status-notice';
import type { AppMessages } from './i18n/messages';

export interface ProviderStatus {
  readonly tone: StatusTone;
  readonly message: string;
}

export function statusFromProviderTestResult(
  result: ProviderProfileTestResult,
  messages: AppMessages,
): ProviderStatus {
  if (result.connectivity?.reachable === false) {
    return {
      tone: 'error',
      message: result.connectivity.errorMessage
        ? `${messages.settings.connectionFailed}: ${result.connectivity.errorMessage}`
        : messages.settings.connectionFailed,
    };
  }

  const modelCount = result.connectivity?.modelCount ?? result.connectivity?.models?.length;
  if (modelCount === 0) {
    return { tone: 'warning', message: messages.settings.configValidProviderNoModels };
  }

  return { tone: 'success', message: messages.settings.testSuccess };
}
