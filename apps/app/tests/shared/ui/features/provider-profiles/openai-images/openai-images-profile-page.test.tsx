import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OpenAiImagesProfilePage } from '../../../../../../src/shared/ui/features/provider-profiles/openai-images/openai-images-profile-page';
import { createFakeServices, fakeProfile } from '../../../../../helpers/fakes';
import { fakeProviderSurfaces } from '../../../../../helpers/fixtures/provider.fixtures';
import { TestAppProviders } from '../../../../../helpers/render-helpers';

let root: Root | undefined;
afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = undefined;
  document.body.innerHTML = '';
});

describe('OpenAiImagesProfilePage', () => {
  it('显示 GPT Image 2 专用编辑页且不显示 unsupported Test Connection', async () => {
    const fake = createFakeServices();
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => root?.render(
      <TestAppProviders services={fake.services}>
        <OpenAiImagesProfilePage surface={fakeProviderSurfaces[2]!} profile={fakeProfile} existingDisplayNames={[]} onBack={vi.fn()} onSaved={vi.fn()} onDeleted={vi.fn()} />
      </TestAppProviders>,
    ));
    expect(container.textContent).toContain('GPT Image 2');
    expect(container.querySelector('[data-testid="provider-profile-test-button"]')).toBeNull();
    expect(container.textContent).not.toContain('/images/generations');
    expect(container.textContent).not.toContain('Bearer');
  });
});
