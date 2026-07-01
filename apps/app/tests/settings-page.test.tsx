import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SettingsPage } from '../src/shared/ui/pages/settings-page';
import { TestAppProviders } from './render-helpers';
import { createFakeServices } from './fakes';

let root: Root | undefined;

afterEach(async () => {
  if (root) {
    await act(async () => {
      root!.unmount();
    });
  }
  root = undefined;
});

describe('SettingsPage UXP compatibility', () => {
  it('uses labelled native header action buttons without legacy tooltip markup', async () => {
    const { services } = createFakeServices();
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root!.render(
        <TestAppProviders services={services}>
          <SettingsPage
            onNav={() => undefined}
            profiles={[]}
            loading={false}
            error={null}
            onReload={async () => undefined}
            onOpenProfile={vi.fn()}
          />
        </TestAppProviders>,
      );
    });

    const headerActions = Array.from(container.querySelectorAll<HTMLButtonElement>('.hdr button.ui-action-button'));
    expect(headerActions).toHaveLength(3);
    for (const action of headerActions) {
      expect(action.getAttribute('aria-label')).toBeTruthy();
      expect(action.getAttribute('title')).toBeTruthy();
    }
    expect(container.querySelector('.tt')).toBeNull();
    expect(container.querySelector('.tt-wrap')).toBeNull();
    expect(container.querySelector('sp-tooltip')).toBeNull();
  });

  it('renders provider rows with prototype-inspired layout and explicit readiness', async () => {
    const { services } = createFakeServices();
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root!.render(
        <TestAppProviders services={services}>
          <SettingsPage
            onNav={() => undefined}
            profiles={[
              {
                profileId: 'long-profile',
                providerId: 'mock',
                displayName: 'Very Long Provider Display Name That Needs Room To Wrap',
                enabled: true,
                config: {
                  providerId: 'mock',
                  displayName: 'Mock Provider',
                  family: 'image-endpoint',
                  baseUrl: 'https://mock.local',
                  defaultModel: 'very-long-model-name-that-should-not-own-the-primary-row',
                  imageMaxSide: 2048,
                },
                secretRefs: {},
                createdAt: '2026-06-27T00:00:00.000Z',
                updatedAt: '2026-06-27T00:00:00.000Z',
              },
            ]}
            loading={false}
            error={null}
            onReload={async () => undefined}
            onOpenProfile={vi.fn()}
          />
        </TestAppProviders>,
      );
    });

    const row = container.querySelector<HTMLElement>('[data-testid="provider-row-long-profile"]')!;
    expect(row.querySelector('.prov-primary-status')?.textContent).toContain('已启用');
    expect(row.querySelector('.prov-content .prov-family')?.textContent).toContain('image-endpoint');
    expect(row.querySelector('.prov-content .prov-model')?.textContent).toContain('very-long-model-name');
    expect(row.querySelector('.prov-readiness .prov-status-text')?.textContent).toContain('就绪');
    expect(row.querySelector('.prov-trail')).not.toBeNull();
    expect(getComputedStyle(row).height).not.toBe('64px');
  });

  it('renders a global generation settings entry before provider profiles', async () => {
    const { services } = createFakeServices();
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    const onOpenGlobalGeneration = vi.fn();

    await act(async () => {
      root!.render(
        <TestAppProviders services={services}>
          <SettingsPage
            onNav={() => undefined}
            profiles={[]}
            loading={false}
            error={null}
            onReload={async () => undefined}
            onOpenProfile={vi.fn()}
            generationSettings={{
              outputSizePreset: '2k',
              outputFormat: 'png',
              aspectRatio: 'auto',
              providerInputMaxSide: 2048,
            }}
            onOpenGlobalGeneration={onOpenGlobalGeneration}
          />
        </TestAppProviders>,
      );
    });

    const row = container.querySelector<HTMLElement>('[data-testid="global-generation-settings-row"]')!;
    expect(row.textContent).toContain('生成设置');
    expect(row.textContent).toContain('2K');
    await act(async () => {
      row.click();
    });
    expect(onOpenGlobalGeneration).toHaveBeenCalledTimes(1);
  });
});
