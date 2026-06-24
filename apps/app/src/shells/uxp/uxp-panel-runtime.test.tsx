import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createImagenPanelRuntime,
  disposePreviousPanelRuntime,
  installUxpPanelEntrypoints,
} from './uxp-panel-runtime';
import type { PluginHostShell } from './create-plugin-host-shell';
import type { UxpModules } from '../../adapters/uxp/uxp-api';

const mocks = vi.hoisted(() => {
  const renderMock = vi.fn();
  const unmountMock = vi.fn();
  const createRootMock = vi.fn(() => ({ render: renderMock, unmount: unmountMock }));
  return { renderMock, unmountMock, createRootMock };
});

const { renderMock, unmountMock, createRootMock } = mocks;

vi.mock('react-dom/client', () => ({
  createRoot: mocks.createRootMock,
}));

vi.mock('../../shared/ui/app-shell', () => ({
  AppShell: () => null,
}));

function fakeHost(dispose = vi.fn()): PluginHostShell {
  return {
    kind: 'photoshop-uxp',
    app: { stage: 'uxp-first-shell', host: 'photoshop-uxp', services: ['commands', 'host'] },
    locale: 'en',
    services: {
      commands: {} as PluginHostShell['services']['commands'],
      host: {} as PluginHostShell['services']['host'],
    },
    dispose,
  };
}

describe('UXP panel runtime', () => {
  beforeEach(() => {
    createRootMock.mockClear();
    renderMock.mockClear();
    unmountMock.mockClear();
    delete globalThis.__IMAGEN_PS_REACT_ROOT__;
    delete globalThis.__IMAGEN_PS_HOST_SMOKE__;
    delete globalThis.__IMAGEN_PS_PANEL_RUNTIME__;
    document.body.innerHTML = '<div id="root"></div>';
    window.localStorage.clear();
  });

  it('mounts one React root and disposes host shell on teardown', () => {
    const dispose = vi.fn();
    const runtime = createImagenPanelRuntime({ createHost: () => fakeHost(dispose) });

    runtime.mount(document.getElementById('root'));
    runtime.mount(document.getElementById('root'));
    runtime.dispose();

    expect(createRootMock).toHaveBeenCalledTimes(1);
    expect(renderMock).toHaveBeenCalledTimes(1);
    expect(unmountMock).toHaveBeenCalledTimes(1);
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('installs UXP panel lifecycle callbacks without immediate mount', () => {
    const setup = vi.fn();
    const createHost = vi.fn(() => fakeHost());
    const runtime = createImagenPanelRuntime({ createHost });

    const modules = {
      uxp: { entrypoints: { setup } },
    } as unknown as UxpModules;
    const installed = installUxpPanelEntrypoints(runtime, modules);

    expect(installed).toBe(true);
    expect(createHost).not.toHaveBeenCalled();
    expect(setup.mock.calls[0]?.[0].plugin.create).toEqual(expect.any(Function));

    const panel = setup.mock.calls[0]?.[0].panels['imagen-ps-panel'];
    panel.create();

    expect(createHost).toHaveBeenCalledTimes(1);
    expect(createRootMock).toHaveBeenCalledTimes(1);
  });

  it('matches the real UXP host plugin lifecycle create contract', () => {
    const setup = vi.fn((config: { readonly plugin?: { readonly create?: () => void } }) => {
      if (typeof config.plugin?.create !== 'function') {
        throw new Error('create method is not defined for plugin');
      }
    });
    const runtime = createImagenPanelRuntime({ createHost: () => fakeHost() });
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    try {
      expect(installUxpPanelEntrypoints(runtime, { uxp: { entrypoints: { setup } } } as unknown as UxpModules)).toBe(true);
    } finally {
      consoleWarnSpy.mockRestore();
    }

    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });

  it('disposes the globally registered previous runtime', () => {
    const dispose = vi.fn();
    globalThis.__IMAGEN_PS_PANEL_RUNTIME__ = {
      host: undefined,
      mount: vi.fn(),
      dispose,
    };

    disposePreviousPanelRuntime();

    expect(dispose).toHaveBeenCalledTimes(1);
    expect(globalThis.__IMAGEN_PS_PANEL_RUNTIME__).toBeUndefined();
  });
});
