import type { Logger } from '@imagen-ps/foundation';
import type { ProviderDiagnostic } from '../../../contract/diagnostics.js';
import type { ProviderEndpointConfig } from '../../../contract/config.js';
import type { ImageEditCodec } from '../../../contract/provider.js';
import type { ProviderInvokeError } from '../../../shared/transport/error-map.js';
import type { RetryPolicy } from '../../../shared/transport/retry.js';
import { classifyImageEditRequestShapeRejection } from './request-shape-classifier.js';

interface AttemptCandidate {
  readonly endpointId: string;
  readonly codecId: ImageEditCodec;
  readonly reason: 'initial' | 'codec-fallback' | 'endpoint-failover';
}

type ResolvedAttemptPlan =
  | { readonly mode: 'single-attempt'; readonly candidates: readonly [AttemptCandidate] }
  | { readonly mode: 'codec-fallback'; readonly candidates: readonly AttemptCandidate[] }
  | { readonly mode: 'endpoint-failover'; readonly candidates: readonly AttemptCandidate[] };

interface DispatchBudget {
  readonly maxSameEndpointRetries: number;
  readonly maxCodecFallbacks: number;
  readonly maxEndpointFailovers: number;
  readonly maxTotalDispatches: number;
}

interface AttemptLedger {
  consume(kind: 'initial' | 'retry' | 'codec-fallback' | 'endpoint-failover'): void;
  readonly exhausted: boolean;
  readonly totalUsed: number;
  readonly sameEndpointRetriesUsed: number;
}

interface DecideInput {
  readonly failure: ProviderInvokeError;
  readonly plan: ResolvedAttemptPlan;
  readonly planIndex: number;
  readonly capability: {
    readonly idempotencySupported: boolean;
    readonly idempotencyScope?: 'same-endpoint' | 'shared-domain' | 'unknown';
  };
  readonly budget: DispatchBudget;
  readonly ledger: AttemptLedger;
  readonly retryPolicy: RetryPolicy;
  readonly currentCodec?: ImageEditCodec;
  readonly alternateCodec?: ImageEditCodec;
}

type NextAction =
  | { readonly type: 'stop'; readonly reason: string }
  | { readonly type: 'retry-same-endpoint'; readonly delayMs?: number }
  | { readonly type: 'try-next-codec' }
  | { readonly type: 'try-next-endpoint' };

interface ExecuteAttemptPlanOptions<T> {
  readonly plan: ResolvedAttemptPlan;
  readonly budget: DispatchBudget;
  readonly ledger: AttemptLedger;
  readonly capability: DecideInput['capability'];
  readonly retryPolicy: RetryPolicy;
  readonly logger?: Logger;
  readonly execute: (candidate: AttemptCandidate, attemptIndex: number) => Promise<T>;
}

interface EndpointAttemptRecord {
  readonly endpointId: string;
  readonly endpointUrl: string;
  readonly attemptIndex: number;
  readonly outcome: 'success' | 'failure';
  readonly kind?: string;
  readonly statusCode?: number;
}

interface ExecuteAttemptPlanResult<T> {
  readonly selectedEndpointId: string;
  readonly candidate: AttemptCandidate;
  readonly value: T;
  readonly diagnostics: readonly ProviderDiagnostic[];
  readonly attempts: readonly EndpointAttemptRecord[];
}

class DispatchAttemptLedger implements AttemptLedger {
  private usedInitial = 0;
  private usedRetries = 0;
  private usedCodecFallbacks = 0;
  private usedEndpointFailovers = 0;

  constructor(private readonly budget: DispatchBudget) {}

  consume(kind: 'initial' | 'retry' | 'codec-fallback' | 'endpoint-failover'): void {
    if (this.exhausted) {
      throw new Error('Dispatch budget exhausted before HTTP dispatch.');
    }
    if (kind === 'initial') this.usedInitial += 1;
    else if (kind === 'retry') this.usedRetries += 1;
    else if (kind === 'codec-fallback') this.usedCodecFallbacks += 1;
    else this.usedEndpointFailovers += 1;
  }

  get exhausted(): boolean {
    return this.totalUsed >= this.budget.maxTotalDispatches ||
      this.usedRetries > this.budget.maxSameEndpointRetries ||
      this.usedCodecFallbacks > this.budget.maxCodecFallbacks ||
      this.usedEndpointFailovers > this.budget.maxEndpointFailovers;
  }

  get totalUsed(): number {
    return this.usedInitial + this.usedRetries + this.usedCodecFallbacks + this.usedEndpointFailovers;
  }

  get sameEndpointRetriesUsed(): number {
    return this.usedRetries;
  }
}

function diagnostic(code: string, message: string, details: Readonly<Record<string, unknown>>): ProviderDiagnostic {
  return { code, message, level: 'info', details };
}

/** 解析 OpenAI Images 编辑请求的 endpoint/codec 尝试顺序。 */
export function resolveAttemptPlan(args: {
  readonly endpoints: readonly ProviderEndpointConfig[];
  readonly failoverEnabled: boolean;
  readonly compatibleCodecs: readonly ImageEditCodec[];
}): ResolvedAttemptPlan {
  const firstEndpoint = args.endpoints[0];
  const firstCodec = args.compatibleCodecs[0];
  if (!firstEndpoint || !firstCodec) {
    throw new Error('Attempt plan requires at least one enabled endpoint and one compatible codec.');
  }
  if (args.failoverEnabled && args.endpoints.length > 1) {
    return { mode: 'endpoint-failover', candidates: args.endpoints.map((endpoint, index) => ({ endpointId: endpoint.id, codecId: firstCodec, reason: index === 0 ? 'initial' : 'endpoint-failover' })) };
  }
  if (args.compatibleCodecs.length > 1) {
    return { mode: 'codec-fallback', candidates: args.compatibleCodecs.map((codec, index) => ({ endpointId: firstEndpoint.id, codecId: codec, reason: index === 0 ? 'initial' : 'codec-fallback' })) };
  }
  return { mode: 'single-attempt', candidates: [{ endpointId: firstEndpoint.id, codecId: firstCodec, reason: 'initial' }] };
}

/** 从尝试计划和重试策略派生有界 dispatch budget。 */
export function deriveDispatchBudget(plan: ResolvedAttemptPlan, retryPolicy: RetryPolicy): DispatchBudget {
  return {
    maxSameEndpointRetries: Math.max(0, retryPolicy.maxRetries),
    maxCodecFallbacks: plan.mode === 'codec-fallback' ? Math.max(0, plan.candidates.length - 1) : 0,
    maxEndpointFailovers: plan.mode === 'endpoint-failover' ? Math.max(0, plan.candidates.length - 1) : 0,
    maxTotalDispatches: plan.candidates.length + Math.max(0, retryPolicy.maxRetries),
  };
}

/** 创建 OpenAI Images dispatch ledger。 */
export function createAttemptLedger(budget: DispatchBudget): AttemptLedger {
  return new DispatchAttemptLedger(budget);
}

function decideNextAction(input: DecideInput): NextAction {
  if (input.ledger.exhausted) return { type: 'stop', reason: 'budget_exhausted' };
  if (input.failure.kind === 'rate_limited') {
    return input.ledger.sameEndpointRetriesUsed < input.budget.maxSameEndpointRetries
      ? { type: 'retry-same-endpoint' }
      : { type: 'stop', reason: 'rate_limited_retry_exhausted' };
  }
  if (input.failure.recovery?.executionState === 'unknown') return { type: 'stop', reason: 'unknown_execution_state' };
  if (input.plan.mode === 'codec-fallback' && input.alternateCodec !== undefined && input.currentCodec !== undefined && input.planIndex < input.plan.candidates.length - 1) {
    const rejection = classifyImageEditRequestShapeRejection(input.failure, { currentCodec: input.currentCodec, alternateCodec: input.alternateCodec });
    if (rejection.eligible) return { type: 'try-next-codec' };
  }
  if (input.plan.mode === 'endpoint-failover' && input.planIndex < input.plan.candidates.length - 1 && input.capability.idempotencySupported && input.capability.idempotencyScope === 'shared-domain') {
    return { type: 'try-next-endpoint' };
  }
  return { type: 'stop', reason: 'no_recovery_path' };
}

/** 执行 OpenAI Images 编辑请求的 codec/failover 尝试计划。 */
export async function executeAttemptPlan<T>(options: ExecuteAttemptPlanOptions<T>): Promise<ExecuteAttemptPlanResult<T>> {
  const diagnostics: ProviderDiagnostic[] = [];
  const attempts: EndpointAttemptRecord[] = [];
  let lastError: ProviderInvokeError | undefined;
  for (let index = 0; index < options.plan.candidates.length; index += 1) {
    const candidate = options.plan.candidates[index]!;
    try {
      const value = await options.execute(candidate, index + 1);
      attempts.push({ endpointId: candidate.endpointId, endpointUrl: candidate.endpointId, attemptIndex: index + 1, outcome: 'success' });
      return { selectedEndpointId: candidate.endpointId, candidate, value, diagnostics, attempts };
    } catch (error) {
      const failure = error as ProviderInvokeError;
      lastError = failure;
      attempts.push({ endpointId: candidate.endpointId, endpointUrl: candidate.endpointId, attemptIndex: index + 1, outcome: 'failure', ...(failure.kind ? { kind: failure.kind } : {}), ...(typeof failure.statusCode === 'number' ? { statusCode: failure.statusCode } : {}) });
      const alternateCodec = options.plan.mode === 'codec-fallback' ? options.plan.candidates[index + 1]?.codecId : undefined;
      const nextAction = decideNextAction({ failure, plan: options.plan, planIndex: index, capability: options.capability, budget: options.budget, ledger: options.ledger, retryPolicy: options.retryPolicy, currentCodec: candidate.codecId, alternateCodec });
      if (nextAction.type === 'try-next-codec' || nextAction.type === 'try-next-endpoint') {
        diagnostics.push(diagnostic(nextAction.type === 'try-next-codec' ? 'image-edit.codec_fallback' : 'image-edit.endpoint_failover', `Continuing image-edit attempt plan after ${failure.kind}.`, { endpointId: candidate.endpointId, codecId: candidate.codecId, nextAction: nextAction.type }));
        continue;
      }
      const reason = nextAction.type === 'stop' ? nextAction.reason : 'retry_same_endpoint_owned_by_transport';
      diagnostics.push(diagnostic('image-edit.recovery_suppressed', `Stopping image-edit attempt plan after ${failure.kind}.`, { endpointId: candidate.endpointId, codecId: candidate.codecId, reason, statusCode: failure.statusCode }));
      options.logger?.log('warn', 'image-edit.recovery_suppressed', { endpointId: candidate.endpointId, codecId: candidate.codecId, reason, statusCode: failure.statusCode });
      throw failure;
    }
  }
  throw lastError ?? new Error('Attempt plan exhausted without a result.');
}
