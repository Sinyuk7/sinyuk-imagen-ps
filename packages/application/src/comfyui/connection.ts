import type { ComfyUiFrontendBridgePort } from '@imagen-ps/execution-backend-comfyui';
import {
  DEFAULT_COMFYUI_RUNTIME_POLICY,
  type ComfyUiActiveConnection,
  type ComfyUiActiveRoutingResolver,
  type ComfyUiConnectionCoordinator,
  type ComfyUiConnectionCoordinatorPorts,
  type ComfyUiConnectionError,
  type ComfyUiConnectionErrorCode,
  type ComfyUiConnectionPhase,
  type ComfyUiConnectionResult,
  type ComfyUiConnectionSnapshot,
  type ComfyUiConnectionTarget,
  type ComfyUiFrontendBridgeGeneration,
  type ComfyUiRuntimePolicy,
} from './types.js';
import { deriveComfyUiConnectionTarget } from './connection-target.js';
import { normalizePersistedComfyUiState } from './repositories.js';

const BOUNDED_REASON = /^[a-z0-9][a-z0-9-]{0,63}$/;

type Attempt = {
  readonly id: number;
  readonly target: ComfyUiConnectionTarget;
  readonly controller: AbortController;
  readonly startedAt: number;
  phase: ComfyUiConnectionPhase;
  disposition: 'current' | 'superseded' | 'aborted';
  durableLinearized: boolean;
  generation?: ComfyUiFrontendBridgeGeneration;
};

function boundedReason(value: unknown, fallback: string): string {
  return typeof value === 'string' && BOUNDED_REASON.test(value) ? value : fallback;
}

function knownCode(value: unknown): value is ComfyUiConnectionErrorCode {
  return typeof value === 'string' && [
    'API_UNREACHABLE',
    'API_INVALID_RESPONSE',
    'WEBVIEW_LOAD_FAILED',
    'BRIDGE_HANDSHAKE_TIMEOUT',
    'BRIDGE_CONTRACT_MISMATCH',
    'PERSISTENCE_FAILED',
    'SUPERSEDED',
    'ABORTED',
  ].includes(value);
}

function hostFailure(error: unknown): { readonly code?: ComfyUiConnectionErrorCode; readonly reason?: string } {
  if (typeof error !== 'object' || error === null) return {};
  const value = error as { readonly name?: unknown; readonly code?: unknown; readonly phase?: unknown; readonly reason?: unknown };
  const resolutionCode = value.name === 'ComfyUiFrontendBridgeResolutionError'
    ? value.phase === 'handshake'
      ? 'BRIDGE_HANDSHAKE_TIMEOUT'
      : value.phase === 'contract'
        ? 'BRIDGE_CONTRACT_MISMATCH'
        : value.phase === 'load' || value.phase === 'ready'
          ? 'WEBVIEW_LOAD_FAILED'
          : undefined
    : undefined;
  return {
    ...(knownCode(value.code) ? { code: value.code } : resolutionCode === undefined ? {} : { code: resolutionCode }),
    ...(typeof value.reason === 'string' ? { reason: value.reason } : {}),
  };
}

function connectionError(
  attempt: Attempt,
  code: ComfyUiConnectionErrorCode,
  fallbackReason: string,
  error?: unknown,
): ComfyUiConnectionError {
  const host = hostFailure(error);
  return Object.freeze({
    code: host.code ?? code,
    phase: attempt.phase,
    reason: boundedReason(host.reason, fallbackReason),
    attemptId: attempt.id,
    target: attempt.target,
  });
}

function publicSnapshot(snapshot: ComfyUiConnectionSnapshot): ComfyUiConnectionSnapshot {
  return Object.freeze({ ...snapshot });
}

/** 创建只路由当前 active generation 的 Resolver proxy。 */
export function createComfyUiActiveRoutingResolver(): ComfyUiActiveRoutingResolver {
  let active: ComfyUiActiveConnection | undefined;
  let disposed = false;
  return {
    resolve(workflowId: string, signal?: AbortSignal): Promise<ComfyUiFrontendBridgePort | undefined> {
      if (disposed || active === undefined) return Promise.resolve(undefined);
      return active.generation.resolve(workflowId, signal);
    },
    getActive() { return active; },
    promote(connection) {
      if (disposed) {
        connection.generation.dispose();
        return undefined;
      }
      const previous = active;
      active = connection;
      return previous;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      const previous = active;
      active = undefined;
      previous?.generation.dispose();
    },
  };
}

/** 创建 latest-wins ComfyUI connection transaction coordinator。 */
export function createComfyUiConnectionCoordinator(
  ports: ComfyUiConnectionCoordinatorPorts,
  policy: Pick<ComfyUiRuntimePolicy, 'requestTimeoutMs' | 'observationTimeoutMs'> = DEFAULT_COMFYUI_RUNTIME_POLICY,
): ComfyUiConnectionCoordinator {
  const activeResolver = ports.activeResolver ?? createComfyUiActiveRoutingResolver();
  const listeners = new Set<() => void>();
  let snapshot: ComfyUiConnectionSnapshot = {};
  let initializePromise: Promise<ComfyUiConnectionSnapshot> | undefined;
  let attemptSerial = 0;
  let current: Attempt | undefined;
  let promotionBarrier: Promise<void> | undefined;
  let releasePromotionBarrier: (() => void) | undefined;
  let disposeAfterPromotion = false;
  let disposed = false;

  const publish = (next: ComfyUiConnectionSnapshot) => {
    snapshot = publicSnapshot(next);
    for (const listener of Array.from(listeners)) {
      if (!listeners.has(listener)) continue;
      try { listener(); } catch { /* Observer failure 不得改变 connection transaction。 */ }
    }
  };
  const runPostPromotion = (operation: () => void) => {
    try { operation(); } catch { /* Durable linearization 后的本地 side effect 不得回滚成功结果。 */ }
  };
  const attemptSnapshot = (attempt: Attempt) => Object.freeze({
    attemptId: attempt.id,
    target: attempt.target,
    phase: attempt.phase,
    startedAt: attempt.startedAt,
  });
  const publishAttempt = (attempt: Attempt) => {
    if (current !== attempt || disposed) return;
    publish({ ...snapshot, provisionalAttempt: attemptSnapshot(attempt), lastFailure: undefined });
  };
  const setPhase = (attempt: Attempt, phase: ComfyUiConnectionPhase) => {
    attempt.phase = phase;
    publishAttempt(attempt);
  };
  const currentDisposition = (attempt: Attempt): 'SUPERSEDED' | 'ABORTED' | undefined => {
    if (attempt.disposition === 'superseded') return 'SUPERSEDED';
    if (attempt.disposition === 'aborted' || disposed || attempt.controller.signal.aborted) return 'ABORTED';
    return current === attempt ? undefined : 'SUPERSEDED';
  };
  const controlFailure = (attempt: Attempt, code: 'SUPERSEDED' | 'ABORTED'): ComfyUiConnectionResult => ({
    ok: false,
    error: connectionError(attempt, code, code === 'SUPERSEDED' ? 'superseded' : 'aborted'),
  });
  const ensureCurrent = (attempt: Attempt): ComfyUiConnectionResult | undefined => {
    const disposition = currentDisposition(attempt);
    return disposition === undefined ? undefined : controlFailure(attempt, disposition);
  };
  const disposeProvisional = (attempt: Attempt) => {
    const generation = attempt.generation;
    attempt.generation = undefined;
    generation?.dispose();
  };
  const completeFailure = (attempt: Attempt, error: ComfyUiConnectionError): ComfyUiConnectionResult => {
    disposeProvisional(attempt);
    if (current === attempt) {
      current = undefined;
      if (error.code === 'SUPERSEDED' || error.code === 'ABORTED') {
        publish({ ...snapshot, provisionalAttempt: undefined });
      } else {
        publish({ ...snapshot, provisionalAttempt: undefined, lastFailure: error });
      }
    }
    return { ok: false, error };
  };

  const execute = async (attempt: Attempt, persist: boolean): Promise<ComfyUiConnectionResult> => {
    const failControl = () => {
      const disposition = currentDisposition(attempt) ?? 'ABORTED';
      return completeFailure(attempt, connectionError(
        attempt,
        disposition,
        disposition === 'SUPERSEDED' ? 'superseded' : 'aborted',
      ));
    };
    try {
      await ports.validateApi(attempt.target, attempt.controller.signal);
      if (ensureCurrent(attempt)) return failControl();

      attempt.generation = ports.generationFactory.create(attempt.target);
      setPhase(attempt, 'frontend');
      const bridge = await attempt.generation.resolve('discovery', attempt.controller.signal);
      if (ensureCurrent(attempt)) return failControl();
      if (bridge === undefined) {
        return completeFailure(attempt, connectionError(attempt, 'WEBVIEW_LOAD_FAILED', 'frontend-unavailable'));
      }

      setPhase(attempt, 'bridge');
      await ports.validateBridge(attempt.generation, attempt.controller.signal);
      if (ensureCurrent(attempt)) return failControl();

      if (persist) {
        setPhase(attempt, 'persistence');
        const expected = await ports.state.load();
        if (ensureCurrent(attempt)) return failControl();
        const next = normalizePersistedComfyUiState({
          baseUrl: attempt.target.baseUrl,
          selectedWorkflowId: expected?.selectedWorkflowId ?? null,
          ambiguousMappingsByRevision: expected?.ambiguousMappingsByRevision ?? {},
        });
        const commit = await ports.state.compareAndSave(expected, next, attempt.controller.signal);
        if (commit !== 'committed') {
          if (commit === 'aborted' || ensureCurrent(attempt)) return failControl();
          return completeFailure(attempt, connectionError(attempt, 'PERSISTENCE_FAILED', 'compare-conflict'));
        }
      }

      attempt.durableLinearized = true;
      promotionBarrier = new Promise<void>((resolve) => { releasePromotionBarrier = resolve; });
      let previousActive: ComfyUiActiveConnection | undefined;
      let promotedActive: ComfyUiActiveConnection | undefined;
      try {
        setPhase(attempt, 'promotion');
        let connectedAt = Date.now();
        try { connectedAt = ports.now?.() ?? connectedAt; } catch { /* Clock failure 不得打断已线性化 promotion。 */ }
        promotedActive = Object.freeze({
          attemptId: attempt.id,
          target: attempt.target,
          generation: attempt.generation,
          connectedAt,
        });
        attempt.generation = undefined;
        previousActive = activeResolver.promote(promotedActive);
        current = undefined;
        publish({
          ...snapshot,
          committedTarget: persist || snapshot.committedTarget !== undefined ? attempt.target : snapshot.committedTarget,
          activeConnection: promotedActive,
          provisionalAttempt: undefined,
          lastFailure: undefined,
        });
      } finally {
        if (disposeAfterPromotion) {
          runPostPromotion(() => activeResolver.dispose());
          const previousGeneration = previousActive?.generation;
          if (previousGeneration !== undefined && previousGeneration !== promotedActive?.generation) {
            runPostPromotion(() => previousGeneration.dispose());
          }
          current = undefined;
          disposeAfterPromotion = false;
          publish({ ...snapshot, activeConnection: undefined, provisionalAttempt: undefined });
        }
        const release = releasePromotionBarrier;
        promotionBarrier = undefined;
        releasePromotionBarrier = undefined;
        release?.();
      }
      if (!disposed) {
        runPostPromotion(() => ports.invalidateRuntime?.(attempt.target));
        runPostPromotion(() => ports.refreshActive?.(attempt.target));
        if (previousActive !== undefined && promotedActive !== undefined && previousActive.generation !== promotedActive.generation) {
          runPostPromotion(() => previousActive.generation.retire());
        }
      }
      return { ok: true, attemptId: attempt.id, target: attempt.target };
    } catch (error) {
      const disposition = currentDisposition(attempt);
      if (disposition !== undefined) return failControl();
      const fallback = attempt.phase === 'api'
        ? ['API_UNREACHABLE', 'api-unreachable'] as const
        : attempt.phase === 'frontend'
          ? ['WEBVIEW_LOAD_FAILED', 'frontend-load-failed'] as const
          : attempt.phase === 'bridge'
            ? ['BRIDGE_CONTRACT_MISMATCH', 'bridge-validation-failed'] as const
            : ['PERSISTENCE_FAILED', 'write-failed'] as const;
      return completeFailure(attempt, connectionError(attempt, fallback[0], fallback[1], error));
    }
  };

  const start = async (
    target: ComfyUiConnectionTarget,
    persist: boolean,
    ownerSignal?: AbortSignal,
  ): Promise<ComfyUiConnectionResult> => {
    const pendingPromotion = promotionBarrier;
    if (pendingPromotion !== undefined) await pendingPromotion;
    if (disposed) {
      const aborted: Attempt = {
        id: ++attemptSerial,
        target,
        controller: new AbortController(),
        startedAt: ports.now?.() ?? Date.now(),
        phase: 'api',
        disposition: 'aborted',
        durableLinearized: false,
      };
      return controlFailure(aborted, 'ABORTED');
    }
    if (current !== undefined) {
      current.disposition = 'superseded';
      current.controller.abort();
      disposeProvisional(current);
    }
    const attempt: Attempt = {
      id: ++attemptSerial,
      target,
      controller: new AbortController(),
      startedAt: ports.now?.() ?? Date.now(),
      phase: 'api',
      disposition: 'current',
      durableLinearized: false,
    };
    current = attempt;
    const abortFromOwner = () => {
      if (current !== attempt || attempt.durableLinearized) return;
      attempt.disposition = 'aborted';
      attempt.controller.abort();
      disposeProvisional(attempt);
      current = undefined;
      publish({ ...snapshot, provisionalAttempt: undefined });
    };
    if (ownerSignal?.aborted) abortFromOwner();
    else ownerSignal?.addEventListener('abort', abortFromOwner, { once: true });
    publishAttempt(attempt);
    try {
      return await execute(attempt, persist);
    } finally {
      ownerSignal?.removeEventListener('abort', abortFromOwner);
    }
  };

  const failInitialization = (
    target: ComfyUiConnectionTarget,
    ownerSignal?: AbortSignal,
  ): ComfyUiConnectionResult => {
    if (disposed || ownerSignal?.aborted) {
      const aborted: Attempt = {
        id: ++attemptSerial,
        target,
        controller: new AbortController(),
        startedAt: ports.now?.() ?? Date.now(),
        phase: 'persistence',
        disposition: 'aborted',
        durableLinearized: false,
      };
      return controlFailure(aborted, 'ABORTED');
    }
    if (current !== undefined) {
      current.disposition = 'superseded';
      current.controller.abort();
      disposeProvisional(current);
    }
    const attempt: Attempt = {
      id: ++attemptSerial,
      target,
      controller: new AbortController(),
      startedAt: ports.now?.() ?? Date.now(),
      phase: 'persistence',
      disposition: 'current',
      durableLinearized: false,
    };
    current = attempt;
    publishAttempt(attempt);
    return completeFailure(attempt, connectionError(attempt, 'PERSISTENCE_FAILED', 'initial-load-failed'));
  };

  return {
    initialize() {
      if (initializePromise !== undefined) return initializePromise;
      const pending = ports.state.load().then((loaded) => {
        if (loaded !== undefined) {
          const committedTarget = deriveComfyUiConnectionTarget(loaded.baseUrl, policy);
          publish({ ...snapshot, committedTarget });
        }
        return snapshot;
      });
      initializePromise = pending;
      void pending.catch(() => {
        if (initializePromise === pending) initializePromise = undefined;
      });
      return pending;
    },
    async recoverCommitted(ownerSignal) {
      await this.initialize();
      if (snapshot.committedTarget === undefined) return undefined;
      return start(snapshot.committedTarget, false, ownerSignal);
    },
    getSnapshot() { return snapshot; },
    subscribe(listener) {
      if (disposed) return () => undefined;
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    async connect(draftBaseUrl, ownerSignal) {
      const target = deriveComfyUiConnectionTarget(draftBaseUrl, policy);
      try {
        await this.initialize();
      } catch {
        return failInitialization(target, ownerSignal);
      }
      return start(target, true, ownerSignal);
    },
    supersedeCurrentAttempt(nextDraftBaseUrl) {
      const attempt = current;
      if (attempt === undefined) return;
      if (attempt.durableLinearized) return;
      let nextTarget: ComfyUiConnectionTarget | undefined;
      try { nextTarget = deriveComfyUiConnectionTarget(nextDraftBaseUrl, policy); } catch { /* invalid draft supersedes */ }
      if (nextTarget?.baseUrl === attempt.target.baseUrl) return;
      attempt.disposition = 'superseded';
      attempt.controller.abort();
      disposeProvisional(attempt);
      current = undefined;
      publish({ ...snapshot, provisionalAttempt: undefined, lastFailure: undefined });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (promotionBarrier !== undefined || current?.durableLinearized) {
        disposeAfterPromotion = true;
        listeners.clear();
        return;
      }
      if (current !== undefined) {
        current.disposition = 'aborted';
        current.controller.abort();
        disposeProvisional(current);
        current = undefined;
      }
      activeResolver.dispose();
      listeners.clear();
      publish({ ...snapshot, activeConnection: undefined, provisionalAttempt: undefined });
    },
  };
}
