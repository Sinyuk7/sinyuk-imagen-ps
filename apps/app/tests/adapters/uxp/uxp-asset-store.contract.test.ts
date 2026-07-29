import { describe, expect, it } from 'vitest';
import type { UxpModules } from '../../../src/adapters/uxp/uxp-api';
import { createUxpAssetStore } from '../../../src/adapters/uxp/uxp-job-history-adapter';

type WriteValue = string | ArrayBuffer;

function createFileSystemFixture(options?: { readonly failCreate?: boolean; readonly failWrite?: boolean }) {
  const entries = new Map<string, FakeEntry>();

  class FakeFile {
    public contents: WriteValue = '';

    constructor(readonly name: string) {}

    async read(): Promise<WriteValue> {
      return this.contents;
    }

    async write(value: WriteValue, writeOptions?: { readonly append?: boolean }): Promise<void> {
      if (options?.failWrite && this.name.startsWith('uxp-asset-')) {
        throw new Error('synthetic UXP asset write failure');
      }
      if (writeOptions?.append && typeof value === 'string' && typeof this.contents === 'string') {
        this.contents += value;
        return;
      }
      this.contents = value;
    }
  }

  class FakeFolder {
    constructor(readonly name: string) {}

    async getEntry(name: string): Promise<FakeEntry> {
      const entry = entries.get(`${this.name}/${name}`);
      if (!entry) throw new Error('EntryNotFound');
      return entry;
    }

    async createFile(name: string): Promise<FakeFile> {
      if (options?.failCreate && this.name === 'root' && name.startsWith('uxp-asset-')) {
        throw new Error('synthetic UXP asset create failure');
      }
      const key = `${this.name}/${name}`;
      if (entries.has(key)) throw new Error('EntryExists');
      const file = new FakeFile(name);
      entries.set(key, file);
      return file;
    }

    async createFolder(name: string): Promise<FakeFolder> {
      const key = `${this.name}/${name}`;
      const existing = entries.get(key);
      if (existing instanceof FakeFolder) return existing;
      if (existing) throw new Error('EntryExists');
      const folder = new FakeFolder(key);
      entries.set(key, folder);
      return folder;
    }
  }

  type FakeEntry = FakeFile | FakeFolder;
  const root = new FakeFolder('root');
  const modules: UxpModules = {
    uxp: {
      storage: {
        formats: { binary: 'binary', utf8: 'utf8' },
        localFileSystem: {
          async getDataFolder() {
            return root;
          },
        },
      },
    },
  };

  return {
    modules,
    assetNames(): readonly string[] {
      return Array.from(entries.entries())
        .filter(([key, entry]) => key.startsWith('root/uxp-asset-') && entry instanceof FakeFile)
        .map(([key]) => key.slice('root/'.length));
    },
    log(): string {
      return Array.from(entries.entries())
        .filter(([key, entry]) => key.endsWith('/imagen.jsonl') && entry instanceof FakeFile)
        .map(([, entry]) => String((entry as FakeFile).contents))
        .join('');
    },
  };
}

describe('UXP asset store', () => {
  it('returns a structured preflight failure and records diagnostic context', async () => {
    const fixture = createFileSystemFixture();
    const store = createUxpAssetStore(fixture.modules);

    await expect(store.put(new ArrayBuffer(0), { mimeType: 'image/png', name: 'generated.png' })).rejects.toMatchObject({
      category: 'execution',
      message: 'Generated image persistence failed.',
      details: { operation: 'asset-store.put', stage: 'preflight', byteLength: 0, mimeType: 'image/png', errorName: 'Error' },
    });

    expect(fixture.assetNames()).toEqual([]);
    expect(fixture.log()).toContain('uxp.asset_store.put.failed');
    expect(fixture.log()).toContain('Image asset is empty.');
  });

  it('returns a structured create-file failure and records diagnostic context', async () => {
    const fixture = createFileSystemFixture({ failCreate: true });
    const store = createUxpAssetStore(fixture.modules);

    await expect(store.put(new Uint8Array([1]).buffer, { mimeType: 'application/octet-stream' })).rejects.toMatchObject({
      category: 'execution',
      details: { stage: 'create-file', byteLength: 1, errorName: 'Error' },
    });

    expect(fixture.assetNames()).toEqual([]);
    expect(fixture.log()).toContain('synthetic UXP asset create failure');
  });

  it('returns a structured write failure and records diagnostic context', async () => {
    const fixture = createFileSystemFixture({ failWrite: true });
    const store = createUxpAssetStore(fixture.modules);

    await expect(store.put(new Uint8Array([1]).buffer, { mimeType: 'application/octet-stream' })).rejects.toMatchObject({
      category: 'execution',
      details: { stage: 'write-file', byteLength: 1, errorName: 'Error' },
    });

    expect(fixture.assetNames()).toHaveLength(1);
    expect(fixture.log()).toContain('synthetic UXP asset write failure');
  });
});
