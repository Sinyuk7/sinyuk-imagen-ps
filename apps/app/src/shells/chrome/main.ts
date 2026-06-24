import { runChromeFeasibilityRuntime } from '../../composition/chrome/chrome-feasibility-runtime';

function renderStatus(status: 'ok' | 'error', detail: string): void {
  const root = document.getElementById('root');
  if (!root) {
    throw new Error('Chrome shell root element is missing.');
  }
  root.dataset.runtime = 'chrome';
  root.dataset.status = status;
  root.textContent = detail;
}

runChromeFeasibilityRuntime()
  .then((result) => {
    globalThis.__IMAGEN_CHROME_FEASIBILITY__ = result;
    renderStatus('ok', `Chrome harness ready: ${result.providerIds.join(', ')}`);
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'Unknown Chrome harness startup error.';
    renderStatus('error', message);
    console.error(error);
  });

declare global {
  // eslint-disable-next-line no-var
  var __IMAGEN_CHROME_FEASIBILITY__: Awaited<ReturnType<typeof runChromeFeasibilityRuntime>> | undefined;
}
