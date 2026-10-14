import { type DurableJobRecord, type TaskRecord } from '@imagen-ps/application';
import type { ChromeFilePicker } from '../../adapters/chrome/chrome-host-port';
import { createBrowserIndexedDbBackend, createMemoryIndexedDbBackend, type ChromeKeyValueBackend } from '../../adapters/chrome/indexed-db-storage';
import type { CommandsPort } from '../../shared/ports/commands-port';
import type { PhotoshopSimulatorScenarioId } from '../../simulators/photoshop/simulator';
type ChromeTestStorageMode = 'memory' | 'indexed-db';
type ChromeTestFilePickerMode = 'image' | 'cancel';
type ChromeTestMockFailureMode = 'none' | 'always';
export interface ChromeRuntimeStorage { readonly secrets: { setSecret(key: string, value: string): Promise<void> }; readonly history: { put(record: DurableJobRecord): Promise<void> }; readonly tasks: { put(record: TaskRecord): Promise<void> } }
export interface ChromeTestHarnessConfig { readonly storageMode: ChromeTestStorageMode; readonly databaseName?: string; readonly seedProfile: boolean; readonly seedHistory: boolean; readonly scenario: PhotoshopSimulatorScenarioId; readonly filePickerMode: ChromeTestFilePickerMode; readonly mockFailureMode: ChromeTestMockFailureMode; readonly comfyUiPersistenceDelayMs: number; readonly resetStorage: boolean }
export interface ChromeTestHarnessRuntime { readonly backend: ChromeKeyValueBackend; readonly filePicker: ChromeFilePicker; readonly scenario: PhotoshopSimulatorScenarioId; wrapCommands(commands: CommandsPort): CommandsPort; install(storage: ChromeRuntimeStorage): void }
export function chromeTestHarnessConfigFromUrl(url: URL): ChromeTestHarnessConfig | undefined {
  if (url.searchParams.get('testHarness') !== '1') return undefined;
  const scenario = url.searchParams.get('scenario');
  return { storageMode: url.searchParams.get('storage') === 'indexed-db' ? 'indexed-db' : 'memory', databaseName: url.searchParams.get('db') ?? undefined, seedProfile: false, seedHistory: url.searchParams.get('seedHistory') === '1', scenario: (scenario as PhotoshopSimulatorScenarioId) || 'seeded-document', filePickerMode: url.searchParams.get('filePicker') === 'cancel' ? 'cancel' : 'image', mockFailureMode: url.searchParams.get('mockFailure') === 'always' ? 'always' : 'none', comfyUiPersistenceDelayMs: 0, resetStorage: url.searchParams.get('resetStorage') === '1' };
}
export function createChromeTestHarnessRuntime(config: ChromeTestHarnessConfig): ChromeTestHarnessRuntime {
  const backend = config.storageMode === 'indexed-db' ? createBrowserIndexedDbBackend({ databaseName: config.databaseName }) : createMemoryIndexedDbBackend();
  return { backend, scenario: config.scenario, filePicker: { pick: async () => undefined }, wrapCommands: (commands) => commands, install: () => undefined };
}
