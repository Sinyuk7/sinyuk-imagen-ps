import {
  DEFAULT_COMFYUI_RUNTIME_POLICY,
  deriveComfyUiConnectionTarget,
  type ComfyUiConnectionTarget,
} from '@imagen-ps/application';
import { createLogger, createMemorySink } from '@imagen-ps/foundation';
import { describe, expect, it } from 'vitest';
import {
  createChromeComfyUiFrontendBridgeGenerationFactory,
  createUxpComfyUiFrontendBridgeGenerationFactory,
  type ChromeComfyUiBridgeFrameElement,
  type ComfyUiBridgeHostWindow,
  type ComfyUiBridgeResolverClock,
  type UxpComfyUiBridgeWebViewElement,
} from '../../../src/adapters/comfyui/comfyui-frontend-bridge-resolver';

const CHROME_PARENT_ORIGIN = 'https://app.example.test';
const ALLOWED_LOG_ATTR_KEYS = new Set(['transport', 'phase', 'reason', 'result']);

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
    if (listener !== null) this.listeners.get(type)?.delete(listener);
  }

  remove(): void { this.removed = true; }
  setAttribute(name: string, value: string): void { this.attributes.set(name, value); }

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
  readonly posts: Array<readonly [unknown, string]> = [];

  postMessage(message: unknown, targetOrigin: string): void {
    this.posts.push([message, targetOrigin]);
  }
}

function target(baseUrl = 'https://comfy.example.test/proxy'): ComfyUiConnectionTarget {
  return deriveComfyUiConnectionTarget(baseUrl, DEFAULT_COMFYUI_RUNTIME_POLICY);
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
  return { requestId, identity: { ...identity }, command: 'handshake' as const, payload: {} };
}

function queryIdentity(url: string) {
  const params = new URL(url).searchParams;
  return {
    origin: params.get('imagenOrigin'),
    sourceId: params.get('imagenSourceId'),
    loadId: params.get('imagenLoadId'),
  };
}

describe('ComfyUI frontend Bridge generation factories', () => {
  it('binds every Chrome transport value to one immutable target', async () => {
    const hostWindow = new FakeHostWindow();
    const frame = new FakeFrame();
    const connectionTarget = target('https://comfy.example.test/reverse-proxy');
    const generation = createChromeComfyUiFrontendBridgeGenerationFactory({
      parentOrigin: CHROME_PARENT_ORIGIN,
      hostWindow,
      clock: new FakeClock(),
      createRuntimeId: createIds(),
      createFrame: () => frame,
      mountFrame: () => undefined,
    }).create(connectionTarget);

    expect(generation.target).toEqual({
      baseUrl: 'https://comfy.example.test/reverse-proxy',
      origin: 'https://comfy.example.test',
      probeUrl: 'https://comfy.example.test/reverse-proxy/system_stats',
      frontendBaseUrl: 'https://comfy.example.test/reverse-proxy',
      websocketUrl: 'wss://comfy.example.test/reverse-proxy/ws',
      requestTimeoutMs: 30_000,
      observationTimeoutMs: 300_000,
    });
    expect(Object.isFrozen(generation.target)).toBe(true);

    const resolving = generation.resolve('workflow-1');
    await flush();
    expect(frame.src).toMatch(/^https:\/\/comfy\.example\.test\/reverse-proxy\/?\?/);
    frame.emit('load');
    const port = (await resolving)!;
    expect(port.identity.origin).toBe(CHROME_PARENT_ORIGIN);
    expect(queryIdentity(frame.src)).toEqual({
      origin: CHROME_PARENT_ORIGIN,
      sourceId: port.identity.sourceId,
      loadId: port.identity.loadId,
    });

    const outgoing = request(port.identity, 'chrome-request');
    const pending = port.exchange(outgoing);
    await flush();
    expect(frame.posts).toEqual([[outgoing, connectionTarget.origin]]);
    for (const rejected of [
      { origin: 'https://other.example.test', source: frame.contentWindow },
      { origin: `${connectionTarget.origin}/path`, source: frame.contentWindow },
      { origin: connectionTarget.origin, source: {} },
    ]) {
      hostWindow.emit({ ...rejected, data: { requestId: outgoing.requestId, ok: true } });
    }
    const response = { requestId: outgoing.requestId, ok: true, payload: {} };
    hostWindow.emit({ origin: connectionTarget.origin, source: frame.contentWindow, data: response });
    await expect(pending).resolves.toBe(response);

    generation.dispose();
    generation.dispose();
    expect(hostWindow.listeners.size).toBe(0);
    expect(frame.removed).toBe(true);
    expect(frame.listenerCount()).toBe(0);
  });

  it('uses exact UXP content origin, WebView source, identity, and targetOrigin', async () => {
    const hostWindow = new FakeHostWindow();
    const webView = new FakeWebView();
    const connectionTarget = target();
    const generation = createUxpComfyUiFrontendBridgeGenerationFactory({
      pluginId: 'com.imagen-ps.panel',
      hostWindow,
      clock: new FakeClock(),
      createRuntimeId: createIds(),
      createWebView: () => webView,
      mountWebView: () => undefined,
    }).create(connectionTarget);

    const resolving = generation.resolve('workflow-1');
    await flush();
    webView.emit('loadstart');
    webView.emit('loadstop');
    const port = (await resolving)!;
    expect(port.identity.origin).toBe('com.imagen-ps.panel');

    const outgoing = request(port.identity, 'uxp-request');
    const pending = port.exchange(outgoing);
    await flush();
    expect(webView.posts).toEqual([[outgoing, connectionTarget.origin]]);
    for (const rejected of [
      { origin: `${connectionTarget.origin}.evil.invalid/`, source: webView },
      { origin: `https://user:password@${new URL(connectionTarget.origin).host}/`, source: webView },
      { origin: webView.src, source: {} },
      { origin: 'not-a-url', source: webView },
    ]) {
      hostWindow.emit({ ...rejected, data: { requestId: outgoing.requestId, ok: true } });
    }
    const response = { requestId: outgoing.requestId, ok: true, payload: {} };
    hostWindow.emit({ origin: webView.src, source: webView, data: response });
    await expect(pending).resolves.toBe(response);
    generation.dispose();
  });

  it('retries a UXP handshake until the page listener can receive it', async () => {
    const clock = new FakeClock();
    const hostWindow = new FakeHostWindow();
    const webView = new FakeWebView();
    const generation = createUxpComfyUiFrontendBridgeGenerationFactory({
      pluginId: 'com.imagen-ps.panel',
      hostWindow,
      clock,
      createRuntimeId: createIds(),
      createWebView: () => webView,
      mountWebView: () => undefined,
    }).create(target());

    const resolving = generation.resolve('workflow-1');
    await flush();
    webView.emit('loadstop');
    const port = (await resolving)!;
    const outgoing = request(port.identity, 'uxp-retry-request');
    const pending = port.exchange(outgoing);
    await flush();
    expect(webView.posts).toEqual([[outgoing, generation.target.origin]]);

    clock.runTimeout(500);
    expect(webView.posts).toEqual([
      [outgoing, generation.target.origin],
      [outgoing, generation.target.origin],
    ]);
    const response = { requestId: outgoing.requestId, ok: true, payload: {} };
    hostWindow.emit({ origin: webView.src, source: webView, data: response });
    await expect(pending).resolves.toBe(response);
    expect(clock.timeouts()).not.toContain(500);
    generation.dispose();
  });

  it('retires bounded existing exchanges and rejects new resolves', async () => {
    const hostWindow = new FakeHostWindow();
    const frame = new FakeFrame();
    const generation = createChromeComfyUiFrontendBridgeGenerationFactory({
      parentOrigin: CHROME_PARENT_ORIGIN,
      hostWindow,
      clock: new FakeClock(),
      createRuntimeId: createIds(),
      createFrame: () => frame,
      mountFrame: () => undefined,
    }).create(target());

    const resolving = generation.resolve('workflow-1');
    await flush();
    frame.emit('load');
    const port = (await resolving)!;
    const outgoing = request(port.identity, 'retiring-request');
    const pending = port.exchange(outgoing);
    await flush();

    generation.retire();
    generation.retire();
    await expect(generation.resolve('workflow-2')).resolves.toBeUndefined();
    expect(frame.removed).toBe(false);
    const response = { requestId: outgoing.requestId, ok: true, payload: {} };
    hostWindow.emit({ origin: generation.target.origin, source: frame.contentWindow, data: response });
    await expect(pending).resolves.toBe(response);
    expect(frame.removed).toBe(true);
    expect(hostWindow.listeners.size).toBe(0);
  });

  it('maps load timeout, loaderror, abort, and stale identity to structured errors', async () => {
    const clock = new FakeClock();
    const webViews: FakeWebView[] = [];
    const factory = createUxpComfyUiFrontendBridgeGenerationFactory({
      pluginId: 'com.imagen-ps.panel',
      hostWindow: new FakeHostWindow(),
      clock,
      createRuntimeId: createIds(),
      createWebView: () => {
        const webView = new FakeWebView();
        webViews.push(webView);
        return webView;
      },
      mountWebView: () => undefined,
    });

    const timeoutGeneration = factory.create(target());
    const timedOut = timeoutGeneration.resolve('timeout');
    await flush();
    clock.runTimeout(30_000);
    await expect(timedOut).rejects.toMatchObject({
      name: 'ComfyUiFrontendBridgeResolutionError', phase: 'ready', reason: 'timeout',
    });

    const failedGeneration = factory.create(target());
    const failed = failedGeneration.resolve('failed');
    await flush();
    webViews[1]!.emit('loaderror');
    await expect(failed).rejects.toMatchObject({ phase: 'load', reason: 'load-failed' });

    const abortedGeneration = factory.create(target());
    const owner = new AbortController();
    const aborted = abortedGeneration.resolve('aborted', owner.signal);
    await flush();
    owner.abort();
    await expect(aborted).rejects.toMatchObject({ phase: 'ready', reason: 'aborted' });
    abortedGeneration.dispose();

    const readyGeneration = factory.create(target());
    const ready = readyGeneration.resolve('ready');
    await flush();
    webViews[3]!.emit('loadstart');
    webViews[3]!.emit('loadstop');
    const port = (await ready)!;
    await expect(port.exchange(request({ ...port.identity, loadId: 'stale-load' }, 'stale'))).rejects.toMatchObject({
      phase: 'contract', reason: 'identity-mismatch',
    });
    readyGeneration.dispose();
  });

  it('isolates generations for similar but distinct targets', async () => {
    const frames: FakeFrame[] = [];
    const factory = createChromeComfyUiFrontendBridgeGenerationFactory({
      parentOrigin: CHROME_PARENT_ORIGIN,
      hostWindow: new FakeHostWindow(),
      clock: new FakeClock(),
      createRuntimeId: createIds(),
      createFrame: () => {
        const frame = new FakeFrame();
        frames.push(frame);
        return frame;
      },
      mountFrame: () => undefined,
    });
    const localhost = factory.create(target('http://localhost:8188/proxy'));
    const loopback = factory.create(target('http://127.0.0.1:8188/proxy'));
    const first = localhost.resolve('workflow');
    const second = loopback.resolve('workflow');
    await flush();
    frames[0]!.emit('load');
    frames[1]!.emit('load');
    expect((await first)?.identity).not.toBe((await second)?.identity);
    expect(new URL(frames[0]!.src).origin).toBe('http://localhost:8188');
    expect(new URL(frames[1]!.src).origin).toBe('http://127.0.0.1:8188');
    localhost.dispose();
    loopback.dispose();
  });

  it('emits only bounded diagnostics without URL, identity, payload, workflow, or request facts', async () => {
    const sink = createMemorySink();
    const logger = createLogger({
      sink,
      context: { surface: 'test', package: 'app', component: 'transport' },
      traceId: 'comfyui-bridge-contract',
    });
    const hostWindow = new FakeHostWindow();
    const webView = new FakeWebView();
    const generation = createUxpComfyUiFrontendBridgeGenerationFactory({
      pluginId: 'com.imagen-ps.panel',
      hostWindow,
      clock: new FakeClock(),
      createRuntimeId: createIds(),
      createWebView: () => webView,
      mountWebView: () => undefined,
      logger,
    }).create(target('https://secret.example.test/private-proxy'));

    const resolving = generation.resolve('secret-workflow');
    await flush();
    webView.emit('loadstart');
    webView.emit('loadstop');
    const port = (await resolving)!;
    const pending = port.exchange(request(port.identity, 'secret-request'));
    await flush();
    hostWindow.emit({
      origin: 'https://attacker.example.test/private',
      source: webView,
      data: { requestId: 'secret-request', payload: { token: 'secret-payload' } },
    });
    generation.dispose();
    await expect(pending).rejects.toMatchObject({ reason: 'disposed' });

    expect(sink.records.every((record) => (
      Object.keys(record.attrs ?? {}).every((key) => ALLOWED_LOG_ATTR_KEYS.has(key))
    ))).toBe(true);
    const serialized = JSON.stringify(sink.records);
    for (const secret of [
      'secret.example.test', 'private-proxy', 'secret-workflow', 'secret-request',
      'secret-payload', 'identity', 'payload', port.identity.sourceId, port.identity.loadId,
    ]) expect(serialized).not.toContain(secret);
  });

  it('records page bridge lifecycle only from the active UXP WebView source', async () => {
    const sink = createMemorySink();
    const logger = createLogger({
      sink,
      context: { surface: 'test', package: 'app', component: 'transport' },
      traceId: 'comfyui-bridge-page-diagnostics',
    });
    const hostWindow = new FakeHostWindow();
    const webView = new FakeWebView();
    const generation = createUxpComfyUiFrontendBridgeGenerationFactory({
      pluginId: 'com.imagen-ps.panel',
      hostWindow,
      clock: new FakeClock(),
      createRuntimeId: createIds(),
      createWebView: () => webView,
      mountWebView: () => undefined,
      logger,
    }).create(target());

    const resolving = generation.resolve('workflow-1');
    await flush();
    webView.emit('loadstop');
    await resolving;
    for (const stage of ['transport-ready', 'listener-attached', 'message-received', 'response-sent'] as const) {
      hostWindow.emit({
        origin: webView.src,
        source: webView,
        data: { type: 'imagen-ps.bridge.diagnostic', stage },
      });
    }
    hostWindow.emit({
      origin: webView.src,
      source: {},
      data: { type: 'imagen-ps.bridge.diagnostic', stage: 'setup-failed' },
    });

    expect(sink.records.map((record) => record.event)).toEqual(expect.arrayContaining([
      'comfyui.bridge.page.transport_ready',
      'comfyui.bridge.page.listener_attached',
      'comfyui.bridge.page.message_received',
      'comfyui.bridge.page.response_sent',
    ]));
    expect(sink.records.map((record) => record.event)).not.toContain('comfyui.bridge.page.setup_failed');
    expect(sink.records.every((record) => (
      Object.keys(record.attrs ?? {}).every((key) => ALLOWED_LOG_ATTR_KEYS.has(key))
    ))).toBe(true);
    generation.dispose();
  });
});
