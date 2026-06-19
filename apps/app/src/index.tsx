/**
 * @imagen-ps/app
 *
 * Photoshop / UXP panel entry.
 */
import { createRoot } from 'react-dom/client';
import { createPluginHostShell } from './host/create-plugin-host-shell';
import type { PluginHostShell } from './host/create-plugin-host-shell';
import { AppShell } from './ui/app-shell';

export { createPluginHostShell } from './host/create-plugin-host-shell';
export { createPluginAppModel } from './shared/plugin-app-model';
export { AppShell } from './ui/app-shell';

function errorMessageFrom(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function renderStartupError(rootEl: HTMLElement, error: unknown): void {
  rootEl.innerHTML = '';
  const container = document.createElement('div');
  container.setAttribute('role', 'alert');
  container.style.cssText = [
    'box-sizing:border-box',
    'min-height:100vh',
    'padding:16px',
    'font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif',
    'font-size:12px',
    'line-height:18px',
    'color:#e9edf4',
    'background:#0d1117',
  ].join(';');

  const title = document.createElement('div');
  title.textContent = 'Imagen PS startup failed';
  title.style.cssText = 'font-weight:600;margin-bottom:8px;color:#f26d6d';

  const message = document.createElement('pre');
  message.textContent = errorMessageFrom(error);
  message.style.cssText = 'white-space:pre-wrap;margin:0;color:#a6b0bf';

  container.append(title, message);
  rootEl.appendChild(container);
}

function createSafePluginHost(rootEl: HTMLElement | null): PluginHostShell | undefined {
  try {
    return createPluginHostShell();
  } catch (error) {
    console.error('Imagen PS startup failed', error);
    if (rootEl) {
      renderStartupError(rootEl, error);
    }
    return undefined;
  }
}

export const pluginHost = createSafePluginHost(typeof document !== 'undefined' ? document.getElementById('root') : null);

const rootEl = typeof document !== 'undefined' ? document.getElementById('root') : null;
if (typeof document !== 'undefined' && rootEl && pluginHost) {
  try {
    createRoot(rootEl).render(<AppShell host={pluginHost} />);
  } catch (error) {
    console.error('Imagen PS render failed', error);
    renderStartupError(rootEl, error);
  }
}

export default pluginHost;
