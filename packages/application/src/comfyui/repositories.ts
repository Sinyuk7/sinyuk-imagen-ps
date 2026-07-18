import { createImmutableSnapshot } from '@imagen-ps/core-engine';
import type {
  ComfyUiConnection,
  ComfyUiConnectionRepository,
  ComfyUiWorkflowConfig,
  ComfyUiWorkflowRepository,
  GenerationTargetSelection,
  GenerationTargetSelectionRepository,
} from './types.js';

function snapshot<T>(value: T): T {
  return createImmutableSnapshot(value) as T;
}

/** 创建 deterministic in-memory ComfyUI connection repository。 */
export function createInMemoryComfyUiConnectionRepository(
  initial: readonly ComfyUiConnection[] = [],
): ComfyUiConnectionRepository {
  const records = new Map(initial.map((record) => [record.connectionId, snapshot(record)]));
  return {
    async list() {
      return snapshot(Array.from(records.values()));
    },
    async get(connectionId) {
      const value = records.get(connectionId);
      return value === undefined ? undefined : snapshot(value);
    },
    async save(connection) {
      records.set(connection.connectionId, snapshot(connection));
    },
    async delete(connectionId) {
      records.delete(connectionId);
    },
  };
}

/** 创建 deterministic in-memory ComfyUI workflow repository。 */
export function createInMemoryComfyUiWorkflowRepository(
  initial: readonly ComfyUiWorkflowConfig[] = [],
): ComfyUiWorkflowRepository {
  const records = new Map(initial.map((record) => [record.workflowId, snapshot(record)]));
  return {
    async list(connectionId) {
      const values = Array.from(records.values()).filter((record) => (
        connectionId === undefined || record.connectionId === connectionId
      ));
      return snapshot(values);
    },
    async get(workflowId) {
      const value = records.get(workflowId);
      return value === undefined ? undefined : snapshot(value);
    },
    async save(workflow) {
      records.set(workflow.workflowId, snapshot(workflow));
    },
    async delete(workflowId) {
      records.delete(workflowId);
    },
    async deleteConnection(connectionId) {
      for (const [workflowId, workflow] of records) {
        if (workflow.connectionId === connectionId) {
          records.delete(workflowId);
        }
      }
    },
  };
}

/** 创建 deterministic in-memory generation target repository。 */
export function createInMemoryGenerationTargetSelectionRepository(
  initial?: GenerationTargetSelection,
): GenerationTargetSelectionRepository {
  let current = initial === undefined ? undefined : snapshot(initial);
  return {
    async get() {
      return current === undefined ? undefined : snapshot(current);
    },
    async save(selection) {
      current = snapshot(selection);
    },
    async clear() {
      current = undefined;
    },
  };
}
