/**
 * @imagen-ps/app
 *
 * Photoshop / UXP panel entry.
 */
import { createRoot } from 'react-dom/client';
import { createPluginHostShell } from './host/create-plugin-host-shell';
import { AppShell } from './ui/app-shell';

export { createPluginHostShell } from './host/create-plugin-host-shell';
export { createPluginAppModel } from './shared/plugin-app-model';
export { AppShell } from './ui/app-shell';

export const pluginHost = createPluginHostShell();

const rootEl = typeof document !== 'undefined' ? document.getElementById('root') : null;
if (typeof document !== 'undefined' && rootEl) {
  createRoot(rootEl).render(<AppShell host={pluginHost} />);
}

export default pluginHost;
