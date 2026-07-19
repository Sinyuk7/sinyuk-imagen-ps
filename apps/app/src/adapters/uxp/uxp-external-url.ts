import type { ExternalUrlPort } from '../../shared/ports/external-url';
import type { UxpModules } from './uxp-api';

function assertHttpUrl(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Only HTTP(S) URLs can be opened externally.');
  }
  return url;
}

/** 通过 UXP shell 打开外部 URL，并将宿主错误转换为异常。 */
export function createUxpExternalUrlPort(modules: UxpModules): ExternalUrlPort {
  return {
    async open(value, developerText): Promise<void> {
      const shell = modules.uxp?.shell;
      if (!shell) {
        throw new Error('UXP shell.openExternal is unavailable.');
      }
      const url = assertHttpUrl(value);
      const error = await shell.openExternal(url.href, developerText);
      if (error.length > 0) {
        throw new Error(error);
      }
    },
  };
}
