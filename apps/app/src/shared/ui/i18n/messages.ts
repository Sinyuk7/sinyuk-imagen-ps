import type { SupportedLocale } from '../../domain/locale';
import type { ErrorActionCategory } from '../error-action';

export interface AppMessages {
  readonly common: {
    readonly provider: string;
    readonly providers: string;
    readonly profile: string;
    readonly prompt: string;
    readonly loading: string;
    readonly back: string;
    readonly save: string;
    readonly continue: string;
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
    readonly help: string;
  };
  readonly status: {
    readonly all: string;
    readonly done: string;
    readonly generating: string;
    readonly running: string;
    readonly queued: string;
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
    readonly queuePosition: (position: number) => string;
    readonly queueStarting: string;
    readonly removeFromQueue: string;
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
    readonly expandPrompt: string;
    readonly collapsePrompt: string;
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
    readonly mask: string;
    readonly maskToggleLabel: (enabled: boolean) => string;
    readonly maskLoading: string;
    readonly maskReady: string;
    readonly maskNone: string;
    readonly maskError: string;
    readonly retryMask: string;
    readonly send: string;
    readonly referenceImage: string;
    readonly generatedImage: string;
    readonly download: string;
    readonly layerCount: (count: number) => string;
    readonly aspectRatio: string;
    readonly aspectRatioAuto: string;
    readonly aspectRatioSquare: string;
    readonly outputSize: string;
    readonly outputFormat: string;
    readonly outputSizeUnsupportedForModel: string;
    readonly outputSizeAutoChanged: (from: string, to: string) => string;
    readonly promptOptimizePlaceholder: string;
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
    readonly modelReasonNotRemotelyAvailable: string;
    readonly modelReasonAuthFailed: string;
    readonly modelReasonProfileMisconfigured: string;
    readonly modelReasonDiscoveryFailed: string;
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
    readonly errorCategoryLabel: Record<ErrorActionCategory, string>;
    readonly errorComfyUiNode: string;
    readonly errorComfyUiDetail: string;
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
  readonly imageFallback: {
    readonly loading: string;
    readonly empty: string;
    readonly previewUnavailable: string;
    readonly fileMissing: string;
    readonly resourceUnresolvable: string;
  };
  readonly settings: {
    readonly configured: string;
    readonly configuration: string;
    readonly settingsTab: string;
    readonly providerProfiles: string;
    readonly configuredProviders: string;
    readonly providerOutput: string;
    readonly providerOutputSummary: string;
    readonly configuredModelCount: (count: number) => string;
    readonly notTested: string;
    readonly storageAndDiagnostics: string;
    readonly storageAndDiagnosticsSummary: string;
    readonly globalSettings: string;
    readonly globalSettingsSummary: string;
    readonly generationBackend: string;
    readonly comfyUi: string;
    readonly comfyUiLoadFailed: string;
    readonly comfyUiWorkflowTarget: string;
    readonly comfyUiSelectWorkflow: string;
    readonly comfyUiReadinessBridge: string;
    readonly comfyUiOperationFailed: string;
    readonly comfyUiConnection: string;
    readonly comfyUiAddress: string;
    readonly comfyUiConnect: string;
    readonly comfyUiReconnect: string;
    readonly comfyUiRetry: string;
    readonly comfyUiConnecting: string;
    readonly comfyUiAddressInvalid: string;
    readonly comfyUiCheckingServer: string;
    readonly comfyUiLoadingBridge: string;
    readonly comfyUiValidatingBridge: string;
    readonly comfyUiSavingConnection: string;
    readonly comfyUiConnectedTo: (target: string) => string;
    readonly comfyUiSwitchFrom: (target: string) => string;
    readonly comfyUiStillConnectedTo: (target: string) => string;
    readonly comfyUiApiUnreachable: string;
    readonly comfyUiApiInvalidResponse: string;
    readonly comfyUiWebViewLoadFailed: string;
    readonly comfyUiBridgeHandshakeTimeout: string;
    readonly comfyUiBridgeContractMismatch: string;
    readonly comfyUiPersistenceFailed: string;
    readonly comfyUiCurrentWorkflow: string;
    readonly comfyUiChooseWorkflow: string;
    readonly comfyUiNoWorkflowSelected: string;
    readonly loading: string;
    readonly noProviderProfile: string;
    readonly config: string;
    readonly alias: string;
    readonly apiKeyReplacePlaceholder: string;
    readonly clearField: string;
    readonly removeSecret: string;
    readonly secretRemovalPending: string;
    readonly duplicateDisplayName: (name: string) => string;
    readonly showApiKey: string;
    readonly hideApiKey: string;
    readonly testConnection: string;
    readonly testingConnection: string;
    readonly saved: string;
    readonly profileCreated: (name: string) => string;
    readonly profileSaved: (name: string) => string;
    readonly profileDeleted: string;
    readonly deleteProfileConfirmation: string;
    readonly savingProvider: string;
    readonly connectionFailed: string;
    readonly globalGeneration: string;
    readonly promptSettings: string;
    readonly promptOptimization: string;
    readonly promptSettingsSummary: string;
    readonly optimizerProfile: string;
    readonly none: string;
    readonly optimizationTemplate: string;
    readonly templatePlaceholder: string;
    readonly templateInputHint: string;
    readonly optimizationNoProfile: string;
    readonly optimizationInvalidTemplate: string;
    readonly optimizationMissingProfile: string;
    readonly promptPresets: string;
    readonly promptPresetsLoading: string;
    readonly promptPresetsEmpty: string;
    readonly addPreset: string;
    readonly editPreset: string;
    readonly presetName: string;
    readonly presetMode: string;
    readonly presetModePrepend: string;
    readonly presetModeAppend: string;
    readonly presetModeReplace: string;
    readonly presetContent: string;
    readonly presetContentValid: string;
    readonly presetReplaceInvalid: string;
    readonly outputGroup: string;
    readonly inputGroup: string;
    readonly outputSize: string;
    readonly outputFormat: string;
    readonly aspectRatio: string;
    readonly providerInputSizePreset: string;
    readonly providerInputSizePresetHint: string;
    readonly useInputSizeNormalizedHint: string;
    readonly storageGroup: string;
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
    readonly errorDetailsCopied: string;
  };
  readonly conversation: {
    readonly jobFailed: string;
  };
}

const EN_MESSAGES: AppMessages = {
  common: {
    provider: 'Provider',
    providers: 'Providers',
    profile: 'Profile',
    prompt: 'Prompt',
    loading: 'Loading…',
    back: 'Back',
    save: 'Save',
    continue: 'Continue',
    cancel: 'Cancel',
    delete: 'Delete',
    refresh: 'Refresh',
    addProvider: 'Add provider',
    enabled: 'Enabled',
    disabled: 'Disabled',
    ready: 'Ready',
    needsSetup: 'Needs setup',
    copy: 'Copy',
    copied: 'Copied',
    help: 'Help',
  },
  status: {
    all: 'All',
    done: 'Done',
    generating: 'Generating',
    running: 'Running',
    queued: 'Queued',
    failed: 'Failed',
  },
  main: {
    history: 'History',
    noProviderProfile: 'No provider configured',
    loadingProfiles: 'Loading profiles…',
    addProviderProfile: 'Add provider profile',
    currentSession: 'Current session',
    emptyHint: 'Start creating (｡•̀ᴗ-)✧',
    promptSuggestionProductValue: 'Create an illustration of a girl with pink hair',
    promptSuggestionProductLabel: 'Pink-haired girl',
    promptSuggestionCyberpunkValue: 'Transform this image into a hand-drawn illustration',
    promptSuggestionCyberpunkLabel: 'Hand-drawn style',
    promptSuggestionLayerValue: 'Generate a full-body portrait from the given image',
    promptSuggestionLayerLabel: 'Full-body portrait',
    reusePrompt: 'Reuse prompt',
    submitJobRunning: 'Generating…',
    queuePosition: (position) => `Queued · #${position}`,
    queueStarting: 'Starting',
    removeFromQueue: 'Remove from queue',
    noAssetPreview: 'No preview available',
    assetFallback: 'Asset',
    imageFallback: 'Image',
    placePs: 'Place in PS',
    placePsShort: 'Place',
    placePsLong: 'Place in Photoshop',
    placeActiveDocument: 'Place in active document',
    cannotPlace: 'Cannot place',
    placementActiveDocumentHint: 'Places into the active Photoshop document when clicked.',
    placementMultipleDocuments: 'Images come from different documents. Keep one document.',
    placementExactFrameHint: 'Places back into the original document and position.',
    placementDocumentOnlyHint: 'Places into the original document.',
    placingPs: 'Placing…',
    placedPs: 'Placed ✨',
    regenerate: 'Regenerate',
    copyPrompt: 'Copy prompt',
    copyResponse: 'Copy response',
    requestId: 'Request ID',
    copyRequestId: 'Copy request ID',
    expandPrompt: 'Expand prompt',
    collapsePrompt: 'Collapse prompt',
    expandResponse: 'Expand response',
    collapseResponse: 'Collapse response',
    textResult: 'Text result',
    psLayers: 'PS Layers',
    noAvailableLayers: 'No layers (´･ω･`)',
    choosePsLayer: 'Choose from PS layers',
    uploadFromComputer: 'Upload from computer',
    uploadFromComputerFormats: 'PNG / JPG / WebP',
    uploadFromComputerHint: 'Unsupported sizes: use Capture or Layer.',
    loadingModels: 'Loading models…',
    noModelCandidates: 'No models (´･ω･`)',
    modelLoading: 'Loading',
    modelUnselected: 'No model selected',
    promptPlaceholderReady: 'Describe the image you want to generate or edit',
    promptPlaceholderNoProfile: 'Add a provider profile first',
    addImage: 'Add image',
    capture: 'Capture',
    captureActionHint: 'Capture the active Photoshop layer or selection',
    captureCount: (count) => `${count} capture${count === 1 ? '' : 's'}`,
    captureLayer: 'Photoshop layer capture',
    captureSelection: 'Photoshop selection capture',
    mask: 'Mask',
    maskToggleLabel: (enabled) => `Mask: ${enabled ? 'on' : 'off'}`,
    maskLoading: 'Preparing mask',
    maskReady: 'Mask ready',
    maskNone: 'No mask on primary image',
    maskError: 'Mask failed',
    retryMask: 'Retry mask',
    send: 'Send',
    referenceImage: 'Reference image',
    generatedImage: 'Generated image',
    download: 'Download',
    layerCount: (count) => `${count} layer${count === 1 ? '' : 's'}`,
    aspectRatio: 'Aspect ratio',
    aspectRatioAuto: 'Auto',
    aspectRatioSquare: '1:1',
    outputSize: 'Size',
    outputFormat: 'Format',
    outputSizeUnsupportedForModel: 'Unavailable for this model',
    outputSizeAutoChanged: (from, to) => `${from} is unavailable; switched to ${to}`,
    promptOptimizePlaceholder: 'Not available yet',
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
    readinessPreparingAttachment: 'Preparing attachments',
    readinessAttachmentFailed: 'Attachment failed',
    readinessModelNoImageEdit: 'Current model does not support image input',
    readinessModelNoTextToImage: 'Current model does not support text-to-image',
    readinessSizeUnsupported: 'Current size is not supported by this model',
    readinessPlacementConflict: 'Resolve placement conflict',
    readinessEnterPrompt: 'Enter a prompt',
    modelReasonNotRemotelyAvailable: 'Unavailable for this profile',
    modelReasonAuthFailed: 'Provider authentication failed',
    modelReasonProfileMisconfigured: 'Profile is incomplete',
    modelReasonDiscoveryFailed: 'Model list failed to load',
    modelReasonNoImageEdit: 'Does not support image input',
    modelReasonNoTextToImage: 'Does not support text-to-image',
    modelReasonSizeUnsupported: (size) => `${size} is unavailable`,
    imageInputDisabledForModel: 'Current model does not support image input',
    imageInputConflict: 'Attached images are incompatible with the current model.',
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
      'provider-protocol-incompatible': 'Relay protocol incompatible',
      'provider-temporarily-unavailable': 'Provider temporarily unavailable',
      'placement-conflict': 'Placement conflict',
      'comfyui-execution-failed': 'ComfyUI execution failed',
      'generated-image-persistence-failed': 'Generated image could not be saved',
      unknown: 'Unknown error',
    },
    errorComfyUiNode: 'Node',
    errorComfyUiDetail: 'Details',
    errorMessageProviderProtocolIncompatible: 'This endpoint does not support image editing.',
    errorActionOpenProviderSettings: 'Open provider settings',
    errorActionChooseSupportedSize: 'Choose supported size',
    errorActionChooseCompatibleModel: 'Choose compatible model',
    errorActionReplaceImage: 'Replace image',
    errorActionCopyDetails: 'Copy details',
    errorActionFillComposer: 'Use in prompt box',
  },
  history: {
    title: 'History',
    loading: 'Loading history…',
    empty: 'No history yet (´･ω･`)',
    noPrompt: '(No prompt)',
    unknownProvider: 'Unknown provider',
    retry: 'Retry',
    download: 'Download',
    place: 'Place in Photoshop',
    resourceUnavailable: 'Resource unavailable',
  },
  imageFallback: {
    loading: 'Loading preview',
    empty: 'No image',
    previewUnavailable: 'Preview unavailable',
    fileMissing: 'File missing',
    resourceUnresolvable: 'Cannot read preview',
  },
  settings: {
    configured: 'Configured',
    configuration: 'Configuration',
    settingsTab: 'Settings',
    providerProfiles: 'Provider Profiles',
    configuredProviders: 'Configured Providers',
    providerOutput: 'Provider Output',
    providerOutputSummary: 'Auto · PNG · Auto',
    configuredModelCount: (count) => `${count} configured model${count === 1 ? '' : 's'}`,
    notTested: 'Not tested',
    storageAndDiagnostics: 'Storage & diagnostics',
    storageAndDiagnosticsSummary: 'Image paths, logs, and runtime details',
    globalSettings: 'Global Settings',
    globalSettingsSummary: 'Input size, storage, and logs',
    generationBackend: 'Generation backend',
    comfyUi: 'ComfyUI',
    comfyUiLoadFailed: 'Could not load ComfyUI settings',
    comfyUiWorkflowTarget: 'Workflow target',
    comfyUiSelectWorkflow: 'Select workflow',
    comfyUiReadinessBridge: 'Frontend unavailable',
    comfyUiOperationFailed: 'ComfyUI operation failed',
    comfyUiConnection: 'Connection',
    comfyUiAddress: 'Address',
    comfyUiConnect: 'Connect',
    comfyUiReconnect: 'Reconnect',
    comfyUiRetry: 'Retry',
    comfyUiConnecting: 'Connecting...',
    comfyUiAddressInvalid: 'Enter a complete http:// or https:// address without credentials, query, or fragment.',
    comfyUiCheckingServer: 'Checking server...',
    comfyUiLoadingBridge: 'Loading Frontend Bridge...',
    comfyUiValidatingBridge: 'Validating Bridge...',
    comfyUiSavingConnection: 'Saving connection...',
    comfyUiConnectedTo: (target) => `Connected to ${target}.`,
    comfyUiSwitchFrom: (target) => `Currently connected to ${target}. Connect to switch.`,
    comfyUiStillConnectedTo: (target) => `Still connected to ${target}.`,
    comfyUiApiUnreachable: 'Could not connect to the ComfyUI server.',
    comfyUiApiInvalidResponse: 'ComfyUI returned an invalid server response.',
    comfyUiWebViewLoadFailed: 'The ComfyUI Frontend Bridge could not load.',
    comfyUiBridgeHandshakeTimeout: 'The server is reachable, but the Frontend Bridge did not respond.',
    comfyUiBridgeContractMismatch: 'This ComfyUI Frontend Bridge is incompatible.',
    comfyUiPersistenceFailed: 'The validated connection could not be saved.',
    comfyUiCurrentWorkflow: 'Current Workflow',
    comfyUiChooseWorkflow: 'Choose workflow',
    comfyUiNoWorkflowSelected: 'No saved workflow selected.',
    loading: 'Loading…',
    noProviderProfile: 'No profiles (´･ω･`)',
    config: 'Configuration',
    alias: 'Alias',
    apiKeyReplacePlaceholder: 'Enter a new API Key to replace it',
    clearField: 'Clear',
    removeSecret: 'Remove',
    secretRemovalPending: 'Will be removed after saving.',
    duplicateDisplayName: (name) => `A Provider named "${name}" already exists.`,
    showApiKey: 'Show API Key',
    hideApiKey: 'Hide API Key',
    testConnection: 'Test connection',
    testingConnection: 'Testing…',
    saved: 'Saved',
    profileCreated: (name) => `Profile "${name}" created.`,
    profileSaved: (name) => `Profile "${name}" saved.`,
    profileDeleted: 'Profile deleted.',
    deleteProfileConfirmation: 'Delete this profile and its saved API key?',
    savingProvider: 'Saving…',
    connectionFailed: 'Connection failed',
    globalGeneration: 'Generation settings',
    promptSettings: 'Prompt Settings',
    promptOptimization: 'Prompt Optimization',
    promptSettingsSummary: 'Templates and presets',
    optimizerProfile: 'Profile',
    none: 'None',
    optimizationTemplate: 'Template',
    templatePlaceholder: 'Write instructions and include {prompt}',
    templateInputHint: 'Instructions + {prompt} placeholder',
    optimizationNoProfile: 'Select a profile to enable.',
    optimizationInvalidTemplate: 'Fix the placeholder.',
    optimizationMissingProfile: 'Saved profile is missing.',
    promptPresets: 'Prompt Presets',
    promptPresetsLoading: 'Loading presets...',
    promptPresetsEmpty: 'No prompt presets yet.',
    addPreset: 'Add preset',
    editPreset: 'Edit preset',
    presetName: 'Name',
    presetMode: 'Mode',
    presetModePrepend: 'Prepend',
    presetModeAppend: 'Append',
    presetModeReplace: 'Replace',
    presetContent: 'Content',
    presetContentValid: 'Content valid ( •̀ ω •́ )✧',
    presetReplaceInvalid: 'Replace mode needs exactly one {prompt}.',
    outputGroup: 'Parameters',
    inputGroup: 'Input',
    outputSize: 'Output size',
    outputFormat: 'Output format',
    aspectRatio: 'Aspect ratio',
    providerInputSizePreset: 'Input image size',
    providerInputSizePresetHint: 'Input images resize locally before sending.',
    useInputSizeNormalizedHint: 'Use Input Size follows the first input.',
    storageGroup: 'Storage',
    logPath: 'Current log path',
    generatedImagePath: 'Generated image path',
    pathInfoUnavailable: 'Path information is unavailable in this environment.',
    footerStatement: 'Imagen PS by sinyuk. For internal use and research only.',
    saving: 'Saving…',
  },
  toast: {
    promptFilled: 'Prompt added ✨',
    layerAdded: 'Layer added ✨',
    layerReadFailed: 'Couldn’t read the layer',
    fileAdded: 'Image added ✨',
    filePickFailed: 'Couldn’t select the image',
    fileNeedsNormalization: 'Size unsupported. Resize, Capture, or Layer.',
    captureAdded: 'Capture added ✨',
    captureFailed: 'Couldn’t capture the Photoshop image',
    selectProviderProfileFirst: 'Add and select a provider profile first',
    noPlaceableImage: 'No image available to place',
    placedOnCanvas: 'Placed in Photoshop ✨',
    placeFailed: 'Failed to place in Photoshop',
    newSessionStarted: 'New session started ✨',
    waitForRunningTask: 'Wait for the running task to finish',
    historyNotInCurrentSession: 'This task is not in the current session',
    errorDetailsCopied: 'Error details copied',
  },
  conversation: {
    jobFailed: 'Task failed.',
  },
};

const ZH_CN_MESSAGES: AppMessages = {
  common: {
    provider: 'Provider',
    providers: 'Providers',
    profile: 'Provider 配置',
    prompt: '提示词',
    loading: '加载中…',
    back: '返回',
    save: '保存',
    continue: '继续',
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
    help: '帮助',
  },
  status: {
    all: '全部',
    done: '完成',
    generating: '生成中',
    running: '运行中',
    queued: '排队中',
    failed: '失败',
  },
  main: {
    history: '历史记录',
    noProviderProfile: '选择 Provider 配置',
    loadingProfiles: '加载配置…',
    addProviderProfile: '添加 Provider 配置',
    currentSession: '本次会话',
    emptyHint: '开始创作吧 (｡•̀ᴗ-)✧',
    promptSuggestionProductValue: '生成一张粉色头发女孩的插画',
    promptSuggestionProductLabel: '粉发少女',
    promptSuggestionCyberpunkValue: '将这张图片转换为手绘插画',
    promptSuggestionCyberpunkLabel: '手绘风格',
    promptSuggestionLayerValue: '根据给定图片生成一张全身肖像',
    promptSuggestionLayerLabel: '全身肖像',
    reusePrompt: '复用提示词',
    submitJobRunning: '生成中…',
    queuePosition: (position) => `排队中 · #${position}`,
    queueStarting: '正在启动',
    removeFromQueue: '移出队列',
    noAssetPreview: '暂无预览',
    assetFallback: '资源',
    imageFallback: '图片',
    placePs: '置入 PS',
    placePsShort: '置入',
    placePsLong: '置入 Photoshop',
    placeActiveDocument: '置入当前文档',
    cannotPlace: '无法置入',
    placementActiveDocumentHint: '点击后置入当前 Photoshop 文档。',
    placementMultipleDocuments: '图片来自不同文档，请保留同一文档。',
    placementExactFrameHint: '置回原文档原位置。',
    placementDocumentOnlyHint: '置入原文档。',
    placingPs: '置入中…',
    placedPs: '已置入 ✨',
    regenerate: '重新生成',
    copyPrompt: '复制提示词',
    copyResponse: '复制结果',
    requestId: 'Request ID',
    copyRequestId: '复制请求 ID',
    expandPrompt: '展开提示词',
    collapsePrompt: '收起提示词',
    expandResponse: '展开响应',
    collapseResponse: '收起响应',
    textResult: '文本结果',
    psLayers: 'PS 图层',
    noAvailableLayers: '暂无图层 (´･ω･`)',
    choosePsLayer: '选择图层',
    uploadFromComputer: '从电脑上传',
    uploadFromComputerFormats: 'PNG / JPG / WebP',
    uploadFromComputerHint: '尺寸不支持。请缩放或改用捕获/图层。',
    loadingModels: '加载模型…',
    noModelCandidates: '暂无模型 (´･ω･`)',
    modelLoading: '加载中',
    modelUnselected: '未选模型',
    promptPlaceholderReady: '描述想生成或编辑的图像',
    promptPlaceholderNoProfile: '请先添加 Provider 配置',
    addImage: '添加图片',
    capture: '捕获',
    captureActionHint: '捕获图层或选区',
    captureCount: (count) => `${count} 个捕获`,
    captureLayer: '图层捕获',
    captureSelection: '选区捕获',
    mask: '蒙版',
    maskToggleLabel: (enabled) => `蒙版：${enabled ? '开启' : '关闭'}`,
    maskLoading: '正在准备蒙版',
    maskReady: '蒙版已就绪',
    maskNone: '主图没有蒙版',
    maskError: '蒙版失败',
    retryMask: '重试蒙版',
    send: '发送',
    referenceImage: '参考图',
    generatedImage: '生成图',
    download: '下载',
    layerCount: (count) => `${count} 个图层`,
    aspectRatio: '宽高比',
    aspectRatioAuto: '自动',
    aspectRatioSquare: '1:1',
    outputSize: '尺寸',
    outputFormat: '格式',
    outputSizeUnsupportedForModel: '不支持此尺寸',
    outputSizeAutoChanged: (from, to) => `${from} 不可用，已切换为 ${to}`,
    promptOptimizePlaceholder: '暂未开放',
    layerKindSmartObject: '智能对象',
    layerKindPixel: '像素图层',
    layerKindText: '文字图层',
    layerKindGroup: '图层组',
    layerKindDefault: '图层',
    readinessReady: '就绪',
    readinessGenerationInProgress: '正在生成',
    readinessSelectProfile: '选择 Provider 配置',
    readinessCheckingProfile: '检查 Provider 配置',
    readinessProfileLoadFailed: 'Provider 配置加载失败',
    readinessSelectModel: '请选择模型',
    readinessLoadingModels: '正在加载模型',
    readinessModelUnavailable: '模型不可用',
    readinessPreparingAttachment: '处理附件',
    readinessAttachmentFailed: '附件处理失败',
    readinessModelNoImageEdit: '此模型不支持图片输入',
    readinessModelNoTextToImage: '此模型不支持文生图',
    readinessSizeUnsupported: '尺寸不支持',
    readinessPlacementConflict: '处理置入冲突',
    readinessEnterPrompt: '请输入提示词',
    modelReasonNotRemotelyAvailable: 'Provider 配置不支持该模型',
    modelReasonAuthFailed: 'Provider 认证失败',
    modelReasonProfileMisconfigured: 'Provider 配置不完整',
    modelReasonDiscoveryFailed: '模型列表获取失败',
    modelReasonNoImageEdit: '不支持图片输入',
    modelReasonNoTextToImage: '不支持文生图',
    modelReasonSizeUnsupported: (size) => `此模型不支持 ${size}`,
    imageInputDisabledForModel: '不支持图片输入',
    imageInputConflict: '图片不兼容。',
    chooseCompatibleModel: '更换模型',
    removeImages: '移除图片',
    runningPhaseSubmitting: '提交中',
    runningPhaseGenerating: '生成中',
    errorCategory: '类别',
    errorCategoryLabel: {
      'authentication-failed': '认证失败',
      'model-unavailable': '模型不可用',
      'size-unsupported': '尺寸不支持',
      'image-input-unreadable': '图片输入无法读取',
      'provider-protocol-incompatible': '端点不兼容',
      'provider-temporarily-unavailable': 'Provider 暂时不可用',
      'placement-conflict': '置入冲突',
      'comfyui-execution-failed': 'ComfyUI 执行失败',
      'generated-image-persistence-failed': '生成图片保存失败',
      unknown: '未知错误',
    },
    errorComfyUiNode: '节点',
    errorComfyUiDetail: '详情',
    errorMessageProviderProtocolIncompatible: '端点不支持图片编辑。',
    errorActionOpenProviderSettings: '打开 Provider 设置',
    errorActionChooseSupportedSize: '选择支持尺寸',
    errorActionChooseCompatibleModel: '选择兼容模型',
    errorActionReplaceImage: '替换图片',
    errorActionCopyDetails: '复制详情',
    errorActionFillComposer: '填入输入框',
  },
  history: {
    title: '历史',
    loading: '加载历史中…',
    empty: '暂无历史 (´･ω･`)',
    noPrompt: '（无提示词）',
    unknownProvider: '未知 Provider',
    retry: '重试',
    download: '下载',
    place: '置入 Photoshop',
    resourceUnavailable: '资源不可用',
  },
  imageFallback: {
    loading: '加载预览中',
    empty: '无图片',
    previewUnavailable: '暂无预览',
    fileMissing: '文件缺失',
    resourceUnresolvable: '无法读取预览',
  },
  settings: {
    configured: '已配置',
    configuration: '设置',
    settingsTab: '设置',
    providerProfiles: 'Provider 配置',
    configuredProviders: '已配置 Provider',
    providerOutput: 'Provider 输出',
    providerOutputSummary: 'Auto · PNG · Auto',
    configuredModelCount: (count) => `${count} 个已配置模型`,
    notTested: '尚未测试',
    storageAndDiagnostics: '存储与诊断',
    storageAndDiagnosticsSummary: '图片目录、日志与运行信息',
    globalSettings: '全局设置',
    globalSettingsSummary: '输入尺寸、存储与日志',
    generationBackend: '生成后端',
    comfyUi: 'ComfyUI',
    comfyUiLoadFailed: 'ComfyUI 设置加载失败',
    comfyUiWorkflowTarget: '工作流目标',
    comfyUiSelectWorkflow: '选择工作流',
    comfyUiReadinessBridge: 'Frontend 不可用',
    comfyUiOperationFailed: 'ComfyUI 操作失败',
    comfyUiConnection: '连接',
    comfyUiAddress: '地址',
    comfyUiConnect: '连接',
    comfyUiReconnect: '重新连接',
    comfyUiRetry: '重试',
    comfyUiConnecting: '连接中...',
    comfyUiAddressInvalid: '请输入完整的 http:// 或 https:// 地址，且不要包含凭据、查询参数或片段。',
    comfyUiCheckingServer: '正在检查服务器...',
    comfyUiLoadingBridge: '正在加载 Frontend Bridge...',
    comfyUiValidatingBridge: '正在验证 Bridge...',
    comfyUiSavingConnection: '正在保存连接...',
    comfyUiConnectedTo: (target) => `已连接到 ${target}。`,
    comfyUiSwitchFrom: (target) => `当前连接到 ${target}。连接以切换。`,
    comfyUiStillConnectedTo: (target) => `仍连接到 ${target}。`,
    comfyUiApiUnreachable: '无法连接 ComfyUI 服务器。',
    comfyUiApiInvalidResponse: 'ComfyUI 返回了无效的服务器响应。',
    comfyUiWebViewLoadFailed: '无法加载 ComfyUI Frontend Bridge。',
    comfyUiBridgeHandshakeTimeout: '服务器可访问，但 Frontend Bridge 未响应。',
    comfyUiBridgeContractMismatch: '当前 ComfyUI Frontend Bridge 不兼容。',
    comfyUiPersistenceFailed: '已验证的连接无法保存。',
    comfyUiCurrentWorkflow: '当前 Workflow',
    comfyUiChooseWorkflow: '选择 Workflow',
    comfyUiNoWorkflowSelected: '尚未选择已保存的 Workflow。',
    loading: '加载中…',
    noProviderProfile: '暂无 Provider 配置 (´･ω･`)',
    config: '配置',
    alias: '别名',
    apiKeyReplacePlaceholder: '输入新的 API Key 以替换',
    clearField: '清空',
    removeSecret: '移除',
    secretRemovalPending: '保存后移除。',
    duplicateDisplayName: (name) => `已存在名为“${name}”的 Provider。`,
    showApiKey: '显示 API Key',
    hideApiKey: '隐藏 API Key',
    testConnection: '测试连接',
    testingConnection: '测试中…',
    saved: '已保存',
    profileCreated: (name) => `Profile“${name}”已创建。`,
    profileSaved: (name) => `Profile“${name}”已保存。`,
    profileDeleted: 'Profile 已删除。',
    deleteProfileConfirmation: '删除此 Profile 及其保存的 API Key？',
    savingProvider: '保存中…',
    connectionFailed: '连接失败',
    globalGeneration: '生成设置',
    promptSettings: '提示词设置',
    promptOptimization: '提示词优化',
    promptSettingsSummary: '模板与预设',
    optimizerProfile: 'Provider 配置',
    none: '无',
    optimizationTemplate: '模板',
    templatePlaceholder: '输入提示词，并保留 {prompt} 占位符',
    templateInputHint: '提示词 + {prompt} 占位符',
    optimizationNoProfile: '选择 Provider 配置后启用。',
    optimizationInvalidTemplate: '请修正占位符。',
    optimizationMissingProfile: '已保存配置不存在。',
    promptPresets: '提示词预设',
    promptPresetsLoading: '正在加载预设...',
    promptPresetsEmpty: '暂无提示词预设。',
    addPreset: '添加预设',
    editPreset: '编辑预设',
    presetName: '名称',
    presetMode: '模式',
    presetModePrepend: '前置',
    presetModeAppend: '后置',
    presetModeReplace: '替换',
    presetContent: '内容',
    presetContentValid: '内容有效 ( •̀ ω •́ )✧',
    presetReplaceInvalid: '替换模式仅需一个 {prompt}。',
    outputGroup: '参数配置',
    inputGroup: '输入',
    outputSize: '输出尺寸',
    outputFormat: '输出格式',
    aspectRatio: '宽高比',
    providerInputSizePreset: '输入图片尺寸',
    providerInputSizePresetHint: '发送前本地缩放输入图。',
    useInputSizeNormalizedHint: 'Use Input Size 会跟随首图。',
    storageGroup: '存储',
    logPath: '当前日志路径',
    generatedImagePath: '生成图片路径',
    pathInfoUnavailable: '当前环境无法获取路径信息。',
    footerStatement: 'Imagen PS by sinyuk。仅供内部使用与研究。',
    saving: '保存中…',
  },
  toast: {
    promptFilled: '已填入提示词 ✨',
    layerAdded: '已添加图层 ✨',
    layerReadFailed: '图层读取失败',
    fileAdded: '已添加图片 ✨',
    filePickFailed: '图片选择失败',
    fileNeedsNormalization: '尺寸不支持。请缩放或改用捕获/图层。',
    captureAdded: '已添加捕获 ✨',
    captureFailed: 'Photoshop 图像捕获失败',
    selectProviderProfileFirst: '请先选择配置',
    noPlaceableImage: '暂无可置入图片',
    placedOnCanvas: '已置入 Photoshop 画布 ✨',
    placeFailed: '置入 Photoshop 失败',
    newSessionStarted: '新会话已开启 ✨',
    waitForRunningTask: '请等待任务完成',
    historyNotInCurrentSession: '任务属其他会话',
    errorDetailsCopied: '错误详情已复制',
  },
  conversation: {
    jobFailed: '任务失败。',
  },
};

export const APP_MESSAGES: Record<SupportedLocale, AppMessages> = {
  en: EN_MESSAGES,
  'zh-CN': ZH_CN_MESSAGES,
};
