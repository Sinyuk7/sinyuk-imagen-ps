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
  const primeSharedUiMock = vi.fn();
  return { renderMock, unmountMock, createRootMock, primeSharedUiMock };
});

const { renderMock, unmountMock, createRootMock, primeSharedUiMock } = mocks;

vi.mock('react-dom/client', () => ({
  createRoot: mocks.createRootMock,
}));

vi.mock('../../shared/ui/app-shell', () => ({
  AppShell: () => null,
}));

vi.mock('../../harness/components/uxp-css-contract', () => ({
  UxpCssContractHarnessPage: () => null,
}));

vi.mock('../../shared/ui/panel-bootstrap', () => ({
  primeSharedUi: mocks.primeSharedUiMock,
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
    primeSharedUiMock.mockClear();
    delete globalThis.__IMAGEN_PS_REACT_ROOT__;
    delete globalThis.__IMAGEN_PS_HOST_SMOKE__;
    delete globalThis.__IMAGEN_PS_PANEL_RUNTIME__;
    delete (globalThis as { __IMAGEN_PS_BOOTSTRAP_LOG__?: unknown }).__IMAGEN_PS_BOOTSTRAP_LOG__;
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
    expect(primeSharedUiMock).toHaveBeenCalledTimes(1);
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
    panel.create(document.getElementById('root'));

    expect(createHost).toHaveBeenCalledTimes(1);
    expect(createRootMock).toHaveBeenCalledTimes(1);
  });

  it('prefers the manifest v5 panel rootNode over document root lookup', () => {
    const setup = vi.fn();
    const mountSpy = vi.fn();
    const runtime = {
      host: undefined,
      mount: mountSpy,
      setRecoveryCleanup: vi.fn(),
      dispose: vi.fn(),
    };

    expect(installUxpPanelEntrypoints(runtime, { uxp: { entrypoints: { setup } } } as unknown as UxpModules)).toBe(true);

    const panelRoot = document.createElement('div');
    panelRoot.id = 'uxp-panel-root';
    const panel = setup.mock.calls[0]?.[0].panels['imagen-ps-panel'];

    panel.create(panelRoot);
    panel.show(panelRoot);

    expect(mountSpy).toHaveBeenNthCalledWith(1, panelRoot);
    expect(mountSpy).toHaveBeenNthCalledWith(2, panelRoot);
  });

  it('reuses the latest panel root during focus recovery instead of document root lookup', () => {
    const setup = vi.fn();
    const mountSpy = vi.fn();
    const runtime = {
      host: undefined,
      mount: mountSpy,
      setRecoveryCleanup: vi.fn(),
      dispose: vi.fn(),
    };

    expect(installUxpPanelEntrypoints(runtime, { uxp: { entrypoints: { setup } } } as unknown as UxpModules)).toBe(true);

    const panelRoot = document.createElement('div');
    panelRoot.id = 'uxp-panel-root';
    const panel = setup.mock.calls[0]?.[0].panels['imagen-ps-panel'];
    panel.create(panelRoot);
    mountSpy.mockClear();

    window.dispatchEvent(new Event('focus'));

    expect(mountSpy).toHaveBeenCalledTimes(1);
    expect(mountSpy).toHaveBeenCalledWith(panelRoot);
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

  it('writes bootstrap checkpoints for entrypoint setup and panel mount', () => {
    const checkpoint = vi.fn();
    const failure = vi.fn();
    (globalThis as { __IMAGEN_PS_BOOTSTRAP_LOG__?: { checkpoint: typeof checkpoint; failure: typeof failure } })
      .__IMAGEN_PS_BOOTSTRAP_LOG__ = { checkpoint, failure };
    const setup = vi.fn();
    const runtime = createImagenPanelRuntime({ createHost: () => fakeHost() });
    const modules = {
      uxp: { entrypoints: { setup } },
    } as unknown as UxpModules;

    expect(installUxpPanelEntrypoints(runtime, modules)).toBe(true);
    const panel = setup.mock.calls[0]?.[0].panels['imagen-ps-panel'];
    panel.create(document.getElementById('root'));

    expect(checkpoint).toHaveBeenCalledWith('panel.bootstrap.entrypoints.setup.start', { panelId: 'imagen-ps-panel' });
    expect(checkpoint).toHaveBeenCalledWith('panel.bootstrap.entrypoints.setup.ok', { panelId: 'imagen-ps-panel' });
    expect(checkpoint).toHaveBeenCalledWith('panel.bootstrap.panel.create');
    expect(checkpoint).toHaveBeenCalledWith('panel.bootstrap.shared_ui.primed');
    expect(checkpoint).toHaveBeenCalledWith('panel.bootstrap.host_shell.created');
    expect(checkpoint).toHaveBeenCalledWith('panel.bootstrap.react.rendered');
    expect(checkpoint).toHaveBeenCalledWith('panel.bootstrap.runtime.mount.complete', { hasHost: true });
    expect(failure).not.toHaveBeenCalled();
  });

  it('renders the UXP CSS contract harness instead of AppShell when the panel harness override is enabled', () => {
    window.localStorage.setItem('imagenPsPanelHarness', 'uxp-css-contract');
    const createHost = vi.fn(() => fakeHost());
    const runtime = createImagenPanelRuntime({ createHost });

    const mounted = runtime.mount(document.getElementById('root'));

    expect(mounted).toBeUndefined();
    expect(createHost).not.toHaveBeenCalled();
    expect(createRootMock).toHaveBeenCalledTimes(1);
    expect(renderMock).toHaveBeenCalledTimes(1);
    expect(primeSharedUiMock).toHaveBeenCalledTimes(1);
  });

  it('disposes the globally registered previous runtime', () => {
    const dispose = vi.fn();
    globalThis.__IMAGEN_PS_PANEL_RUNTIME__ = {
      host: undefined,
      mount: vi.fn(),
      setRecoveryCleanup: vi.fn(),
      dispose,
    };

    disposePreviousPanelRuntime();

    expect(dispose).toHaveBeenCalledTimes(1);
    expect(globalThis.__IMAGEN_PS_PANEL_RUNTIME__).toBeUndefined();
  });
});
