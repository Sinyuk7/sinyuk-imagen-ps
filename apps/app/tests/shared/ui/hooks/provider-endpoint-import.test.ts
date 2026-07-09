import { describe, expect, it } from 'vitest';
import { classifyEndpoint, type ApiFormat } from '@imagen-ps/application';
import {
  interpretEndpointDraft,
  resolveAddNewModelAction,
  resolveEndpointApply,
  type EndpointDraftInterpretation,
} from '../../../../src/shared/ui/hooks/provider-endpoint-import';
import {
  defaultApiPathDraft,
  mergeApiPathDraft,
  normalizeProviderConnectionDraft,
  type ApiPathDraft,
  type ProviderConnectionDraft,
} from '../../../../src/shared/ui/hooks/use-provider-settings';

const messages = {
  apiFormatNeedsPath: 'Needs path',
  apiFormatUnsupported: 'Unsupported',
  apiFormatDetected: (label: string) => `Detected ${label}`,
  apiFormatIncomplete: (label: string) => `Incomplete ${label}`,
  apiFormatConflict: (current: string, next: string) => `${current} conflicts with ${next}`,
};

function connection(url = ''): ProviderConnectionDraft {
  return normalizeProviderConnectionDraft({
    selectionMode: 'manual',
    selectedEndpointId: 'primary',
    endpoints: [{
      id: 'primary',
      url,
      enabled: true,
    }],
  });
}

function applyAdd(
  raw: string,
  options?: {
    readonly currentApiFormat?: ApiFormat | null;
    readonly currentPaths?: ApiPathDraft;
    readonly currentConnection?: ProviderConnectionDraft;
  },
) {
  const interpretation = interpretEndpointDraft(raw, classifyEndpoint);
  return {
    interpretation,
    decision: resolveEndpointApply({
      interpretation,
      policy: 'add-live',
      currentApiFormat: options?.currentApiFormat ?? null,
      currentPaths: options?.currentPaths ?? defaultApiPathDraft(options?.currentApiFormat ?? null),
      currentConnection: options?.currentConnection ?? connection(),
      endpointId: 'primary',
      profiles: [],
      nameTouched: true,
      selectedModelId: '',
      defaultPathsForApiFormat: defaultApiPathDraft,
      mergeApiPathDraft,
      classifyEndpoint,
      messages,
      normalizeBaseUrlIntoConnection: true,
    }),
  };
}

describe('provider endpoint URL flow helpers', () => {
  it('recomputes API format and clears stale path draft when URL changes format', () => {
    const previousPaths = {
      ...defaultApiPathDraft('openai-chat-completions'),
      invoke: '/custom/chat/completions',
    };
    const { decision } = applyAdd('https://relay.test/v1/images/generations', {
      currentApiFormat: 'openai-chat-completions',
      currentPaths: previousPaths,
      currentConnection: connection('https://relay.test/v1'),
    });

    expect(decision.kind).toBe('apply');
    expect(decision.nextApiFormat).toBe('openai-images');
    expect(decision.nextPaths.generation).toBe('/images/generations');
    expect(decision.nextPaths.invoke).not.toBe('/custom/chat/completions');
    expect(decision.nextConnection.endpoints[0]?.url).toBe('https://relay.test/v1');
  });

  it('updates only the base URL while preserving recognized path facts', () => {
    const { decision } = applyAdd('https://second.test/v1/images/generations', {
      currentApiFormat: 'openai-images',
      currentPaths: defaultApiPathDraft('openai-images'),
      currentConnection: connection('https://first.test/v1'),
    });

    expect(decision.kind).toBe('apply');
    expect(decision.nextApiFormat).toBe('openai-images');
    expect(decision.nextPaths.generation).toBe('/images/generations');
    expect(decision.nextConnection.endpoints[0]?.url).toBe('https://second.test/v1');
  });

  it('clears stale add-page path facts when input is reduced to a base path', () => {
    const { interpretation, decision } = applyAdd('https://relay.test/v1/', {
      currentApiFormat: 'openai-images',
      currentPaths: defaultApiPathDraft('openai-images'),
      currentConnection: connection('https://relay.test/v1'),
    });

    expect(interpretation.status).toBe('incomplete');
    expect(interpretation.baseUrlCandidate).toBe('https://relay.test/v1');
    expect(decision.kind).toBe('not-applied');
    expect(decision.nextApiFormat).toBeNull();
    expect(decision.nextConnection.endpoints[0]?.url).toBe('https://relay.test/v1');
  });

  it('rejects unsupported custom paths and query or hash URLs', () => {
    const custom = applyAdd('https://relay.test/v1/api/generate');
    expect(custom.interpretation.status).toBe('unsupported');
    expect(custom.decision.kind).toBe('not-applied');
    expect(custom.decision.nextApiFormat).toBeNull();

    for (const raw of [
      'https://relay.test/v1/images/generations?foo=1',
      'https://relay.test/v1/images/generations#frag',
    ]) {
      const interpretation = interpretEndpointDraft(raw, classifyEndpoint);
      expect(interpretation.status).toBe('unsupported');
      expect(interpretation.classification).toMatchObject({
        status: 'unsupported',
        reason: 'unsupported-query',
      });
    }
  });

  it('extracts and clears Gemini explicit model hints from current input', () => {
    const supported = interpretEndpointDraft(
      'https://llm-api.net/v1beta/models/gemini-3-pro-image-preview:generateContent',
      classifyEndpoint,
    );
    expect(supported.status).toBe('supported');
    expect(supported.explicitModelHint).toEqual({
      apiFormat: 'gemini-generate-content',
      modelId: 'gemini-3-pro-image-preview',
      wireModelId: 'gemini-3-pro-image-preview',
    });

    const cleared = interpretEndpointDraft('https://llm-api.net/v1beta/', classifyEndpoint);
    expect(cleared.status).toBe('incomplete');
    expect(cleared.explicitModelHint).toBeUndefined();
  });

  it('resolves add-new-model action to matched page or unresolved editor seed at click time', () => {
    const profile = { profileId: 'profile-a', apiFormat: 'gemini-generate-content' as const };
    const hint: NonNullable<EndpointDraftInterpretation['explicitModelHint']> = {
      apiFormat: 'gemini-generate-content',
      modelId: 'gemini-3-pro-image-preview',
      wireModelId: 'gemini-3-pro-image-preview',
    };

    expect(resolveAddNewModelAction(profile, hint, [{ id: 'gemini-3-pro-image-preview' }])).toEqual({
      kind: 'open-models-page',
      reason: 'matched-existing',
      matchedModelId: 'gemini-3-pro-image-preview',
    });

    expect(resolveAddNewModelAction(profile, hint, [])).toEqual({
      kind: 'open-editor',
      seed: {
        profileId: 'profile-a',
        apiFormat: 'gemini-generate-content',
        modelId: 'gemini-3-pro-image-preview',
        wireModelId: 'gemini-3-pro-image-preview',
      },
    });
  });
});
