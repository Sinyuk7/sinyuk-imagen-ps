import type { SupportedLocale } from '../../domain/locale';

export interface AppMessages {
  readonly common: {
    readonly provider: string;
    readonly providers: string;
    readonly profile: string;
    readonly prompt: string;
    readonly loading: string;
    readonly save: string;
    readonly cancel: string;
    readonly refresh: string;
    readonly addProvider: string;
    readonly enabled: string;
    readonly disabled: string;
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
    readonly regenerate: string;
    readonly copyPrompt: string;
    readonly psLayers: string;
    readonly noAvailableLayers: string;
    readonly choosePsLayer: string;
    readonly uploadFromComputer: string;
    readonly loadingModels: string;
    readonly noModelCandidates: string;
    readonly modelLoading: string;
    readonly modelUnselected: string;
    readonly promptPlaceholderReady: string;
    readonly promptPlaceholderNoProfile: string;
    readonly addImage: string;
    readonly send: string;
    readonly referenceImage: string;
    readonly generatedImage: string;
    readonly download: string;
    readonly layerCount: (count: number) => string;
    readonly target: string;
    readonly targetLayer: string;
    readonly targetSelection: string;
    readonly aspectRatio: string;
    readonly aspectRatioAuto: string;
    readonly aspectRatioSquare: string;
    readonly promptOptimize: string;
    readonly promptOptimizePlaceholder: string;
  };
  readonly history: {
    readonly title: string;
    readonly loading: string;
    readonly empty: string;
    readonly noPrompt: string;
    readonly unknownProvider: string;
    readonly retry: string;
  };
  readonly settings: {
    readonly configured: string;
    readonly loading: string;
    readonly noProviderProfile: string;
    readonly chooseType: string;
    readonly config: string;
    readonly alias: string;
    readonly baseUrlHint: string;
    readonly defaultModel: string;
    readonly customModelId: string;
    readonly connectionInfo: string;
    readonly noProfileSelected: string;
    readonly savedSecretPlaceholder: string;
    readonly enableProfile: string;
    readonly refreshModels: string;
    readonly refreshingModels: string;
    readonly testConnection: string;
    readonly testingConnection: string;
    readonly saved: string;
    readonly testSuccess: string;
    readonly connectionFailed: string;
    readonly configValidNoModels: string;
    readonly configValidProviderNoModels: string;
    readonly selectProviderType: string;
  };
  readonly toast: {
    readonly promptFilled: string;
    readonly layerAdded: string;
    readonly layerReadFailed: string;
    readonly fileAdded: string;
    readonly filePickFailed: string;
    readonly selectProviderProfileFirst: string;
    readonly noPlaceableImage: string;
    readonly placedOnCanvas: string;
    readonly placeFailed: string;
    readonly newSessionStarted: string;
    readonly waitForRunningTask: string;
    readonly historyNotInCurrentSession: string;
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
    save: 'Save',
    cancel: 'Cancel',
    refresh: 'Refresh',
    addProvider: 'Add Provider',
    enabled: 'Enabled',
    disabled: 'Disabled',
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
    regenerate: 'Regenerate',
    copyPrompt: 'Copy Prompt',
    psLayers: 'PS Layers',
    noAvailableLayers: 'No available layers',
    choosePsLayer: 'Choose from PS layers',
    uploadFromComputer: 'Upload from computer',
    loadingModels: 'Loading models...',
    noModelCandidates: 'No model candidates',
    modelLoading: 'Loading models...',
    modelUnselected: 'No model selected',
    promptPlaceholderReady: 'Describe the image you want to generate or edit...',
    promptPlaceholderNoProfile: 'Add a profile in Providers first',
    addImage: 'Add image',
    send: 'Send',
    referenceImage: 'Reference',
    generatedImage: 'Generated',
    download: 'Download',
    layerCount: (count) => `${count} layer${count === 1 ? '' : 's'}`,
    target: 'Target',
    targetLayer: 'Layer',
    targetSelection: 'Selection',
    aspectRatio: 'Aspect ratio',
    aspectRatioAuto: 'Auto',
    aspectRatioSquare: '1:1',
    promptOptimize: 'Optimize prompt',
    promptOptimizePlaceholder: 'Coming soon',
  },
  history: {
    title: 'History',
    loading: 'Loading history...',
    empty: 'No history yet',
    noPrompt: '(no prompt)',
    unknownProvider: 'unknown',
    retry: 'Retry',
  },
  settings: {
    configured: 'Configured',
    loading: 'Loading...',
    noProviderProfile: 'No Provider profile',
    chooseType: 'Choose type',
    config: 'Configuration',
    alias: 'Alias',
    baseUrlHint: 'API base URL from the service provider',
    defaultModel: 'Default model',
    customModelId: 'Custom model id',
    connectionInfo: 'Connection info',
    noProfileSelected: 'No Provider profile selected',
    savedSecretPlaceholder: 'Saved; leave blank to keep unchanged',
    enableProfile: 'Enable profile',
    refreshModels: 'Refresh model list',
    refreshingModels: 'Refreshing...',
    testConnection: 'Test connection',
    testingConnection: 'Testing...',
    saved: 'Saved',
    testSuccess: 'Connected',
    connectionFailed: 'Connection failed',
    configValidNoModels: 'Configuration is valid; no model list found',
    configValidProviderNoModels: 'Configuration is valid; this provider returned no available model list',
    selectProviderType: 'Choose a Provider type',
  },
  toast: {
    promptFilled: 'Filled into the prompt box',
    layerAdded: 'Layer added',
    layerReadFailed: 'Failed to read layer',
    fileAdded: 'Image added',
    filePickFailed: 'Failed to choose image',
    selectProviderProfileFirst: 'Add and select a Provider profile first',
    noPlaceableImage: 'No image to place',
    placedOnCanvas: 'Placed on Photoshop canvas',
    placeFailed: 'Failed to place in Photoshop',
    newSessionStarted: 'New session started',
    waitForRunningTask: 'Wait for the running task to finish',
    historyNotInCurrentSession: 'This task is not in the current session',
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
    save: '保存',
    cancel: '取消',
    refresh: '刷新',
    addProvider: '添加 Provider',
    enabled: '已启用',
    disabled: '已停用',
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
    regenerate: '重新生成',
    copyPrompt: '复制 Prompt',
    psLayers: 'PS 图层',
    noAvailableLayers: '无可用图层',
    choosePsLayer: '从 PS 图层选择',
    uploadFromComputer: '从电脑上传',
    loadingModels: '加载模型...',
    noModelCandidates: '无模型候选',
    modelLoading: '加载模型...',
    modelUnselected: '未选择模型',
    promptPlaceholderReady: '描述你想要生成或编辑的图像...',
    promptPlaceholderNoProfile: '先在 Providers 中添加 profile',
    addImage: '添加图片',
    send: '发送',
    referenceImage: '参考',
    generatedImage: '生成',
    download: '下载',
    layerCount: (count) => `${count} 个图层`,
    target: '目标',
    targetLayer: '图层',
    targetSelection: '选区',
    aspectRatio: '宽高比',
    aspectRatioAuto: '智能',
    aspectRatioSquare: '1:1',
    promptOptimize: '优化提示词',
    promptOptimizePlaceholder: '即将支持',
  },
  history: {
    title: '历史',
    loading: '读取历史中...',
    empty: '暂无历史记录',
    noPrompt: '(no prompt)',
    unknownProvider: 'unknown',
    retry: '重试',
  },
  settings: {
    configured: '已配置',
    loading: '加载中...',
    noProviderProfile: '暂无 Provider profile',
    chooseType: '选择类型',
    config: '配置',
    alias: '别名',
    baseUrlHint: '服务商提供的 API base URL',
    defaultModel: '默认模型',
    customModelId: '自定义 model id',
    connectionInfo: '连接信息',
    noProfileSelected: '未选择 Provider profile',
    savedSecretPlaceholder: '已保存；留空不修改',
    enableProfile: '启用 profile',
    refreshModels: '刷新模型列表',
    refreshingModels: '刷新中...',
    testConnection: '测试连接',
    testingConnection: '测试中...',
    saved: '已保存',
    testSuccess: '连接成功',
    connectionFailed: '连接失败',
    configValidNoModels: '配置有效；未发现模型列表',
    configValidProviderNoModels: '配置有效；该 provider 未返回可用模型列表',
    selectProviderType: '请选择 Provider 类型',
  },
  toast: {
    promptFilled: '已填入输入框',
    layerAdded: '已添加图层',
    layerReadFailed: '读取图层失败',
    fileAdded: '已添加图片',
    filePickFailed: '选择图片失败',
    selectProviderProfileFirst: '请先添加并选择 Provider profile',
    noPlaceableImage: '没有可置入的图片',
    placedOnCanvas: '已置入 Photoshop 画布',
    placeFailed: '置入 Photoshop 失败',
    newSessionStarted: '已开始新会话',
    waitForRunningTask: '请等待当前任务完成',
    historyNotInCurrentSession: '该任务不在当前会话中',
  },
  conversation: {
    jobFailed: 'Job failed.',
  },
};

export const APP_MESSAGES: Record<SupportedLocale, AppMessages> = {
  en: EN_MESSAGES,
  'zh-CN': ZH_CN_MESSAGES,
};
