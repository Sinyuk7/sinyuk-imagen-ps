type UxpRequire = (moduleName: string) => unknown;

export interface UxpModules {
  readonly photoshop?: {
    readonly app?: unknown;
    readonly core?: unknown;
    readonly action?: unknown;
    readonly imaging?: unknown;
  };
  readonly uxp?: {
    readonly storage?: unknown;
  };
}

declare const require: UxpRequire | undefined;

function getUxpRequire(): UxpRequire | undefined {
  try {
    return typeof require === 'function' ? require : undefined;
  } catch {
    return undefined;
  }
}

export function resolveUxpModules(): UxpModules {
  const uxpRequire = getUxpRequire();
  if (!uxpRequire) {
    return {};
  }

  try {
    return {
      photoshop: uxpRequire('photoshop') as UxpModules['photoshop'],
      uxp: uxpRequire('uxp') as UxpModules['uxp'],
    };
  } catch {
    return {};
  }
}
