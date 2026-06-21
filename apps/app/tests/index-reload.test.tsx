import { beforeEach, describe, expect, it, vi } from 'vitest';

const renderMock = vi.fn();
const unmountMock = vi.fn();
const createRootMock = vi.fn(() => ({ render: renderMock, unmount: unmountMock }));

vi.mock('react-dom/client', () => ({
  createRoot: createRootMock,
}));

vi.mock('../src/host/create-plugin-host-shell', () => ({
  createPluginHostShell: () => ({
    kind: 'photoshop-uxp',
    app: { stage: 'uxp-first-shell', host: 'photoshop-uxp', services: ['commands', 'host'] },
    locale: 'en',
    services: {
      commands: {},
      host: {
        listLayers: async () => [],
      },
    },
  }),
}));

vi.mock('../src/ui/app-shell', () => ({
  AppShell: () => null,
}));

describe('UXP panel entry reload behavior', () => {
  beforeEach(() => {
    vi.resetModules();
    createRootMock.mockClear();
    renderMock.mockClear();
    unmountMock.mockClear();
    delete globalThis.__IMAGEN_PS_REACT_ROOT__;
    document.body.innerHTML = '<div id="root"></div>';
  });

  it('unmounts an existing React root before rendering after a repeated entry execution', async () => {
    await import('../src/index');
    expect(createRootMock).toHaveBeenCalledTimes(1);
    expect(renderMock).toHaveBeenCalledTimes(1);
    expect(unmountMock).not.toHaveBeenCalled();

    vi.resetModules();
    await import('../src/index');
    expect(unmountMock).toHaveBeenCalledTimes(1);
    expect(createRootMock).toHaveBeenCalledTimes(2);
    expect(renderMock).toHaveBeenCalledTimes(2);
  });
});
