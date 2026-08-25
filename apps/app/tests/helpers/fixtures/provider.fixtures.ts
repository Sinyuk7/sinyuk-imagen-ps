import type {
  ProfileModelItem,
  ProviderDescriptor,
  ProviderProfile,
  ProviderSurfaceProjection,
  RequestStrategy,
} from '@imagen-ps/application';

export const fakeProfile: ProviderProfile = {
  profileId: 'mock-profile',
  apiFormat: 'openai-images',
  displayName: 'Mock Profile',
  lifecycle: 'ready',
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
  defaultModelTemplates: [],
  billing: {
    query: 'unsupported',
  },
};

export const fakeProviderSurfaces: readonly ProviderSurfaceProjection[] = [
  {
    identity: { apiFormat: 'grsai', implementationId: 'grsai-generate' },
    operations: ['text_to_image', 'image_edit'],
    defaultModelId: 'nano-banana-fast',
    modelIds: ['nano-banana-fast', 'nano-banana-pro'],
    canTestConnection: false,
  },
  {
    identity: { apiFormat: 'gemini-generate-content', implementationId: 'gemini-generate-content' },
    operations: ['text_to_image', 'image_edit'],
    defaultModelId: 'gemini-3.1-flash-image',
    modelIds: ['gemini-3.1-flash-image', 'gemini-3-pro-image', 'gemini-3.1-flash-lite-image'],
    canTestConnection: true,
  },
  {
    identity: { apiFormat: 'openai-images', implementationId: 'image-endpoint' },
    operations: ['text_to_image', 'image_edit'],
    defaultModelId: 'gpt-image-2',
    modelIds: ['gpt-image-2'],
    canTestConnection: false,
  },
];

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
