import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProviderPickerPage } from '../../../../../src/shared/ui/features/provider-profiles/provider-picker-page';
import { fakeProviderSurfaces } from '../../../../helpers/fixtures/provider.fixtures';
import { TestI18nProvider } from '../../../../helpers/render-helpers';

let root: Root | undefined;

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = undefined;
  document.body.innerHTML = '';
});

describe('ProviderPickerPage', () => {
  it('只显示三个固定业务 Provider，不显示协议配置入口', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const onSelect = vi.fn();
    root = createRoot(container);
    await act(async () => root?.render(
      <TestI18nProvider>
        <ProviderPickerPage surfaces={fakeProviderSurfaces} onBack={vi.fn()} onSelect={onSelect} />
      </TestI18nProvider>,
    ));

    expect(container.querySelectorAll('[data-testid^="provider-picker-"]')).toHaveLength(4);
    expect(container.textContent).toContain('GRSAI');
    expect(container.textContent).toContain('Gemini');
    expect(container.textContent).toContain('GPT Image 2');
    expect(container.textContent).not.toContain('API Format');
    expect(container.textContent).not.toContain('OpenAI Chat');

    await act(async () => container.querySelector<HTMLElement>('[data-testid="provider-picker-gemini"]')?.click());
    expect(onSelect).toHaveBeenCalledWith('gemini');
  });

  it('缺少对应 Application surface 时保留入口但禁止进入', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const onSelect = vi.fn();
    root = createRoot(container);
    await act(async () => root?.render(
      <TestI18nProvider>
        <ProviderPickerPage
          surfaces={fakeProviderSurfaces.filter((surface) => surface.identity.implementationId !== 'image-endpoint')}
          onBack={vi.fn()}
          onSelect={onSelect}
        />
      </TestI18nProvider>,
    ));

    const unavailable = container.querySelector<HTMLElement>('[data-testid="provider-picker-openai-images"]');
    expect(unavailable?.getAttribute('aria-disabled')).toBe('true');
    await act(async () => unavailable?.click());
    expect(onSelect).not.toHaveBeenCalled();
  });
});
