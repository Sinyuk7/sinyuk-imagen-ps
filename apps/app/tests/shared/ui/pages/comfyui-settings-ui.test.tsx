import { act } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { changeTextarea, cleanupMainPageRoot, flush, renderMainPage } from '../../../helpers/main-page-harness';
import { changeInput } from '../../../helpers/settings-detail-harness';
import { createFakeServices } from '../../../helpers/fakes';

describe('ComfyUI workflow settings surface', () => {
  afterEach(async () => {
    await cleanupMainPageRoot();
    document.body.innerHTML = '';
  });

  async function openComfySettings(container: HTMLElement): Promise<void> {
    await flush();
    await flush();
    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="main-providers-button"]')?.click();
    });
    await flush();
    const tab = container.querySelector<HTMLElement>('[data-testid="settings-backend-comfyui"]');
    if (tab) {
      await act(async () => { tab.click(); });
      await flush();
    }
  }

  it('renders the singleton root, conditional mapping notice, and exposed parameters', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    await renderMainPage(container, createFakeServices({ comfyUi: { baseUrl: 'https://comfy.example.test' } }));
    await flush();

    await openComfySettings(container);

    expect(container.querySelector('[data-testid="comfyui-settings-root"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="comfyui-connection-section"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="comfyui-workflow-parameters"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="comfyui-input-mapping"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="comfyui-image-mapping"]')).toBeNull();
    expect(container.textContent).toContain('此 Workflow 不接收图片附件');
  });

  it('opens the picker and returns to the root after selecting a saved workflow', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    await renderMainPage(container, createFakeServices({ comfyUi: { baseUrl: 'https://comfy.example.test' } }));
    await flush();

    await openComfySettings(container);
    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="comfyui-change-workflow"]')?.click();
    });
    await flush();
    expect(container.querySelector('[data-testid="comfyui-workflow-picker"]')).not.toBeNull();
    expect(container.querySelector('[data-testid^="comfyui-workflow-option-"]')).not.toBeNull();
    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid^="comfyui-workflow-option-"]')?.click();
    });
    await flush();
    expect(container.querySelector('[data-testid="comfyui-settings-root"]')).not.toBeNull();
  });

  it('keeps composer draft and both backend selections while switching mode and settings tabs', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    await renderMainPage(container, createFakeServices({ comfyUi: { baseUrl: 'https://comfy.example.test' } }));
    await flush();

    await act(async () => {
      changeTextarea(container.querySelector<HTMLTextAreaElement>('[data-testid="composer-textarea"]')!, 'draft survives');
      container.querySelector<HTMLElement>('[data-testid="composer-capture-button"]')?.click();
      container.querySelector<HTMLElement>('[data-testid="main-profile-selector"]')?.click();
    });
    await flush();
    expect(container.querySelectorAll('[data-testid^="attachment-remove-button-"]')).toHaveLength(1);
    await act(async () => { container.querySelector<HTMLElement>('[data-testid="main-mode-comfyui"]')?.click(); });
    await flush();
    expect(container.querySelector('[data-testid="generation-current-target-summary"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="generation-workspace-notices"]')?.textContent).toContain('附件不会发送');

    await act(async () => { container.querySelector<HTMLElement>('[data-testid="main-providers-button"]')?.click(); });
    await flush();
    expect(container.querySelector('[data-testid="comfyui-settings-root"]')).not.toBeNull();
    await act(async () => { container.querySelector<HTMLElement>('[data-testid="settings-backend-provider"]')?.click(); });
    await flush();
    expect(container.querySelector('[data-testid="settings-back-button"]')).not.toBeNull();
    await act(async () => { container.querySelector<HTMLElement>('[data-testid="settings-backend-comfyui"]')?.click(); });
    await flush();
    expect(container.querySelector('[data-testid="comfyui-settings-root"]')).not.toBeNull();
    await act(async () => { container.querySelector<HTMLElement>('[data-testid="settings-back-button"]')?.click(); });
    await flush();

    expect(container.querySelector<HTMLTextAreaElement>('[data-testid="composer-textarea"]')?.value).toBe('draft survives');
    expect(container.querySelectorAll('[data-testid^="attachment-remove-button-"]')).toHaveLength(1);
    await act(async () => { container.querySelector<HTMLElement>('[data-testid="main-profile-selector"]')?.click(); });
    await flush();
    expect(container.querySelector('[data-testid="main-mode-provider"]')).not.toBeNull();
    await act(async () => { container.querySelector<HTMLElement>('[data-testid="main-mode-provider"]')?.click(); });
    await flush();
    expect(container.querySelector<HTMLTextAreaElement>('[data-testid="composer-textarea"]')?.value).toBe('draft survives');
  });

  it('filters picker search and groups remote identities without legacy execution controls', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    await renderMainPage(container, createFakeServices({
      comfyUi: {
        baseUrl: 'https://comfy.example.test',
        workflows: [
          { workflowId: 'one', displayName: 'One', remotePath: 'portraits/one.json', groupPath: ['portraits'], revision: 'r1' },
          { workflowId: 'two', displayName: 'Two', remotePath: 'landscapes/two.json', groupPath: ['landscapes'], revision: 'r1' },
        ],
      },
    }));
    await flush();
    await openComfySettings(container);
    await act(async () => { container.querySelector<HTMLElement>('[data-testid="comfyui-change-workflow"]')?.click(); });
    await flush();
    expect(container.querySelector('[data-testid="comfyui-workflow-group-portraits"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="comfyui-workflow-group-landscapes"]')).not.toBeNull();
    const search = container.querySelector<HTMLInputElement>('[data-testid="comfyui-workflow-search"]')!;
    await act(async () => {
      changeInput(search, 'land');
    });
    await flush();
    expect(container.querySelector('[data-testid="comfyui-workflow-option-two"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="comfyui-workflow-option-one"]')).toBeNull();
    expect(container.querySelector('[data-testid="comfyui-connection-row-singleton"]')).toBeNull();
    expect(container.querySelector('[data-testid="comfyui-workflow-target-selector"]')).toBeNull();
    expect(container.textContent).not.toContain('Import');
  });

  it('renders resolved empty parameters and scoped diagnostics without management controls', async () => {
    const emptyForm = { nodes: [] } as const;
    const empty = document.createElement('div');
    document.body.appendChild(empty);
    await renderMainPage(empty, createFakeServices({ comfyUi: { baseUrl: 'https://comfy.example.test', form: emptyForm } }));
    await flush();
    await openComfySettings(empty);
    expect(empty.querySelector('[data-testid="comfyui-parameters-empty"]')).not.toBeNull();
    expect(empty.querySelector('[data-testid="comfyui-connection-row-singleton"]')).toBeNull();
    await cleanupMainPageRoot();
    empty.innerHTML = '';

    const failed = document.createElement('div');
    document.body.appendChild(failed);
    await renderMainPage(failed, createFakeServices({ comfyUi: { baseUrl: 'https://comfy.example.test', loadError: new Error('workflow unavailable') } }));
    await flush();
    await openComfySettings(failed);
    expect(failed.querySelector('[data-testid="comfyui-diagnostics"]')).not.toBeNull();
    expect(failed.querySelector('[data-testid="comfyui-parameters-empty"]')).toBeNull();
  });

  it('updates workflow parameter draft immediately and restores it after page navigation', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    await renderMainPage(container, createFakeServices({ comfyUi: { baseUrl: 'https://comfy.example.test' } }));
    await flush();
    await openComfySettings(container);
    const parameter = container.querySelector<HTMLInputElement>('#comfyui-parameter-prompt-0')!;
    await act(async () => {
      changeInput(parameter, 'session draft');
    });
    await flush();
    await act(async () => { container.querySelector<HTMLElement>('[data-testid="settings-back-button"]')?.click(); });
    await flush();
    await act(async () => { container.querySelector<HTMLElement>('[data-testid="main-providers-button"]')?.click(); });
    await flush();
    await act(async () => { container.querySelector<HTMLElement>('[data-testid="settings-backend-comfyui"]')?.click(); });
    await flush();
    expect(container.querySelector<HTMLInputElement>('#comfyui-parameter-prompt-0')?.value).toBe('session draft');
  });

  it('shows selectors only for ambiguous mappings', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    await renderMainPage(container, createFakeServices({
      comfyUi: {
        baseUrl: 'https://comfy.example.test',
        form: { nodes: [{
          nodeId: 'prompt', title: '# Prompt', label: 'Prompt', order: 0, active: true, visible: true,
          widgets: [
            { ref: { nodeId: 'prompt', inputName: 'text' }, kind: 'string', label: 'Text A', workflowValue: 'a', writable: true, visible: true, order: 0 },
            { ref: { nodeId: 'prompt', inputName: 'text2' }, kind: 'string', label: 'Text B', workflowValue: 'b', writable: true, visible: true, order: 1 },
          ],
        }] },
      },
    }));
    await flush();
    await openComfySettings(container);
    expect(container.querySelector('[data-testid="comfyui-text-mapping"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="comfyui-image-mapping"]')).toBeNull();
  });

  it('shows an explicit Mask selector only for writable upload-image inputs', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    await renderMainPage(container, createFakeServices({
      comfyUi: {
        baseUrl: 'https://comfy.example.test',
        form: { nodes: [{
          nodeId: 'images', title: '# Inputs', label: 'Inputs', order: 0, active: true, visible: true,
          widgets: [
            { ref: { nodeId: 'images', inputName: 'primary' }, kind: 'upload-image', label: 'Primary', writable: true, visible: false, order: 0 },
            { ref: { nodeId: 'images', inputName: 'edit_region' }, kind: 'upload-image', label: 'Edit Region', writable: true, visible: false, order: 1 },
            { ref: { nodeId: 'images', inputName: 'mask_name_only' }, kind: 'string', label: 'Mask', writable: true, visible: true, order: 2 },
          ],
        }] },
      },
    }));
    await flush();
    await openComfySettings(container);
    expect(container.querySelector('[data-testid="comfyui-mask-mapping"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="comfyui-mask-polarity"]')).toBeNull();
  });

  it('keeps the same bounded settings surface in the Chrome host at narrow width', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const previousWidth = window.innerWidth;
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 320 });
    try {
      await renderMainPage(
        container,
        createFakeServices({ comfyUi: { baseUrl: 'https://comfy.example.test' } }),
        'chrome-browser',
      );
      await flush();
      await openComfySettings(container);

      const sections = [...container.querySelectorAll<HTMLElement>('[data-testid="comfyui-settings-root"] > .section')]
        .map((section) => section.dataset.testid ?? section.getAttribute('data-testid'));
      expect(sections).toEqual([
        'comfyui-connection-section',
        'comfyui-current-workflow-section',
        'comfyui-input-mapping',
        'comfyui-workflow-parameters',
      ]);
      expect(container.querySelector('[data-testid="comfyui-settings-root"] [data-testid*="run"]')).toBeNull();
      expect(container.querySelector('[data-testid="comfyui-settings-root"] [data-testid*="batch"]')).toBeNull();
      expect(container.querySelector('[data-testid="comfyui-settings-root"] [data-testid*="stop"]')).toBeNull();
    } finally {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: previousWidth });
    }
  });
});
