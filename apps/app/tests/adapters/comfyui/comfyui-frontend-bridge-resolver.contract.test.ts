import type { ComfyUiConnectionRepository } from '@imagen-ps/application';
import { describe, expect, it } from 'vitest';
import {
  createChromeComfyUiFrontendBridgeResolver,
  createUxpComfyUiFrontendBridgeResolver,
  type ChromeComfyUiBridgeFrameElement,
  type ComfyUiBridgeHostWindow,
  type ComfyUiBridgeResolverClock,
  type UxpComfyUiBridgeWebViewElement,
} from '../../../src/adapters/comfyui/comfyui-frontend-bridge-resolver';

type ConnectionReader = Pick<ComfyUiConnectionRepository, 'get'>;
const CHROME_PARENT_ORIGIN = 'https://app.example.test';

class FakeHostWindow implements ComfyUiBridgeHostWindow {
  readonly listeners = new Set<(event: MessageEvent<unknown>) => void>();

  addEventListener(_type: 'message', listener: (event: MessageEvent<unknown>) => void): void {
    this.listeners.add(listener);
  }

  removeEventListener(_type: 'message', listener: (event: MessageEvent<unknown>) => void): void {
    this.listeners.delete(listener);
  }

  emit(input: { readonly origin: string; readonly source: unknown; readonly data: unknown }): void {
    const event = input as unknown as MessageEvent<unknown>;
    for (const listener of this.listeners) listener(event);
  }
}

class FakeClock implements ComfyUiBridgeResolverClock {
  private nextId = 0;
  private readonly callbacks = new Map<number, { readonly callback: () => void; readonly timeoutMs: number }>();

  setTimeout(callback: () => void, timeoutMs: number): unknown {
    this.nextId += 1;
    this.callbacks.set(this.nextId, { callback, timeoutMs });
    return this.nextId;
  }

  clearTimeout(handle: unknown): void {
    this.callbacks.delete(handle as number);
  }

  runAll(): void {
    const callbacks = Array.from(this.callbacks.values(), (entry) => entry.callback);
    this.callbacks.clear();
    for (const callback of callbacks) callback();
  }

  runTimeout(timeoutMs: number): void {
    const entry = Array.from(this.callbacks.entries()).find(([, value]) => value.timeoutMs === timeoutMs);
    if (entry === undefined) throw new Error(`No timeout registered for ${timeoutMs}ms.`);
    this.callbacks.delete(entry[0]);
    entry[1].callback();
  }

  timeouts(): readonly number[] {
    return Array.from(this.callbacks.values(), (entry) => entry.timeoutMs);
  }
}

class FakeLoadElement {
  src = '';
  removed = false;
  readonly attributes = new Map<string, string>();
  private readonly listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();

  addEventListener(type: string, listener: EventListenerOrEventListenerObject | null): void {
    if (listener === null) return;
    const listeners = this.listeners.get(type) ?? new Set<EventListenerOrEventListenerObject>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: EventListenerOrEventListenerObject | null): void {
    if (listener === null) return;
    this.listeners.get(type)?.delete(listener);
  }

  remove(): void {
    this.removed = true;
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  emit(type: string, url = this.src): void {
    const event = { type, url } as unknown as Event;
    for (const listener of this.listeners.get(type) ?? []) {
      if (typeof listener === 'function') listener.call(this, event);
      else listener.handleEvent(event);
    }
  }

  listenerCount(): number {
    return Array.from(this.listeners.values()).reduce((count, listeners) => count + listeners.size, 0);
  }
}

class FakeFrame extends FakeLoadElement implements ChromeComfyUiBridgeFrameElement {
  hidden = false;
  readonly posts: Array<readonly [unknown, string]> = [];
  readonly contentWindow = {
    postMessage: (message: unknown, targetOrigin: string): void => {
      this.posts.push([message, targetOrigin]);
    },
  };
}

class FakeWebView extends FakeLoadElement implements UxpComfyUiBridgeWebViewElement {
  width = '';
  height = '';
  readonly posts: Array<readonly [unknown]> = [];

  postMessage(message: unknown): void {
    this.posts.push([message]);
  }
}

function connectionReader(origins: Readonly<Record<string, string>> = {
  'connection-1': 'https://comfy.example.test',
}): ConnectionReader {
  return {
    async get(connectionId) {
      const origin = origins[connectionId];
      if (origin === undefined) return undefined;
      return {
        connectionId,
        displayName: connectionId,
        origin,
        requestTimeoutMs: 1_000,
        configureTimeoutMs: 1_000,
        observationTimeoutMs: 5_000,
      };
    },
  };
}

function createIds(): (prefix: string) => string {
  let index = 0;
  return (prefix) => `${prefix}-${++index}`;
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function request(identity: { readonly origin: string; readonly sourceId: string; readonly loadId: string }, requestId: string) {
  return {
    requestId,
    identity: { ...identity },
    command: 'handshake' as const,
    payload: {},
  };
}

function queryIdentity(url: string): { readonly origin: string | null; readonly sourceId: string | null; readonly loadId: string | null } {
  const params = new URL(url).searchParams;
  return {
    origin: params.get('imagenOrigin'),
    sourceId: params.get('imagenSourceId'),
    loadId: params.get('imagenLoadId'),
  };
}

describe('ComfyUI frontend Bridge resolvers', () => {
  it('routes Chrome responses by exact origin, contentWindow, and requestId', async () => {
    const hostWindow = new FakeHostWindow();
    const frame = new FakeFrame();
    const resolver = createChromeComfyUiFrontendBridgeResolver({
      connections: connectionReader(),
      parentOrigin: CHROME_PARENT_ORIGIN,
      hostWindow,
      clock: new FakeClock(),
      createRuntimeId: createIds(),
      createFrame: () => frame,
      mountFrame: () => undefined,
    });

    const resolving = resolver.resolve('connection-1');
    await flush();
    frame.emit('load');
    const port = await resolving;
    expect(port).toBeDefined();
    expect(queryIdentity(frame.src)).toEqual({
      origin: CHROME_PARENT_ORIGIN,
      sourceId: port!.identity.sourceId,
      loadId: port!.identity.loadId,
    });
    expect(port!.identity.origin).toBe(CHROME_PARENT_ORIGIN);

    const outgoing = request(port!.identity, 'request-1');
    const pending = port!.exchange(outgoing);
    await flush();
    expect(frame.posts).toEqual([[outgoing, 'https://comfy.example.test']]);

    hostWindow.emit({
      origin: 'https://other.example.test',
      source: frame.contentWindow,
      data: { requestId: 'request-1', ok: true },
    });
    hostWindow.emit({
      origin: 'https://comfy.example.test',
      source: {},
      data: { requestId: 'request-1', ok: true },
    });
    hostWindow.emit({
      origin: 'https://comfy.example.test',
      source: frame.contentWindow,
      data: { requestId: 'other-request', ok: true },
    });
    const response = { requestId: 'request-1', ok: true, payload: {} };
    hostWindow.emit({
      origin: 'https://comfy.example.test',
      source: frame.contentWindow,
      data: response,
    });
    await expect(pending).resolves.toBe(response);

    resolver.dispose();
    expect(hostWindow.listeners.size).toBe(0);
    expect(frame.removed).toBe(true);
    expect(frame.listenerCount()).toBe(0);
  });

  it('uses plugin identity and one-argument postMessage for UXP WebView', async () => {
    const hostWindow = new FakeHostWindow();
    const webView = new FakeWebView();
    const resolver = createUxpComfyUiFrontendBridgeResolver({
      connections: connectionReader(),
      pluginId: 'com.imagen-ps.panel',
      hostWindow,
      clock: new FakeClock(),
      createRuntimeId: createIds(),
      createWebView: () => webView,
      mountWebView: () => undefined,
    });

    const resolving = resolver.resolve('connection-1');
    await flush();
    webView.emit('loadstart');
    webView.emit('loadstop');
    const port = await resolving;
    expect(port?.identity.origin).toBe('com.imagen-ps.panel');
    expect(queryIdentity(webView.src)).toEqual({
      origin: 'com.imagen-ps.panel',
      sourceId: port!.identity.sourceId,
      loadId: port!.identity.loadId,
    });

    const outgoing = request(port!.identity, 'request-uxp');
    const pending = port!.exchange(outgoing);
    await flush();
    expect(webView.posts).toEqual([[outgoing]]);

    hostWindow.emit({
      origin: 'com.imagen-ps.panel',
      source: webView,
      data: { requestId: 'request-uxp', ok: true },
    });
    hostWindow.emit({
      origin: 'https://comfy.example.test',
      source: {},
      data: { requestId: 'request-uxp', ok: true },
    });
    const response = { requestId: 'request-uxp', ok: true, payload: {} };
    hostWindow.emit({
      origin: 'https://comfy.example.test',
      source: webView,
      data: response,
    });
    await expect(pending).resolves.toBe(response);
    resolver.dispose();
  });

  it('retries only the Chrome handshake while async Bridge setup is pending', async () => {
    const hostWindow = new FakeHostWindow();
    const clock = new FakeClock();
    const frame = new FakeFrame();
    const resolver = createChromeComfyUiFrontendBridgeResolver({
      connections: connectionReader(),
      parentOrigin: CHROME_PARENT_ORIGIN,
      hostWindow,
      clock,
      createRuntimeId: createIds(),
      createFrame: () => frame,
      mountFrame: () => undefined,
    });

    const resolving = resolver.resolve('connection-1');
    await flush();
    frame.emit('load');
    const port = (await resolving)!;
    const outgoing = request(port.identity, 'delayed-handshake');
    const pending = port.exchange(outgoing);
    await flush();
    expect(frame.posts).toEqual([[outgoing, 'https://comfy.example.test']]);

    clock.runTimeout(500);
    expect(frame.posts).toEqual([
      [outgoing, 'https://comfy.example.test'],
      [outgoing, 'https://comfy.example.test'],
    ]);
    const response = { requestId: 'delayed-handshake', ok: true, payload: {} };
    hostWindow.emit({
      origin: 'https://comfy.example.test',
      source: frame.contentWindow,
      data: response,
    });
    await expect(pending).resolves.toBe(response);
    expect(clock.timeouts()).toEqual([]);
    resolver.dispose();
  });

  it('rotates UXP load identity, rejects pending work, and reuses the connection session', async () => {
    const hostWindow = new FakeHostWindow();
    const webView = new FakeWebView();
    const resolver = createUxpComfyUiFrontendBridgeResolver({
      connections: connectionReader(),
      pluginId: 'com.imagen-ps.panel',
      hostWindow,
      clock: new FakeClock(),
      createRuntimeId: createIds(),
      createWebView: () => webView,
      mountWebView: () => undefined,
    });

    const firstResolve = resolver.resolve('connection-1');
    await flush();
    webView.emit('loadstart');
    webView.emit('loadstop');
    const port = (await firstResolve)!;
    const firstIdentity = { ...port.identity };
    const pending = port.exchange(request(firstIdentity, 'before-reload'));
    await flush();

    webView.emit('loadstart');
    await expect(pending).rejects.toThrow('reloaded');
    expect(port.identity.sourceId).toBe(firstIdentity.sourceId);
    expect(port.identity.loadId).not.toBe(firstIdentity.loadId);
    expect(queryIdentity(webView.src).loadId).toBe(port.identity.loadId);

    const secondResolve = resolver.resolve('connection-1');
    await flush();
    webView.emit('loadstart');
    webView.emit('loadstop');
    expect(await secondResolve).toBe(port);
    await expect(port.exchange(request(firstIdentity, 'stale-request'))).rejects.toThrow('stale');
    resolver.dispose();
  });

  it('detects Chrome reload at load completion and rotates its load identity', async () => {
    const frame = new FakeFrame();
    const resolver = createChromeComfyUiFrontendBridgeResolver({
      connections: connectionReader(),
      parentOrigin: CHROME_PARENT_ORIGIN,
      hostWindow: new FakeHostWindow(),
      clock: new FakeClock(),
      createRuntimeId: createIds(),
      createFrame: () => frame,
      mountFrame: () => undefined,
    });

    const firstResolve = resolver.resolve('connection-1');
    await flush();
    frame.emit('load');
    const port = (await firstResolve)!;
    const firstLoadId = port.identity.loadId;
    const pending = port.exchange(request(port.identity, 'chrome-reload'));
    await flush();

    frame.emit('load');
    await expect(pending).rejects.toThrow('reloaded');
    expect(port.identity.loadId).not.toBe(firstLoadId);
    const secondResolve = resolver.resolve('connection-1');
    await flush();
    frame.emit('load');
    expect(await secondResolve).toBe(port);
    resolver.dispose();
  });

  it('reschedules an in-flight load when the connection timeout changes', async () => {
    let requestTimeoutMs = 1_000;
    const baseConnections = connectionReader();
    const connections: ConnectionReader = {
      async get(connectionId) {
        const connection = await baseConnections.get(connectionId);
        return connection === undefined ? undefined : { ...connection, requestTimeoutMs };
      },
    };
    const clock = new FakeClock();
    const frame = new FakeFrame();
    const resolver = createChromeComfyUiFrontendBridgeResolver({
      connections,
      parentOrigin: CHROME_PARENT_ORIGIN,
      hostWindow: new FakeHostWindow(),
      clock,
      createRuntimeId: createIds(),
      createFrame: () => frame,
      mountFrame: () => undefined,
    });

    const firstResolve = resolver.resolve('connection-1');
    await flush();
    expect(clock.timeouts()).toEqual([1_000]);
    requestTimeoutMs = 2_000;
    const secondResolve = resolver.resolve('connection-1');
    await flush();
    expect(clock.timeouts()).toEqual([2_000]);

    frame.emit('load');
    expect(await secondResolve).toBe(await firstResolve);
    resolver.dispose();
  });

  it('rejects UXP exchanges on abort, timeout, load error, and dispose', async () => {
    const hostWindow = new FakeHostWindow();
    const clock = new FakeClock();
    const webView = new FakeWebView();
    const resolver = createUxpComfyUiFrontendBridgeResolver({
      connections: connectionReader(),
      pluginId: 'com.imagen-ps.panel',
      hostWindow,
      clock,
      createRuntimeId: createIds(),
      createWebView: () => webView,
      mountWebView: () => undefined,
    });
    const resolving = resolver.resolve('connection-1');
    await flush();
    webView.emit('loadstart');
    webView.emit('loadstop');
    const port = (await resolving)!;

    const controller = new AbortController();
    const aborted = port.exchange(request(port.identity, 'abort-request'), controller.signal);
    await flush();
    controller.abort();
    await expect(aborted).rejects.toMatchObject({ name: 'AbortError' });

    const timedOut = port.exchange(request(port.identity, 'timeout-request'));
    await flush();
    clock.runAll();
    await expect(timedOut).rejects.toThrow('timeout');

    const loadFailed = port.exchange(request(port.identity, 'load-error-request'));
    await flush();
    webView.emit('loaderror');
    await expect(loadFailed).rejects.toThrow('load-failed');
    expect(webView.removed).toBe(true);

    const replacement = new FakeWebView();
    const replacementResolver = createUxpComfyUiFrontendBridgeResolver({
      connections: connectionReader(),
      pluginId: 'com.imagen-ps.panel',
      hostWindow: new FakeHostWindow(),
      clock: new FakeClock(),
      createRuntimeId: createIds(),
      createWebView: () => replacement,
      mountWebView: () => undefined,
    });
    const replacementResolving = replacementResolver.resolve('connection-1');
    await flush();
    replacement.emit('loadstart');
    replacement.emit('loadstop');
    const replacementPort = (await replacementResolving)!;
    const disposed = replacementPort.exchange(request(replacementPort.identity, 'dispose-request'));
    await flush();
    replacementResolver.dispose();
    await expect(disposed).rejects.toThrow('disposed');
    expect(replacement.listenerCount()).toBe(0);

    resolver.dispose();
  });

  it('rejects initial load timeout and detaches the failed element', async () => {
    const clock = new FakeClock();
    const frame = new FakeFrame();
    const resolver = createChromeComfyUiFrontendBridgeResolver({
      connections: connectionReader(),
      parentOrigin: CHROME_PARENT_ORIGIN,
      hostWindow: new FakeHostWindow(),
      clock,
      createRuntimeId: createIds(),
      createFrame: () => frame,
      mountFrame: () => undefined,
    });
    const resolving = resolver.resolve('connection-1');
    await flush();
    clock.runAll();
    await expect(resolving).rejects.toThrow('timeout');
    expect(frame.removed).toBe(true);
    resolver.dispose();
  });

  it('rejects a non-HTTP Chrome parent origin before creating a session', () => {
    expect(() => createChromeComfyUiFrontendBridgeResolver({
      connections: connectionReader(),
      parentOrigin: 'file://',
      hostWindow: new FakeHostWindow(),
      clock: new FakeClock(),
    })).toThrow('parent origin is invalid');
  });
});
