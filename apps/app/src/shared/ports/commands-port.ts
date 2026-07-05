import * as commands from '@imagen-ps/application';

export interface CommandsPort {
  readonly submitJob: typeof commands.submitJob;
  readonly getJob: typeof commands.getJob;
  readonly subscribeJobEvents: typeof commands.subscribeJobEvents;
  readonly retryJob: typeof commands.retryJob;
  readonly listJobHistoryRecords: typeof commands.listJobHistoryRecords;
  readonly putTaskRecord: typeof commands.putTaskRecord;
  readonly getTaskRecord: typeof commands.getTaskRecord;
  readonly listTaskRecords: typeof commands.listTaskRecords;
  readonly reconcileStaleRunningTaskRecords: typeof commands.reconcileStaleRunningTaskRecords;
  readonly listProviders: typeof commands.listProviders;
  readonly describeProvider: typeof commands.describeProvider;
  readonly classifyEndpoint: typeof commands.classifyEndpoint;
  readonly resolveModelBrand: typeof commands.resolveModelBrand;
  readonly listProviderProfiles: typeof commands.listProviderProfiles;
  readonly getProviderProfile: typeof commands.getProviderProfile;
  readonly saveProviderProfile: typeof commands.saveProviderProfile;
  readonly deleteProviderProfile: typeof commands.deleteProviderProfile;
  readonly testProviderProfile: typeof commands.testProviderProfile;
  readonly testProviderProfileConnection: typeof commands.testProviderProfileConnection;
  readonly measureProfileEndpoints: typeof commands.measureProfileEndpoints;
  /** @deprecated Settings/Profile UI 已退出主路径；仅保留给底层兼容链路。 */
  readonly refreshDraftProfileModels: typeof commands.refreshDraftProfileModels;
  readonly refreshProfileBalance: typeof commands.refreshProfileBalance;
  readonly getProfileBillingState: typeof commands.getProfileBillingState;
  readonly listUserModelConfigs: typeof commands.listUserModelConfigs;
  readonly listOfficialModelConfigPresets: typeof commands.listOfficialModelConfigPresets;
  readonly listRequestStrategiesForApiFormat: typeof commands.listRequestStrategiesForApiFormat;
  readonly getUserModelConfig: typeof commands.getUserModelConfig;
  readonly saveUserModelConfig: typeof commands.saveUserModelConfig;
  readonly deleteUserModelConfig: typeof commands.deleteUserModelConfig;
  readonly getModelGenerationSettings: typeof commands.getModelGenerationSettings;
  readonly saveModelGenerationPreference: typeof commands.saveModelGenerationPreference;
  readonly deleteModelGenerationPreference: typeof commands.deleteModelGenerationPreference;
  readonly listProfileModels: typeof commands.listProfileModels;
  /** @deprecated Settings/Profile UI 已退出主路径；仅保留给底层兼容链路。 */
  readonly refreshProfileModels: typeof commands.refreshProfileModels;
}

export function createCommandsAdapter(): CommandsPort {
  return {
    submitJob: commands.submitJob,
    getJob: commands.getJob,
    subscribeJobEvents: commands.subscribeJobEvents,
    retryJob: commands.retryJob,
    listJobHistoryRecords: commands.listJobHistoryRecords,
    putTaskRecord: commands.putTaskRecord,
    getTaskRecord: commands.getTaskRecord,
    listTaskRecords: commands.listTaskRecords,
    reconcileStaleRunningTaskRecords: commands.reconcileStaleRunningTaskRecords,
    listProviders: commands.listProviders,
    describeProvider: commands.describeProvider,
    classifyEndpoint: commands.classifyEndpoint,
    resolveModelBrand: commands.resolveModelBrand,
    listProviderProfiles: commands.listProviderProfiles,
    getProviderProfile: commands.getProviderProfile,
    saveProviderProfile: commands.saveProviderProfile,
    deleteProviderProfile: commands.deleteProviderProfile,
    testProviderProfile: commands.testProviderProfile,
    testProviderProfileConnection: commands.testProviderProfileConnection,
    measureProfileEndpoints: commands.measureProfileEndpoints,
    refreshDraftProfileModels: commands.refreshDraftProfileModels,
    refreshProfileBalance: commands.refreshProfileBalance,
    getProfileBillingState: commands.getProfileBillingState,
    listUserModelConfigs: commands.listUserModelConfigs,
    listOfficialModelConfigPresets: commands.listOfficialModelConfigPresets,
    listRequestStrategiesForApiFormat: commands.listRequestStrategiesForApiFormat,
    getUserModelConfig: commands.getUserModelConfig,
    saveUserModelConfig: commands.saveUserModelConfig,
    deleteUserModelConfig: commands.deleteUserModelConfig,
    getModelGenerationSettings: commands.getModelGenerationSettings,
    saveModelGenerationPreference: commands.saveModelGenerationPreference,
    deleteModelGenerationPreference: commands.deleteModelGenerationPreference,
    listProfileModels: commands.listProfileModels,
    refreshProfileModels: commands.refreshProfileModels,
  };
}
