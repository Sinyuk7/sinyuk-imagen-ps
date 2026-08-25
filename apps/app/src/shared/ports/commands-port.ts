import * as commands from '@imagen-ps/application';

export interface CommandsPort {
  readonly executeJob: typeof commands.executeJob;
  readonly getJob: typeof commands.getJob;
  readonly subscribeJobEvents: typeof commands.subscribeJobEvents;
  readonly listJobHistoryRecords: typeof commands.listJobHistoryRecords;
  readonly putTaskRecord: typeof commands.putTaskRecord;
  readonly getTaskRecord: typeof commands.getTaskRecord;
  readonly listTaskRecords: typeof commands.listTaskRecords;
  readonly reconcileStaleRunningTaskRecords: typeof commands.reconcileStaleRunningTaskRecords;
  readonly listProviders: typeof commands.listProviders;
  readonly describeProvider: typeof commands.describeProvider;
  readonly saveProviderSurfaceProfile: typeof commands.saveProviderSurfaceProfile;
  readonly listProviderProfiles: typeof commands.listProviderProfiles;
  readonly getProviderProfile: typeof commands.getProviderProfile;
  readonly deleteProviderProfile: typeof commands.deleteProviderProfile;
  readonly testProviderProfile: typeof commands.testProviderProfile;
  readonly testProviderProfileConnection: typeof commands.testProviderProfileConnection;
  readonly getModelGenerationSettings: typeof commands.getModelGenerationSettings;
  readonly saveModelGenerationPreference: typeof commands.saveModelGenerationPreference;
  readonly deleteModelGenerationPreference: typeof commands.deleteModelGenerationPreference;
  readonly listProfileModels: typeof commands.listProfileModels;
}

export function createCommandsAdapter(): CommandsPort {
  return {
    executeJob: commands.executeJob,
    getJob: commands.getJob,
    subscribeJobEvents: commands.subscribeJobEvents,
    listJobHistoryRecords: commands.listJobHistoryRecords,
    putTaskRecord: commands.putTaskRecord,
    getTaskRecord: commands.getTaskRecord,
    listTaskRecords: commands.listTaskRecords,
    reconcileStaleRunningTaskRecords: commands.reconcileStaleRunningTaskRecords,
    listProviders: commands.listProviders,
    describeProvider: commands.describeProvider,
    saveProviderSurfaceProfile: commands.saveProviderSurfaceProfile,
    listProviderProfiles: commands.listProviderProfiles,
    getProviderProfile: commands.getProviderProfile,
    deleteProviderProfile: commands.deleteProviderProfile,
    testProviderProfile: commands.testProviderProfile,
    testProviderProfileConnection: commands.testProviderProfileConnection,
    getModelGenerationSettings: commands.getModelGenerationSettings,
    saveModelGenerationPreference: commands.saveModelGenerationPreference,
    deleteModelGenerationPreference: commands.deleteModelGenerationPreference,
    listProfileModels: commands.listProfileModels,
  };
}
