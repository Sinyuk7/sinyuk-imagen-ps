export interface PluginAppModel {
  readonly stage: "placeholder";
  readonly host: "photoshop-uxp";
  readonly notes: readonly string[];
}

export function createPluginAppModel(): PluginAppModel {
  return {
    stage: "placeholder",
    host: "photoshop-uxp",
    notes: [
      "UI stays in the app layer.",
      "Photoshop IO remains at the host boundary.",
      "Runtime and provider semantics stay outside the app shell."
    ]
  };
}
