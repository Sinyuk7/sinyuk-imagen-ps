import type { ExternalUrlPort } from '../../shared/ports/external-url';

function assertHttpUrl(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Only HTTP(S) URLs can be opened externally.');
  }
  return url;
}

/** 使用浏览器新标签页打开外部 URL。 */
export function createChromeExternalUrlPort(openWindow: typeof window.open = window.open.bind(window)): ExternalUrlPort {
  return {
    async open(value): Promise<void> {
      const url = assertHttpUrl(value);
      const opened = openWindow(url.href, '_blank', 'noopener,noreferrer');
      if (opened === null) {
        throw new Error('The browser blocked the external URL.');
      }
    },
  };
}
