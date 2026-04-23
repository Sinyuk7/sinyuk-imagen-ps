/**
 * Create a job lifecycle event bus.
 *
 * INTENT: Provide runtime-wide lifecycle notifications without leaking host APIs
 * INPUT: None
 * OUTPUT: JobEventBus
 * SIDE EFFECT: Emits in-memory events to current subscribers
 * FAILURE: None
 */

import mitt, { type Emitter, type WildcardHandler } from "mitt";
import type { JobEventType, JobEventPayload, JobRecord } from "./types/job.js";
import type { JobEventListener } from "./types/runtime.js";

export interface RuntimeEvent {
  readonly type: JobEventType;
  readonly payload: JobEventPayload;
  readonly record: JobRecord;
}

export interface JobEventBus {
  emit(event: RuntimeEvent): void;
  subscribe(listener: JobEventListener): () => void;
}

type RuntimeEventMap = Record<JobEventType, RuntimeEvent>;

export function createJobEventBus(): JobEventBus {
  const emitter: Emitter<RuntimeEventMap> = mitt<RuntimeEventMap>();

  return {
    emit(event) {
      emitter.emit(event.type, event);
    },
    subscribe(listener) {
      const handler: WildcardHandler<RuntimeEventMap> = (_type, event) => {
        if (event) {
          listener(event);
        }
      };

      emitter.on("*", handler);

      return () => {
        emitter.off("*", handler);
      };
    },
  };
}
