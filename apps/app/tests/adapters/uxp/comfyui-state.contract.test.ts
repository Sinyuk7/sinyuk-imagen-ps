import { describe, expect, it } from 'vitest';
import type { UxpModules } from '../../../src/adapters/uxp/uxp-api';
import { createUxpComfyUiStateRepository } from '../../../src/adapters/uxp/uxp-comfyui-persistence';

const PRIMARY_FILE = 'comfyui-state.json';
const STAGING_FILE = 'comfyui-state.staging.json';
const stateA = {
  baseUrl: 'http://127.0.0.1:8188/a',
  selectedWorkflowId: 'wf-a',
  ambiguousMappingsByRevision: {},
} as const;
const stateB = {
  baseUrl: 'http://127.0.0.1:8188/b',
  selectedWorkflowId: 'wf-b',
  ambiguousMappingsByRevision: {},
} as const;

function persisted(value: typeof stateA | typeof stateB): string {
  return JSON.stringify({ schemaVersion: 1, value });
}

function createFileSystemFixture(initial: Readonly<Record<string, string>> = {}) {
  let failNextMove = false;
  let afterStagingWrite: (() => void) | undefined;

  class FakeFile {
    constructor(public name: string, public contents: string) {}

    async read(): Promise<string> {
      return this.contents;
    }

    async write(value: string): Promise<void> {
      this.contents = value;
      if (this.name === STAGING_FILE) afterStagingWrite?.();
    }

    async moveTo(_folder: FakeFolder, options?: { readonly overwrite?: boolean; readonly newName?: string }): Promise<void> {
      if (failNextMove) {
        failNextMove = false;
        throw new Error('synthetic UXP replace failure');
      }
      const nextName = options?.newName ?? this.name;
      if (!options?.overwrite && files.has(nextName)) throw new Error('EntryExists');
      files.delete(this.name);
      this.name = nextName;
      files.set(nextName, this);
    }

    async delete(): Promise<number> {
      files.delete(this.name);
      return 0;
    }
  }

  class FakeFolder {
    async getEntry(name: string): Promise<FakeFile> {
      const file = files.get(name);
      if (!file) throw new Error('EntryNotFound');
      return file;
    }

    async createFile(name: string, options?: { readonly overwrite?: boolean }): Promise<FakeFile> {
      if (!options?.overwrite && files.has(name)) throw new Error('EntryExists');
      const file = new FakeFile(name, '');
      files.set(name, file);
      return file;
    }
  }

  const files = new Map<string, FakeFile>();
  const folder = new FakeFolder();
  for (const [name, contents] of Object.entries(initial)) files.set(name, new FakeFile(name, contents));

  const modules: UxpModules = {
    uxp: {
      storage: {
        formats: { utf8: 'utf8' },
        localFileSystem: {
          async getDataFolder() {
            return folder;
          },
        },
      },
    },
  };

  return {
    modules,
    failReplaceOnce() {
      failNextMove = true;
    },
    abortAfterStagingWrite(callback: () => void) {
      afterStagingWrite = callback;
    },
    contents(name: string): string | undefined {
      return files.get(name)?.contents;
    },
    names(): readonly string[] {
      return [...files.keys()].sort();
    },
  };
}

describe('UXP ComfyUI singleton state', () => {
  it('keeps state in the exact allowlist without a UXP file system', async () => {
    const state = createUxpComfyUiStateRepository({});
    await state.save({ baseUrl: 'http://127.0.0.1:8188/comfy', selectedWorkflowId: null, ambiguousMappingsByRevision: {} });
    await expect(state.load()).resolves.toEqual({ baseUrl: 'http://127.0.0.1:8188/comfy', selectedWorkflowId: null, ambiguousMappingsByRevision: {} });
  });

  it('keeps save and clear compatible on the staged file backend', async () => {
    const fixture = createFileSystemFixture();
    const state = createUxpComfyUiStateRepository(fixture.modules);

    await state.save(stateA);
    await expect(state.load()).resolves.toEqual(stateA);

    await state.clear();
    await expect(state.load()).resolves.toBeUndefined();
    expect(fixture.names()).toEqual([PRIMARY_FILE]);
  });

  it('commits through a same-directory staging replace without changing the value schema', async () => {
    const fixture = createFileSystemFixture({ [PRIMARY_FILE]: persisted(stateA) });
    const state = createUxpComfyUiStateRepository(fixture.modules);

    await expect(state.compareAndSave({
      selectedWorkflowId: 'wf-a',
      ambiguousMappingsByRevision: {},
      baseUrl: 'http://127.0.0.1:8188/a',
    }, stateB)).resolves.toBe('committed');

    expect(fixture.names()).toEqual([PRIMARY_FILE]);
    const record = JSON.parse(fixture.contents(PRIMARY_FILE) ?? '{}') as Record<string, unknown>;
    expect(Object.keys(record).sort()).toEqual(['schemaVersion', 'value']);
    expect(Object.keys(record.value as Record<string, unknown>).sort()).toEqual([
      'ambiguousMappingsByRevision',
      'baseUrl',
      'selectedWorkflowId',
    ]);
    await expect(state.load()).resolves.toEqual(stateB);
  });

  it('returns conflict before staging and preserves the primary file', async () => {
    const original = persisted(stateA);
    const fixture = createFileSystemFixture({ [PRIMARY_FILE]: original });
    const state = createUxpComfyUiStateRepository(fixture.modules);

    await expect(state.compareAndSave(undefined, stateB)).resolves.toBe('conflict');

    expect(fixture.contents(PRIMARY_FILE)).toBe(original);
    expect(fixture.names()).toEqual([PRIMARY_FILE]);
  });

  it('cleans staging and preserves primary when owner aborts before replace', async () => {
    const original = persisted(stateA);
    const fixture = createFileSystemFixture({ [PRIMARY_FILE]: original });
    const state = createUxpComfyUiStateRepository(fixture.modules);
    const controller = new AbortController();
    fixture.abortAfterStagingWrite(() => controller.abort());

    await expect(state.compareAndSave(stateA, stateB, controller.signal)).resolves.toBe('aborted');

    expect(fixture.contents(PRIMARY_FILE)).toBe(original);
    expect(fixture.names()).toEqual([PRIMARY_FILE]);
  });

  it('cleans stale startup staging without replacing primary', async () => {
    const original = persisted(stateA);
    const fixture = createFileSystemFixture({
      [PRIMARY_FILE]: original,
      [STAGING_FILE]: persisted(stateB),
    });
    const state = createUxpComfyUiStateRepository(fixture.modules);

    await expect(state.load()).resolves.toEqual(stateA);

    expect(fixture.contents(PRIMARY_FILE)).toBe(original);
    expect(fixture.names()).toEqual([PRIMARY_FILE]);
  });

  it('cleans staging and preserves primary when overwrite move fails', async () => {
    const original = persisted(stateA);
    const fixture = createFileSystemFixture({ [PRIMARY_FILE]: original });
    const state = createUxpComfyUiStateRepository(fixture.modules);
    fixture.failReplaceOnce();

    await expect(state.compareAndSave(stateA, stateB)).rejects.toThrow('synthetic UXP replace failure');

    expect(fixture.contents(PRIMARY_FILE)).toBe(original);
    expect(fixture.names()).toEqual([PRIMARY_FILE]);
  });
});
