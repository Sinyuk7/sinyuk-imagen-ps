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
  it('uses sp-action-button with sp-tooltip for header actions (no legacy CSS tooltip in native button)', async () => {
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

    // Header actions are now sp-action-button (not native <button>), so the old
    // UXP-unsafe pattern of a CSS tooltip div living inside a native button is gone.
    const headerActions = Array.from(container.querySelectorAll<HTMLElement>('.hdr sp-action-button'));
    expect(headerActions).toHaveLength(3);
    expect(container.querySelectorAll('.hdr button')).toHaveLength(0);
    // No legacy CSS tooltip remnants anywhere in the rendered tree.
    expect(container.querySelector('.tt')).toBeNull();
    expect(container.querySelector('.tt-wrap')).toBeNull();
    // Tooltips that do exist are Spectrum sp-tooltip elements.
    expect(container.querySelectorAll('sp-tooltip').length).toBeGreaterThan(0);
  });
});
