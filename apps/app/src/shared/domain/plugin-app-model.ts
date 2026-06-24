export interface PluginAppModel {
  readonly stage: 'uxp-first-shell';
  readonly host: 'photoshop-uxp' | 'chrome-browser';
  readonly services: readonly ['commands', 'host'];
}

export function createPluginAppModel(host: PluginAppModel['host'] = 'photoshop-uxp'): PluginAppModel {
  return {
    stage: 'uxp-first-shell',
    host,
    services: ['commands', 'host'],
  };
}
