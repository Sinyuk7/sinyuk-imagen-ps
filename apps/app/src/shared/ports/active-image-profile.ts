export interface ActiveImageProfileStore {
  load(): Promise<string | null>;
  save(profileId: string | null): Promise<void>;
}

export function createMemoryActiveImageProfileStore(initial: string | null = null): ActiveImageProfileStore {
  let current = initial;
  return {
    async load(): Promise<string | null> {
      return current;
    },
    async save(profileId: string | null): Promise<void> {
      current = profileId;
    },
  };
}
