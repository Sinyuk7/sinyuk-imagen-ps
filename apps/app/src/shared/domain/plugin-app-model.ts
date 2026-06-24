export interface PluginAppModel {
  readonly stage: 'uxp-first-shell';
  readonly host: 'photoshop-uxp';
  readonly services: readonly ['commands', 'host'];
}

export function createPluginAppModel(): PluginAppModel {
  return {
    stage: 'uxp-first-shell',
    host: 'photoshop-uxp',
    services: ['commands', 'host'],
  };
}
