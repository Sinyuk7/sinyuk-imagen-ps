import type {
  ComfyUiConnectionRepository,
  ComfyUiExecutionHostPorts,
} from '@imagen-ps/application';
import type { Logger, LogSpan } from '@imagen-ps/foundation';

type FrontendBridgeResolver = NonNullable<ComfyUiExecutionHostPorts['frontendBridgeResolver']>;
type FrontendBridgePort = NonNullable<Awaited<ReturnType<FrontendBridgeResolver['resolve']>>>;
type BridgeRequest = Parameters<FrontendBridgePort['exchange']>[0];
type BridgeIdentity = FrontendBridgePort['identity'];
type ConnectionReader = Pick<ComfyUiConnectionRepository, 'get'>;

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
  postMessage(message: unknown): void;
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

/** 带有显式 host lifecycle 的 ComfyUI Bridge resolver。 */
export type DisposableComfyUiFrontendBridgeResolver = FrontendBridgeResolver & {
  dispose(): void;
};

interface SharedResolverOptions {
  readonly connections: ConnectionReader;
  readonly hostWindow?: ComfyUiBridgeHostWindow;
  readonly clock?: ComfyUiBridgeResolverClock;
  readonly createRuntimeId?: (prefix: string) => string;
  readonly logger?: Logger;
}

/** Chrome iframe resolver 的 DOM 与 lifecycle 注入点。 */
export interface ChromeComfyUiFrontendBridgeResolverOptions extends SharedResolverOptions {
  /** Chrome parent page 的 canonical HTTP(S) origin。 */
  readonly parentOrigin: string;
  readonly createFrame?: (connectionId: string) => ChromeComfyUiBridgeFrameElement;
  readonly mountFrame?: (frame: ChromeComfyUiBridgeFrameElement, connectionId: string) => void;
  readonly detachFrame?: (frame: ChromeComfyUiBridgeFrameElement, connectionId: string) => void;
}

/** Photoshop UXP WebView resolver 的 DOM 与 lifecycle 注入点。 */
export interface UxpComfyUiFrontendBridgeResolverOptions extends SharedResolverOptions {
  readonly pluginId: string;
  readonly createWebView?: (connectionId: string) => UxpComfyUiBridgeWebViewElement;
  readonly mountWebView?: (webView: UxpComfyUiBridgeWebViewElement, connectionId: string) => void;
  readonly detachWebView?: (webView: UxpComfyUiBridgeWebViewElement, connectionId: string) => void;
}

interface ConnectionSnapshot {
  readonly connectionId: string;
  readonly origin: string;
  readonly requestTimeoutMs: number;
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
  readonly connections: ConnectionReader;
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

function resolverError(reason: 'aborted' | 'disposed' | 'load-failed' | 'reloaded' | 'stale' | 'timeout'): Error {
  const error = new Error(`ComfyUI Bridge resolver ${reason}.`);
  if (reason === 'aborted') error.name = 'AbortError';
  return error;
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

function canonicalConnection(value: Awaited<ReturnType<ConnectionReader['get']>>, connectionId: string): ConnectionSnapshot | undefined {
  if (value === undefined || value.connectionId !== connectionId) return undefined;
  let url: URL;
  try {
    url = new URL(value.origin);
  } catch {
    return undefined;
  }
  if (
    (url.protocol !== 'http:' && url.protocol !== 'https:')
    || url.origin !== value.origin
    || url.username.length > 0
    || url.password.length > 0
    || url.pathname !== '/'
    || url.search.length > 0
    || url.hash.length > 0
    || !Number.isInteger(value.requestTimeoutMs)
    || value.requestTimeoutMs < 250
    || value.requestTimeoutMs > 120_000
  ) return undefined;
  return {
    connectionId,
    origin: value.origin,
    requestTimeoutMs: value.requestTimeoutMs,
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
  const match = /^ComfyUI Bridge resolver ([a-z-]+)\.$/u.exec(error.message);
  return match?.[1] ?? 'unknown';
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
  if (signal.aborted) return Promise.reject(resolverError('aborted'));
  return new Promise<T>((resolve, reject) => {
    const abort = (): void => {
      signal.removeEventListener('abort', abort);
      reject(resolverError('aborted'));
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
  private timeoutMs: number;
  private state: 'new' | 'loading' | 'ready' | 'disposed' = 'new';
  private ready = createDeferred<void>();
  private readonly pending = new Map<string, PendingExchange>();
  private loadTimeout: unknown | undefined;
  private detachLoadListeners: (() => void) | undefined;
  private mounted = false;
  private loadSpan: LogSpan | undefined;

  constructor(
    readonly connection: ConnectionSnapshot,
    private readonly identityOrigin: string,
    private readonly transport: SessionTransport,
    private readonly transportKind: 'chrome' | 'uxp',
    private readonly clock: ComfyUiBridgeResolverClock,
    private readonly createRuntimeId: (prefix: string) => string,
    private readonly onRetire: (session: BridgeSession) => void,
    private readonly handshakeRetryMs?: number,
    private readonly logger?: Logger,
  ) {
    this.timeoutMs = connection.requestTimeoutMs;
    this.sourceId = createRuntimeId('comfy-bridge-source');
    this.identityValue = this.nextIdentity();
    this.expectedUrl = bridgeUrl(connection.origin, this.identityValue);
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
      this.retire(resolverError('load-failed'));
    }
  }

  updateTimeout(timeoutMs: number): void {
    if (this.timeoutMs === timeoutMs) return;
    this.timeoutMs = timeoutMs;
    if (this.state === 'loading') {
      this.clearLoadTimeout();
      this.scheduleLoadTimeout();
    }
  }

  async awaitReady(signal?: AbortSignal): Promise<void> {
    if (this.state === 'disposed') throw resolverError('disposed');
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
        command: exchange.command,
        reason: !originMatches ? 'origin-mismatch' : 'source-mismatch',
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

  dispose(reason = resolverError('disposed')): void {
    if (this.state === 'disposed') return;
    this.failLoadSpan(reason, 'load');
    this.state = 'disposed';
    this.clearLoadTimeout();
    this.ready.reject(reason);
    this.rejectPending(reason);
    this.detachLoadListeners?.();
    this.detachLoadListeners = undefined;
    if (this.mounted) {
      this.transport.detach();
      this.mounted = false;
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
    const span = this.logger?.startSpan(exchangeOperation(request.command), {
      transport: this.transportKind,
      command: request.command,
    });
    let phase: 'identity' | 'load' | 'send' | 'response' = 'identity';
    try {
      if (!identityMatches(request.identity, this.identityValue)) throw resolverError('stale');
      phase = 'load';
      await this.awaitReady(signal);
      if (!identityMatches(request.identity, this.identityValue)) throw resolverError('stale');
      if (signal?.aborted) throw resolverError('aborted');
      if (this.pending.has(request.requestId)) throw resolverError('stale');
      phase = 'send';

      const response = await new Promise<unknown>((resolve, reject) => {
        let timeoutHandle: unknown | undefined;
        let retryHandle: unknown | undefined;
        const abort = (): void => {
          const pending = this.pending.get(request.requestId);
          if (pending === undefined) return;
          this.pending.delete(request.requestId);
          pending.cleanup();
          pending.reject(resolverError('aborted'));
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
          pending.reject(resolverError('timeout'));
        }, this.timeoutMs);

        const send = (): void => {
          this.transport.send(request, this.connection.origin);
          if (request.command === 'handshake' && this.handshakeRetryMs !== undefined) {
            retryHandle = this.clock.setTimeout(() => {
              retryHandle = undefined;
              if (!this.pending.has(request.requestId)) return;
              try {
                send();
              } catch (error) {
                const pending = this.pending.get(request.requestId);
                if (pending === undefined) return;
                this.pending.delete(request.requestId);
                pending.cleanup();
                pending.reject(error);
              }
            }, this.handshakeRetryMs);
          }
        };

        try {
          send();
          phase = 'response';
        } catch (error) {
          const pending = this.pending.get(request.requestId);
          if (pending === undefined) return;
          this.pending.delete(request.requestId);
          pending.cleanup();
          pending.reject(error);
        }
      });
      span?.finish({
        transport: this.transportKind,
        command: request.command,
      });
      return response;
    } catch (error) {
      span?.fail(resolverLogError(error), {
        transport: this.transportKind,
        command: request.command,
        phase,
        reason: resolverReason(error),
      });
      throw error;
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
    this.retire(resolverError('load-failed'));
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
    const error = resolverError('reloaded');
    this.failLoadSpan(error, 'reload');
    this.ready.reject(error);
    this.rejectPending(error);
    this.clearLoadTimeout();
    this.identityValue = this.nextIdentity();
    this.expectedUrl = bridgeUrl(this.connection.origin, this.identityValue);
    this.ready = createDeferred<void>();
    this.state = 'loading';
    this.beginLoadSpan();
    this.scheduleLoadTimeout();
    try {
      this.transport.navigate(this.expectedUrl);
    } catch {
      this.retire(resolverError('load-failed'));
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
      this.retire(resolverError('timeout'));
    }, this.timeoutMs);
  }

  private beginLoadSpan(): void {
    this.loadSpan = this.logger?.startSpan('comfyui.bridge.load', {
      transport: this.transportKind,
    });
  }

  private finishLoadSpan(): void {
    this.loadSpan?.finish({ transport: this.transportKind });
    this.loadSpan = undefined;
  }

  private failLoadSpan(error: unknown, phase: 'load' | 'reload'): void {
    this.loadSpan?.fail(resolverLogError(error), {
      transport: this.transportKind,
      phase,
      reason: resolverReason(error),
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

function createResolver(configuration: ResolverConfiguration): DisposableComfyUiFrontendBridgeResolver {
  const sessions = new Map<string, BridgeSession>();
  let disposed = false;

  const handleMessage = (event: MessageEvent<unknown>): void => {
    for (const session of sessions.values()) {
      if (session.handleMessage(event)) return;
    }
  };
  configuration.hostWindow.addEventListener('message', handleMessage);

  return {
    async resolve(connectionId) {
      const span = configuration.logger?.startSpan('comfyui.bridge.resolve', {
        transport: configuration.transportKind,
      });
      try {
        if (disposed) {
          span?.finish({ transport: configuration.transportKind, result: 'disposed' });
          return undefined;
        }
        const connection = canonicalConnection(await configuration.connections.get(connectionId), connectionId);
        if (disposed) {
          span?.finish({ transport: configuration.transportKind, result: 'disposed' });
          return undefined;
        }
        if (connection === undefined) {
          const invalidSession = sessions.get(connectionId);
          sessions.delete(connectionId);
          invalidSession?.dispose(resolverError('disposed'));
          span?.finish({ transport: configuration.transportKind, result: 'unavailable' });
          return undefined;
        }

        let session = sessions.get(connectionId);
        if (session !== undefined && session.connection.origin !== connection.origin) {
          sessions.delete(connectionId);
          session.dispose(resolverError('disposed'));
          session = undefined;
        }
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
              if (sessions.get(connectionId) === retired) sessions.delete(connectionId);
            },
            configuration.handshakeRetryMs,
            configuration.logger,
          );
          sessions.set(connectionId, session);
          session.start();
        } else {
          session.updateTimeout(connection.requestTimeoutMs);
        }
        await session.awaitReady();
        span?.finish({
          transport: configuration.transportKind,
          result: sessionResult,
        });
        return session.port;
      } catch (error) {
        span?.fail(resolverLogError(error), {
          transport: configuration.transportKind,
          phase: 'load',
          reason: resolverReason(error),
        });
        throw error;
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      configuration.hostWindow.removeEventListener('message', handleMessage);
      const activeSessions = Array.from(sessions.values());
      sessions.clear();
      for (const session of activeSessions) session.dispose();
    },
  };
}

function sharedConfiguration(options: SharedResolverOptions): Pick<
  ResolverConfiguration,
  'connections' | 'hostWindow' | 'clock' | 'createRuntimeId' | 'logger'
> {
  return {
    connections: options.connections,
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

/** 创建 Chrome iframe connection-scoped Bridge resolver。 */
export function createChromeComfyUiFrontendBridgeResolver(
  options: ChromeComfyUiFrontendBridgeResolverOptions,
): DisposableComfyUiFrontendBridgeResolver {
  const parentOrigin = canonicalHttpOrigin(options.parentOrigin);
  const createFrame = options.createFrame ?? (() => {
    const frame = globalThis.document.createElement('iframe');
    configureOffscreenCanvas(frame);
    return frame;
  });
  const mountFrame = options.mountFrame ?? ((frame: ChromeComfyUiBridgeFrameElement) => defaultMount(frame));
  const detachFrame = options.detachFrame ?? ((frame: ChromeComfyUiBridgeFrameElement) => frame.remove());

  return createResolver({
    ...sharedConfiguration(options),
    transportKind: 'chrome',
    identityOrigin: () => parentOrigin,
    handshakeRetryMs: CHROME_HANDSHAKE_RETRY_MS,
    createTransport(connection) {
      const frame = createFrame(connection.connectionId);
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
        mount: () => mountFrame(frame, connection.connectionId),
        navigate(url) {
          frame.src = url;
        },
        detach: () => detachFrame(frame, connection.connectionId),
        source: () => frame.contentWindow,
        send(request, targetOrigin) {
          const contentWindow = frame.contentWindow;
          if (contentWindow === null) throw resolverError('load-failed');
          contentWindow.postMessage(request, targetOrigin);
        },
        currentUrl: () => frame.src,
      };
    },
  });
}

/** 创建 Photoshop UXP WebView connection-scoped Bridge resolver。 */
export function createUxpComfyUiFrontendBridgeResolver(
  options: UxpComfyUiFrontendBridgeResolverOptions,
): DisposableComfyUiFrontendBridgeResolver {
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

  return createResolver({
    ...sharedConfiguration(options),
    transportKind: 'uxp',
    identityOrigin: () => options.pluginId,
    createTransport(connection) {
      const webView = createWebView(connection.connectionId);
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
        mount: () => mountWebView(webView, connection.connectionId),
        navigate(url) {
          webView.src = url;
        },
        detach: () => detachWebView(webView, connection.connectionId),
        source: () => webView,
        send(request) {
          webView.postMessage(request);
        },
        currentUrl: () => webView.src,
      };
    },
  });
}
