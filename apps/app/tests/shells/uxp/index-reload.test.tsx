import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const renderMock = vi.fn();
  const unmountMock = vi.fn();
  const disposeMock = vi.fn();
  const createRootMock = vi.fn(() => ({ render: renderMock, unmount: unmountMock }));
  const createPluginHostShellMock = vi.fn();
  const entrypointsSetupMock = vi.fn();
  const primeSharedUiMock = vi.fn();
  return {
    renderMock,
    unmountMock,
    disposeMock,
    createRootMock,
    createPluginHostShellMock,
    entrypointsSetupMock,
    primeSharedUiMock,
  };
});

const {
  renderMock,
  unmountMock,
  disposeMock,
  createRootMock,
  createPluginHostShellMock,
  entrypointsSetupMock,
  primeSharedUiMock,
} = mocks;

vi.mock('react-dom/client', () => ({
  createRoot: createRootMock,
}));

vi.mock('../../../src/shells/uxp/create-plugin-host-shell', () => ({
  createPluginHostShell: createPluginHostShellMock,
}));

vi.mock('../../../src/adapters/uxp/uxp-api', () => ({
  resolveUxpModules: () => ({
    uxp: {
      entrypoints: {
        setup: entrypointsSetupMock,
      },
    },
  }),
}));

function createFakeHostShell() {
  return {
    kind: 'photoshop-uxp' as const,
    app: { stage: 'uxp-first-shell' as const, host: 'photoshop-uxp' as const, services: ['commands' as const, 'host' as const] },
    locale: 'en' as const,
    services: {
      commands: {},
      host: {
        listLayers: async () => [],
      },
    },
    dispose: disposeMock,
  };
}

vi.mock('../../../src/shared/ui/app-shell', () => ({
  AppShell: () => null,
}));

vi.mock('../../../src/shared/ui/panel-bootstrap', () => ({
  primeSharedUi: primeSharedUiMock,
}));

function latestPanelController() {
  const setupConfig = entrypointsSetupMock.mock.calls.at(-1)?.[0];
  const panel = setupConfig?.panels?.['imagen-ps-panel'];
  if (!panel) {
    throw new Error('missing panel controller');
  }
  return panel as {
    create: () => HTMLElement | undefined;
    show: () => void;
    hide: () => void;
    destroy: () => void;
  };
}

function latestPluginController() {
  const setupConfig = entrypointsSetupMock.mock.calls.at(-1)?.[0];
  const plugin = setupConfig?.plugin;
  if (!plugin) {
    throw new Error('missing plugin controller');
  }
  return plugin as {
    create: () => void;
    destroy: () => void;
  };
}

describe('UXP panel entry reload behavior', () => {
  beforeEach(() => {
    vi.resetModules();
    createPluginHostShellMock.mockReset();
    createPluginHostShellMock.mockImplementation(createFakeHostShell);
    createRootMock.mockClear();
    renderMock.mockClear();
    unmountMock.mockClear();
    disposeMock.mockClear();
    entrypointsSetupMock.mockClear();
    primeSharedUiMock.mockClear();
    delete globalThis.__IMAGEN_PS_REACT_ROOT__;
    delete globalThis.__IMAGEN_PS_HOST_SMOKE__;
    delete globalThis.__IMAGEN_PS_PANEL_RUNTIME__;
    delete (globalThis as { __IMAGEN_PS_BOOTSTRAP_LOG__?: unknown }).__IMAGEN_PS_BOOTSTRAP_LOG__;
    window.localStorage.clear();
    document.body.innerHTML = '<div id="root"></div>';
  });

  it('registers UXP entrypoints and mounts only when the panel is created', async () => {
    await import('../../../src/index');

    expect(entrypointsSetupMock).toHaveBeenCalledTimes(1);
    expect(latestPluginController().create).toEqual(expect.any(Function));
    expect(createPluginHostShellMock).not.toHaveBeenCalled();
    expect(createRootMock).not.toHaveBeenCalled();

    latestPanelController().create();

    expect(createPluginHostShellMock).toHaveBeenCalledTimes(1);
    expect(primeSharedUiMock).toHaveBeenCalledTimes(1);
    expect(createRootMock).toHaveBeenCalledTimes(1);
    expect(renderMock).toHaveBeenCalledTimes(1);
  });

  it('disposes the previous runtime before installing replacement entrypoints', async () => {
    await import('../../../src/index');
    latestPanelController().create();

    vi.resetModules();
    await import('../../../src/index');

    expect(unmountMock).toHaveBeenCalledTimes(1);
    expect(disposeMock).toHaveBeenCalledTimes(1);
    expect(entrypointsSetupMock).toHaveBeenCalledTimes(2);
    expect(unmountMock.mock.invocationCallOrder[0]).toBeLessThan(
      entrypointsSetupMock.mock.invocationCallOrder[1] ?? 0,
    );
  });

  it('clears stale host smoke handle before replacement host startup', async () => {
    window.localStorage.setItem('imagenPsHostSmoke', '1');
    await import('../../../src/index');
    latestPanelController().create();
    expect(globalThis.__IMAGEN_PS_HOST_SMOKE__).toBeTruthy();

    vi.resetModules();
    await import('../../../src/index');
    createPluginHostShellMock.mockImplementationOnce(() => {
      throw new Error('replacement startup failed');
    });
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      latestPanelController().create();
    } finally {
      consoleErrorSpy.mockRestore();
    }

    expect(globalThis.__IMAGEN_PS_HOST_SMOKE__).toBeUndefined();
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('replacement startup failed');
  });
});
