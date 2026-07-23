import type {
  ComfyUiConnectionTarget,
  ComfyUiExecutionHostPorts,
  ComfyUiFrontendBridgeGeneration,
  ComfyUiFrontendBridgeGenerationFactory,
  ComfyUiFrontendBridgeResolutionPhase,
  ComfyUiFrontendBridgeResolutionReason,
} from '@imagen-ps/application';
import { createComfyUiFrontendBridgeResolutionError } from '@imagen-ps/application';
import type { Logger, LogSpan } from '@imagen-ps/foundation';

type FrontendBridgeResolver = NonNullable<ComfyUiExecutionHostPorts['frontendBridgeResolver']>;
type FrontendBridgePort = NonNullable<Awaited<ReturnType<FrontendBridgeResolver['resolve']>>>;
type BridgeRequest = Parameters<FrontendBridgePort['exchange']>[0];
type BridgeIdentity = FrontendBridgePort['identity'];
interface BridgeMessageTarget {
  postMessage(message: unknown, targetOrigin: string): void;
}

interface BridgeLoadElement {
  src: string;
  readonly style?: {
    position: string;
    left: string;
    top: string;
    width: string;
    height: string;
    pointerEvents: string;
    display: string;
    border: string;
  };
  addEventListener(type: string, listener: EventListenerOrEventListenerObject | null): void;
  removeEventListener(type: string, listener: EventListenerOrEventListenerObject | null): void;
  remove(): void;
  setAttribute?(name: string, value: string): void;
}

/** Chrome Bridge iframe 的最小可替换 DOM shape。 */
export interface ChromeComfyUiBridgeFrameElement extends BridgeLoadElement {
  readonly contentWindow: BridgeMessageTarget | null;
  hidden?: boolean;
}

/** Photoshop UXP WebView 的最小可替换 DOM shape。 */
export interface UxpComfyUiBridgeWebViewElement extends BridgeLoadElement {
  width: string;
  height: string;
  postMessage(message: unknown, targetOrigin: string): void;
}

/** Resolver 使用的 host message window seam。 */
export interface ComfyUiBridgeHostWindow {
  addEventListener(type: 'message', listener: (event: MessageEvent<unknown>) => void): void;
  removeEventListener(type: 'message', listener: (event: MessageEvent<unknown>) => void): void;
}

/** Resolver timeout seam；测试可显式推进 timer。 */
export interface ComfyUiBridgeResolverClock {
  setTimeout(callback: () => void, timeoutMs: number): unknown;
  clearTimeout(handle: unknown): void;
}

interface SharedResolverOptions {
  readonly hostWindow?: ComfyUiBridgeHostWindow;
  readonly clock?: ComfyUiBridgeResolverClock;
  readonly createRuntimeId?: (prefix: string) => string;
  readonly logger?: Logger;
}

/** Chrome iframe resolver 的 DOM 与 lifecycle 注入点。 */
export interface ChromeComfyUiFrontendBridgeGenerationFactoryOptions extends SharedResolverOptions {
  /** Chrome parent page 的 canonical HTTP(S) origin。 */
  readonly parentOrigin: string;
  readonly createFrame?: (workflowId: string) => ChromeComfyUiBridgeFrameElement;
  readonly mountFrame?: (frame: ChromeComfyUiBridgeFrameElement, workflowId: string) => void;
  readonly detachFrame?: (frame: ChromeComfyUiBridgeFrameElement, workflowId: string) => void;
}

/** Photoshop UXP WebView resolver 的 DOM 与 lifecycle 注入点。 */
export interface UxpComfyUiFrontendBridgeGenerationFactoryOptions extends SharedResolverOptions {
  readonly pluginId: string;
  readonly createWebView?: (workflowId: string) => UxpComfyUiBridgeWebViewElement;
  readonly mountWebView?: (webView: UxpComfyUiBridgeWebViewElement, workflowId: string) => void;
  readonly detachWebView?: (webView: UxpComfyUiBridgeWebViewElement, workflowId: string) => void;
}

interface ConnectionSnapshot extends ComfyUiConnectionTarget {
  readonly workflowId: string;
}

interface LoadCallbacks {
  readonly start?: (url: string | undefined) => void;
  readonly stop: (url: string | undefined, reloadDetectedAtStop: boolean) => void;
  readonly error: (url: string | undefined) => void;
}

interface SessionTransport {
  readonly attach: (callbacks: LoadCallbacks) => () => void;
  readonly mount: () => void;
  readonly navigate: (url: string) => void;
  readonly detach: () => void;
  readonly source: () => unknown;
  readonly send: (request: BridgeRequest, targetOrigin: string) => void;
  readonly currentUrl: () => string | undefined;
}

interface ResolverConfiguration {
  readonly target: ComfyUiConnectionTarget;
  readonly hostWindow: ComfyUiBridgeHostWindow;
  readonly clock: ComfyUiBridgeResolverClock;
  readonly createRuntimeId: (prefix: string) => string;
  readonly transportKind: 'chrome' | 'uxp';
  readonly logger?: Logger;
  readonly identityOrigin: (connection: ConnectionSnapshot) => string;
  readonly handshakeRetryMs?: number;
  readonly createTransport: (connection: ConnectionSnapshot) => SessionTransport;
}

interface Deferred<T> {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
  readonly reject: (reason: unknown) => void;
  readonly settled: () => boolean;
}

interface PendingExchange {
  readonly command: BridgeRequest['command'];
  readonly resolve: (value: unknown) => void;
  readonly reject: (reason: unknown) => void;
  readonly cleanup: () => void;
}

const PLUGIN_ID_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,62}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,62}[A-Za-z0-9])?)+$/;
const CHROME_HANDSHAKE_RETRY_MS = 500;
let fallbackRuntimeId = 0;

const defaultClock: ComfyUiBridgeResolverClock = {
  setTimeout(callback, timeoutMs) {
    return globalThis.setTimeout(callback, timeoutMs);
  },
  clearTimeout(handle) {
    globalThis.clearTimeout(handle as ReturnType<typeof globalThis.setTimeout>);
  },
};

function createDeferred<T>(): Deferred<T> {
  let resolvePromise!: (value: T) => void;
  let rejectPromise!: (reason: unknown) => void;
  let isSettled = false;
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  void promise.catch(() => undefined);
  return {
    promise,
    resolve(value) {
      if (isSettled) return;
      isSettled = true;
      resolvePromise(value);
    },
    reject(reason) {
      if (isSettled) return;
      isSettled = true;
      rejectPromise(reason);
    },
    settled: () => isSettled,
  };
}

function resolverError(
  phase: ComfyUiFrontendBridgeResolutionPhase,
  reason: ComfyUiFrontendBridgeResolutionReason,
): Error {
  return createComfyUiFrontendBridgeResolutionError(phase, reason);
}

function runtimeIdFactory(factory: SharedResolverOptions['createRuntimeId']): (prefix: string) => string {
  return (prefix) => {
    fallbackRuntimeId += 1;
    const fallback = `${Date.now()}-${fallbackRuntimeId}`;
    const value = factory?.(prefix)
      ?? `${prefix}-${globalThis.crypto?.randomUUID?.() ?? fallback}`;
    if (value.length === 0 || [...value].length > 128 || /[\u0000-\u001f\u007f]/.test(value)) {
      throw new Error('ComfyUI Bridge runtime id is invalid.');
    }
    return value;
  };
}

function canonicalHttpOrigin(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('ComfyUI Bridge parent origin is invalid.');
  }
  if (
    (url.protocol !== 'http:' && url.protocol !== 'https:')
    || url.origin !== value
    || url.username.length > 0
    || url.password.length > 0
    || url.pathname !== '/'
    || url.search.length > 0
    || url.hash.length > 0
  ) {
    throw new Error('ComfyUI Bridge parent origin is invalid.');
  }
  return value;
}

function bridgeUrl(connectionOrigin: string, identity: BridgeIdentity): string {
  const url = new URL(`${connectionOrigin}/`);
  url.searchParams.set('imagenOrigin', identity.origin);
  url.searchParams.set('imagenSourceId', identity.sourceId);
  url.searchParams.set('imagenLoadId', identity.loadId);
  return url.toString();
}

function identityMatches(left: unknown, right: BridgeIdentity): boolean {
  if (typeof left !== 'object' || left === null || Array.isArray(left)) return false;
  const value = left as Record<string, unknown>;
  return value.origin === right.origin
    && value.sourceId === right.sourceId
    && value.loadId === right.loadId;
}

function responseRequestId(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  if (!Object.prototype.hasOwnProperty.call(value, 'requestId')) return undefined;
  const requestId = (value as Record<string, unknown>).requestId;
  return typeof requestId === 'string' && requestId.length > 0 ? requestId : undefined;
}

function messageOriginMatches(
  transportKind: 'chrome' | 'uxp',
  eventOrigin: string,
  connectionOrigin: string,
): boolean {
  if (eventOrigin === connectionOrigin) return true;
  if (transportKind !== 'uxp') return false;
  try {
    const contentUrl = new URL(eventOrigin);
    return (contentUrl.protocol === 'http:' || contentUrl.protocol === 'https:')
      && contentUrl.username.length === 0
      && contentUrl.password.length === 0
      && contentUrl.origin === connectionOrigin;
  } catch {
    return false;
  }
}

function exchangeOperation(command: BridgeRequest['command']): string {
  if (command === 'handshake') return 'comfyui.bridge.handshake';
  if (command === 'list-workflows') return 'comfyui.frontend.discovery';
  return 'comfyui.bridge.exchange';
}

function resolverReason(error: unknown): string {
  if (!(error instanceof Error)) return 'unknown';
  const reason = (error as { readonly reason?: unknown }).reason;
  return typeof reason === 'string' ? reason : 'unknown';
}

function resolverPhase(error: unknown, fallback: ComfyUiFrontendBridgeResolutionPhase): string {
  if (!(error instanceof Error)) return fallback;
  const phase = (error as { readonly phase?: unknown }).phase;
  return typeof phase === 'string' ? phase : fallback;
}

function structuredResolverError(
  error: unknown,
  fallbackPhase: ComfyUiFrontendBridgeResolutionPhase,
): Error {
  if (
    error instanceof Error
    && error.name === 'ComfyUiFrontendBridgeResolutionError'
    && typeof (error as { readonly phase?: unknown }).phase === 'string'
    && typeof (error as { readonly reason?: unknown }).reason === 'string'
  ) return error;
  return resolverError(fallbackPhase, 'unknown');
}

function resolverLogError(error: unknown): { readonly category: 'bridge'; readonly kind: string; readonly message: string } {
  return {
    category: 'bridge',
    kind: resolverReason(error),
    message: 'ComfyUI Bridge operation failed.',
  };
}

function eventUrl(event: Event): string | undefined {
  const url = (event as Event & { readonly url?: unknown }).url;
  return typeof url === 'string' && url.length > 0 ? url : undefined;
}

function waitWithSignal<T>(promise: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  if (signal === undefined) return promise;
  if (signal.aborted) return Promise.reject(resolverError('ready', 'aborted'));
  return new Promise<T>((resolve, reject) => {
    const abort = (): void => {
      signal.removeEventListener('abort', abort);
      reject(resolverError('ready', 'aborted'));
    };
    signal.addEventListener('abort', abort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener('abort', abort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener('abort', abort);
        reject(error);
      },
    );
  });
}

class BridgeSession {
  readonly port: FrontendBridgePort;
  private readonly sourceId: string;
  private identityValue: BridgeIdentity;
  private expectedUrl: string;
  private readonly timeoutMs: number;
  private state: 'new' | 'loading' | 'ready' | 'disposed' = 'new';
  private ready = createDeferred<void>();
  private readonly pending = new Map<string, PendingExchange>();
  private loadTimeout: unknown | undefined;
  private detachLoadListeners: (() => void) | undefined;
  private mounted = false;
  private loadSpan: LogSpan | undefined;
  private retireWhenIdle = false;

  constructor(
    readonly connection: ConnectionSnapshot,
    private readonly identityOrigin: string,
    private readonly transport: SessionTransport,
    private readonly transportKind: 'chrome' | 'uxp',
    private readonly clock: ComfyUiBridgeResolverClock,
    private readonly createRuntimeId: (prefix: string) => string,
    private readonly onRetire: (session: BridgeSession) => void,
    private readonly retireAfterWorkflowList: boolean,
    private readonly handshakeRetryMs?: number,
    private readonly logger?: Logger,
  ) {
    this.timeoutMs = connection.requestTimeoutMs;
    this.sourceId = createRuntimeId('comfy-bridge-source');
    this.identityValue = this.nextIdentity();
    this.expectedUrl = bridgeUrl(connection.frontendBaseUrl, this.identityValue);
    const session = this;
    this.port = Object.freeze({
      get identity() {
        return session.identityValue;
      },
      exchange(request: BridgeRequest, signal?: AbortSignal) {
        return session.exchange(request, signal);
      },
    });
  }

  get disposed(): boolean {
    return this.state === 'disposed';
  }

  start(): void {
    if (this.state !== 'new') return;
    this.beginLoadSpan();
    this.detachLoadListeners = this.transport.attach({
      start: (url) => this.handleLoadStart(url),
      stop: (url, reloadDetectedAtStop) => this.handleLoadStop(url, reloadDetectedAtStop),
      error: (url) => this.handleLoadError(url),
    });
    this.state = 'loading';
    this.scheduleLoadTimeout();
    try {
      this.mounted = true;
      this.transport.navigate(this.expectedUrl);
      this.transport.mount();
    } catch {
      this.retire(resolverError('load', 'load-failed'));
    }
  }

  requestRetirement(): void {
    if (this.state === 'disposed') return;
    this.retireWhenIdle = true;
    if (this.pending.size === 0) this.retire(resolverError('ready', 'disposed'));
  }

  async awaitReady(signal?: AbortSignal): Promise<void> {
    if (this.state === 'disposed') throw resolverError('ready', 'disposed');
    if (this.state === 'ready') return;
    await waitWithSignal(this.ready.promise, signal);
  }

  handleMessage(event: MessageEvent<unknown>): boolean {
    const requestId = responseRequestId(event.data);
    if (requestId === undefined) return false;
    const exchange = this.pending.get(requestId);
    if (exchange === undefined) return false;
    const source = this.transport.source();
    // UXP 返回完整内容 URL；Chrome 仍使用浏览器 exact-origin 语义。
    const originMatches = messageOriginMatches(this.transportKind, event.origin, this.connection.origin);
    const sourceMatches = source !== undefined && source !== null && event.source === source;
    if (!originMatches || !sourceMatches) {
      this.logger?.warn('comfyui.bridge.message.rejected', {
        transport: this.transportKind,
        phase: exchange.command === 'handshake' ? 'handshake' : 'contract',
        reason: !originMatches ? 'origin-mismatch' : 'source-mismatch',
        result: 'rejected',
      });
      return false;
    }
    return this.receive(event.data);
  }

  receive(value: unknown): boolean {
    const requestId = responseRequestId(value);
    if (requestId === undefined) return false;
    const exchange = this.pending.get(requestId);
    if (exchange === undefined) return false;
    this.pending.delete(requestId);
    exchange.cleanup();
    exchange.resolve(value);
    return true;
  }

  dispose(reason = resolverError('ready', 'disposed')): void {
    if (this.state === 'disposed') return;
    this.failLoadSpan(reason, 'load');
    this.state = 'disposed';
    this.clearLoadTimeout();
    this.ready.reject(reason);
    this.rejectPending(reason);
    try { this.detachLoadListeners?.(); } catch { /* 本地清理失败不得覆盖已完成的 Bridge 操作。 */ }
    this.detachLoadListeners = undefined;
    if (this.mounted) {
      this.mounted = false;
      try { this.transport.detach(); } catch { /* 本地清理失败不得覆盖已完成的 Bridge 操作。 */ }
    }
  }

  private nextIdentity(): BridgeIdentity {
    return Object.freeze({
      origin: this.identityOrigin,
      sourceId: this.sourceId,
      loadId: this.createRuntimeId('comfy-bridge-load'),
    });
  }

  private async exchange(request: BridgeRequest, signal?: AbortSignal): Promise<unknown> {
    const operationPhase: ComfyUiFrontendBridgeResolutionPhase = request.command === 'handshake'
      ? 'handshake'
      : 'contract';
    const span = this.logger?.startSpan(exchangeOperation(request.command), { transport: this.transportKind });
    try {
      if (!identityMatches(request.identity, this.identityValue)) throw resolverError('contract', 'identity-mismatch');
      await this.awaitReady(signal);
      if (!identityMatches(request.identity, this.identityValue)) throw resolverError('contract', 'identity-mismatch');
      if (signal?.aborted) throw resolverError(operationPhase, 'aborted');
      if (this.pending.has(request.requestId)) throw resolverError(operationPhase, 'stale');
      const response = await new Promise<unknown>((resolve, reject) => {
        let timeoutHandle: unknown | undefined;
        let retryHandle: unknown | undefined;
        const abort = (): void => {
          const pending = this.pending.get(request.requestId);
          if (pending === undefined) return;
          this.pending.delete(request.requestId);
          pending.cleanup();
          pending.reject(resolverError(operationPhase, 'aborted'));
        };
        const cleanup = (): void => {
          if (timeoutHandle !== undefined) this.clock.clearTimeout(timeoutHandle);
          if (retryHandle !== undefined) this.clock.clearTimeout(retryHandle);
          signal?.removeEventListener('abort', abort);
        };
        this.pending.set(request.requestId, { command: request.command, resolve, reject, cleanup });
        signal?.addEventListener('abort', abort, { once: true });
        timeoutHandle = this.clock.setTimeout(() => {
          const pending = this.pending.get(request.requestId);
          if (pending === undefined) return;
          this.pending.delete(request.requestId);
          pending.cleanup();
          pending.reject(resolverError(operationPhase, 'timeout'));
        }, this.timeoutMs);

        const send = (): void => {
          this.transport.send(request, this.connection.origin);
          if (request.command === 'handshake' && this.handshakeRetryMs !== undefined) {
            retryHandle = this.clock.setTimeout(() => {
              retryHandle = undefined;
              if (!this.pending.has(request.requestId)) return;
              try {
                send();
              } catch {
                const pending = this.pending.get(request.requestId);
                if (pending === undefined) return;
                this.pending.delete(request.requestId);
                pending.cleanup();
                pending.reject(resolverError(operationPhase, 'unknown'));
              }
            }, this.handshakeRetryMs);
          }
        };

        try {
          send();
        } catch {
          const pending = this.pending.get(request.requestId);
          if (pending === undefined) return;
          this.pending.delete(request.requestId);
          pending.cleanup();
          pending.reject(resolverError(operationPhase, 'unknown'));
        }
      });
      span?.finish({
        transport: this.transportKind,
        phase: operationPhase,
        result: 'ok',
      });
      if (this.retireAfterWorkflowList && request.command === 'list-workflows') this.retireWhenIdle = true;
      return response;
    } catch (error) {
      span?.fail(resolverLogError(error), {
        transport: this.transportKind,
        phase: resolverPhase(error, operationPhase),
        reason: resolverReason(error),
        result: 'failed',
      });
      throw structuredResolverError(error, operationPhase);
    } finally {
      if (this.retireWhenIdle && this.pending.size === 0) this.retire(resolverError('ready', 'disposed'));
    }
  }

  private handleLoadStart(url: string | undefined): void {
    if (this.state === 'disposed') return;
    if (this.state === 'loading' && this.isExpectedUrl(url)) return;
    this.rotateLoad();
  }

  private handleLoadStop(url: string | undefined, reloadDetectedAtStop: boolean): void {
    if (this.state === 'disposed') return;
    if (!this.isExpectedUrl(url)) {
      this.logger?.warn('comfyui.bridge.load.rejected', {
        transport: this.transportKind,
        phase: 'stop',
        reason: 'unexpected-url',
        result: 'rejected',
      });
      return;
    }
    if (this.state === 'ready') {
      if (reloadDetectedAtStop) this.rotateLoad();
      return;
    }
    if (this.state !== 'loading') return;
    this.state = 'ready';
    this.clearLoadTimeout();
    this.finishLoadSpan();
    this.ready.resolve(undefined);
  }

  private handleLoadError(url: string | undefined): void {
    if (this.state === 'disposed' || !this.isExpectedUrl(url)) return;
    this.retire(resolverError('load', 'load-failed'));
  }

  private isExpectedUrl(url: string | undefined): boolean {
    const candidate = url ?? this.transport.currentUrl();
    if (candidate === undefined) return true;
    try {
      return new URL(candidate).toString() === this.expectedUrl;
    } catch {
      return false;
    }
  }

  private rotateLoad(): void {
    if (this.state === 'disposed') return;
    const error = resolverError('ready', 'reloaded');
    this.failLoadSpan(error, 'reload');
    this.ready.reject(error);
    this.rejectPending(error);
    this.clearLoadTimeout();
    this.identityValue = this.nextIdentity();
    this.expectedUrl = bridgeUrl(this.connection.frontendBaseUrl, this.identityValue);
    this.ready = createDeferred<void>();
    this.state = 'loading';
    this.beginLoadSpan();
    this.scheduleLoadTimeout();
    try {
      this.transport.navigate(this.expectedUrl);
    } catch {
      this.retire(resolverError('load', 'load-failed'));
    }
  }

  private rejectPending(reason: unknown): void {
    const exchanges = Array.from(this.pending.values());
    this.pending.clear();
    for (const exchange of exchanges) {
      exchange.cleanup();
      exchange.reject(reason);
    }
  }

  private scheduleLoadTimeout(): void {
    this.loadTimeout = this.clock.setTimeout(() => {
      this.retire(resolverError('ready', 'timeout'));
    }, this.timeoutMs);
  }

  private beginLoadSpan(): void {
    this.loadSpan = this.logger?.startSpan('comfyui.bridge.load', {
      transport: this.transportKind,
    });
  }

  private finishLoadSpan(): void {
    this.loadSpan?.finish({ transport: this.transportKind, phase: 'ready', result: 'ok' });
    this.loadSpan = undefined;
  }

  private failLoadSpan(error: unknown, phase: 'load' | 'reload'): void {
    this.loadSpan?.fail(resolverLogError(error), {
      transport: this.transportKind,
      phase,
      reason: resolverReason(error),
      result: 'failed',
    });
    this.loadSpan = undefined;
  }

  private clearLoadTimeout(): void {
    if (this.loadTimeout === undefined) return;
    this.clock.clearTimeout(this.loadTimeout);
    this.loadTimeout = undefined;
  }

  private retire(reason: Error): void {
    if (this.state === 'disposed') return;
    this.failLoadSpan(reason, 'load');
    this.dispose(reason);
    this.onRetire(this);
  }
}

function createResolver(configuration: ResolverConfiguration): ComfyUiFrontendBridgeGeneration {
  const sessions = new Map<string, BridgeSession>();
  let disposed = false;
  let retiring = false;

  const handleMessage = (event: MessageEvent<unknown>): void => {
    for (const session of sessions.values()) {
      if (session.handleMessage(event)) return;
    }
  };
  configuration.hostWindow.addEventListener('message', handleMessage);

  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    configuration.hostWindow.removeEventListener('message', handleMessage);
    const activeSessions = Array.from(sessions.values());
    sessions.clear();
    for (const session of activeSessions) session.dispose();
  };
  const finishRetireIfIdle = (): void => {
    if (retiring && sessions.size === 0) dispose();
  };

  return {
    target: configuration.target,
    async resolve(workflowId, signal) {
      const span = configuration.logger?.startSpan('comfyui.bridge.resolve', {
        transport: configuration.transportKind,
      });
      try {
        if (disposed || retiring) {
          span?.finish({ transport: configuration.transportKind, phase: 'ready', result: 'disposed' });
          return undefined;
        }
        if (signal?.aborted) throw resolverError('ready', 'aborted');
        const connection: ConnectionSnapshot = Object.freeze({ ...configuration.target, workflowId });

        if (workflowId !== 'discovery') {
          for (const [activeWorkflowId, activeSession] of Array.from(sessions.entries())) {
            if (activeWorkflowId !== 'discovery' && activeWorkflowId !== workflowId) {
              activeSession.requestRetirement();
            }
          }
        }

        let session = sessions.get(workflowId);
        const sessionResult = session === undefined || session.disposed ? 'created' : 'reused';
        if (session === undefined || session.disposed) {
          session = new BridgeSession(
            connection,
            configuration.identityOrigin(connection),
            configuration.createTransport(connection),
            configuration.transportKind,
            configuration.clock,
            configuration.createRuntimeId,
            (retired) => {
              if (sessions.get(workflowId) === retired) sessions.delete(workflowId);
              finishRetireIfIdle();
            },
            workflowId === 'discovery',
            configuration.handshakeRetryMs,
            configuration.logger,
          );
          sessions.set(workflowId, session);
          session.start();
        }
        await session.awaitReady(signal);
        span?.finish({
          transport: configuration.transportKind,
          phase: 'ready',
          result: sessionResult,
        });
        return session.port;
      } catch (error) {
        span?.fail(resolverLogError(error), {
          transport: configuration.transportKind,
          phase: resolverPhase(error, 'ready'),
          reason: resolverReason(error),
          result: 'failed',
        });
        throw structuredResolverError(error, 'load');
      }
    },
    retire() {
      if (disposed || retiring) return;
      retiring = true;
      for (const session of Array.from(sessions.values())) session.requestRetirement();
      finishRetireIfIdle();
    },
    dispose,
  };
}

function sharedConfiguration(options: SharedResolverOptions): Pick<
  ResolverConfiguration,
    'hostWindow' | 'clock' | 'createRuntimeId' | 'logger'
> {
  return {
    hostWindow: options.hostWindow ?? globalThis.window,
    clock: options.clock ?? defaultClock,
    createRuntimeId: runtimeIdFactory(options.createRuntimeId),
    logger: options.logger,
  };
}

function defaultMount(element: BridgeLoadElement): void {
  globalThis.document.body.appendChild(element as unknown as Node);
}

function configureOffscreenCanvas(element: BridgeLoadElement): void {
  element.setAttribute?.('aria-hidden', 'true');
  if (element.style === undefined) return;
  element.style.position = 'absolute';
  element.style.left = '-10000px';
  element.style.top = '0';
  element.style.width = '1024px';
  element.style.height = '768px';
  element.style.pointerEvents = 'none';
  element.style.display = 'block';
  element.style.border = '0';
}

/** 创建 Chrome iframe target-bound Bridge generation factory。 */
export function createChromeComfyUiFrontendBridgeGenerationFactory(
  options: ChromeComfyUiFrontendBridgeGenerationFactoryOptions,
): ComfyUiFrontendBridgeGenerationFactory {
  const parentOrigin = canonicalHttpOrigin(options.parentOrigin);
  const createFrame = options.createFrame ?? (() => {
    const frame = globalThis.document.createElement('iframe');
    configureOffscreenCanvas(frame);
    return frame;
  });
  const mountFrame = options.mountFrame ?? ((frame: ChromeComfyUiBridgeFrameElement) => defaultMount(frame));
  const detachFrame = options.detachFrame ?? ((frame: ChromeComfyUiBridgeFrameElement) => frame.remove());

  return {
    create(target) {
      return createResolver({
        ...sharedConfiguration(options),
        target: Object.freeze({ ...target }),
        transportKind: 'chrome',
        identityOrigin: () => parentOrigin,
        handshakeRetryMs: CHROME_HANDSHAKE_RETRY_MS,
        createTransport(connection) {
          const frame = createFrame(connection.workflowId);
          return {
            attach(callbacks) {
              const load: EventListener = () => callbacks.stop(frame.src, true);
              const error: EventListener = () => callbacks.error(frame.src);
              frame.addEventListener('load', load);
              frame.addEventListener('error', error);
              return () => {
                frame.removeEventListener('load', load);
                frame.removeEventListener('error', error);
              };
            },
            mount: () => mountFrame(frame, connection.workflowId),
            navigate(url) {
              frame.src = url;
            },
            detach: () => detachFrame(frame, connection.workflowId),
            source: () => frame.contentWindow,
            send(request, targetOrigin) {
              const contentWindow = frame.contentWindow;
              if (contentWindow === null) throw resolverError('load', 'load-failed');
              contentWindow.postMessage(request, targetOrigin);
            },
            currentUrl: () => frame.src,
          };
        },
      });
    },
  };
}

/** 创建 Photoshop UXP WebView target-bound Bridge generation factory。 */
export function createUxpComfyUiFrontendBridgeGenerationFactory(
  options: UxpComfyUiFrontendBridgeGenerationFactoryOptions,
): ComfyUiFrontendBridgeGenerationFactory {
  if (!PLUGIN_ID_PATTERN.test(options.pluginId) || options.pluginId.length > 128) {
    throw new Error('ComfyUI Bridge plugin id is invalid.');
  }
  const createWebView = options.createWebView ?? (() => {
    const webView = globalThis.document.createElement('webview') as unknown as UxpComfyUiBridgeWebViewElement;
    webView.width = '1024px';
    webView.height = '768px';
    configureOffscreenCanvas(webView);
    return webView;
  });
  const mountWebView = options.mountWebView ?? ((webView: UxpComfyUiBridgeWebViewElement) => defaultMount(webView));
  const detachWebView = options.detachWebView ?? ((webView: UxpComfyUiBridgeWebViewElement) => webView.remove());

  return {
    create(target) {
      return createResolver({
        ...sharedConfiguration(options),
        target: Object.freeze({ ...target }),
        transportKind: 'uxp',
        identityOrigin: () => options.pluginId,
        createTransport(connection) {
          const webView = createWebView(connection.workflowId);
          return {
            attach(callbacks) {
              const loadStart: EventListener = (event) => callbacks.start?.(eventUrl(event));
              const loadStop: EventListener = (event) => callbacks.stop(eventUrl(event), false);
              const loadError: EventListener = (event) => callbacks.error(eventUrl(event));
              webView.addEventListener('loadstart', loadStart);
              webView.addEventListener('loadstop', loadStop);
              webView.addEventListener('loaderror', loadError);
              return () => {
                webView.removeEventListener('loadstart', loadStart);
                webView.removeEventListener('loadstop', loadStop);
                webView.removeEventListener('loaderror', loadError);
              };
            },
            mount: () => mountWebView(webView, connection.workflowId),
            navigate(url) {
              webView.src = url;
            },
            detach: () => detachWebView(webView, connection.workflowId),
            source: () => webView,
            send(request, targetOrigin) {
              webView.postMessage(request, targetOrigin);
            },
            currentUrl: () => webView.src,
          };
        },
      });
    },
  };
}
