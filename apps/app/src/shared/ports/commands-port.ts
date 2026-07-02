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
  readonly listProviders: typeof commands.listProviders;
  readonly describeProvider: typeof commands.describeProvider;
  readonly listProviderProfiles: typeof commands.listProviderProfiles;
  readonly getProviderProfile: typeof commands.getProviderProfile;
  readonly saveProviderProfile: typeof commands.saveProviderProfile;
  readonly deleteProviderProfile: typeof commands.deleteProviderProfile;
  readonly testProviderProfile: typeof commands.testProviderProfile;
  readonly probeProfileEndpoints: typeof commands.probeProfileEndpoints;
  readonly refreshProfileBalance: typeof commands.refreshProfileBalance;
  readonly getProfileBillingState: typeof commands.getProfileBillingState;
  readonly listProfileModels: typeof commands.listProfileModels;
  readonly refreshProfileModels: typeof commands.refreshProfileModels;
  readonly ensurePromptOptimizerProfile: typeof commands.ensurePromptOptimizerProfile;
  readonly optimizePrompt: typeof commands.optimizePrompt;
  readonly validatePromptOptimizerProfile: typeof commands.validatePromptOptimizerProfile;
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
    listProviders: commands.listProviders,
    describeProvider: commands.describeProvider,
    listProviderProfiles: commands.listProviderProfiles,
    getProviderProfile: commands.getProviderProfile,
    saveProviderProfile: commands.saveProviderProfile,
    deleteProviderProfile: commands.deleteProviderProfile,
    testProviderProfile: commands.testProviderProfile,
    probeProfileEndpoints: commands.probeProfileEndpoints,
    refreshProfileBalance: commands.refreshProfileBalance,
    getProfileBillingState: commands.getProfileBillingState,
    listProfileModels: commands.listProfileModels,
    refreshProfileModels: commands.refreshProfileModels,
    ensurePromptOptimizerProfile: commands.ensurePromptOptimizerProfile,
    optimizePrompt: commands.optimizePrompt,
    validatePromptOptimizerProfile: commands.validatePromptOptimizerProfile,
  };
}
