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
    readonly placePsLong: string;
    readonly placingPs: string;
    readonly placedPs: string;
    readonly regenerate: string;
    readonly copyPrompt: string;
    readonly copyResponse: string;
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
    readonly promptOptimize: string;
    readonly promptRefine: string;
    readonly promptOptimizePlaceholder: string;
    readonly promptOptimizeUndo: string;
    readonly promptOptimizing: string;
    readonly promptOptimizeNoProfile: string;
    readonly promptOptimizeEmpty: string;
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
    readonly config: string;
    readonly promptBehavior: string;
    readonly instruction: string;
    readonly instructionPlaceholder: string;
    readonly alias: string;
    readonly baseUrlHint: string;
    readonly defaultModel: string;
    readonly customModelId: string;
    readonly selectedModel: string;
    readonly chooseFromList: string;
    readonly chooseFromListHint: string;
    readonly useCustomModelId: string;
    readonly customModelHint: string;
    readonly modelListEmpty: string;
    readonly modelListFailed: string;
    readonly connectionInfo: string;
    readonly noProfileSelected: string;
    readonly savedSecretPlaceholder: string;
    readonly showApiKey: string;
    readonly hideApiKey: string;
    readonly refreshModels: string;
    readonly refreshingModels: string;
    readonly testConnection: string;
    readonly testingConnection: string;
    readonly testResultPrefix: string;
    readonly saved: string;
    readonly testSuccess: string;
    readonly connectionFailed: string;
    readonly configValidNoModels: string;
    readonly configValidProviderNoModels: string;
    readonly selectProviderType: string;
    readonly globalGeneration: string;
    readonly outputGroup: string;
    readonly inputGroup: string;
    readonly outputSize: string;
    readonly outputFormat: string;
    readonly aspectRatio: string;
    readonly providerInputMaxSide: string;
    readonly providerInputMaxSideHint: string;
    readonly resultDisplayGroup: string;
    readonly showProviderResponseText: string;
    readonly showProviderResponseTextHint: string;
    readonly showProviderResponseTextSessionHint: string;
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
    emptyHint: 'What would you like to create? Pick a profile, describe your image, and send.',
    promptSuggestionProductValue: 'A blue glass perfume bottle in product photography style with soft studio lighting',
    promptSuggestionProductLabel: 'Product photo of a blue glass perfume bottle',
    promptSuggestionCyberpunkValue: 'Turn the reference image into a cyberpunk night scene while preserving the subject outline',
    promptSuggestionCyberpunkLabel: 'Cyberpunk night reference edit',
    promptSuggestionLayerValue: 'Use the selected Photoshop layer as a base and generate a fantasy forest environment around it',
    promptSuggestionLayerLabel: 'Generate around the current PS layer',
    reusePrompt: 'Reuse Prompt',
    submitJobRunning: 'Generating...',
    noAssetPreview: 'No asset preview',
    assetFallback: 'Asset',
    imageFallback: 'image',
    placePs: 'Place in PS',
    placePsLong: 'Place in Photoshop',
    placingPs: 'Placing...',
    placedPs: 'Placed',
    regenerate: 'Regenerate',
    copyPrompt: 'Copy Prompt',
    copyResponse: 'Copy response',
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
    promptOptimize: 'Optimize prompt',
    promptRefine: 'Refine',
    promptOptimizePlaceholder: 'Coming soon',
    promptOptimizeUndo: 'Undo',
    promptOptimizing: 'Optimizing…',
    promptOptimizeNoProfile: 'Configure Prompt Optimizer in Providers',
    promptOptimizeEmpty: 'Enter a prompt first',
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
    config: 'Configuration',
    promptBehavior: 'Prompt behavior',
    instruction: 'Instruction',
    instructionPlaceholder: 'System instruction for prompt optimization',
    alias: 'Alias',
    baseUrlHint: 'If this provider does not auto-complete endpoint paths, enter the full API base URL such as https://example.com/v1',
    defaultModel: 'Default model',
    customModelId: 'Custom model id',
    selectedModel: 'Selected model',
    chooseFromList: 'Choose from list',
    chooseFromListHint: 'Switch back to the discovered model list.',
    useCustomModelId: 'Use custom model id',
    customModelHint: 'Use a custom model id when the model is not in the list.',
    modelListEmpty: 'No models available. Refresh the model list or enter a custom model id.',
    modelListFailed: 'Model list unavailable. Refresh the model list or enter a custom model id.',
    connectionInfo: 'Connection info',
    noProfileSelected: 'No Provider profile selected',
    savedSecretPlaceholder: 'Saved; leave blank to keep unchanged',
    showApiKey: 'Show API Key',
    hideApiKey: 'Hide API Key',
    refreshModels: 'Refresh model list',
    refreshingModels: 'Refreshing...',
    testConnection: 'Test connection',
    testingConnection: 'Testing...',
    testResultPrefix: 'Latest test result',
    saved: 'Saved',
    testSuccess: 'Connected',
    connectionFailed: 'Connection failed',
    configValidNoModels: 'Configuration is valid; no model list found',
    configValidProviderNoModels: 'Configuration is valid; this provider returned no available model list',
    selectProviderType: 'Choose a Provider type',
    globalGeneration: 'Generation settings',
    outputGroup: 'Output',
    inputGroup: 'Input',
    outputSize: 'Output size',
    outputFormat: 'Output format',
    aspectRatio: 'Aspect ratio',
    providerInputMaxSide: 'Provider input max side',
    providerInputMaxSideHint: 'Reference and captured images are resized before provider edit requests.',
    resultDisplayGroup: 'Result display',
    showProviderResponseText: 'Show provider response text',
    showProviderResponseTextHint:
      'Provider-returned text is shown in generated results. This changes UI display only and does not change the generation request.',
    showProviderResponseTextSessionHint: 'Response text is current-session-only and is not written into history.',
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
    emptyHint: '想生成或编辑什么图像？选择模型，输入描述，然后发送。',
    promptSuggestionProductValue: '一张产品摄影风格的蓝色玻璃香水瓶，柔和棚拍光线',
    promptSuggestionProductLabel: '产品摄影风格的蓝色玻璃香水瓶',
    promptSuggestionCyberpunkValue: '把参考图改成赛博朋克夜景，保留主体轮廓',
    promptSuggestionCyberpunkLabel: '参考图改成赛博朋克夜景',
    promptSuggestionLayerValue: '使用当前 PS 图层作为基础，围绕它生成奇幻森林环境',
    promptSuggestionLayerLabel: '围绕当前 PS 图层生成环境',
    reusePrompt: '复用 Prompt',
    submitJobRunning: '生成中...',
    noAssetPreview: 'No asset preview',
    assetFallback: 'Asset',
    imageFallback: 'image',
    placePs: '置入 PS',
    placePsLong: '置入 Photoshop',
    placingPs: '置入中...',
    placedPs: '已置入',
    regenerate: '重新生成',
    copyPrompt: '复制 Prompt',
    copyResponse: '复制 response',
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
    promptOptimize: '优化提示词',
    promptRefine: '优化',
    promptOptimizePlaceholder: '即将支持',
    promptOptimizeUndo: '撤销',
    promptOptimizing: '优化中…',
    promptOptimizeNoProfile: '请在 Providers 中配置 Prompt Optimizer',
    promptOptimizeEmpty: '请先输入提示词',
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
    config: '配置',
    promptBehavior: '提示词行为',
    instruction: 'Instruction',
    instructionPlaceholder: '用于优化提示词的系统指令',
    alias: '别名',
    baseUrlHint: '如果该 Provider 不会自动补全端点路径，请填写完整 API 基础地址，例如 https://example.com/v1',
    defaultModel: '默认模型',
    customModelId: '自定义 model id',
    selectedModel: '当前模型',
    chooseFromList: '从列表选择',
    chooseFromListHint: '切回已发现的模型列表。',
    useCustomModelId: '使用自定义 model id',
    customModelHint: '当模型不在列表中时，使用自定义 model id。',
    modelListEmpty: '暂无可用模型。请刷新模型列表或手动填写自定义 model id。',
    modelListFailed: '模型列表不可用。请刷新模型列表或手动填写自定义 model id。',
    connectionInfo: '连接信息',
    noProfileSelected: '未选择 Provider profile',
    savedSecretPlaceholder: '已保存；留空不修改',
    showApiKey: '显示 API Key',
    hideApiKey: '隐藏 API Key',
    refreshModels: '刷新模型列表',
    refreshingModels: '刷新中...',
    testConnection: '测试连接',
    testingConnection: '测试中...',
    testResultPrefix: '最近一次测试结果',
    saved: '已保存',
    testSuccess: '连接成功',
    connectionFailed: '连接失败',
    configValidNoModels: '配置有效；未发现模型列表',
    configValidProviderNoModels: '配置有效；该 provider 未返回可用模型列表',
    selectProviderType: '请选择 Provider 类型',
    globalGeneration: '生成设置',
    outputGroup: '输出',
    inputGroup: '输入',
    outputSize: '输出尺寸',
    outputFormat: '输出格式',
    aspectRatio: '宽高比',
    providerInputMaxSide: 'Provider 输入最大边',
    providerInputMaxSideHint: '参考图和捕获图会在发送给 provider edit 请求前调整尺寸。',
    resultDisplayGroup: '结果显示',
    showProviderResponseText: '显示 provider response text',
    showProviderResponseTextHint: '生成结果中显示 provider 返回的文本。这里只影响 UI 展示，不改变生成请求。',
    showProviderResponseTextSessionHint: 'Response text 只保留在当前会话，不写入历史记录。',
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
  },
  conversation: {
    jobFailed: 'Job failed.',
  },
};

export const APP_MESSAGES: Record<SupportedLocale, AppMessages> = {
  en: EN_MESSAGES,
  'zh-CN': ZH_CN_MESSAGES,
};
