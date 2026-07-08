import { describe, expect, it } from 'vitest';
import { createUxpGenerationSettingsStore } from '../../../src/adapters/uxp/uxp-generation-settings-store';
import type { UxpModules } from '../../../src/adapters/uxp/uxp-api';

function createModulesWithJson(rawJson: string): {
  readonly modules: UxpModules;
  readWrittenJson(): string;
} {
  let current = rawJson;
  const file = {
    async read() {
      return current;
    },
    async write(data: string | ArrayBuffer) {
      current = String(data);
      return undefined;
    },
  };

  return {
    modules: {
      uxp: {
        storage: {
          formats: { utf8: 'utf8' },
          localFileSystem: {
            async getDataFolder() {
              return {
                async getEntry() {
                  return file;
                },
                async createFile() {
                  return file;
                },
              };
            },
          },
        },
      },
    },
    readWrittenJson(): string {
      return current;
    },
  };
}

describe('UXP generation settings storage', () => {
  it('reads and writes onboarding seen version in generation-settings.json', async () => {
    const fixture = createModulesWithJson(JSON.stringify({
      providerInputSizePreset: '2k',
      settingsOnboardingSeenVersion: 1,
    }));
    const store = createUxpGenerationSettingsStore(fixture.modules);

    expect(await store.load()).toEqual({
      providerInputSizePreset: '2k',
      settingsOnboardingSeenVersion: 1,
    });

    await store.save({
      providerInputSizePreset: '4k',
      settingsOnboardingSeenVersion: 1,
    });

    expect(JSON.parse(fixture.readWrittenJson())).toEqual({
      providerInputSizePreset: '4k',
      settingsOnboardingSeenVersion: 1,
    });
  });
});
