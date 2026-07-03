import type { SupportedLocale } from '../../domain/locale';

export interface AppMessages {
  readonly common: {
    readonly provider: string;
    readonly providers: string;
    readonly profile: string;
    readonly prompt: string;
    readonly loading: string;
    readonly back: string;
    readonly save: string;
    readonly cancel: string;
    readonly delete: string;
    readonly refresh: string;
    readonly addProvider: string;
    readonly enabled: string;
    readonly disabled: string;
    readonly ready: string;
    readonly needsSetup: string;
    readonly copy: string;
    readonly copied: string;
  };
  readonly status: {
    readonly all: string;
    readonly done: string;
    readonly generating: string;
    readonly running: string;
    readonly failed: string;
  };
  readonly main: {
    readonly history: string;
    readonly noProviderProfile: string;
    readonly loadingProfiles: string;
    readonly addProviderProfile: string;
    readonly currentSession: string;
    readonly emptyHint: string;
    readonly promptSuggestionProductValue: string;
    readonly promptSuggestionProductLabel: string;
    readonly promptSuggestionCyberpunkValue: string;
    readonly promptSuggestionCyberpunkLabel: string;
    readonly promptSuggestionLayerValue: string;
    readonly promptSuggestionLayerLabel: string;
    readonly reusePrompt: string;
    readonly submitJobRunning: string;
    readonly noAssetPreview: string;
    readonly assetFallback: string;
    readonly imageFallback: string;
    readonly placePs: string;
    readonly placePsShort: string;
    readonly placePsLong: string;
    readonly placeActiveDocument: string;
    readonly cannotPlace: string;
    readonly placementActiveDocumentHint: string;
    readonly placementMultipleDocuments: string;
    readonly placementExactFrameHint: string;
    readonly placementDocumentOnlyHint: string;
    readonly placingPs: string;
    readonly placedPs: string;
    readonly regenerate: string;
    readonly copyPrompt: string;
    readonly copyResponse: string;
    readonly requestId: string;
    readonly copyRequestId: string;
    readonly expandResponse: string;
    readonly collapseResponse: string;
    readonly textResult: string;
    readonly psLayers: string;
    readonly noAvailableLayers: string;
    readonly choosePsLayer: string;
    readonly uploadFromComputer: string;
    readonly uploadFromComputerFormats: string;
    readonly uploadFromComputerHint: string;
    readonly loadingModels: string;
    readonly noModelCandidates: string;
    readonly modelLoading: string;
    readonly modelUnselected: string;
    readonly promptPlaceholderReady: string;
    readonly promptPlaceholderNoProfile: string;
    readonly addImage: string;
    readonly capture: string;
    readonly captureActionHint: string;
    readonly captureCount: (count: number) => string;
    readonly captureLayer: string;
    readonly captureSelection: string;
    readonly send: string;
    readonly referenceImage: string;
    readonly generatedImage: string;
    readonly download: string;
    readonly layerCount: (count: number) => string;
    readonly aspectRatio: string;
    readonly aspectRatioAuto: string;
    readonly aspectRatioSquare: string;
    readonly outputSize: string;
    readonly outputSizeUnsupportedForModel: string;
    readonly outputSizeAutoChanged: (from: string, to: string) => string;
    readonly billingSummary: string;
    readonly billingUnknown: string;
    readonly billingCost: string;
    readonly billingObservedChange: string;
    readonly billingLastCost: string;
    readonly billingLastChange: string;
    readonly promptOptimize: string;
    readonly promptRefine: string;
    readonly promptOptimizePlaceholder: string;
    readonly promptOptimizeUndo: string;
    readonly promptOptimizing: string;
    readonly promptOptimizeNoProfile: string;
    readonly promptOptimizeEmpty: string;
    readonly layerKindSmartObject: string;
    readonly layerKindPixel: string;
    readonly layerKindText: string;
    readonly layerKindGroup: string;
    readonly layerKindDefault: string;
    readonly readinessReady: string;
    readonly readinessGenerationInProgress: string;
    readonly readinessSelectProfile: string;
    readonly readinessCheckingProfile: string;
    readonly readinessProfileLoadFailed: string;
    readonly readinessSelectModel: string;
    readonly readinessLoadingModels: string;
    readonly readinessModelUnavailable: string;
    readonly readinessPreparingAttachment: string;
    readonly readinessAttachmentFailed: string;
    readonly readinessModelNoImageEdit: string;
    readonly readinessModelNoTextToImage: string;
    readonly readinessSizeUnsupported: string;
    readonly readinessPlacementConflict: string;
    readonly readinessEnterPrompt: string;
    readonly readinessOptimizingPrompt: string;
    readonly modelReasonNotRemotelyAvailable: string;
    readonly modelReasonAuthFailed: string;
    readonly modelReasonProfileMisconfigured: string;
    readonly modelReasonDiscoveryFailed: string;
    readonly modelReasonCustomUnchecked: string;
    readonly modelReasonNoImageEdit: string;
    readonly modelReasonNoTextToImage: string;
    readonly modelReasonSizeUnsupported: (size: string) => string;
    readonly imageInputDisabledForModel: string;
    readonly imageInputConflict: string;
    readonly chooseCompatibleModel: string;
    readonly removeImages: string;
    readonly runningPhaseSubmitting: string;
    readonly runningPhaseGenerating: string;
    readonly errorCategory: string;
    readonly errorCategoryLabel: Record<string, string>;
    readonly errorMessageProviderProtocolIncompatible: string;
    readonly errorActionOpenProviderSettings: string;
    readonly errorActionChooseSupportedSize: string;
    readonly errorActionChooseCompatibleModel: string;
    readonly errorActionReplaceImage: string;
    readonly errorActionCopyDetails: string;
    readonly errorActionFillComposer: string;
  };
  readonly history: {
    readonly title: string;
    readonly loading: string;
    readonly empty: string;
    readonly noPrompt: string;
    readonly unknownProvider: string;
    readonly retry: string;
    readonly download: string;
    readonly place: string;
    readonly resourceUnavailable: string;
  };
  readonly settings: {
    readonly configured: string;
    readonly loading: string;
    readonly noProviderProfile: string;
    readonly chooseType: string;
    readonly providerTypeGuide: string;
    readonly providerTypeHintImageEndpoint: string;
    readonly providerTypeHintChatImage: string;
    readonly providerTypeHintMock: string;
    readonly config: string;
    readonly promptBehavior: string;
    readonly billing: string;
    readonly billingMode: string;
    readonly billingModeHint: string;
    readonly billingDisabled: string;
    readonly billingRefresh: string;
    readonly billingRefreshing: string;
    readonly billingExpand: string;
    readonly billingCollapse: string;
    readonly billingDetails: string;
    readonly billingBalanceLabel: string;
    readonly billingCheckedAt: string;
    readonly billingErrorStale: string;
    readonly billingUserId: string;
    readonly billingUserIdHint: string;
    readonly billingAccessToken: string;
    readonly billingAccessTokenHint: string;
    readonly billingAccessTokenSavedHint: string;
    readonly billingNotSupported: string;
    readonly billingValidationUserId: string;
    readonly billingValidationAccessToken: string;
    readonly instruction: string;
    readonly instructionPlaceholder: string;
    readonly alias: string;
    readonly baseUrlHint: string;
    readonly requestAddresses: string;
    readonly endpointLabel: (index: number) => string;
    readonly endpointPreferred: string;
    readonly endpointSuggested: string;
    readonly endpointEnabled: string;
    readonly addEndpoint: string;
    readonly autoSelect: string;
    readonly failoverEnabled: string;
    readonly defaultModel: string;
    readonly customModelId: string;
    readonly selectedModel: string;
    readonly chooseFromList: string;
    readonly chooseFromListHint: string;
    readonly useCustomModelId: string;
    readonly customModelHint: string;
    readonly modelListEmpty: string;
    readonly modelListFailed: string;
    readonly modelSavedUndiscovered: string;
    readonly modelCustomUnchecked: string;
    readonly modelSelectableOnly: string;
    readonly connectionInfo: string;
    readonly noProfileSelected: string;
    readonly savedSecretPlaceholder: string;
    readonly apiKeyReplacePlaceholder: string;
    readonly accessTokenReplacePlaceholder: string;
    readonly replaceSecret: string;
    readonly removeSecret: string;
    readonly secretRemovalPending: string;
    readonly changesNotTested: string;
    readonly modelListStale: string;
    readonly duplicateDisplayName: (name: string) => string;
    readonly duplicateEndpointUrl: string;
    readonly useProviderAfterSaving: string;
    readonly saveProvider: string;
    readonly saveChanges: string;
    readonly savedButton: string;
    readonly showApiKey: string;
    readonly hideApiKey: string;
    readonly editApiKey: string;
    readonly refreshModels: string;
    readonly refreshingModels: string;
    readonly testConnection: string;
    readonly testingConnection: string;
    readonly testNotTested: string;
    readonly testResultPrefix: string;
    readonly saved: string;
    readonly retrySave: string;
    readonly testSuccess: string;
    readonly connectionFailed: string;
    readonly configValidNoModels: string;
    readonly configValidProviderNoModels: string;
    readonly selectProviderType: string;
    readonly globalGeneration: string;
    readonly outputGroup: string;
    readonly inputGroup: string;
    readonly outputSize: string;
    readonly outputSizeRequiresMainComposerContext: string;
    readonly outputFormat: string;
    readonly aspectRatio: string;
    readonly providerInputSizePreset: string;
    readonly providerInputSizePresetHint: string;
    readonly storageGroup: string;
    readonly storageGroupHint: string;
    readonly logPath: string;
    readonly generatedImagePath: string;
    readonly pathInfoUnavailable: string;
    readonly footerStatement: string;
    readonly saving: string;
  };
  readonly toast: {
    readonly promptFilled: string;
    readonly layerAdded: string;
    readonly layerReadFailed: string;
    readonly fileAdded: string;
    readonly filePickFailed: string;
    readonly fileNeedsNormalization: string;
    readonly captureAdded: string;
    readonly captureFailed: string;
    readonly selectProviderProfileFirst: string;
    readonly noPlaceableImage: string;
    readonly placedOnCanvas: string;
    readonly placeFailed: string;
    readonly newSessionStarted: string;
    readonly waitForRunningTask: string;
    readonly historyNotInCurrentSession: string;
    readonly promptOptimized: string;
    readonly promptOptimizeNoChanges: string;
    readonly promptOptimizeFailed: string;
    readonly errorDetailsCopied: string;
    readonly billingRefreshFailed: string;
  };
  readonly conversation: {
    readonly jobFailed: string;
  };
}

const EN_MESSAGES: AppMessages = {
  common: {
    provider: 'Provider',
    providers: 'Providers',
    profile: 'profile',
    prompt: 'Prompt',
    loading: 'Loading...',
    back: 'Back',
    save: 'Save',
    cancel: 'Cancel',
    delete: 'Delete',
    refresh: 'Refresh',
    addProvider: 'Add Provider',
    enabled: 'Enabled',
    disabled: 'Disabled',
    ready: 'Ready',
    needsSetup: 'Needs setup',
    copy: 'Copy',
    copied: 'Copied',
  },
  status: {
    all: 'All',
    done: 'Done',
    generating: 'Generating',
    running: 'Running',
    failed: 'Failed',
  },
  main: {
    history: 'History',
    noProviderProfile: 'No provider profile',
    loadingProfiles: 'Loading profiles...',
    addProviderProfile: 'Add Provider profile',
    currentSession: 'Current session',
    emptyHint: 'Where should we start?',
    promptSuggestionProductValue: 'Create an illustration of a girl with pink hair',
    promptSuggestionProductLabel: 'Create an illustration of a girl with pink hair',
    promptSuggestionCyberpunkValue: 'Transform this image into a hand-drawn illustration',
    promptSuggestionCyberpunkLabel: 'Transform this image into a hand-drawn illustration',
    promptSuggestionLayerValue: 'Generate a full-body portrait from the given image',
    promptSuggestionLayerLabel: 'Generate a full-body portrait from the given image',
    reusePrompt: 'Reuse Prompt',
    submitJobRunning: 'Generating...',
    noAssetPreview: 'No asset preview',
    assetFallback: 'Asset',
    imageFallback: 'image',
    placePs: 'Place in PS',
    placePsShort: 'Place',
    placePsLong: 'Place in Photoshop',
    placeActiveDocument: 'Place in Active Document',
    cannotPlace: 'Cannot Place',
    placementActiveDocumentHint: 'Places into the active Photoshop document at click time.',
    placementMultipleDocuments: 'Source images came from multiple Photoshop documents. Choose one document source before placing.',
    placementExactFrameHint: 'Places back into the captured document frame.',
    placementDocumentOnlyHint: 'Places into the captured document.',
    placingPs: 'Placing...',
    placedPs: 'Placed',
    regenerate: 'Regenerate',
    copyPrompt: 'Copy Prompt',
    copyResponse: 'Copy response',
    requestId: 'Request ID',
    copyRequestId: 'Copy Request ID',
    expandResponse: 'Expand response',
    collapseResponse: 'Collapse response',
    textResult: 'Text result',
    psLayers: 'PS Layers',
    noAvailableLayers: 'No available layers',
    choosePsLayer: 'Choose from PS layers',
    uploadFromComputer: 'Upload from computer',
    uploadFromComputerFormats: 'PNG / JPG / WebP',
    uploadFromComputerHint: 'Some sizes: use Capture or Layer.',
    loadingModels: 'Loading models...',
    noModelCandidates: 'No model candidates',
    modelLoading: 'Loading',
    modelUnselected: 'No model',
    promptPlaceholderReady: 'Describe the image you want to generate or edit...',
    promptPlaceholderNoProfile: 'Add a profile in Providers first',
    addImage: 'Add image',
    capture: 'Capture',
    captureActionHint: 'Capture the active Photoshop layer or selection',
    captureCount: (count) => `${count} capture${count === 1 ? '' : 's'}`,
    captureLayer: 'Photoshop layer capture',
    captureSelection: 'Photoshop selection capture',
    send: 'Send',
    referenceImage: 'Reference',
    generatedImage: 'Generated',
    download: 'Download',
    layerCount: (count) => `${count} layer${count === 1 ? '' : 's'}`,
    aspectRatio: 'Aspect ratio',
    aspectRatioAuto: 'Auto',
    aspectRatioSquare: '1:1',
    outputSize: 'Size',
    outputSizeUnsupportedForModel: 'Unavailable for this model',
    outputSizeAutoChanged: (from, to) => `${from} is unavailable; changed to ${to}`,
    billingSummary: 'Balance',
    billingUnknown: 'Billing unavailable',
    billingCost: 'Cost',
    billingObservedChange: 'Observed balance change',
    billingLastCost: 'Last exact cost',
    billingLastChange: 'Last balance change',
    promptOptimize: 'Optimize prompt',
    promptRefine: 'Refine',
    promptOptimizePlaceholder: 'Coming soon',
    promptOptimizeUndo: 'Undo',
    promptOptimizing: 'Optimizing…',
    promptOptimizeNoProfile: 'Configure Prompt Optimizer in Providers',
    promptOptimizeEmpty: 'Enter a prompt first',
    layerKindSmartObject: 'Smart Object',
    layerKindPixel: 'Pixel',
    layerKindText: 'Text',
    layerKindGroup: 'Group',
    layerKindDefault: 'Layer',
    readinessReady: 'Ready',
    readinessGenerationInProgress: 'Generation in progress',
    readinessSelectProfile: 'Select a provider profile',
    readinessCheckingProfile: 'Checking provider profile',
    readinessProfileLoadFailed: 'Provider profiles failed to load',
    readinessSelectModel: 'Select a model',
    readinessLoadingModels: 'Loading models',
    readinessModelUnavailable: 'Selected model is unavailable',
    readinessPreparingAttachment: 'Preparing attachment',
    readinessAttachmentFailed: 'Attachment failed',
    readinessModelNoImageEdit: 'Current model does not support image input',
    readinessModelNoTextToImage: 'Current model does not support text-to-image',
    readinessSizeUnsupported: 'Current size is not supported by this model',
    readinessPlacementConflict: 'Resolve placement conflict',
    readinessEnterPrompt: 'Enter a prompt',
    readinessOptimizingPrompt: 'Optimizing prompt',
    modelReasonNotRemotelyAvailable: 'Not available for this profile',
    modelReasonAuthFailed: 'Provider authentication failed',
    modelReasonProfileMisconfigured: 'Profile needs configuration',
    modelReasonDiscoveryFailed: 'Model discovery failed',
    modelReasonCustomUnchecked: 'Custom model capability is unknown',
    modelReasonNoImageEdit: 'Does not support image input',
    modelReasonNoTextToImage: 'Does not support text-to-image',
    modelReasonSizeUnsupported: (size) => `${size} is unavailable`,
    imageInputDisabledForModel: 'Current model does not support image input',
    imageInputConflict: 'Attached images are not compatible with the current model.',
    chooseCompatibleModel: 'Choose compatible model',
    removeImages: 'Remove images',
    runningPhaseSubmitting: 'Submitting',
    runningPhaseGenerating: 'Generating',
    errorCategory: 'Category',
    errorCategoryLabel: {
      'authentication-failed': 'Authentication failed',
      'model-unavailable': 'Model unavailable',
      'size-unsupported': 'Unsupported size',
      'image-input-unreadable': 'Image input could not be read',
      'provider-protocol-incompatible': 'Relay incompatible',
      'provider-temporarily-unavailable': 'Provider temporarily unavailable',
      'placement-conflict': 'Placement conflict',
      unknown: 'Unknown',
    },
    errorMessageProviderProtocolIncompatible: 'Current relay is incompatible with Qwen image edit. Switch provider or profile.',
    errorActionOpenProviderSettings: 'Open provider settings',
    errorActionChooseSupportedSize: 'Choose supported size',
    errorActionChooseCompatibleModel: 'Choose compatible model',
    errorActionReplaceImage: 'Replace image',
    errorActionCopyDetails: 'Copy details',
    errorActionFillComposer: 'Fill composer',
  },
  history: {
    title: 'History',
    loading: 'Loading history...',
    empty: 'No history yet',
    noPrompt: '(no prompt)',
    unknownProvider: 'unknown',
    retry: 'Retry',
    download: 'Download',
    place: 'Place in Photoshop',
    resourceUnavailable: 'Resource unavailable',
  },
  settings: {
    configured: 'Configured',
    loading: 'Loading...',
    noProviderProfile: 'No Provider profile',
    chooseType: 'Choose type',
    providerTypeGuide: 'Choose by the API path in your provider docs: /v1/images/* uses Image Endpoint; /v1/chat/completions uses Chat Image.',
    providerTypeHintImageEndpoint: 'For /v1/images/generations, /v1/images/edits, and similar image endpoints.',
    providerTypeHintChatImage: 'For compatible image models called through /v1/chat/completions.',
    providerTypeHintMock: 'Local test provider. No API key or real service required; it will be removed later.',
    config: 'Configuration',
    promptBehavior: 'Prompt behavior',
    billing: 'Billing',
    billingMode: 'Billing mode',
    billingModeHint: 'Balance query stays optional and separate from generation availability.',
    billingDisabled: 'Billing is not configured for this profile.',
    billingRefresh: 'Refresh balance',
    billingRefreshing: 'Refreshing balance...',
    billingExpand: 'Expand',
    billingCollapse: 'Collapse',
    billingDetails: 'Billing details',
    billingBalanceLabel: 'Current balance',
    billingCheckedAt: 'Last checked',
    billingErrorStale: 'Latest refresh failed. Showing last successful balance if available.',
    billingUserId: 'New API user id',
    billingUserIdHint: 'Use the integer user id required by the panel family.',
    billingAccessToken: 'Billing access token',
    billingAccessTokenHint: 'Stored as a secret and used only for balance queries.',
    billingAccessTokenSavedHint: 'Saved securely. Enter a new token to replace it, or remove it explicitly.',
    billingNotSupported: 'This provider preset does not expose a billing adapter yet.',
    billingValidationUserId: 'Billing user id must be an integer.',
    billingValidationAccessToken: 'Billing access token is required for New API mode.',
    instruction: 'Instruction',
    instructionPlaceholder: 'System instruction for prompt optimization',
    alias: 'Alias',
    baseUrlHint: 'If this provider does not auto-complete endpoint paths, enter the full API base URL such as https://example.com/v1',
    requestAddresses: 'Request addresses',
    endpointLabel: (index) => `Endpoint ${index}`,
    endpointPreferred: 'Preferred',
    endpointSuggested: 'Suggested',
    endpointEnabled: 'Enabled',
    addEndpoint: 'Add endpoint',
    autoSelect: 'Auto Select',
    failoverEnabled: 'Fail over when unavailable',
    defaultModel: 'Default model',
    customModelId: 'Custom model id',
    selectedModel: 'Selected model',
    chooseFromList: 'Choose from list',
    chooseFromListHint: 'Switch back to the discovered model list.',
    useCustomModelId: 'Use custom model id',
    customModelHint: 'Use a custom model id when the model is not in the list.',
    modelListEmpty: 'No models available. Refresh the model list or enter a custom model id.',
    modelListFailed: 'Model list unavailable. Refresh the model list or enter a custom model id.',
    modelSavedUndiscovered: 'Saved model is currently not discovered',
    modelCustomUnchecked: 'Custom model id is unchecked',
    modelSelectableOnly: 'Only locally supported and currently discovered models can be sent.',
    connectionInfo: 'Connection info',
    noProfileSelected: 'No Provider profile selected',
    savedSecretPlaceholder: 'Saved securely',
    apiKeyReplacePlaceholder: 'Enter a new key to replace the saved key',
    accessTokenReplacePlaceholder: 'Enter a new token to replace the saved token',
    replaceSecret: 'Replace',
    removeSecret: 'Remove',
    secretRemovalPending: 'Will be removed when you save changes.',
    changesNotTested: 'Changes not tested',
    modelListStale: 'Model list may be outdated for the current draft.',
    duplicateDisplayName: (name) => `A provider named "${name}" already exists.`,
    duplicateEndpointUrl: 'This endpoint is already used in this profile.',
    useProviderAfterSaving: 'Use this provider after saving',
    saveProvider: 'Save Provider',
    saveChanges: 'Save changes',
    savedButton: 'Saved',
    showApiKey: 'Show API Key',
    hideApiKey: 'Hide API Key',
    editApiKey: 'Edit API Key',
    refreshModels: 'Refresh model list',
    refreshingModels: 'Refreshing...',
    testConnection: 'Test connection',
    testingConnection: 'Testing...',
    testNotTested: 'Not tested',
    testResultPrefix: 'Latest test result',
    saved: 'Saved',
    retrySave: 'Retry save',
    testSuccess: 'Connected',
    connectionFailed: 'Connection failed',
    configValidNoModels: 'Configuration is valid; no model list found',
    configValidProviderNoModels: 'Configuration is valid; this provider returned no available model list',
    selectProviderType: 'Choose a Provider type',
    globalGeneration: 'Generation settings',
    outputGroup: 'Output',
    inputGroup: 'Input',
    outputSize: 'Output size',
    outputSizeRequiresMainComposerContext: 'Open the main composer to change output size.',
    outputFormat: 'Output format',
    aspectRatio: 'Aspect ratio',
    providerInputSizePreset: 'Provider input size',
    providerInputSizePresetHint: 'Reference and captured images are resized locally before provider edit requests while preserving aspect ratio.',
    storageGroup: 'Storage',
    storageGroupHint: 'Current runtime paths and generated-image output location.',
    logPath: 'Current log path',
    generatedImagePath: 'Generated image path',
    pathInfoUnavailable: 'Path info is unavailable in the current runtime.',
    footerStatement: 'Imagen PS by sinyuk. For internal and research use.',
    saving: 'Saving...',
  },
  toast: {
    promptFilled: 'Filled into the prompt box',
    layerAdded: 'Layer added',
    layerReadFailed: 'Failed to read layer',
    fileAdded: 'Image added',
    filePickFailed: 'Failed to choose image',
    fileNeedsNormalization:
      'This image size is not supported for Upload from computer here. Use Capture or Layer, or resize the image first.',
    captureAdded: 'Capture added',
    captureFailed: 'Failed to capture Photoshop image',
    selectProviderProfileFirst: 'Add and select a Provider profile first',
    noPlaceableImage: 'No image to place',
    placedOnCanvas: 'Placed on Photoshop canvas',
    placeFailed: 'Failed to place in Photoshop',
    newSessionStarted: 'New session started',
    waitForRunningTask: 'Wait for the running task to finish',
    historyNotInCurrentSession: 'This task is not in the current session',
    promptOptimized: 'Prompt optimized',
    promptOptimizeNoChanges: 'No changes were suggested',
    promptOptimizeFailed: 'Prompt optimization failed',
    errorDetailsCopied: 'Error details copied',
    billingRefreshFailed: 'Balance refresh failed',
  },
  conversation: {
    jobFailed: 'Job failed.',
  },
};

const ZH_CN_MESSAGES: AppMessages = {
  common: {
    provider: 'Provider',
    providers: 'Providers',
    profile: 'profile',
    prompt: 'Prompt',
    loading: '加载中...',
    back: '返回',
    save: '保存',
    cancel: '取消',
    delete: '删除',
    refresh: '刷新',
    addProvider: '添加 Provider',
    enabled: '已启用',
    disabled: '已停用',
    ready: '就绪',
    needsSetup: '待配置',
    copy: '复制',
    copied: '已复制',
  },
  status: {
    all: '全部',
    done: '完成',
    generating: '生成中',
    running: '运行中',
    failed: '失败',
  },
  main: {
    history: '历史记录',
    noProviderProfile: 'No provider profile',
    loadingProfiles: '加载 profiles...',
    addProviderProfile: '添加 Provider profile',
    currentSession: '当前会话',
    emptyHint: '我们从哪里开始？',
    promptSuggestionProductValue: '生成一张粉色头发女孩的插画',
    promptSuggestionProductLabel: '生成一张粉色头发女孩的插画',
    promptSuggestionCyberpunkValue: '将这张图片转换为手绘插画',
    promptSuggestionCyberpunkLabel: '将这张图片转换为手绘插画',
    promptSuggestionLayerValue: '根据给定图片生成一张全身肖像',
    promptSuggestionLayerLabel: '根据给定图片生成一张全身肖像',
    reusePrompt: '复用 Prompt',
    submitJobRunning: '生成中...',
    noAssetPreview: 'No asset preview',
    assetFallback: 'Asset',
    imageFallback: 'image',
    placePs: '置入 PS',
    placePsShort: '置入',
    placePsLong: '置入 Photoshop',
    placeActiveDocument: '置入 Active Document',
    cannotPlace: '无法置入',
    placementActiveDocumentHint: '点击时会置入当前活动的 Photoshop 文档。',
    placementMultipleDocuments: '来源图片来自多个 Photoshop 文档。请先保留单一文档来源。',
    placementExactFrameHint: '置回捕获时的文档和画面位置。',
    placementDocumentOnlyHint: '置入捕获时的文档。',
    placingPs: '置入中...',
    placedPs: '已置入',
    regenerate: '重新生成',
    copyPrompt: '复制 Prompt',
    copyResponse: '复制 response',
    requestId: 'Request ID',
    copyRequestId: '复制 Request ID',
    expandResponse: '展开 response',
    collapseResponse: '收起 response',
    textResult: '文本结果',
    psLayers: 'PS 图层',
    noAvailableLayers: '无可用图层',
    choosePsLayer: '从 PS 图层选择',
    uploadFromComputer: '从电脑上传',
    uploadFromComputerFormats: 'PNG / JPG / WebP',
    uploadFromComputerHint: '部分尺寸用 Capture / Layer',
    loadingModels: '加载模型...',
    noModelCandidates: '无模型候选',
    modelLoading: '加载中',
    modelUnselected: '未选模型',
    promptPlaceholderReady: '描述你想要生成或编辑的图像...',
    promptPlaceholderNoProfile: '先在 Providers 中添加 profile',
    addImage: '添加图片',
    capture: '捕获',
    captureActionHint: '捕获当前 Photoshop 图层或选区',
    captureCount: (count) => `${count} 个捕获`,
    captureLayer: 'Photoshop 图层捕获',
    captureSelection: 'Photoshop 选区捕获',
    send: '发送',
    referenceImage: '参考',
    generatedImage: '生成',
    download: '下载',
    layerCount: (count) => `${count} 个图层`,
    aspectRatio: '宽高比',
    aspectRatioAuto: '智能',
    aspectRatioSquare: '1:1',
    outputSize: '尺寸',
    outputSizeUnsupportedForModel: '当前模型不可用',
    outputSizeAutoChanged: (from, to) => `${from} 不可用；已改为 ${to}`,
    billingSummary: '余额',
    billingUnknown: 'Billing 不可用',
    billingCost: 'Cost',
    billingObservedChange: 'Observed balance change',
    billingLastCost: '最近一次精确费用',
    billingLastChange: '最近一次余额变化',
    promptOptimize: '优化提示词',
    promptRefine: '优化',
    promptOptimizePlaceholder: '即将支持',
    promptOptimizeUndo: '撤销',
    promptOptimizing: '优化中…',
    promptOptimizeNoProfile: '请在 Providers 中配置 Prompt Optimizer',
    promptOptimizeEmpty: '请先输入提示词',
    layerKindSmartObject: '智能对象',
    layerKindPixel: '像素图层',
    layerKindText: '文字图层',
    layerKindGroup: '图层组',
    layerKindDefault: '图层',
    readinessReady: '就绪',
    readinessGenerationInProgress: '生成任务运行中',
    readinessSelectProfile: '请选择 Provider profile',
    readinessCheckingProfile: '正在检查 Provider profile',
    readinessProfileLoadFailed: 'Provider profiles 加载失败',
    readinessSelectModel: '请选择模型',
    readinessLoadingModels: '模型加载中',
    readinessModelUnavailable: '当前模型不可用',
    readinessPreparingAttachment: '正在准备附件',
    readinessAttachmentFailed: '附件处理失败',
    readinessModelNoImageEdit: '当前模型不支持图片输入',
    readinessModelNoTextToImage: '当前模型不支持文生图',
    readinessSizeUnsupported: '当前尺寸不被该模型支持',
    readinessPlacementConflict: '请先解决置入冲突',
    readinessEnterPrompt: '请输入提示词',
    readinessOptimizingPrompt: '提示词优化中',
    modelReasonNotRemotelyAvailable: '当前 profile 不可用',
    modelReasonAuthFailed: 'Provider 认证失败',
    modelReasonProfileMisconfigured: 'Profile 需要配置',
    modelReasonDiscoveryFailed: '模型发现失败',
    modelReasonCustomUnchecked: '自定义模型能力未知',
    modelReasonNoImageEdit: '不支持图片输入',
    modelReasonNoTextToImage: '不支持文生图',
    modelReasonSizeUnsupported: (size) => `${size} 不可用`,
    imageInputDisabledForModel: '当前模型不支持图片输入',
    imageInputConflict: '已添加的图片与当前模型不兼容。',
    chooseCompatibleModel: '选择兼容模型',
    removeImages: '移除图片',
    runningPhaseSubmitting: '提交中',
    runningPhaseGenerating: '生成中',
    errorCategory: '类别',
    errorCategoryLabel: {
      'authentication-failed': '认证失败',
      'model-unavailable': '模型不可用',
      'size-unsupported': '尺寸不支持',
      'image-input-unreadable': '图片输入无法读取',
      'provider-protocol-incompatible': '中转不兼容',
      'provider-temporarily-unavailable': 'Provider 暂时不可用',
      'placement-conflict': '置入冲突',
      unknown: '未知',
    },
    errorMessageProviderProtocolIncompatible: '当前中转站与 Qwen 图像编辑不兼容。请更换 Provider 或 Profile。',
    errorActionOpenProviderSettings: '打开 Provider 设置',
    errorActionChooseSupportedSize: '选择支持尺寸',
    errorActionChooseCompatibleModel: '选择兼容模型',
    errorActionReplaceImage: '替换图片',
    errorActionCopyDetails: '复制详情',
    errorActionFillComposer: '填入输入框',
  },
  history: {
    title: '历史',
    loading: '读取历史中...',
    empty: '暂无历史记录',
    noPrompt: '(no prompt)',
    unknownProvider: 'unknown',
    retry: '重试',
    download: '下载',
    place: '放入 Photoshop',
    resourceUnavailable: '资源不可用',
  },
  settings: {
    configured: '已配置',
    loading: '加载中...',
    noProviderProfile: '暂无 Provider profile',
    chooseType: '选择类型',
    providerTypeGuide: '根据服务商文档里的接口路径选择：/v1/images/* 选 Image Endpoint；/v1/chat/completions 选 Chat Image。',
    providerTypeHintImageEndpoint: '适合 /v1/images/generations、/v1/images/edits 等图片接口。',
    providerTypeHintChatImage: '适合通过 /v1/chat/completions 调用图片模型的兼容接口。',
    providerTypeHintMock: '本地测试用 Provider，无需 API Key，不连接真实服务；后续会移除。',
    config: '配置',
    promptBehavior: '提示词行为',
    billing: 'Billing',
    billingMode: 'Billing 模式',
    billingModeHint: '余额查询保持可选，并且与生成可用性分离。',
    billingDisabled: '当前 profile 未配置 billing。',
    billingRefresh: '刷新余额',
    billingRefreshing: '刷新余额中...',
    billingExpand: '展开',
    billingCollapse: '收起',
    billingDetails: 'Billing 详情',
    billingBalanceLabel: '当前余额',
    billingCheckedAt: '最近检查时间',
    billingErrorStale: '最近一次刷新失败；如果有上次成功数据，将继续显示。',
    billingUserId: 'New API 用户 ID',
    billingUserIdHint: '填写该面板要求的整数 user id。',
    billingAccessToken: 'Billing access token',
    billingAccessTokenHint: '仅用于余额查询，并按 secret 保存。',
    billingAccessTokenSavedHint: '已安全保存。输入新 token 可替换，也可以显式移除。',
    billingNotSupported: '当前 provider preset 还没有可用的 billing adapter。',
    billingValidationUserId: 'Billing user id 必须是整数。',
    billingValidationAccessToken: 'New API 模式需要 billing access token。',
    instruction: 'Instruction',
    instructionPlaceholder: '用于优化提示词的系统指令',
    alias: '别名',
    baseUrlHint: '如果该 Provider 不会自动补全端点路径，请填写完整 API 基础地址，例如 https://example.com/v1',
    requestAddresses: '请求地址',
    endpointLabel: (index) => `端点 ${index}`,
    endpointPreferred: '首选',
    endpointSuggested: '建议',
    endpointEnabled: '启用',
    addEndpoint: '添加端点',
    autoSelect: '自动选择',
    failoverEnabled: '不可用时切换',
    defaultModel: '默认模型',
    customModelId: '自定义 model id',
    selectedModel: '当前模型',
    chooseFromList: '从列表选择',
    chooseFromListHint: '切回已发现的模型列表。',
    useCustomModelId: '使用自定义 model id',
    customModelHint: '当模型不在列表中时，使用自定义 model id。',
    modelListEmpty: '暂无可用模型。请刷新模型列表或手动填写自定义 model id。',
    modelListFailed: '模型列表不可用。请刷新模型列表或手动填写自定义 model id。',
    modelSavedUndiscovered: '已保存模型当前未被发现',
    modelCustomUnchecked: '自定义 model id 未校验',
    modelSelectableOnly: '仅允许发送本地支持且当前已发现的模型。',
    connectionInfo: '连接信息',
    noProfileSelected: '未选择 Provider profile',
    savedSecretPlaceholder: '已安全保存',
    apiKeyReplacePlaceholder: '输入新的 key 以替换已保存的 key',
    accessTokenReplacePlaceholder: '输入新的 token 以替换已保存的 token',
    replaceSecret: '替换',
    removeSecret: '移除',
    secretRemovalPending: '保存修改后会移除。',
    changesNotTested: '修改尚未测试',
    modelListStale: '模型列表可能不匹配当前草稿。',
    duplicateDisplayName: (name) => `已存在名为“${name}”的 provider。`,
    duplicateEndpointUrl: '当前 profile 中已有这个 endpoint。',
    useProviderAfterSaving: '保存后立即使用该 provider',
    saveProvider: '保存 Provider',
    saveChanges: '保存修改',
    savedButton: '已保存',
    showApiKey: '显示 API Key',
    hideApiKey: '隐藏 API Key',
    editApiKey: '编辑 API Key',
    refreshModels: '刷新模型列表',
    refreshingModels: '刷新中...',
    testConnection: '测试连接',
    testingConnection: '测试中...',
    testNotTested: '未测试',
    testResultPrefix: '最近一次测试结果',
    saved: '已保存',
    retrySave: '重试保存',
    testSuccess: '连接成功',
    connectionFailed: '连接失败',
    configValidNoModels: '配置有效；未发现模型列表',
    configValidProviderNoModels: '配置有效；该 provider 未返回可用模型列表',
    selectProviderType: '请选择 Provider 类型',
    globalGeneration: '生成设置',
    outputGroup: '输出',
    inputGroup: '输入',
    outputSize: '输出尺寸',
    outputSizeRequiresMainComposerContext: '请先回到主编辑区，再修改输出尺寸。',
    outputFormat: '输出格式',
    aspectRatio: '宽高比',
    providerInputSizePreset: 'Provider 输入尺寸',
    providerInputSizePresetHint: '参考图和捕获图会在发送给 provider edit 请求前本地缩放，并保持原比例。',
    storageGroup: '存储',
    storageGroupHint: '当前 runtime 路径和生成图片输出位置。',
    logPath: '当前日志路径',
    generatedImagePath: '生成图片路径',
    pathInfoUnavailable: '当前 runtime 无法提供路径信息。',
    footerStatement: 'Imagen PS by sinyuk. 仅供内部与研究使用。',
    saving: '保存中...',
  },
  toast: {
    promptFilled: '已填入输入框',
    layerAdded: '已添加图层',
    layerReadFailed: '读取图层失败',
    fileAdded: '已添加图片',
    filePickFailed: '选择图片失败',
    fileNeedsNormalization: '这张图片尺寸当前不支持从电脑上传。请用 Capture / Layer，或先缩放后再上传。',
    captureAdded: '已添加捕获',
    captureFailed: '捕获 Photoshop 图像失败',
    selectProviderProfileFirst: '请先添加并选择 Provider profile',
    noPlaceableImage: '没有可置入的图片',
    placedOnCanvas: '已置入 Photoshop 画布',
    placeFailed: '置入 Photoshop 失败',
    newSessionStarted: '已开始新会话',
    waitForRunningTask: '请等待当前任务完成',
    historyNotInCurrentSession: '该任务不在当前会话中',
    promptOptimized: '提示词已优化',
    promptOptimizeNoChanges: '没有建议的修改',
    promptOptimizeFailed: '提示词优化失败',
    errorDetailsCopied: '错误详情已复制',
    billingRefreshFailed: '余额刷新失败',
  },
  conversation: {
    jobFailed: 'Job failed.',
  },
};

export const APP_MESSAGES: Record<SupportedLocale, AppMessages> = {
  en: EN_MESSAGES,
  'zh-CN': ZH_CN_MESSAGES,
};
