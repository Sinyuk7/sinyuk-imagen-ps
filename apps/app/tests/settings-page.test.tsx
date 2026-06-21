import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SettingsPage } from '../src/ui/pages/settings-page';
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
  it('keeps header tooltips outside native button elements', async () => {
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

    const headerButtons = Array.from(container.querySelectorAll<HTMLButtonElement>('.hdr button'));
    expect(headerButtons).toHaveLength(3);
    for (const button of headerButtons) {
      expect(button.querySelector('.tt')).toBeNull();
      expect(button.className).not.toContain('tt-wrap');
    }
  });
});
