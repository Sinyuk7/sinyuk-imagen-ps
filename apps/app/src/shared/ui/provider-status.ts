import type { ProviderProfileTestResult } from '@imagen-ps/application';
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
