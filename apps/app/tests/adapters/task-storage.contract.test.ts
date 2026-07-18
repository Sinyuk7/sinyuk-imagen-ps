import { describe, expect, it } from 'vitest';
import { TASK_RECORD_SCHEMA_VERSION, type TaskRecord } from '@imagen-ps/application';
import {
  createChromeIndexedDbStorage,
  createMemoryIndexedDbBackend,
} from '../../src/adapters/chrome/indexed-db-storage';
import {
  createUxpStorageAdmin,
  createUxpTaskStore,
} from '../../src/adapters/uxp/uxp-job-history-adapter';
import type { UxpModules } from '../../src/adapters/uxp/uxp-api';
import { fakeTaskRecord } from '../helpers/fixtures/task.fixtures';

interface MemoryUxpFile {
  read(): Promise<string>;
  write(value: string | ArrayBuffer): Promise<void>;
}

function createMemoryUxpModules(initial?: Readonly<Record<string, string>>): {
  readonly modules: UxpModules;
  readonly files: Map<string, string>;
} {
  const files = new Map(Object.entries(initial ?? {}));

  function file(name: string): MemoryUxpFile {
    return {
      async read() {
        return files.get(name) ?? '';
      },
      async write(value) {
        if (typeof value !== 'string') {
          throw new Error('Task history test expects UTF-8 writes.');
        }
        files.set(name, value);
      },
    };
  }

  const folder = {
    async getEntry(name: string) {
      if (!files.has(name)) {
        throw new Error(`Missing UXP file: ${name}`);
      }
      return file(name);
    },
    async createFile(name: string) {
      files.set(name, '');
      return file(name);
    },
    async getEntries() {
      return [...files.keys()].map((name) => ({ name, isFile: true }));
    },
  };

  return {
    files,
    modules: {
      uxp: {
        storage: {
          formats: { utf8: 'utf8', binary: 'binary' },
          localFileSystem: {
            formats: { utf8: 'utf8' },
            async getDataFolder() {
              return folder;
            },
          },
        },
      },
    },
  };
}

function legacyTask(taskId = 'legacy-task'): Record<string, unknown> {
  return {
    schemaVersion: 1,
    taskId,
    status: 'running',
    operation: 'text-to-image',
    prompt: 'legacy prompt',
    attachments: [],
    outputs: [],
    placement: { kind: 'unbound', reason: 'no-photoshop-source' },
    execution: { profileId: 'legacy-profile' },
    createdAt: '2026-07-18T00:00:00.000Z',
    updatedAt: '2026-07-18T00:00:00.000Z',
  };
}

describe('Task v2 storage adapters', () => {
  it('round-trips fresh v2 records through Chrome and isolates v1 rows', async () => {
    const backend = createMemoryIndexedDbBackend({
      initial: {
        tasks: [{ key: 'legacy-task', value: legacyTask() }],
      },
    });
    const storage = createChromeIndexedDbStorage({ backend });

    expect(await storage.tasks.get('legacy-task')).toBeUndefined();
    expect(await storage.tasks.list()).toEqual([]);

    await storage.tasks.put(fakeTaskRecord);

    expect(await storage.tasks.get(fakeTaskRecord.taskId)).toEqual(fakeTaskRecord);
    expect(await storage.tasks.list()).toEqual([fakeTaskRecord]);
    const raw = await backend.get<TaskRecord>('tasks', fakeTaskRecord.taskId);
    expect(raw?.schemaVersion).toBe(TASK_RECORD_SCHEMA_VERSION);
  });

  it('round-trips fresh v2 records through UXP and writes only the v2 wrapper', async () => {
    const memory = createMemoryUxpModules();
    const store = createUxpTaskStore(memory.modules);

    await store.put(fakeTaskRecord);

    expect(await store.get(fakeTaskRecord.taskId)).toEqual(fakeTaskRecord);
    expect(await store.list()).toEqual([fakeTaskRecord]);
    const raw = await createUxpStorageAdmin(memory.modules)?.readTaskHistoryRaw();
    expect(raw).toEqual({
      schemaVersion: TASK_RECORD_SCHEMA_VERSION,
      records: [fakeTaskRecord],
    });
  });

  it('fails closed for old UXP wrappers and v1 records inside the current wrapper', async () => {
    const oldWrapper = createMemoryUxpModules({
      'task-history.json': JSON.stringify({ schemaVersion: 1, records: [legacyTask()] }),
    });
    const mixedCurrentWrapper = createMemoryUxpModules({
      'task-history.json': JSON.stringify({
        schemaVersion: TASK_RECORD_SCHEMA_VERSION,
        records: [legacyTask()],
      }),
    });

    expect(await createUxpTaskStore(oldWrapper.modules).list()).toEqual([]);
    expect(await createUxpTaskStore(mixedCurrentWrapper.modules).list()).toEqual([]);
  });
});
