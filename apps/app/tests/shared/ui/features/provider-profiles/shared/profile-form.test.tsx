import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProfileForm } from '../../../../../../src/shared/ui/features/provider-profiles/shared/profile-form';
import { changeInput, flush } from '../../../../../helpers/settings-detail-harness';
import { TestI18nProvider } from '../../../../../helpers/render-helpers';

let root: Root | undefined;

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = undefined;
  document.body.innerHTML = '';
});

describe('ProfileForm', () => {
  it('只提交名称与 secret 动作，并支持显示、移除和删除确认', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const onSave = vi.fn(async () => undefined);
    const onDelete = vi.fn(async () => undefined);
    root = createRoot(container);
    await act(async () => root?.render(
      <TestI18nProvider>
        <ProfileForm
          initialDisplayName="Main"
          hasSavedApiKey
          existingDisplayNames={[]}
          onCancel={vi.fn()}
          onSave={onSave}
          onDelete={onDelete}
        />
      </TestI18nProvider>,
    ));

    const key = container.querySelector<HTMLInputElement>('[data-testid="provider-profile-api-key-input"]')!;
    expect(key.type).toBe('password');
    await act(async () => container.querySelector<HTMLElement>('[data-testid="provider-profile-api-key-toggle"]')?.click());
    expect(key.type).toBe('text');
    await act(async () => container.querySelector<HTMLElement>('[data-testid="provider-profile-api-key-clear"]')?.click());
    expect(container.querySelector('[data-testid="provider-profile-api-key-removal-pending"]')).not.toBeNull();
    await act(async () => container.querySelector<HTMLElement>('[data-testid="provider-profile-save-button"]')?.click());
    await flush();
    expect(onSave).toHaveBeenCalledWith({ displayName: 'Main', removeSavedApiKey: true });

    await act(async () => container.querySelector<HTMLElement>('[data-testid="provider-profile-delete-button"]')?.click());
    expect(container.querySelector('[data-testid="provider-profile-delete-confirmation"]')).not.toBeNull();
    await act(async () => container.querySelector<HTMLElement>('[data-testid="provider-profile-confirm-delete"]')?.click());
    await flush();
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('阻止重复名称和缺少 API Key 的新 Profile', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => root?.render(
      <TestI18nProvider>
        <ProfileForm
          initialDisplayName="Duplicate"
          hasSavedApiKey={false}
          existingDisplayNames={['Duplicate']}
          onCancel={vi.fn()}
          onSave={vi.fn(async () => undefined)}
        />
      </TestI18nProvider>,
    ));
    expect(container.querySelector<HTMLButtonElement>('[data-testid="provider-profile-save-button"]')?.disabled).toBe(true);
    const name = container.querySelector<HTMLInputElement>('[data-testid="provider-profile-name-input"]')!;
    const key = container.querySelector<HTMLInputElement>('[data-testid="provider-profile-api-key-input"]')!;
    await act(async () => {
      changeInput(name, 'Unique');
      changeInput(key, 'sk-test');
    });
    await flush();
    expect(container.querySelector<HTMLButtonElement>('[data-testid="provider-profile-save-button"]')?.disabled).toBe(false);
  });

  it('保存期间锁定字段与动作，并在失败后显示错误', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    let rejectSave!: (reason: Error) => void;
    const savePending = new Promise<void>((_resolve, reject) => {
      rejectSave = reject;
    });
    root = createRoot(container);
    await act(async () => root?.render(
      <TestI18nProvider>
        <ProfileForm
          initialDisplayName="Gemini Production Connection With A Long Descriptive Name"
          hasSavedApiKey
          existingDisplayNames={[]}
          onCancel={vi.fn()}
          onSave={() => savePending}
        />
      </TestI18nProvider>,
    ));

    const name = container.querySelector<HTMLInputElement>('[data-testid="provider-profile-name-input"]')!;
    const save = container.querySelector<HTMLButtonElement>('[data-testid="provider-profile-save-button"]')!;
    expect(name.value).toBe('Gemini Production Connection With A Long Descriptive Name');
    await act(async () => save.click());
    expect(name.disabled).toBe(true);
    expect(save.disabled).toBe(true);

    await act(async () => rejectSave(new Error('save failed')));
    await flush();

    expect(name.disabled).toBe(false);
    expect(container.textContent).toContain('save failed');
  });
});
