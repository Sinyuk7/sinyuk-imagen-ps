import * as commands from '@imagen-ps/application';

export interface CommandsPort {
  readonly submitJob: typeof commands.submitJob;
  readonly getJob: typeof commands.getJob;
  readonly subscribeJobEvents: typeof commands.subscribeJobEvents;
  readonly retryJob: typeof commands.retryJob;
  readonly listProviders: typeof commands.listProviders;
  readonly describeProvider: typeof commands.describeProvider;
  readonly listProviderProfiles: typeof commands.listProviderProfiles;
  readonly getProviderProfile: typeof commands.getProviderProfile;
  readonly saveProviderProfile: typeof commands.saveProviderProfile;
  readonly deleteProviderProfile: typeof commands.deleteProviderProfile;
  readonly testProviderProfile: typeof commands.testProviderProfile;
  readonly listProfileModels: typeof commands.listProfileModels;
  readonly refreshProfileModels: typeof commands.refreshProfileModels;
}

export function createCommandsAdapter(): CommandsPort {
  return {
    submitJob: commands.submitJob,
    getJob: commands.getJob,
    subscribeJobEvents: commands.subscribeJobEvents,
    retryJob: commands.retryJob,
    listProviders: commands.listProviders,
    describeProvider: commands.describeProvider,
    listProviderProfiles: commands.listProviderProfiles,
    getProviderProfile: commands.getProviderProfile,
    saveProviderProfile: commands.saveProviderProfile,
    deleteProviderProfile: commands.deleteProviderProfile,
    testProviderProfile: commands.testProviderProfile,
    listProfileModels: commands.listProfileModels,
    refreshProfileModels: commands.refreshProfileModels,
  };
}
