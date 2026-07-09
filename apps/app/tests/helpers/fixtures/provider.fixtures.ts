import type {
  ProfileModelItem,
  ProviderDescriptor,
  ProviderProfile,
  ProviderProfileInput,
  RequestStrategy,
} from '@imagen-ps/application';

export const fakeProfile: ProviderProfile = {
  profileId: 'mock-profile',
  apiFormat: 'openai-images',
  displayName: 'Mock Profile',
  enabled: true,
  config: {
    apiFormat: 'openai-images',
    displayName: 'Mock Profile',
    connection: {
      selectionMode: 'manual',
      selectedEndpointId: 'primary',
      endpoints: [
        {
          id: 'primary',
          url: 'https://mock.local',
          enabled: true,
        },
      ],
    },
    paths: { generation: '/images/generations', edit: '/images/edits' },
  },
  secretRefs: {
    apiKey: 'secret:provider-profile:mock-profile:apiKey',
  },
  createdAt: '2026-06-15T00:00:00.000Z',
  updatedAt: '2026-06-15T00:00:00.000Z',
};

export const fakeProvider: ProviderDescriptor = {
  id: 'mock',
  family: 'image-endpoint',
  apiFormat: 'openai-images',
  displayName: 'Mock Provider',
  operations: ['text_to_image', 'image_edit'],
  invokeMode: 'sync',
  defaultModels: [{ id: 'gpt-image-2' }],
  billing: {
    query: 'unsupported',
  },
};

export const fakeChatProvider: ProviderDescriptor = {
  id: 'chat-image',
  family: 'chat-image',
  apiFormat: 'openai-chat-completions',
  displayName: 'Chat Image',
  operations: ['text_to_image', 'image_edit'],
  invokeMode: 'sync',
  defaultModels: [{ id: 'gpt-4o-image' }],
  billing: {
    query: 'supported',
  },
  connectivity: {
    endpointMeasurement: 'supported',
    connectionTest: 'supported',
  },
};

export const fakeProfileModelItems: readonly ProfileModelItem[] = [{
  modelId: 'gpt-image-2',
  wireModelId: 'gpt-image-2',
  discovered: false,
  configured: true,
  configSource: 'user',
}];

export const fakeDraftProfileModelItems: readonly ProfileModelItem[] = [{
  modelId: 'gpt-image-2-preview',
  wireModelId: 'gpt-image-2-preview',
  discovered: true,
  configured: false,
}];

export const fakeRequestStrategies: readonly RequestStrategy[] = [{
  id: 'image-endpoint-default',
  apiFormat: 'openai-images',
  outputCodecId: 'image-endpoint',
}];

export function profileModelItem(
  modelId: string,
  overrides: Partial<ProfileModelItem> = {},
): ProfileModelItem {
  return {
    modelId,
    wireModelId: modelId,
    discovered: false,
    configured: true,
    configSource: 'user',
    ...overrides,
  };
}

export function savedProfile(input: ProviderProfileInput, existing: ProviderProfile | undefined): ProviderProfile {
  const baseProfile = {
    ...fakeProfile,
    ...(existing ?? {}),
  };
  return {
    ...baseProfile,
    profileId: input.profileId,
    apiFormat: input.apiFormat ?? existing?.apiFormat ?? fakeProfile.apiFormat,
    displayName: input.displayName ?? existing?.displayName ?? fakeProfile.displayName,
    ...(input.systemInstruction && input.systemInstruction.trim().length > 0 ? { systemInstruction: input.systemInstruction } : {}),
    enabled: input.enabled ?? existing?.enabled ?? fakeProfile.enabled,
    config: {
      ...(existing?.config ?? fakeProfile.config),
      ...(input.config ?? {}),
    },
    updatedAt: '2026-06-15T00:00:02.000Z',
  };
}
