import { describe, expect, it } from 'vitest';
import {
  buildComfyUiComposerViewModel,
  buildProviderComposerViewModel,
} from '../../../src/shared/ui/generation-workspace';
import { isMaskToggleDisabled } from '../../../src/shared/ui/hooks/use-generation-workspace';

describe('Generation Workspace builders', () => {
  it('keeps a saved Mask preference non-actionable for semantic and unsupported Provider plans', () => {
    expect(isMaskToggleDisabled({
      hasPhotoshopPrimary: true,
      mode: 'provider',
      providerPlan: { kind: 'semantic-only', reason: 'transport-has-no-separate-raster-mask-field' },
    })).toBe(true);
    expect(isMaskToggleDisabled({
      hasPhotoshopPrimary: true,
      mode: 'provider',
      providerPlan: { kind: 'unsupported', reason: 'no-explicit-raster-mask-capability' },
    })).toBe(true);
    expect(isMaskToggleDisabled({
      hasPhotoshopPrimary: true,
      mode: 'provider',
      providerPlan: {
        kind: 'provider-native',
        transport: 'image-endpoint',
        capability: {
          canonicalEncoding: 'grayscale-png',
          canonicalPolarity: 'white-edit',
          target: 'first-input',
          wireFormat: 'png',
          wirePolarity: 'alpha-zero-edit',
          requiresSameDimensions: true,
          maxBytes: 1_000_000,
        },
      },
    })).toBe(false);
  });

  it('projects ComfyUI as a product target and keeps resolved settings in the intent', () => {
    const vm = buildComfyUiComposerViewModel({
      runtime: {
        identity: {
          workflowId: 'wf-1',
          displayName: 'Portrait',
          remotePath: 'saved/Portrait.json',
          revision: 'r1',
        },
        form: {
          nodes: [{
            nodeId: '10',
            title: '# Prompt',
            label: 'Prompt',
            order: 0,
            active: true,
            visible: true,
            widgets: [{
              ref: { nodeId: '10', inputName: 'text' },
              kind: 'string',
              label: 'Prompt',
              workflowValue: 'saved',
              writable: true,
              visible: true,
              order: 0,
            }],
          }],
        },
      },
      mapping: {
        text: { resolved: { nodeId: '10', inputName: 'text' } },
        image: { resolved: null, notice: '此 Workflow 未识别到图片输入，附件不会发送' },
        mask: { binding: { transport: 'separate-image-input', inputRef: { nodeId: '11', inputName: 'image' }, polarity: 'black-edit' } },
      },
      draftValues: { '10\u0000text\u0000': 'draft' },
      prompt: 'hello',
      attachmentCount: 1,
      readiness: { canSend: true, state: 'ready', message: 'Ready' },
    });

    expect(vm.billingVisible).toBe(false);
    expect(vm.target).toEqual({ kind: 'comfyui', label: 'Portrait', workflowId: 'wf-1', remotePath: 'saved/Portrait.json' });
    expect(vm.notices).toContain('此 Workflow 未识别到图片输入，附件不会发送');
    expect(vm.submitIntent).toMatchObject({
      backend: 'comfyui',
      selectedWorkflowId: 'wf-1',
      revision: 'r1',
      mappings: { text: { nodeId: '10', inputName: 'text' }, image: null },
      formValues: { '10\u0000text\u0000': 'draft' },
      composer: { prompt: 'hello', attachmentCount: 1 },
      maskBinding: { transport: 'separate-image-input', inputRef: { nodeId: '11', inputName: 'image' }, polarity: 'black-edit' },
    });
    expect(JSON.stringify(vm)).not.toContain('connectionId');
    expect(JSON.stringify(vm)).not.toContain('source');
    expect(JSON.stringify(vm)).not.toContain('capability');
  });

  it('keeps Provider projection independent from ComfyUI facts', () => {
    const vm = buildProviderComposerViewModel({
      profiles: [],
      profilesLoading: false,
      profilesError: null,
      selectedProfileId: 'profile-1',
      selectedProfile: {
        profileId: 'profile-1',
        displayName: 'Provider One',
        apiFormat: 'openai-images',
      } as never,
      models: [],
      modelsLoading: false,
      modelsError: null,
      selectedModelId: 'model-1',
      selectedModel: { id: 'model-1', label: 'Model One' } as never,
      operation: 'text-to-image',
      readiness: { canSend: true, state: 'ready', message: 'Ready' },
      imageInputDisabled: false,
    });

    expect(vm.billingVisible).toBe(true);
    expect(vm.target.kind).toBe('provider');
    expect(vm.submitIntent).toMatchObject({ backend: 'provider', profileId: 'profile-1', modelId: 'model-1' });
    expect(JSON.stringify(vm)).not.toContain('workflowId');
  });
});
