import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GeminiProfilePage } from '../../../../../../src/shared/ui/features/provider-profiles/gemini/gemini-profile-page';
import { createFakeServices, fakeProfile } from '../../../../../helpers/fakes';
import { fakeProviderSurfaces } from '../../../../../helpers/fixtures/provider.fixtures';
import { TestAppProviders } from '../../../../../helpers/render-helpers';
import { flush } from '../../../../../helpers/settings-detail-harness';

let root: Root | undefined;
afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = undefined;
  document.body.innerHTML = '';
});

describe('GeminiProfilePage', () => {
  it('只按 sanitized capability 在编辑页显示安全连接测试', async () => {
    const profile = { ...fakeProfile, apiFormat: 'gemini-generate-content' as const, displayName: 'Gemini Main' };
    const fake = createFakeServices({ profiles: [profile] });
    const surface = fakeProviderSurfaces[1]!;
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => root?.render(
      <TestAppProviders services={fake.services}>
        <GeminiProfilePage surface={surface} profile={profile} existingDisplayNames={[]} onBack={vi.fn()} onSaved={vi.fn()} onDeleted={vi.fn()} />
      </TestAppProviders>,
    ));

    await act(async () => container.querySelector<HTMLElement>('[data-testid="provider-profile-test-button"]')?.click());
    await flush();
    expect(fake.spies.testProviderProfile).toHaveBeenCalledWith('mock-profile', {
      connect: true,
      modelId: 'gemini-3.1-flash-image',
    });
  });
});
