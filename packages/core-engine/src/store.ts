/**
 * Create the in-memory job store.
 *
 * INTENT: Own authoritative job snapshots for runtime lifecycle reads
 * INPUT: None
 * OUTPUT: JobStore
 * SIDE EFFECT: Mutates in-memory state only
 * FAILURE: Throws explicit error when updating an unknown job
 */

import { createStore } from "zustand/vanilla";
import { deepFreeze } from "./invariants.js";
import type { JobRecord } from "./types/job.js";

interface JobStoreState {
  readonly jobs: Readonly<Record<string, JobRecord>>;
}

export interface JobStore {
  put(record: JobRecord): JobRecord;
  get(jobId: string): JobRecord | undefined;
  update(jobId: string, updater: (record: JobRecord) => JobRecord): JobRecord;
}

export function createJobStore(): JobStore {
  const store = createStore<JobStoreState>(() => ({ jobs: {} }));

  return {
    put(record) {
      const nextRecord = deepFreeze(record);
      store.setState((state) => ({
        jobs: {
          ...state.jobs,
          [nextRecord.jobId]: nextRecord,
        },
      }));
      return nextRecord;
    },
    get(jobId) {
      return store.getState().jobs[jobId];
    },
    update(jobId, updater) {
      const current = store.getState().jobs[jobId];
      if (!current) {
        throw new Error(`Unknown job "${jobId}".`);
      }

      const nextRecord = deepFreeze(updater(current));
      store.setState((state) => ({
        jobs: {
          ...state.jobs,
          [jobId]: nextRecord,
        },
      }));
      return nextRecord;
    },
  };
}
