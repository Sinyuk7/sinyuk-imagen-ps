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
  readonly listProviderAccounts: typeof commands.listProviderAccounts;
  readonly saveProviderAccount: typeof commands.saveProviderAccount;
  readonly getCatalogParameterPreference: typeof commands.getCatalogParameterPreference;
  readonly saveCatalogParameterPreference: typeof commands.saveCatalogParameterPreference;
  readonly describeProvider: typeof commands.describeProvider;
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
    listProviderAccounts: commands.listProviderAccounts,
    saveProviderAccount: commands.saveProviderAccount,
    getCatalogParameterPreference: commands.getCatalogParameterPreference,
    saveCatalogParameterPreference: commands.saveCatalogParameterPreference,
    describeProvider: commands.describeProvider,
  };
}
