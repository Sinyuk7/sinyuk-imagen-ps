import { act } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  buttonByText,
  cleanupSettingsDetailRoot,
  flush,
  renderOptimizerDetail,
} from './settings-detail-harness';

afterEach(async () => {
  await cleanupSettingsDetailRoot();
});

describe('SettingsDetailPage contract — prompt optimizer', () => {
  it('tests Prompt Optimizer draft without saving profile changes', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const { spies, onProfilesChanged } = await renderOptimizerDetail(container);

    await act(async () => {
      buttonByText(container, '测试连接').click();
    });
    await flush();

    expect(spies.saveProviderProfile).not.toHaveBeenCalled();
    expect(spies.validatePromptOptimizerProfile).not.toHaveBeenCalled();
    expect(spies.testProviderProfile).not.toHaveBeenCalled();
    expect(spies.probeProfileEndpoints).toHaveBeenCalledWith(
      expect.objectContaining({
        profileId: '__prompt-optimizer__',
        providerId: 'prompt-optimize',
      }),
    );
    expect(onProfilesChanged).not.toHaveBeenCalled();
    expect(container.textContent).toContain('连接成功');
  });

  it('renders Prompt Optimizer instruction as a styled multiline field inside its own section', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    await renderOptimizerDetail(container);

    const textarea = container.querySelector<HTMLTextAreaElement>('[data-testid="provider-instruction-input"]');
    expect(textarea).not.toBeNull();
    expect(textarea?.tagName).toBe('TEXTAREA');
    expect(textarea?.getAttribute('rows')).toBe('5');
    expect(textarea?.className).toContain('field-textarea-input');
    expect(container.textContent).toContain('提示词行为');
    expect(container.textContent).toContain('Instruction');
  });

  it('keeps a single default-model trigger and a separate custom model field for Prompt Optimizer', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    await renderOptimizerDetail(container);

    const selector = container.querySelectorAll('[data-testid="provider-default-model-selector"]');
    const textInput = container.querySelectorAll('[data-testid="provider-default-model-input"]');
    expect(selector).toHaveLength(1);
    expect(textInput).toHaveLength(0);
    expect(selector[0]?.getAttribute('aria-haspopup')).toBe('listbox');
    expect(container.textContent).toContain('gpt-4o-mini');
    expect(container.textContent).toContain('使用自定义 model id');
  });
});
