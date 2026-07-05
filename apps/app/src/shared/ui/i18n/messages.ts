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
    readonly errorCategoryLabel: Record<ErrorActionCategory, string>;
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
    readonly configuration: string;
    readonly providerProfiles: string;
    readonly loading: string;
    readonly noProviderProfile: string;
    readonly config: string;
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
    readonly alias: string;
    readonly baseUrlHint: string;
    readonly requestAddresses: string;
    readonly endpointCurrent: string;
    readonly endpointEnabled: string;
    readonly addEndpoint: string;
    readonly autoSelect: string;
    readonly speedTest: string;
    readonly testingSpeed: string;
    readonly endpointMeasurementUnsupported: string;
    readonly providerConnectionUnsupported: string;
    readonly autoSelectManaged: string;
    readonly allEndpointsUnavailable: string;
    readonly endpointFailed: string;
    readonly endpointTimeout: string;
    readonly endpointDns: string;
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
    readonly modelDiscoveryUnsupported: string;
    readonly modelDiscoveryFieldHelp: string;
    readonly apiProfile: string;
    readonly apiFormat: string;
    readonly apiFormatAuto: string;
    readonly apiFormatRequired: string;
    readonly apiFormatNeedsPath: string;
    readonly apiFormatUnsupported: string;
    readonly apiFormatDetected: (label: string) => string;
    readonly apiFormatIncomplete: (label: string) => string;
    readonly apiFormatConflict: (current: string, next: string) => string;
    readonly endpointOrPath: string;
    readonly endpointOrPathHint: string;
    readonly advancedSettings: string;
    readonly generationPath: string;
    readonly editPath: string;
    readonly invokePath: string;
    readonly invokePathTemplate: string;
    readonly authMode: string;
    readonly authModeFixedBearer: string;
    readonly duplicateDisplayName: (name: string) => string;
    readonly duplicateEndpointUrl: string;
    readonly saveProvider: string;
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
    readonly testSuccess: string;
    readonly speedTestSuccess: string;
    readonly connectionFailed: string;
    readonly configValidNoModels: string;
    readonly configValidProviderNoModels: string;
    readonly globalGeneration: string;
    readonly promptSettings: string;
    readonly promptOptimization: string;
    readonly optimizerProfile: string;
    readonly none: string;
    readonly optimizationTemplate: string;
    readonly templateValid: string;
    readonly templateInvalidReason: string;
    readonly optimizationActive: string;
    readonly optimizationNoProfile: string;
    readonly optimizationInvalidTemplate: string;
    readonly optimizationMissingProfile: string;
    readonly promptPresets: string;
    readonly selectedPreset: string;
    readonly presetNone: string;
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
    readonly selectProfileToEnable: string;
    readonly systemInstructions: string;
    readonly systemInstructionsHint: string;
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
    profile: 'Profile',
    prompt: 'Prompt',
    loading: 'Loading…',
    back: 'Back',
    save: 'Save',
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
    noProviderProfile: 'No provider configured',
    loadingProfiles: 'Loading profiles…',
    addProviderProfile: 'Add provider profile',
    currentSession: 'Current session',
    emptyHint: 'What shall we create today? ✨',
    promptSuggestionProductValue: 'Create an illustration of a girl with pink hair',
    promptSuggestionProductLabel: 'Pink-haired girl',
    promptSuggestionCyberpunkValue: 'Transform this image into a hand-drawn illustration',
    promptSuggestionCyberpunkLabel: 'Hand-drawn style',
    promptSuggestionLayerValue: 'Generate a full-body portrait from the given image',
    promptSuggestionLayerLabel: 'Full-body portrait',
    reusePrompt: 'Reuse prompt',
    submitJobRunning: 'Generating…',
    noAssetPreview: 'No preview available',
    assetFallback: 'Asset',
    imageFallback: 'Image',
    placePs: 'Place in PS',
    placePsShort: 'Place',
    placePsLong: 'Place in Photoshop',
    placeActiveDocument: 'Place in active document',
    cannotPlace: 'Cannot place',
    placementActiveDocumentHint: 'Places into the active Photoshop document when clicked.',
    placementMultipleDocuments: 'Images come from multiple Photoshop documents. Keep images from one document before placing.',
    placementExactFrameHint: 'Places back into the original document and position.',
    placementDocumentOnlyHint: 'Places into the original document.',
    placingPs: 'Placing…',
    placedPs: 'Placed',
    regenerate: 'Regenerate',
    copyPrompt: 'Copy prompt',
    copyResponse: 'Copy response',
    requestId: 'Request ID',
    copyRequestId: 'Copy request ID',
    expandResponse: 'Expand response',
    collapseResponse: 'Collapse response',
    textResult: 'Text result',
    psLayers: 'PS Layers',
    noAvailableLayers: 'No available layers',
    choosePsLayer: 'Choose from PS layers',
    uploadFromComputer: 'Upload from computer',
    uploadFromComputerFormats: 'PNG / JPG / WebP',
    uploadFromComputerHint: 'Some sizes: use Capture or Layer.',
    loadingModels: 'Loading models…',
    noModelCandidates: 'No models available',
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
    send: 'Send',
    referenceImage: 'Reference image',
    generatedImage: 'Generated image',
    download: 'Download',
    layerCount: (count) => `${count} layer${count === 1 ? '' : 's'}`,
    aspectRatio: 'Aspect ratio',
    aspectRatioAuto: 'Auto',
    aspectRatioSquare: '1:1',
    outputSize: 'Size',
    outputSizeUnsupportedForModel: 'Unavailable for this model',
    outputSizeAutoChanged: (from, to) => `${from} is unavailable; changed to ${to}`,
    billingSummary: 'Balance',
    billingUnknown: 'Balance unavailable',
    billingCost: 'Cost',
    billingObservedChange: 'Observed balance change',
    billingLastCost: 'Last exact cost',
    billingLastChange: 'Last balance change',
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
    modelReasonCustomUnchecked: 'Custom model is not verified',
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
      unknown: 'Unknown error',
    },
    errorMessageProviderProtocolIncompatible: 'This relay is incompatible with the current image-edit protocol. Try another endpoint or provider profile.',
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
    empty: 'No history yet (｡•̀ᴗ-)✧',
    noPrompt: '(No prompt)',
    unknownProvider: 'Unknown provider',
    retry: 'Retry',
    download: 'Download',
    place: 'Place in Photoshop',
    resourceUnavailable: 'Resource unavailable',
  },
  settings: {
    configured: 'Configured',
    configuration: 'Configuration',
    providerProfiles: 'Provider Profiles',
    loading: 'Loading…',
    noProviderProfile: 'No provider profiles',
    config: 'Configuration',
    billing: 'Billing',
    billingMode: 'Billing mode',
    billingModeHint: 'Balance query stays optional and separate from generation availability.',
    billingDisabled: 'Billing is not configured for this profile.',
    billingRefresh: 'Refresh balance',
    billingRefreshing: 'Refreshing balance…',
    billingExpand: 'Expand',
    billingCollapse: 'Collapse',
    billingDetails: 'Billing details',
    billingBalanceLabel: 'Current balance',
    billingCheckedAt: 'Last checked',
    billingErrorStale: 'Latest refresh failed. Showing the last available balance.',
    billingUserId: 'New API user ID',
    billingUserIdHint: 'Use the integer user ID required by the billing panel.',
    billingAccessToken: 'Billing access token',
    billingAccessTokenHint: 'Stored securely and used only to query the balance.',
    billingAccessTokenSavedHint: 'Saved securely. Enter a new token to replace it, or remove it explicitly.',
    billingNotSupported: 'This provider preset does not expose a billing adapter yet.',
    billingValidationUserId: 'Billing user ID must be an integer.',
    billingValidationAccessToken: 'An access token is required for New API billing.',
    alias: 'Alias',
    baseUrlHint: 'If this provider does not auto-complete endpoint paths, enter the full API base URL such as https://example.com/v1',
    requestAddresses: 'Endpoints',
    endpointCurrent: 'Current',
    endpointEnabled: 'Enabled',
    addEndpoint: 'Add endpoint',
    autoSelect: 'Auto-select',
    speedTest: 'Test endpoint',
    testingSpeed: 'Testing endpoint…',
    endpointMeasurementUnsupported: 'Endpoint test unavailable for this provider.',
    providerConnectionUnsupported: 'Connection test unavailable for this provider.',
    autoSelectManaged: 'Endpoint selected automatically.',
    allEndpointsUnavailable: 'No endpoints are available. Check your network or add another endpoint.',
    endpointFailed: 'Failed',
    endpointTimeout: 'Timeout',
    endpointDns: 'DNS error',
    defaultModel: 'Default model',
    customModelId: 'Custom model ID',
    selectedModel: 'Selected model',
    chooseFromList: 'Choose from list',
    chooseFromListHint: 'Switch back to the discovered model list.',
    useCustomModelId: 'Use custom model ID',
    customModelHint: 'Use a custom model ID when the model is not listed.',
    modelListEmpty: 'No models found. Refresh or enter a custom model ID.',
    modelListFailed: 'Couldn’t load models. Retry or enter a custom model ID.',
    modelSavedUndiscovered: 'Saved model not found',
    modelCustomUnchecked: 'Configured model ID will be sent as-is. Availability is not verified yet.',
    modelSelectableOnly: 'Only supported models in the current list can be used.',
    connectionInfo: 'Connection info',
    noProfileSelected: 'No provider profile selected',
    savedSecretPlaceholder: 'Saved securely',
    apiKeyReplacePlaceholder: 'Enter a new API Key to replace it',
    accessTokenReplacePlaceholder: 'Enter a new Access Token to replace it',
    replaceSecret: 'Replace',
    removeSecret: 'Remove',
    secretRemovalPending: 'Will be removed after saving.',
    changesNotTested: 'Untested changes',
    modelListStale: 'Model list may not match unsaved changes.',
    modelDiscoveryUnsupported: 'Remote model discovery is not available for this API format yet.',
    modelDiscoveryFieldHelp: 'Model discovery is not available for this API format. Choose a preset model or enter a custom model ID.',
    apiProfile: 'API Profile',
    apiFormat: 'API Format',
    apiFormatAuto: 'Auto Detect',
    apiFormatRequired: 'Paste a supported full endpoint URL or path before saving.',
    apiFormatNeedsPath: 'API format not detected yet. Paste a supported full endpoint URL or path.',
    apiFormatUnsupported: 'Unsupported API format. Use OpenAI Images, OpenAI Chat Completions, or Gemini GenerateContent.',
    apiFormatDetected: (label) => `Detected ${label}.`,
    apiFormatIncomplete: (label) => `${label} detected, but required path settings are incomplete.`,
    apiFormatConflict: (current, next) => `This URL looks like ${next}. Create a separate profile instead of mixing it with ${current}.`,
    endpointOrPath: 'Endpoint URL or Path',
    endpointOrPathHint: 'Paste a full endpoint URL to split Base URL and path, or paste a path to update advanced settings.',
    advancedSettings: 'Advanced settings',
    generationPath: 'Generation Path',
    editPath: 'Edit Path',
    invokePath: 'Invoke Path',
    invokePathTemplate: 'Invoke Path Template',
    authMode: 'Auth mode',
    authModeFixedBearer: 'Auth mode: Bearer',
    duplicateDisplayName: (name) => `A Provider named "${name}" already exists.`,
    duplicateEndpointUrl: 'This endpoint already exists in this profile.',
    saveProvider: 'Save',
    savedButton: 'Saved',
    showApiKey: 'Show API Key',
    hideApiKey: 'Hide API Key',
    editApiKey: 'Edit API Key',
    refreshModels: 'Refresh models',
    refreshingModels: 'Refreshing…',
    testConnection: 'Test connection',
    testingConnection: 'Testing…',
    testNotTested: 'Not tested',
    testResultPrefix: 'Last test',
    saved: 'Saved',
    testSuccess: 'Connected',
    speedTestSuccess: 'Endpoint response time checked',
    connectionFailed: 'Connection failed',
    configValidNoModels: 'Configuration valid; no model list is available.',
    configValidProviderNoModels: 'Configuration valid; no available models were returned.',
    globalGeneration: 'Generation settings',
    promptSettings: 'Prompt Settings',
    promptOptimization: 'Prompt Optimization',
    optimizerProfile: 'Profile',
    none: 'None',
    optimizationTemplate: 'Template',
    templateValid: 'Use {prompt} exactly once.',
    templateInvalidReason: 'Invalid template: use exactly one lowercase {prompt}.',
    optimizationActive: 'Active: profile selected and template is valid.',
    optimizationNoProfile: 'Inactive: select a profile to enable.',
    optimizationInvalidTemplate: 'Inactive: fix the template placeholder.',
    optimizationMissingProfile: 'Inactive: saved profile is missing.',
    promptPresets: 'Prompt Presets',
    selectedPreset: 'Selected preset',
    presetNone: 'None',
    addPreset: 'Add preset',
    editPreset: 'Edit preset',
    presetName: 'Name',
    presetMode: 'Mode',
    presetModePrepend: 'Prepend',
    presetModeAppend: 'Append',
    presetModeReplace: 'Replace',
    presetContent: 'Content',
    presetContentValid: 'Valid content.',
    presetReplaceInvalid: 'Replace mode requires exactly one lowercase {prompt}.',
    selectProfileToEnable: 'Select a profile to enable.',
    systemInstructions: 'System instructions',
    systemInstructionsHint: 'Optional tone and style instructions for the model.',
    outputGroup: 'Output',
    inputGroup: 'Input',
    outputSize: 'Output size',
    outputSizeRequiresMainComposerContext: 'Change output size in the main composer.',
    outputFormat: 'Output format',
    aspectRatio: 'Aspect ratio',
    providerInputSizePreset: 'Input image size',
    providerInputSizePresetHint: 'Reference and captured images are resized locally before image-edit requests while preserving aspect ratio.',
    storageGroup: 'Storage',
    storageGroupHint: 'Runtime paths and generated-image output location.',
    logPath: 'Current log path',
    generatedImagePath: 'Generated image path',
    pathInfoUnavailable: 'Path information is unavailable in this environment.',
    footerStatement: 'Imagen PS by sinyuk. For internal use and research only.',
    saving: 'Saving…',
  },
  toast: {
    promptFilled: 'Prompt added',
    layerAdded: 'Layer added',
    layerReadFailed: 'Couldn’t read the layer',
    fileAdded: 'Image added',
    filePickFailed: 'Couldn’t select the image',
    fileNeedsNormalization: 'This image size isn’t supported here. Resize it, or use Capture or Layer.',
    captureAdded: 'Capture added',
    captureFailed: 'Couldn’t capture the Photoshop image',
    selectProviderProfileFirst: 'Add and select a provider profile first',
    noPlaceableImage: 'No image available to place',
    placedOnCanvas: 'Placed on the Photoshop canvas ✨',
    placeFailed: 'Failed to place in Photoshop',
    newSessionStarted: 'New session started ✨',
    waitForRunningTask: 'Wait for the running task to finish',
    historyNotInCurrentSession: 'This task is not in the current session',
    errorDetailsCopied: 'Error details copied',
    billingRefreshFailed: 'Balance refresh failed',
  },
  conversation: {
    jobFailed: 'Task failed.',
  },
};

const ZH_CN_MESSAGES: AppMessages = {
  common: {
    provider: 'Provider',
    providers: 'Providers',
    profile: '配置',
    prompt: '提示词',
    loading: '加载中…',
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
    noProviderProfile: '尚未添加 Provider 配置',
    loadingProfiles: '正在加载配置…',
    addProviderProfile: '添加 Provider 配置',
    currentSession: '当前会话',
    emptyHint: '今天想创造什么呢？✨',
    promptSuggestionProductValue: '生成一张粉色头发女孩的插画',
    promptSuggestionProductLabel: '粉发少女',
    promptSuggestionCyberpunkValue: '将这张图片转换为手绘插画',
    promptSuggestionCyberpunkLabel: '手绘风格',
    promptSuggestionLayerValue: '根据给定图片生成一张全身肖像',
    promptSuggestionLayerLabel: '全身肖像',
    reusePrompt: '复用提示词',
    submitJobRunning: '生成中…',
    noAssetPreview: '暂无预览',
    assetFallback: '资源',
    imageFallback: '图片',
    placePs: '置入 PS',
    placePsShort: '置入',
    placePsLong: '置入 Photoshop',
    placeActiveDocument: '置入当前文档',
    cannotPlace: '无法置入',
    placementActiveDocumentHint: '点击后置入当前 Photoshop 文档。',
    placementMultipleDocuments: '图片来自多个 Photoshop 文档，请仅保留同一文档的图片后再置入。',
    placementExactFrameHint: '置回原文档与原位置。',
    placementDocumentOnlyHint: '置入原文档。',
    placingPs: '置入中…',
    placedPs: '已置入',
    regenerate: '重新生成',
    copyPrompt: '复制提示词',
    copyResponse: '复制响应',
    requestId: 'Request ID',
    copyRequestId: '复制请求 ID',
    expandResponse: '展开响应',
    collapseResponse: '收起响应',
    textResult: '文本结果',
    psLayers: 'PS 图层',
    noAvailableLayers: '无可用图层',
    choosePsLayer: '从 PS 图层选择',
    uploadFromComputer: '从电脑上传',
    uploadFromComputerFormats: 'PNG / JPG / WebP',
    uploadFromComputerHint: '尺寸不支持时，请改用“捕获”或“图层”。',
    loadingModels: '加载模型…',
    noModelCandidates: '暂无可用模型',
    modelLoading: '加载中',
    modelUnselected: '未选择模型',
    promptPlaceholderReady: '描述你想要生成或编辑的图像',
    promptPlaceholderNoProfile: '请先添加 Provider 配置',
    addImage: '添加图片',
    capture: '捕获',
    captureActionHint: '捕获当前 Photoshop 图层或选区',
    captureCount: (count) => `${count} 个捕获`,
    captureLayer: 'Photoshop 图层捕获',
    captureSelection: 'Photoshop 选区捕获',
    send: '发送',
    referenceImage: '参考图',
    generatedImage: '生成图',
    download: '下载',
    layerCount: (count) => `${count} 个图层`,
    aspectRatio: '宽高比',
    aspectRatioAuto: '自动',
    aspectRatioSquare: '1:1',
    outputSize: '尺寸',
    outputSizeUnsupportedForModel: '该模型不支持此尺寸',
    outputSizeAutoChanged: (from, to) => `${from} 不可用；已改为 ${to}`,
    billingSummary: '余额',
    billingUnknown: '余额不可用',
    billingCost: '费用',
    billingObservedChange: '检测到的余额变化',
    billingLastCost: '上次精确费用',
    billingLastChange: '上次余额变化',
    promptOptimizePlaceholder: '暂未开放',
    layerKindSmartObject: '智能对象',
    layerKindPixel: '像素图层',
    layerKindText: '文字图层',
    layerKindGroup: '图层组',
    layerKindDefault: '图层',
    readinessReady: '就绪',
    readinessGenerationInProgress: '正在生成',
    readinessSelectProfile: '选择 Provider 配置',
    readinessCheckingProfile: '正在检查配置',
    readinessProfileLoadFailed: 'Provider 配置加载失败',
    readinessSelectModel: '请选择模型',
    readinessLoadingModels: '正在加载模型',
    readinessModelUnavailable: '当前所选模型不可用',
    readinessPreparingAttachment: '正在处理附件',
    readinessAttachmentFailed: '附件处理失败',
    readinessModelNoImageEdit: '当前模型不支持图片输入',
    readinessModelNoTextToImage: '当前模型不支持文生图',
    readinessSizeUnsupported: '当前尺寸不受支持',
    readinessPlacementConflict: '先解决置入冲突',
    readinessEnterPrompt: '请输入提示词',
    modelReasonNotRemotelyAvailable: '此模型在当前配置中不可用',
    modelReasonAuthFailed: 'Provider 认证失败',
    modelReasonProfileMisconfigured: 'Provider 配置不完整',
    modelReasonDiscoveryFailed: '模型列表获取失败',
    modelReasonCustomUnchecked: '自定义模型尚未验证',
    modelReasonNoImageEdit: '不支持图片输入',
    modelReasonNoTextToImage: '不支持文生图',
    modelReasonSizeUnsupported: (size) => `此模型不支持 ${size}`,
    imageInputDisabledForModel: '当前模型不支持图片输入',
    imageInputConflict: '已添加图片与当前模型不兼容。',
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
      'provider-protocol-incompatible': '中转协议不兼容',
      'provider-temporarily-unavailable': 'Provider 暂时不可用',
      'placement-conflict': '置入冲突',
      unknown: '未知错误',
    },
    errorMessageProviderProtocolIncompatible: '当前中转站不兼容此图像编辑协议，请更换端点或 Provider 配置。',
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
    empty: '暂无历史记录 (｡•̀ᴗ-)✧',
    noPrompt: '（无提示词）',
    unknownProvider: '未知 Provider',
    retry: '重试',
    download: '下载',
    place: '置入 Photoshop',
    resourceUnavailable: '资源不可用',
  },
  settings: {
    configured: '已配置',
    configuration: '配置',
    providerProfiles: 'Provider 配置',
    loading: '加载中…',
    noProviderProfile: '暂无 Provider 配置',
    config: '配置',
    billing: '余额与计费',
    billingMode: '计费模式',
    billingModeHint: '余额查询为可选项，不影响生成。',
    billingDisabled: '当前配置未启用余额查询。',
    billingRefresh: '刷新余额',
    billingRefreshing: '刷新中…',
    billingExpand: '展开',
    billingCollapse: '收起',
    billingDetails: '计费详情',
    billingBalanceLabel: '当前余额',
    billingCheckedAt: '上次检查',
    billingErrorStale: '刷新失败，已显示上次可用余额。',
    billingUserId: 'New API 用户 ID',
    billingUserIdHint: '填写计费面板要求的整数用户 ID。',
    billingAccessToken: '计费 Access Token',
    billingAccessTokenHint: '将安全保存，仅用于查询余额。',
    billingAccessTokenSavedHint: '已安全保存；输入新 Token 可替换，或点击“移除”。',
    billingNotSupported: '当前 Provider 暂不支持余额查询。',
    billingValidationUserId: '用户 ID 必须为整数。',
    billingValidationAccessToken: 'New API 余额查询需要 Access Token。',
    alias: '别名',
    baseUrlHint: '如果该 Provider 不会自动补全端点路径，请填写完整 API 基础地址，例如 https://example.com/v1',
    requestAddresses: '端点',
    endpointCurrent: '当前使用',
    endpointEnabled: '已启用',
    addEndpoint: '添加端点',
    autoSelect: '自动选择',
    speedTest: '测试端点',
    testingSpeed: '测试端点中…',
    endpointMeasurementUnsupported: '当前 Provider 不支持端点测试。',
    providerConnectionUnsupported: '当前 Provider 不支持连接测试。',
    autoSelectManaged: '端点由系统自动选择。',
    allEndpointsUnavailable: '暂无可用端点，请检查网络或添加新端点。',
    endpointFailed: '失败',
    endpointTimeout: '超时',
    endpointDns: 'DNS 解析失败',
    defaultModel: '默认模型',
    customModelId: '自定义模型 ID',
    selectedModel: '当前模型',
    chooseFromList: '从列表选择',
    chooseFromListHint: '切回已发现的模型列表。',
    useCustomModelId: '使用自定义模型 ID',
    customModelHint: '模型不在列表中时，可填写自定义模型 ID。',
    modelListEmpty: '未发现模型，请刷新或填写自定义模型 ID。',
    modelListFailed: '模型列表加载失败，请重试或填写自定义模型 ID。',
    modelSavedUndiscovered: '未发现已保存的模型',
    modelCustomUnchecked: '当前将按原样发送已配置模型 ID，但可用性尚未验证。',
    modelSelectableOnly: '仅可使用当前列表中已支持的模型。',
    connectionInfo: '连接信息',
    noProfileSelected: '未选择 Provider 配置',
    savedSecretPlaceholder: '已安全保存',
    apiKeyReplacePlaceholder: '输入新的 API Key 以替换',
    accessTokenReplacePlaceholder: '输入新的 Access Token 以替换',
    replaceSecret: '替换',
    removeSecret: '移除',
    secretRemovalPending: '保存后移除。',
    changesNotTested: '修改尚未测试',
    modelListStale: '模型列表可能与未保存的修改不一致。',
    modelDiscoveryUnsupported: '当前 API 格式暂不支持远端模型发现。',
    modelDiscoveryFieldHelp: '当前 API 格式不支持模型发现。请选择预设模型，或填写自定义模型 ID。',
    apiProfile: 'API 配置',
    apiFormat: 'API 格式',
    apiFormatAuto: '自动检测',
    apiFormatRequired: '保存前请粘贴受支持的完整端点 URL 或路径。',
    apiFormatNeedsPath: '尚未检测到 API 格式。请粘贴受支持的完整端点 URL 或路径。',
    apiFormatUnsupported: '暂不支持此 API 格式。请使用 OpenAI Images、OpenAI Chat Completions 或 Gemini GenerateContent。',
    apiFormatDetected: (label) => `已检测到 ${label}。`,
    apiFormatIncomplete: (label) => `已检测到 ${label}，但必填路径设置还不完整。`,
    apiFormatConflict: (current, next) => `此 URL 看起来是 ${next}。请为它新建配置，不要和 ${current} 混用。`,
    endpointOrPath: '端点 URL 或路径',
    endpointOrPathHint: '粘贴完整端点 URL 会自动拆分 Base URL 和路径；粘贴路径只更新高级设置。',
    advancedSettings: '高级设置',
    generationPath: '生成路径',
    editPath: '编辑路径',
    invokePath: '调用路径',
    invokePathTemplate: '调用路径模板',
    authMode: '认证模式',
    authModeFixedBearer: '认证模式：Bearer',
    duplicateDisplayName: (name) => `已存在名为“${name}”的 Provider。`,
    duplicateEndpointUrl: '当前配置中已存在此端点。',
    saveProvider: '保存',
    savedButton: '已保存',
    showApiKey: '显示 API Key',
    hideApiKey: '隐藏 API Key',
    editApiKey: '编辑 API Key',
    refreshModels: '刷新模型',
    refreshingModels: '刷新中…',
    testConnection: '测试连接',
    testingConnection: '测试中…',
    testNotTested: '未测试',
    testResultPrefix: '上次测试',
    saved: '已保存',
    testSuccess: '连接成功',
    speedTestSuccess: '已检查端点响应时间',
    connectionFailed: '连接失败',
    configValidNoModels: '配置有效；未提供模型列表。',
    configValidProviderNoModels: '配置有效；服务端未返回可用模型。',
    globalGeneration: '生成设置',
    promptSettings: '提示词设置',
    promptOptimization: '提示词优化',
    optimizerProfile: '配置',
    none: '无',
    optimizationTemplate: '模板',
    templateValid: '恰好使用一次 {prompt}。',
    templateInvalidReason: '模板无效：必须恰好包含一个小写 {prompt}。',
    optimizationActive: '已启用：已选择配置，且模板有效。',
    optimizationNoProfile: '未启用：选择配置后启用。',
    optimizationInvalidTemplate: '未启用：请修正模板占位符。',
    optimizationMissingProfile: '未启用：已保存的配置不存在。',
    promptPresets: '提示词预设',
    selectedPreset: '当前预设',
    presetNone: '无',
    addPreset: '添加预设',
    editPreset: '编辑预设',
    presetName: '名称',
    presetMode: '模式',
    presetModePrepend: '前置',
    presetModeAppend: '后置',
    presetModeReplace: '替换',
    presetContent: '内容',
    presetContentValid: '内容有效。',
    presetReplaceInvalid: '替换模式必须恰好包含一个小写 {prompt}。',
    selectProfileToEnable: '选择配置后启用。',
    systemInstructions: '系统指令',
    systemInstructionsHint: '可选的模型语气与风格指令。',
    outputGroup: '输出',
    inputGroup: '输入',
    outputSize: '输出尺寸',
    outputSizeRequiresMainComposerContext: '请在主编辑区修改输出尺寸。',
    outputFormat: '输出格式',
    aspectRatio: '宽高比',
    providerInputSizePreset: '输入图片尺寸',
    providerInputSizePresetHint: '参考图与捕获图会在发送编辑请求前本地缩放，并保持宽高比。',
    storageGroup: '存储',
    storageGroupHint: '运行路径与生成图片保存位置。',
    logPath: '当前日志路径',
    generatedImagePath: '生成图片路径',
    pathInfoUnavailable: '当前环境无法获取路径信息。',
    footerStatement: 'Imagen PS by sinyuk。仅供内部使用与研究。',
    saving: '保存中…',
  },
  toast: {
    promptFilled: '已填入提示词',
    layerAdded: '已添加图层',
    layerReadFailed: '图层读取失败',
    fileAdded: '已添加图片',
    filePickFailed: '图片选择失败',
    fileNeedsNormalization: '当前不支持此图片尺寸，请先缩放，或改用“捕获”或“图层”。',
    captureAdded: '捕获内容已添加',
    captureFailed: 'Photoshop 图像捕获失败',
    selectProviderProfileFirst: '请先添加并选择 Provider 配置',
    noPlaceableImage: '没有可置入的图片',
    placedOnCanvas: '已置入 Photoshop 画布 ✨',
    placeFailed: '置入 Photoshop 失败',
    newSessionStarted: '新会话已开启 ✨',
    waitForRunningTask: '请等待当前任务完成',
    historyNotInCurrentSession: '该任务属于其他会话',
    errorDetailsCopied: '错误详情已复制',
    billingRefreshFailed: '余额刷新失败',
  },
  conversation: {
    jobFailed: '任务失败。',
  },
};

export const APP_MESSAGES: Record<SupportedLocale, AppMessages> = {
  en: EN_MESSAGES,
  'zh-CN': ZH_CN_MESSAGES,
};
