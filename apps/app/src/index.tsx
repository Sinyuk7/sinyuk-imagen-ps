/**
 * @imagen-ps/app
 *
 * Minimal single-app entry for the early-stage Photoshop plugin shell.
 */
import { createPluginHostShell } from "./host/create-plugin-host-shell";

export { createPluginHostShell } from "./host/create-plugin-host-shell";
export { createPluginAppModel } from "./shared/plugin-app-model";
export { AppShell } from "./ui/app-shell";

export const pluginHost = createPluginHostShell();

export default pluginHost;
