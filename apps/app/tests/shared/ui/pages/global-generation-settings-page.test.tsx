import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppGenerationSettings } from '../../../../src/shared/ports/app-generation-settings';
import { GlobalGenerationSettingsPage, middleEllipsizePath } from '../../../../src/shared/ui/pages/global-generation-settings-page';
import { TestAppProviders } from '../../../helpers/render-helpers';
import { createFakeServices } from '../../../helpers/fakes';

let root: Root | undefined;

const settings: AppGenerationSettings = {
  providerInputSizePreset: '1k',
};

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  document.body.innerHTML = '';
});

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

describe('GlobalGenerationSettingsPage', () => {
  it('middle-ellipsizes a long read-only path for narrow path rows', () => {
    expect(middleEllipsizePath('/Users/sinyuk/Documents/very-long-folder/output.png', 72)).toBe('/Users/….png');
    expect(middleEllipsizePath('/tmp/a.png', 200)).toBe('/tmp/a.png');
  });

  it('uses a compact read-only path list and a toast for save success', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    const { services } = createFakeServices();
    const render = async (saveState: 'idle' | 'saved') => {
      await act(async () => {
        root!.render(
          <TestAppProviders services={services} locale="en">
            <div className="panel">
              <GlobalGenerationSettingsPage
                error={null}
                loading={false}
                onBack={vi.fn()}
                onSave={vi.fn(async () => undefined)}
                saveState={saveState}
                settings={settings}
              />
            </div>
          </TestAppProviders>,
        );
      });
      await flush();
      await flush();
    };

    await render('idle');

    expect(container.querySelector('.ui-settings-form-section h2')?.textContent).toBe('Input');
    expect(container.querySelector('.global-settings-path-list')).not.toBeNull();
    expect(container.querySelectorAll('.global-settings-path-value')).toHaveLength(2);
    expect(container.querySelector('[data-testid="global-settings-log-path-row"] [data-icon-name="chevron-right"]')).toBeNull();
    expect(container.querySelector('[data-testid="global-settings-generated-image-path-row"] [data-icon-name="chevron-right"]')).toBeNull();
    expect(container.querySelector('.field-input-affordance')).toBeNull();
    expect(container.querySelector('[data-testid="global-settings-save-status"]')).toBeNull();

    await render('saved');

    expect(container.querySelector('[data-testid="global-settings-save-status"]')).toBeNull();
    expect(document.body.querySelector('[data-testid="toast"]')?.textContent).toContain('Saved');
  });
});
