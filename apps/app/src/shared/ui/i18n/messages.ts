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
    readonly providerProfiles: string;
    readonly loading: string;
    readonly noProviderProfile: string;
    readonly config: string;
    readonly billing: string;
    readonly billingMode: string;
    readonly billingModeHint: string;
    readonly billingUseCurrentApiKey: string;
    readonly billingUseBillingToken: string;
    readonly billingDisabled: string;
    readonly billingRefresh: string;
    readonly billingRefreshing: string;
    readonly billingExpand: string;
    readonly billingCollapse: string;
    readonly billingDetails: string;
    readonly billingBalanceLabel: string;
    readonly billingCheckedAt: string;
    readonly billingErrorStale: string;
    readonly billingPath: string;
    readonly billingPathHint: string;
    readonly billingUserId: string;
    readonly billingUserIdHint: string;
    readonly billingAccessToken: string;
    readonly billingAccessTokenHint: string;
    readonly billingAccessTokenSavedHint: string;
    readonly billingNotSupported: string;
    readonly billingValidationPath: string;
    readonly billingValidationApiKey: string;
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
    readonly selectedModel: string;
    readonly chooseFromList: string;
    readonly modelSelectionEmpty: string;
    readonly modelSelectionCreateFirst: string;
    readonly chooseFromListHint: string;
    readonly modelListEmpty: string;
    readonly modelListFailed: string;
    readonly modelSavedUndiscovered: string;
    readonly modelSelectableOnly: string;
    readonly connectionInfo: string;
    readonly noProfileSelected: string;
    readonly savedSecretPlaceholder: string;
    readonly apiKeyReplacePlaceholder: string;
    readonly accessTokenReplacePlaceholder: string;
    readonly replaceSecret: string;
    readonly clearField: string;
    readonly removeSecret: string;
    readonly secretRemovalPending: string;
    readonly changesNotTested: string;
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
    readonly modelConfiguration: string;
    readonly modelConfigurationSummary: string;
    readonly onboardingTitle: string;
    readonly onboardingIntro: string;
    readonly onboardingStepModelConfiguration: string;
    readonly onboardingStepProviderProfile: string;
    readonly onboardingStepReturnHome: string;
    readonly onboardingHint: string;
    readonly onboardingHelp: string;
    readonly modelConfigurationEmpty: string;
    readonly modelConfigurationHint: string;
    readonly modelConfigurationSaveHint: string;
    readonly addNewModel: string;
    readonly discoveredModels: string;
    readonly discoverySuggestion: string;
    readonly createModelConfiguration: string;
    readonly editModelConfiguration: string;
    readonly modelConfigPreset: string;
    readonly modelConfigApiFormat: string;
    readonly modelConfigModelId: string;
    readonly modelConfigWireModelId: string;
    readonly modelConfigWireModelIdHint: string;
    readonly modelConfigWireModelMeta: (modelId: string) => string;
    readonly modelConfigRequestStrategy: string;
    readonly modelConfigManagedByPreset: string;
    readonly modelConfigMatrixCells: string;
    readonly modelConfigOutputCapabilities: string;
    readonly modelConfigSharedScope: string;
    readonly modelConfigOutputFormat: string;
    readonly modelConfigAspectRatio: string;
    readonly modelConfigOutputSize: string;
    readonly modelConfigOperationTextToImage: string;
    readonly modelConfigOperationEditImage: string;
    readonly modelConfigRatioAuto: string;
    readonly modelConfigRatioSource: string;
    readonly modelConfigNormalizationWarning: string;
    readonly modelConfigSparseCombinationHint: string;
    readonly modelConfigValidationOutputFormat: string;
    readonly modelConfigValidationAspectRatio: string;
    readonly modelConfigValidationResolution: string;
    readonly modelConfigModuleSummary: (formats: number, ratios: number, resolutions: number) => string;
    readonly modelConfigSizeFormatSummary: (formats: number, sizes: number) => string;
    readonly modelConfigValidCombinations: (count: number) => string;
    readonly modelConfigSelection: string;
    readonly modelConfigProfileList: string;
    readonly modelConfigUnconfigured: string;
    readonly modelConfigConfigured: string;
    readonly modelConfigCatalogSource: string;
    readonly modelConfigUserSource: string;
    readonly modelConfigSelectAtLeastOne: string;
    readonly modelConfigValidationApiFormat: string;
    readonly modelConfigValidationModelId: string;
    readonly modelConfigValidationPreset: string;
    readonly modelConfigValidationStrategy: string;
    readonly modelConfigValidationMatrixCells: string;
    readonly modelConfigConfigureModel: string;
    readonly modelConfigEditModel: string;
    readonly modelConfigSelectedTag: string;
    readonly modelConfigSelectedEmpty: string;
    readonly promptOptimization: string;
    readonly promptSettingsSummary: string;
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
    readonly useInputSizeNormalizedHint: string;
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
    providerProfiles: 'Provider Profiles',
    loading: 'Loading…',
    noProviderProfile: 'No profiles (´･ω･`)',
    config: 'Configuration',
    billing: 'Billing',
    billingMode: 'Billing query',
    billingModeHint: 'Balance query stays optional and separate from generation availability.',
    billingUseCurrentApiKey: 'Use current API key',
    billingUseBillingToken: 'Use billing token',
    billingDisabled: 'Billing is not configured for this profile.',
    billingRefresh: 'Refresh balance',
    billingRefreshing: 'Refreshing balance…',
    billingExpand: 'Expand',
    billingCollapse: 'Collapse',
    billingDetails: 'Billing details',
    billingBalanceLabel: 'Current balance',
    billingCheckedAt: 'Last checked',
    billingErrorStale: 'Latest refresh failed. Showing the last available balance.',
    billingPath: 'Billing path',
    billingPathHint: 'Use a root-relative path, for example /client/openapi/getCredits.',
    billingUserId: 'User ID (optional)',
    billingUserIdHint: 'Only needed by protocols that require a user identifier.',
    billingAccessToken: 'Billing token',
    billingAccessTokenHint: 'Stored securely and used only to query the balance.',
    billingAccessTokenSavedHint: 'Used only to query balance. Saved securely.',
    billingNotSupported: 'This provider preset does not expose a billing adapter yet.',
    billingValidationPath: 'Billing path is required and must start with "/".',
    billingValidationApiKey: 'Current API key mode requires a saved API key.',
    billingValidationUserId: 'Billing user ID is invalid.',
    billingValidationAccessToken: 'A billing token is required for token mode.',
    alias: 'Alias',
    baseUrlHint: 'Enter API base URL, e.g. https://example.com/v1',
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
    selectedModel: 'Selected model',
    chooseFromList: 'Choose from list',
    modelSelectionEmpty: 'No saved model configurations are available for this profile yet.',
    modelSelectionCreateFirst: 'Create a model config first, then return to select it.',
    chooseFromListHint: 'Switch back to the discovered model list.',
    modelListEmpty: 'No models (´･ω･`)',
    modelListFailed: 'Couldn’t load models. Retry to fetch the supported list.',
    modelSavedUndiscovered: 'Saved model not found',
    modelSelectableOnly: 'Only supported models in the current list can be used.',
    connectionInfo: 'Connection info',
    noProfileSelected: 'No provider profile selected',
    savedSecretPlaceholder: 'Saved securely',
    apiKeyReplacePlaceholder: 'Enter a new API Key to replace it',
    accessTokenReplacePlaceholder: 'Enter a new Access Token to replace it',
    replaceSecret: 'Replace',
    clearField: 'Clear',
    removeSecret: 'Remove',
    secretRemovalPending: 'Will be removed after saving.',
    changesNotTested: 'Untested changes',
    modelDiscoveryUnsupported: 'Remote model discovery is not available for this API format yet.',
    modelDiscoveryFieldHelp: 'Choose a supported preset model.',
    apiProfile: 'API Profile',
    apiFormat: 'API Format',
    apiFormatAuto: 'Auto Detect',
    apiFormatRequired: 'Paste a supported full endpoint URL or path before saving.',
    apiFormatNeedsPath: 'Paste a supported URL or path.',
    apiFormatUnsupported: 'Unsupported API format. Use OpenAI Images, OpenAI Chat Completions, or Gemini GenerateContent.',
    apiFormatDetected: (label) => `Detected ${label}.`,
    apiFormatIncomplete: (label) => `${label} detected, but path settings are incomplete.`,
    apiFormatConflict: (current, next) => `This URL looks like ${next}, not ${current}.`,
    endpointOrPath: 'Endpoint URL or Path',
    endpointOrPathHint: 'URL splits into base URL and path.',
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
    testSuccess: 'Connected ( •̀ ω •́ )✧',
    speedTestSuccess: 'Endpoint response time checked',
    connectionFailed: 'Connection failed',
    configValidNoModels: 'Config valid; no models.',
    configValidProviderNoModels: 'Config valid; no models.',
    globalGeneration: 'Generation settings',
    promptSettings: 'Prompt Settings',
    modelConfiguration: 'Model Configuration',
    modelConfigurationSummary: 'Reusable model mappings',
    onboardingTitle: 'Quick setup order',
    onboardingIntro: 'First time here, follow this order to avoid backtracking.',
    onboardingStepModelConfiguration: 'Save reusable model mappings first.',
    onboardingStepProviderProfile: 'Then add a provider profile and choose which model config it should use.',
    onboardingStepReturnHome: 'Return to the main page, select that profile and model, then start generating.',
    onboardingHint: 'Use the question button in Configuration to reopen this guide later.',
    onboardingHelp: 'Open quick setup guide',
    modelConfigurationEmpty: 'No model configs (´･ω･`)',
    modelConfigurationHint: 'Create reusable model configs.',
    modelConfigurationSaveHint: 'Saving does not apply it.',
    addNewModel: 'Add new model',
    discoveredModels: 'Discovered suggestions',
    discoverySuggestion: 'Suggestion; save before use',
    createModelConfiguration: 'Create model config',
    editModelConfiguration: 'Edit model config',
    modelConfigPreset: 'Preset',
    modelConfigApiFormat: 'API format',
    modelConfigModelId: 'Model ID',
    modelConfigWireModelId: 'Request model ID',
    modelConfigWireModelIdHint: 'Only changes model sent to API. Does not change capability configuration.',
    modelConfigWireModelMeta: (modelId) => `Request model: ${modelId}`,
    modelConfigRequestStrategy: 'Request strategy',
    modelConfigManagedByPreset: 'Managed by preset.',
    modelConfigMatrixCells: 'Output options',
    modelConfigOutputCapabilities: 'Output capabilities',
    modelConfigSharedScope: 'Text + Edit',
    modelConfigOutputFormat: 'Output format',
    modelConfigAspectRatio: 'Aspect ratio',
    modelConfigOutputSize: 'Output size',
    modelConfigOperationTextToImage: 'Text to Image',
    modelConfigOperationEditImage: 'Edit Image',
    modelConfigRatioAuto: 'Auto',
    modelConfigRatioSource: 'Source',
    modelConfigNormalizationWarning: 'Saving updates current output rules.',
    modelConfigSparseCombinationHint: 'Some options cannot be combined.',
    modelConfigValidationOutputFormat: 'Keep at least one output format.',
    modelConfigValidationAspectRatio: 'Keep at least one aspect ratio.',
    modelConfigValidationResolution: 'Keep at least one resolution.',
    modelConfigModuleSummary: (formats, ratios, resolutions) => `${formats} formats · ${ratios} ratios · ${resolutions} resolutions`,
    modelConfigSizeFormatSummary: (formats, sizes) => `${formats} formats · ${sizes} sizes`,
    modelConfigValidCombinations: (count) => `${count} valid combinations`,
    modelConfigSelection: 'Profile selection',
    modelConfigProfileList: 'Profile models',
    modelConfigUnconfigured: 'Needs configuration before selection.',
    modelConfigConfigured: 'Saved model config.',
    modelConfigCatalogSource: 'Catalog preset',
    modelConfigUserSource: 'Saved model configuration',
    modelConfigSelectAtLeastOne: 'Select at least one value.',
    modelConfigValidationApiFormat: 'Choose an API format.',
    modelConfigValidationModelId: 'Model ID is required.',
    modelConfigValidationPreset: 'Choose an official preset.',
    modelConfigValidationStrategy: 'Choose a valid request strategy.',
    modelConfigValidationMatrixCells: 'Keep at least one output option for each operation type.',
    modelConfigConfigureModel: 'Configure model',
    modelConfigEditModel: 'Edit config',
    modelConfigSelectedTag: 'Selected',
    modelConfigSelectedEmpty: 'No saved model configurations in this profile yet.',
    promptOptimization: 'Prompt Optimization',
    promptSettingsSummary: 'Templates and presets',
    optimizerProfile: 'Profile',
    none: 'None',
    optimizationTemplate: 'Template',
    templateValid: 'Template valid ( •̀ ω •́ )✧',
    templateInvalidReason: 'Keep exactly one {prompt}.',
    optimizationActive: 'Active',
    optimizationNoProfile: 'Select a profile to enable.',
    optimizationInvalidTemplate: 'Fix the placeholder.',
    optimizationMissingProfile: 'Saved profile is missing.',
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
    presetContentValid: 'Content valid ( •̀ ω •́ )✧',
    presetReplaceInvalid: 'Replace mode needs exactly one {prompt}.',
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
    providerInputSizePresetHint: 'Input images resize locally before sending.',
    useInputSizeNormalizedHint: 'Use Input Size follows the first input.',
    storageGroup: 'Storage',
    storageGroupHint: 'Runtime paths and image output.',
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
    profile: 'Provider 配置',
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
    billingSummary: '余额',
    billingUnknown: '余额不可用',
    billingCost: '费用',
    billingObservedChange: '余额变化',
    billingLastCost: '上次费用',
    billingLastChange: '上次变化',
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
      unknown: '未知错误',
    },
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
    configuration: 'Provider 设置',
    providerProfiles: 'Provider 配置',
    loading: '加载中…',
    noProviderProfile: '暂无 Provider 配置 (´･ω･`)',
    config: '配置',
    billing: '余额与计费',
    billingMode: '余额查询',
    billingModeHint: '余额查询不影响生成。',
    billingUseCurrentApiKey: '使用当前 API Key',
    billingUseBillingToken: '使用独立 Token',
    billingDisabled: '未启用余额查询。',
    billingRefresh: '刷新余额',
    billingRefreshing: '刷新中…',
    billingExpand: '展开',
    billingCollapse: '收起',
    billingDetails: '计费详情',
    billingBalanceLabel: '当前余额',
    billingCheckedAt: '上次检查',
    billingErrorStale: '刷新失败，已显示上次可用余额。',
    billingPath: '查询路径',
    billingPathHint: '填写根路径，例如 /client/openapi/getCredits。',
    billingUserId: '用户 ID（可选）',
    billingUserIdHint: '仅在某些需要用户标识的协议下使用。',
    billingAccessToken: '计费 Token',
    billingAccessTokenHint: '仅用于查询余额。',
    billingAccessTokenSavedHint: '仅用于查询余额，已安全保存。',
    billingNotSupported: '暂不支持余额查询。',
    billingValidationPath: '查询路径必填，且必须以 / 开头。',
    billingValidationApiKey: '当前 API Key 模式需要已保存或当前填写的 API Key。',
    billingValidationUserId: '用户 ID 无效。',
    billingValidationAccessToken: 'Token 模式需要计费 Token。',
    alias: '别名',
    baseUrlHint: '填写 API 基础地址，如 https://example.com/v1',
    requestAddresses: '端点',
    endpointCurrent: '当前使用',
    endpointEnabled: '已启用',
    addEndpoint: '添加端点',
    autoSelect: '自动选择',
    speedTest: '测试端点',
    testingSpeed: '测试端点中…',
    endpointMeasurementUnsupported: '当前 Provider 不支持端点测试。',
    providerConnectionUnsupported: '当前 Provider 不支持连接测试。',
    autoSelectManaged: '端点自动选择。',
    allEndpointsUnavailable: '暂无可用端点。',
    endpointFailed: '失败',
    endpointTimeout: '超时',
    endpointDns: 'DNS 解析失败',
    selectedModel: '当前模型',
    chooseFromList: '从列表选择',
    modelSelectionEmpty: '暂无可用模型配置',
    modelSelectionCreateFirst: '请先创建模型配置',
    chooseFromListHint: '切回模型列表。',
    modelListEmpty: '暂无模型 (´･ω･`)',
    modelListFailed: '模型加载失败，请重试。',
    modelSavedUndiscovered: '未发现已保存的模型',
    modelSelectableOnly: '仅可使用列表模型。',
    connectionInfo: '连接信息',
    noProfileSelected: '未选择 Provider 配置',
    savedSecretPlaceholder: '已安全保存',
    apiKeyReplacePlaceholder: '输入新的 API Key 以替换',
    accessTokenReplacePlaceholder: '输入新的 Access Token 以替换',
    replaceSecret: '替换',
    clearField: '清空',
    removeSecret: '移除',
    secretRemovalPending: '保存后移除。',
    changesNotTested: '修改尚未测试',
    modelDiscoveryUnsupported: '暂不支持模型发现。',
    modelDiscoveryFieldHelp: '请选择支持的预设模型。',
    apiProfile: 'API 配置',
    apiFormat: 'API 格式',
    apiFormatAuto: '自动检测',
    apiFormatRequired: '请填写支持的 URL 或路径。',
    apiFormatNeedsPath: '请填写支持的 URL 或路径。',
    apiFormatUnsupported: '暂不支持此 API 格式。',
    apiFormatDetected: (label) => `已检测到 ${label}。`,
    apiFormatIncomplete: (label) => `已识别为 ${label}，但路径配置不完整。`,
    apiFormatConflict: (current, next) => `此 URL 像 ${next}，非 ${current}。`,
    endpointOrPath: '端点 URL 或路径',
    endpointOrPathHint: 'URL 会自动拆分地址和路径。',
    advancedSettings: '高级设置',
    generationPath: '生成路径',
    editPath: '编辑路径',
    invokePath: '调用路径',
    invokePathTemplate: '调用路径模板',
    authMode: '认证模式',
    authModeFixedBearer: '认证模式：Bearer',
    duplicateDisplayName: (name) => `已存在名为“${name}”的 Provider。`,
    duplicateEndpointUrl: '此端点已存在。',
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
    testSuccess: '连接成功 ( •̀ ω •́ )✧',
    speedTestSuccess: '响应时间已检查',
    connectionFailed: '连接失败',
    configValidNoModels: '配置有效，无模型',
    configValidProviderNoModels: '配置有效，无模型',
    globalGeneration: '生成设置',
    promptSettings: '提示词设置',
    modelConfiguration: '模型配置',
    modelConfigurationSummary: '复用模型映射',
    onboardingTitle: '首次配置顺序',
    onboardingIntro: '第一次来这里，按这个顺序配置最省事。',
    onboardingStepModelConfiguration: '先保存可复用的模型映射。',
    onboardingStepProviderProfile: '再添加 Provider 配置，并选择它要使用的模型配置。',
    onboardingStepReturnHome: '最后回到首页，选择该配置和模型后开始生成。',
    onboardingHint: '以后可在 Provider 设置页点问号再次查看。',
    onboardingHelp: '重新打开新手说明',
    modelConfigurationEmpty: '暂无模型配置 (´･ω･`)',
    modelConfigurationHint: '创建可复用模型配置。',
    modelConfigurationSaveHint: '保存后不会自动应用。',
    addNewModel: '添加新模型',
    discoveredModels: '发现建议',
    discoverySuggestion: '建议项，保存后才能使用',
    createModelConfiguration: '新建模型配置',
    editModelConfiguration: '编辑模型配置',
    modelConfigPreset: '预设',
    modelConfigApiFormat: 'API 格式',
    modelConfigModelId: '模型 ID',
    modelConfigWireModelId: '请求模型 ID',
    modelConfigWireModelIdHint: '仅修改发送给接口的模型，不改变能力配置。',
    modelConfigWireModelMeta: (modelId) => `请求模型：${modelId}`,
    modelConfigRequestStrategy: '请求策略',
    modelConfigManagedByPreset: '由预设管理',
    modelConfigMatrixCells: '输出选项',
    modelConfigOutputCapabilities: '输出能力',
    modelConfigSharedScope: '文生图 + 编辑',
    modelConfigOutputFormat: '输出格式',
    modelConfigAspectRatio: '宽高比',
    modelConfigOutputSize: '输出尺寸',
    modelConfigOperationTextToImage: '文生图',
    modelConfigOperationEditImage: '编辑图片',
    modelConfigRatioAuto: '自动',
    modelConfigRatioSource: '跟随输入图',
    modelConfigNormalizationWarning: '保存后更新为当前输出规则。',
    modelConfigSparseCombinationHint: '部分选项无法组合使用。',
    modelConfigValidationOutputFormat: '至少保留一种输出格式。',
    modelConfigValidationAspectRatio: '至少保留一种宽高比。',
    modelConfigValidationResolution: '至少保留一种分辨率。',
    modelConfigModuleSummary: (formats, ratios, resolutions) => `${formats} 格式 · ${ratios} 比例 · ${resolutions} 尺寸`,
    modelConfigSizeFormatSummary: (formats, sizes) => `${formats} 格式 · ${sizes} 尺寸`,
    modelConfigValidCombinations: (count) => `${count} 个有效组合`,
    modelConfigSelection: '配置选择',
    modelConfigProfileList: '配置模型',
    modelConfigUnconfigured: '完成配置后即可选择。',
    modelConfigConfigured: '已保存模型配置',
    modelConfigCatalogSource: '内置预设',
    modelConfigUserSource: '已保存模型配置',
    modelConfigSelectAtLeastOne: '至少选择一项。',
    modelConfigValidationApiFormat: '请选择 API 格式。',
    modelConfigValidationModelId: '模型 ID 不能为空。',
    modelConfigValidationPreset: '请选择官方预设。',
    modelConfigValidationStrategy: '请选择有效的请求策略。',
    modelConfigValidationMatrixCells: '每种操作类型至少保留一个输出选项。',
    modelConfigConfigureModel: '配置模型',
    modelConfigEditModel: '编辑配置',
    modelConfigSelectedTag: '已选中',
    modelConfigSelectedEmpty: '暂无已选模型配置',
    promptOptimization: '提示词优化',
    promptSettingsSummary: '模板与预设',
    optimizerProfile: 'Provider 配置',
    none: '无',
    optimizationTemplate: '模板',
    templateValid: '模板有效 ( •̀ ω •́ )✧',
    templateInvalidReason: '仅保留一个 {prompt}。',
    optimizationActive: '已启用',
    optimizationNoProfile: '选择 Provider 配置后启用。',
    optimizationInvalidTemplate: '请修正占位符。',
    optimizationMissingProfile: '已保存配置不存在。',
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
    presetContentValid: '内容有效 ( •̀ ω •́ )✧',
    presetReplaceInvalid: '替换模式仅需一个 {prompt}。',
    selectProfileToEnable: '选择 Provider 配置后启用。',
    systemInstructions: '系统指令',
    systemInstructionsHint: '可选语气与风格指令。',
    outputGroup: '输出',
    inputGroup: '输入',
    outputSize: '输出尺寸',
    outputSizeRequiresMainComposerContext: '请在主编辑区修改。',
    outputFormat: '输出格式',
    aspectRatio: '宽高比',
    providerInputSizePreset: '输入图片尺寸',
    providerInputSizePresetHint: '发送前本地缩放输入图。',
    useInputSizeNormalizedHint: 'Use Input Size 会跟随首图。',
    storageGroup: '存储',
    storageGroupHint: '运行与图片保存路径。',
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
