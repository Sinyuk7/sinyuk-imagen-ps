import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PromptSettings } from '../../../../src/shared/ports/prompt-settings';
import { PromptSettingsPage } from '../../../../src/shared/ui/pages/prompt-settings-page';
import type { PromptPresetView } from '../../../../src/shared/ui/hooks/use-prompt-settings';
import { TestAppProviders } from '../../../helpers/render-helpers';
import { createFakeServices } from '../../../helpers/fakes';

let root: Root | undefined;

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  document.body.innerHTML = '';
});

const settings: PromptSettings = {
  optimization: { profileId: null, template: '{prompt}' },
  presets: { selectedId: null, items: [] },
};

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

async function renderPage(options?: {
  readonly loading?: boolean;
  readonly error?: string | null;
  readonly saveState?: 'idle' | 'saving' | 'saved' | 'error';
  readonly settings?: PromptSettings;
  readonly templateValid?: boolean;
  readonly presetViews?: readonly PromptPresetView[];
  readonly onSelectPreset?: (presetId: string | null) => Promise<void>;
  readonly onDeletePreset?: (presetId: string) => Promise<void>;
  readonly onOpenPreset?: (presetId: string | null) => void;
}): Promise<HTMLDivElement> {
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  const { services } = createFakeServices();

  await act(async () => {
    root!.render(
      <TestAppProviders services={services} locale="en">
        <div className="panel">
          <PromptSettingsPage
            activationState="no-profile"
            error={options?.error ?? null}
            loading={options?.loading ?? false}
            onDeletePreset={options?.onDeletePreset ?? vi.fn(async () => undefined)}
            onNav={vi.fn()}
            onOpenPreset={options?.onOpenPreset ?? vi.fn()}
            onSave={vi.fn(async () => undefined)}
            onSelectPreset={options?.onSelectPreset ?? vi.fn(async () => undefined)}
            presetViews={options?.presetViews ?? []}
            profiles={[]}
            saveState={options?.saveState ?? 'idle'}
            settings={options?.settings ?? settings}
            templateValid={options?.templateValid ?? true}
          />
        </div>
      </TestAppProviders>,
    );
  });
  await flush();
  return container;
}

describe('PromptSettingsPage preset list', () => {
  it('keeps template requirements visible when its value is empty', async () => {
    const container = await renderPage({
      settings: { ...settings, optimization: { ...settings.optimization, template: '' } },
      templateValid: false,
    });

    const template = container.querySelector<HTMLTextAreaElement>('[data-testid="prompt-optimization-template"]');
    expect(template?.getAttribute('placeholder')).toBe('Write instructions and include {prompt}');
    expect(container.querySelector('[data-testid="prompt-optimization-template-status"]')?.textContent)
      .toBe('Instructions + {prompt} placeholder');
  });

  it('uses a toast, not persistent page feedback, after settings save', async () => {
    const container = await renderPage();

    await act(async () => {
      root?.render(
        <TestAppProviders services={createFakeServices().services} locale="en">
          <div className="panel">
            <PromptSettingsPage
              activationState="no-profile"
              error={null}
              loading={false}
              onDeletePreset={vi.fn(async () => undefined)}
              onNav={vi.fn()}
              onOpenPreset={vi.fn()}
              onSave={vi.fn(async () => undefined)}
              onSelectPreset={vi.fn(async () => undefined)}
              presetViews={[]}
              profiles={[]}
              saveState="saved"
              settings={settings}
              templateValid
            />
          </div>
        </TestAppProviders>,
      );
    });
    await flush();

    expect(container.querySelector('[data-testid="prompt-settings-save-status"]')).toBeNull();
    expect(document.body.querySelector('[data-testid="toast"]')?.textContent).toContain('Saved');
  });

  it('uses inert prompt-preset shell rows for initial loading, error, and empty states', async () => {
    const loading = await renderPage({ loading: true });
    const loadingState = loading.querySelector<HTMLElement>('[data-testid="prompt-preset-loading-state"]');
    expect(loadingState?.getAttribute('aria-disabled')).toBe('true');
    expect(loadingState?.hasAttribute('tabindex')).toBe(false);
    expect(loadingState?.getAttribute('role')).toBe('option');
    expect(loadingState?.classList.contains('prompt-preset-row')).toBe(true);
    expect(loadingState?.querySelector('.prompt-preset-row-main')).not.toBeNull();
    expect(loadingState?.className).not.toContain('ui-list-item-shell');

    await act(async () => {
      root?.render(
        <TestAppProviders services={createFakeServices().services} locale="en">
          <PromptSettingsPage
            activationState="no-profile"
            error="Load failed"
            loading={false}
            onDeletePreset={vi.fn(async () => undefined)}
            onNav={vi.fn()}
            onOpenPreset={vi.fn()}
            onSave={vi.fn(async () => undefined)}
            onSelectPreset={vi.fn(async () => undefined)}
            presetViews={[]}
            profiles={[]}
            saveState="error"
            settings={settings}
            templateValid
          />
        </TestAppProviders>,
      );
    });
    await flush();

    const errorState = loading.querySelector<HTMLElement>('[data-testid="prompt-preset-error-state"]');
    expect(errorState?.textContent).toContain('Load failed');
    expect(errorState?.getAttribute('aria-disabled')).toBe('true');
    expect(errorState?.getAttribute('role')).toBe('option');
    expect(errorState?.querySelector('.prompt-preset-list-state-description')?.textContent).toContain('Load failed');

    await act(async () => {
      root?.unmount();
    });
    root = undefined;
    loading.remove();

    const empty = await renderPage();
    const emptyState = empty.querySelector<HTMLElement>('[data-testid="prompt-preset-empty-state"]');
    expect(emptyState?.getAttribute('aria-disabled')).toBe('true');
    expect(emptyState?.hasAttribute('tabindex')).toBe(false);
    expect(emptyState?.getAttribute('role')).toBe('option');
    expect(emptyState?.querySelector('.prompt-preset-radio[data-selected="false"]')).not.toBeNull();
  });

  it('keeps preset listbox semantics and edit, delete, and selection actions', async () => {
    const onSelectPreset = vi.fn(async () => undefined);
    const onDeletePreset = vi.fn(async () => undefined);
    const onOpenPreset = vi.fn();
    const presetViews: readonly PromptPresetView[] = [{
      preset: { id: 'cinematic', name: 'Cinematic', mode: 'append', content: 'cinematic' },
      selected: true,
      contentValid: true,
      effectState: 'active',
    }];
    const container = await renderPage({ presetViews, onSelectPreset, onDeletePreset, onOpenPreset });
    const listbox = container.querySelector<HTMLElement>('[role="listbox"]');
    const row = container.querySelector<HTMLElement>('[data-testid="prompt-preset-row-cinematic"]');

    expect(listbox).not.toBeNull();
    expect(container.querySelector('.prompt-preset-section-header h2')?.textContent).toBe('Prompt Presets');
    expect(container.querySelector('.prompt-preset-section-header [data-testid="prompt-preset-add-button"]')).not.toBeNull();
    expect(row?.getAttribute('role')).toBe('option');
    expect(row?.getAttribute('aria-selected')).toBe('true');

    await act(async () => {
      row?.click();
      container.querySelector<HTMLElement>('[data-testid="prompt-preset-edit-cinematic"]')?.click();
      container.querySelector<HTMLElement>('[data-testid="prompt-preset-delete-cinematic"]')?.click();
    });

    expect(onSelectPreset).toHaveBeenCalledWith('cinematic');
    expect(onOpenPreset).toHaveBeenCalledWith('cinematic');
    expect(onDeletePreset).toHaveBeenCalledWith('cinematic');
  });

  it('keeps save failure as page feedback instead of replacing existing preset rows', async () => {
    const presetViews: readonly PromptPresetView[] = [{
      preset: { id: 'cinematic', name: 'Cinematic', mode: 'append', content: 'cinematic' },
      selected: false,
      contentValid: true,
      effectState: 'none',
    }];
    const container = await renderPage({ presetViews });

    await act(async () => {
      root?.render(
        <TestAppProviders services={createFakeServices().services} locale="en">
          <div className="panel">
            <PromptSettingsPage
              activationState="no-profile"
              error="Save failed"
              loading={false}
              onDeletePreset={vi.fn(async () => undefined)}
              onNav={vi.fn()}
              onOpenPreset={vi.fn()}
              onSave={vi.fn(async () => undefined)}
              onSelectPreset={vi.fn(async () => undefined)}
              presetViews={presetViews}
              profiles={[]}
              saveState="error"
              settings={settings}
              templateValid
            />
          </div>
        </TestAppProviders>,
      );
    });
    await flush();

    expect(container.querySelector('[data-testid="prompt-preset-row-cinematic"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="prompt-preset-error-state"]')).toBeNull();
    expect(container.textContent).toContain('Save failed');
  });
});
