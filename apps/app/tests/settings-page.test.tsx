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
    expect(container.querySelector('.hdr-title')?.textContent).toMatch(/^(Configuration|配置)$/);
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
                apiFormat: 'openai-images',
                displayName: 'Very Long Provider Display Name That Needs Room To Wrap',
                enabled: true,
                config: {
                  apiFormat: 'openai-images',
                  displayName: 'Mock Provider',
                  paths: { generation: '/images/generations', edit: '/images/edits' },
                },
                secretRefs: {},
                selectedModelIds: ['very-long-model-name-that-should-not-own-the-primary-row'],
                defaultModelId: 'very-long-model-name-that-should-not-own-the-primary-row',
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
    expect(row.querySelector('.prov-primary-status')).toBeNull();
    expect(row.querySelector('.prov-content .prov-family')?.textContent).toContain('OpenAI Images');
    expect(row.querySelector('.prov-content .prov-model')?.textContent).toContain('very-long-model-name');
    expect(row.querySelector('.prov-readiness .prov-status-text')?.textContent).toContain('就绪');
    expect(row.querySelector('.prov-trail')).not.toBeNull();
    expect(getComputedStyle(row).height).not.toBe('64px');
  });

  it('renders fixed configuration rows before provider profiles', async () => {
    const { services } = createFakeServices();
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    const onOpenGlobalGeneration = vi.fn();
    const onOpenPromptSettings = vi.fn();
    const onOpenModelConfiguration = vi.fn();

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
              providerInputSizePreset: '2k',
            }}
            onOpenGlobalGeneration={onOpenGlobalGeneration}
            onOpenPromptSettings={onOpenPromptSettings}
            onOpenModelConfiguration={onOpenModelConfiguration}
          />
        </TestAppProviders>,
      );
    });

    const configRows = Array.from(container.querySelectorAll<HTMLElement>('.settings-provider-row'));
    expect(configRows[0]?.dataset.testid).toBe('global-generation-settings-row');
    expect(configRows[1]?.dataset.testid).toBe('prompt-settings-row');
    expect(configRows[2]?.dataset.testid).toBe('model-configuration-row');
    const row = configRows[0]!;
    expect(row.textContent).toContain('生成设置');
    expect(row.textContent).toContain('2K');
    expect(configRows[1]?.textContent).toContain('提示词设置');
    expect(configRows[1]?.querySelector('[data-icon-name="pencil"]')).not.toBeNull();
    await act(async () => {
      row.click();
    });
    expect(onOpenGlobalGeneration).toHaveBeenCalledTimes(1);
    await act(async () => {
      configRows[1]!.click();
    });
    expect(onOpenPromptSettings).toHaveBeenCalledTimes(1);
    await act(async () => {
      configRows[2]!.click();
    });
    expect(onOpenModelConfiguration).toHaveBeenCalledTimes(1);
  });
});
