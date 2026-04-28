import { createPluginAppModel, type PluginAppModel } from "../shared/plugin-app-model";

export interface PluginHostShell {
  readonly kind: "photoshop-uxp";
  readonly app: PluginAppModel;
}

export function createPluginHostShell(): PluginHostShell {
  return {
    kind: "photoshop-uxp",
    app: createPluginAppModel()
  };
}
