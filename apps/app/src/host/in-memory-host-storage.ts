import type { ProviderProfile, ProviderProfileRepository, SecretStorageAdapter } from '@imagen-ps/application';

export function createInMemoryProviderProfileRepository(): ProviderProfileRepository {
  const profiles = new Map<string, ProviderProfile>();
  return {
    async list(): Promise<readonly ProviderProfile[]> {
      return Array.from(profiles.values());
    },
    async get(profileId: string): Promise<ProviderProfile | undefined> {
      return profiles.get(profileId);
    },
    async save(profile: ProviderProfile): Promise<void> {
      profiles.set(profile.profileId, profile);
    },
    async delete(profileId: string): Promise<void> {
      profiles.delete(profileId);
    },
  };
}

export function createInMemorySecretStorageAdapter(): SecretStorageAdapter {
  const secrets = new Map<string, string>();
  return {
    async getSecret(key: string): Promise<string | undefined> {
      return secrets.get(key);
    },
    async setSecret(key: string, value: string): Promise<void> {
      secrets.set(key, value);
    },
    async deleteSecret(key: string): Promise<void> {
      secrets.delete(key);
    },
  };
}
