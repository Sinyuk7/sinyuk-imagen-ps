import { createRoot, type Root } from 'react-dom/client';
import { AppShell } from '../../shared/ui/app-shell';
import { createChromeAppShell } from '../../composition/chrome/create-chrome-app-shell';
import { chromeTestHarnessConfigFromUrl } from '../../composition/chrome/chrome-test-harness';
import { ComposerSelectHarnessPage } from '../../harness/components/composer-select';

function resolveChromeHarness(url: URL): 'composer-select' | null {
  const harness = url.searchParams.get('harness');
  if (harness === 'composer-select') {
    return harness;
  }
  return null;
}

let root: Root | undefined;

function renderStartupError(message: string): void {
  const root = document.getElementById('root');
  if (!root) {
    throw new Error('Chrome shell root element is missing.');
  }
  root.dataset.runtime = 'chrome';
  root.dataset.status = 'error';
  root.textContent = message;
}

try {
  const container = document.getElementById('root');
  if (!container) {
    throw new Error('Chrome shell root element is missing.');
  }
  container.dataset.runtime = 'chrome';
  container.dataset.status = 'ok';
  const url = new URL(window.location.href);
  const harness = resolveChromeHarness(url);
  root = createRoot(container);
  if (harness === 'composer-select') {
    root.render(<ComposerSelectHarnessPage />);
    globalThis.__IMAGEN_CHROME_RUNTIME__ = undefined;
  } else {
    const testHarness = chromeTestHarnessConfigFromUrl(url);
    const host = createChromeAppShell(testHarness ? { testHarness } : undefined);
    root.render(<AppShell host={host} />);
    globalThis.__IMAGEN_CHROME_RUNTIME__ = { host, dispose: () => {
      root?.unmount();
      host.dispose();
    } };
  }
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : 'Unknown Chrome shell startup error.';
  renderStartupError(message);
  console.error(error);
}

declare global {
  // eslint-disable-next-line no-var
  var __IMAGEN_CHROME_RUNTIME__: { readonly host: ReturnType<typeof createChromeAppShell>; dispose(): void } | undefined;
}
