import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createChromeAppShell } from '../src/composition/chrome/create-chrome-app-shell';
import { createMemoryIndexedDbBackend, type ChromeKeyValueBackend, type ChromeStoreName } from '../src/adapters/chrome/indexed-db-storage';
import { AppShell } from '../src/shared/ui/app-shell';
import { listTaskRecords, type ProviderProfile } from '@imagen-ps/application';
import { _resetForTesting } from '../../../packages/application/src/runtime';
import { resetEndpointRuntimeHealthForTesting } from '../../../packages/providers/src/transport/image-endpoint/failover';

type FetchProgramStep =
  | { readonly kind: 'response'; readonly status?: number; readonly data?: unknown; readonly headers?: Record<string, string> }
  | { readonly kind: 'network_error' }
  | { readonly kind: 'timeout' };

function createCountingFetch(program: readonly FetchProgramStep[]) {
  const calls: Array<{ url: string; method: string; headers: Record<string, string>; body: unknown }> = [];
  const fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const index = calls.length;
    const step = program[Math.min(index, program.length - 1)]!;
    const headers: Record<string, string> = {};
    const headerInit = init?.headers;
    if (headerInit instanceof Headers) {
      headerInit.forEach((value, key) => {
        headers[key] = value;
      });
    } else if (Array.isArray(headerInit)) {
      for (const [key, value] of headerInit) {
        headers[key] = value;
      }
    } else if (headerInit) {
      Object.assign(headers, headerInit);
    }
    calls.push({
      url: typeof url === 'string' ? url : url.toString(),
      method: init?.method ?? 'GET',
      headers,
      body: init?.body,
    });
    if (step.kind === 'network_error') {
      throw new TypeError('Failed to fetch');
    }
    if (step.kind === 'timeout') {
      const error = new Error('Request timed out.');
      error.name = 'TimeoutError';
      throw error;
    }
    return {
      ok: (step.status ?? 200) >= 200 && (step.status ?? 200) < 300,
      status: step.status ?? 200,
      statusText: step.status === 200 || step.status === undefined ? 'OK' : `HTTP ${step.status}`,
      headers: new Headers({ 'content-type': 'application/json', ...(step.headers ?? {}) }),
      json: async () => step.data ?? { ok: true },
      text: async () => JSON.stringify(step.data ?? { ok: true }),
    } as Response;
  }) as unknown as typeof fetch;
  return {
    fetch,
    calls,
    attemptCount: () => calls.length,
    reset: () => {
      calls.length = 0;
      fetch.mockClear();
    },
  };
}

type StoredRecord = { readonly key: string; readonly value: unknown };
type StoreSeed = Partial<Record<ChromeStoreName, readonly StoredRecord[]>>;

interface ScriptedEndpoint {
  readonly baseUrl: string;
  readonly steps: readonly FetchProgramStep[];
}

interface FlowFixtureOptions {
  readonly storedProfiles?: readonly ProviderProfile[];
  readonly storedSecrets?: Readonly<Record<string, string>>;
  readonly endpoints?: Readonly<Record<string, ScriptedEndpoint>>;
}

interface FlowFixture {
  readonly host: ReturnType<typeof createChromeAppShell>;
  readonly backend: ChromeKeyValueBackend;
  readonly counting: ReturnType<typeof createCountingFetch>;
  readonly container: HTMLElement;
  requestedUrls(): readonly string[];
  endpointAttemptOrder(): readonly string[];
  persistedProfiles(): Promise<readonly ProviderProfile[]>;
  persistedSecrets(): Promise<Readonly<Record<string, string>>>;
  renderedNotices(): readonly string[];
  dispose(): Promise<void>;
}

let root: Root | undefined;
let activeFixture: FlowFixture | undefined;

function profileSeed(profile: ProviderProfile): StoredRecord {
  return { key: profile.profileId, value: profile };
}

function secretSeed(entries: Readonly<Record<string, string>>): readonly StoredRecord[] {
  return Object.entries(entries).map(([key, value]) => ({ key, value }));
}

function profileConnection(url: string, options?: {
  readonly id?: string;
  readonly selectionMode?: 'manual' | 'auto';
  readonly selectedEndpointId?: string;
  readonly extraEndpoints?: readonly Array<{ readonly id: string; readonly url: string; readonly enabled: boolean }>;
  readonly defaultModel?: string;
}): ProviderProfile['config'] {
  const id = options?.id ?? 'primary';
  const selectionMode = options?.selectionMode ?? 'manual';
  return {
    apiFormat: 'openai-images',
    displayName: 'Image Endpoint',
    connection: {
      selectionMode,
      ...(selectionMode === 'auto' ? {} : { selectedEndpointId: options?.selectedEndpointId ?? id }),
      endpoints: [
        { id, url, enabled: true },
        ...(options?.extraEndpoints ?? []),
      ],
    },
    paths: { generation: '/images/generations', edit: '/images/edits' },
    defaultModel: options?.defaultModel ?? 'gpt-image-2',
  };
}

function storedImageEndpointProfile(input: {
  readonly profileId: string;
  readonly displayName: string;
  readonly config: ProviderProfile['config'];
  readonly secretRef?: string;
  readonly models?: readonly Array<{ readonly id: string }>;
}): ProviderProfile {
  return {
    profileId: input.profileId,
    apiFormat: 'openai-images',
    displayName: input.displayName,
    enabled: true,
    config: input.config,
    ...(input.secretRef ? { secretRefs: { apiKey: input.secretRef } } : {}),
    ...(input.models ? { models: input.models } : {}),
    createdAt: '2026-07-02T00:00:00.000Z',
    updatedAt: '2026-07-02T00:00:00.000Z',
  };
}

function flowSeed(options: FlowFixtureOptions): StoreSeed {
  return {
    profiles: (options.storedProfiles ?? []).map(profileSeed),
    secrets: secretSeed(options.storedSecrets ?? {}),
  };
}

function attachProgram(endpoints: Readonly<Record<string, ScriptedEndpoint>>): ReturnType<typeof createCountingFetch> {
  const scripted = Object.values(endpoints);
  const fallback = createCountingFetch([{ kind: 'response', status: 200, data: { ok: true } }]);
  const counters = new Map<string, number>();
  const calls: Array<{ url: string; method: string; headers: Record<string, string>; body: unknown }> = [];

  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.toString();
    const endpoint = scripted.find((candidate) => url.startsWith(candidate.baseUrl));
    if (!endpoint) {
      return fallback.fetch(input, init);
    }
    const headers: Record<string, string> = {};
    const headerInit = init?.headers;
    if (headerInit instanceof Headers) {
      headerInit.forEach((value, key) => {
        headers[key] = value;
      });
    } else if (Array.isArray(headerInit)) {
      for (const [key, value] of headerInit) {
        headers[key] = value;
      }
    } else if (headerInit) {
      Object.assign(headers, headerInit);
    }
    calls.push({
      url,
      method: init?.method ?? 'GET',
      headers,
      body: init?.body,
    });
    const index = counters.get(endpoint.baseUrl) ?? 0;
    counters.set(endpoint.baseUrl, index + 1);
    const step = endpoint.steps[Math.min(index, endpoint.steps.length - 1)]!;
    if (step.kind === 'network_error') {
      throw new TypeError('Failed to fetch');
    }
    if (step.kind === 'timeout') {
      const error = new Error('Request timed out.');
      error.name = 'TimeoutError';
      throw error;
    }
    return {
      ok: (step.status ?? 200) >= 200 && (step.status ?? 200) < 300,
      status: step.status ?? 200,
      statusText: step.status === 200 || step.status === undefined ? 'OK' : `HTTP ${step.status}`,
      headers: new Headers({ 'content-type': 'application/json', ...(step.headers ?? {}) }),
      json: async () => step.data ?? { ok: true },
      text: async () => JSON.stringify(step.data ?? { ok: true }),
    } as Response;
  }) as unknown as typeof fetch;

  return {
    fetch,
    calls,
    attemptCount: () => calls.length,
    reset: () => {
      calls.length = 0;
      counters.clear();
      fetch.mockClear();
    },
  };
}

async function flush(times = 2): Promise<void> {
  for (let index = 0; index < times; index += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

async function createFlowFixture(options: FlowFixtureOptions = {}): Promise<FlowFixture> {
  const counting = attachProgram(options.endpoints ?? {});
  vi.stubGlobal('fetch', counting.fetch);
  const backend = createMemoryIndexedDbBackend({ initial: flowSeed(options) });
  const host = createChromeAppShell({ backend });
  const container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(<AppShell host={host} />);
  });
  await flush(4);

  return {
    host,
    backend,
    counting,
    container,
    requestedUrls: () => counting.calls.map((call) => call.url),
    endpointAttemptOrder: () =>
      counting.calls.map((call) => new URL(call.url).origin.replace(/^https?:\/\//, '').replace(/\.example\.com$/, '')),
    persistedProfiles: async () => backend.list<ProviderProfile>('profiles'),
    persistedSecrets: async () => {
      const rows = await backend.list<string>('secrets');
      return Object.fromEntries(rows.map((row) => [row.key, row.value]));
    },
    renderedNotices: () => Array.from(container.querySelectorAll('.status-notice,.toast-host,.err-msg')).map((node) => node.textContent ?? ''),
    async dispose() {
      await act(async () => {
        root?.unmount();
      });
      host.dispose();
      container.remove();
    },
  };
}

function buttonByTestId(container: HTMLElement, testId: string): HTMLButtonElement {
  const button = container.querySelector<HTMLButtonElement>(`[data-testid="${testId}"]`);
  if (!button) {
    throw new Error(`Missing button ${testId}`);
  }
  return button;
}

async function waitForEnabledButton(container: HTMLElement, testId: string, attempts = 8): Promise<HTMLButtonElement> {
  for (let index = 0; index < attempts; index += 1) {
    const button = container.querySelector<HTMLButtonElement>(`[data-testid="${testId}"]`);
    if (button && !button.disabled) {
      return button;
    }
    await flush();
  }
  throw new Error(`Missing enabled button ${testId}`);
}

function elementByTestId<T extends HTMLElement>(container: HTMLElement, testId: string): T {
  const element = container.querySelector<T>(`[data-testid="${testId}"]`);
  if (!element) {
    throw new Error(`Missing element ${testId}`);
  }
  return element;
}

async function waitForElementByTestId<T extends HTMLElement>(container: HTMLElement, testId: string, attempts = 8): Promise<T> {
  for (let index = 0; index < attempts; index += 1) {
    const element = container.querySelector<T>(`[data-testid="${testId}"]`);
    if (element) {
      return element;
    }
    await flush();
  }
  throw new Error(`Missing element ${testId}`);
}

function setInputValue(input: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'x' }));
}

function buttonByText(container: HTMLElement, text: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find((item) => item.textContent?.includes(text));
  if (!button) {
    throw new Error(`Missing button text ${text}`);
  }
  return button;
}

async function openSettings(container: HTMLElement): Promise<void> {
  await act(async () => {
    buttonByTestId(container, 'main-providers-button').click();
  });
  await flush();
}

async function openAddProvider(container: HTMLElement): Promise<void> {
  await act(async () => {
    elementByTestId<HTMLElement>(container, 'providers-add-button').click();
  });
  await flush();
}

async function openProfileDetail(container: HTMLElement, profileId: string): Promise<void> {
  const row = await waitForElementByTestId<HTMLElement>(container, `provider-row-${profileId}`);
  await act(async () => {
    row.click();
  });
  await flush(3);
}

async function sendPrompt(container: HTMLElement, prompt: string): Promise<void> {
  await act(async () => {
    setInputValue(elementByTestId<HTMLTextAreaElement>(container, 'composer-textarea'), prompt);
  });
  await waitForEnabledButton(container, 'composer-send-button');
  await act(async () => {
    buttonByTestId(container, 'composer-send-button').click();
  });
  await flush(6);
}

function generatedImageResponse(url: string): FetchProgramStep {
  return {
    kind: 'response',
    status: 200,
    data: {
      created: 1,
      output_format: 'png',
      data: [{ url }],
      usage: { input_tokens: 1, output_tokens: 2, total_tokens: 3 },
    },
  };
}

function modelsResponse(ids: readonly string[]): FetchProgramStep {
  return {
    kind: 'response',
    status: 200,
    data: { object: 'list', data: ids.map((id) => ({ id })) },
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
  _resetForTesting();
  resetEndpointRuntimeHealthForTesting();
});

afterEach(async () => {
  await activeFixture?.dispose();
  activeFixture = undefined;
  root = undefined;
  _resetForTesting();
  resetEndpointRuntimeHealthForTesting();
  vi.unstubAllGlobals();
});

describe('provider endpoint user flows', () => {
  it('creates a provider profile, enables auto selection, saves, reloads, and generates successfully', async () => {
    const endpoints = {
      nodeA: {
        baseUrl: 'https://node-a.example.com',
        steps: [modelsResponse(['gpt-image-2']), generatedImageResponse('https://cdn.example.com/node-a.png')],
      },
    } satisfies Readonly<Record<string, ScriptedEndpoint>>;
    activeFixture = await createFlowFixture({ endpoints });
    const { container } = activeFixture;

    await openSettings(container);
    await openAddProvider(container);
    await act(async () => {
      setInputValue(elementByTestId(container, 'provider-alias-input'), 'Multi Endpoint');
    });
    await flush();
    await act(async () => {
      setInputValue(elementByTestId(container, 'provider-endpoint-detect-input'), 'https://node-a.example.com/v1/images/generations');
    });
    await flush();
    expect(elementByTestId<HTMLInputElement>(container, 'provider-endpoint-url-0').value).toBe('https://node-a.example.com/v1');
    await act(async () => {
      setInputValue(elementByTestId(container, 'provider-api-key-input'), 'sk-test');
    });
    await flush();
    await act(async () => {
      elementByTestId<HTMLElement>(container, 'provider-selection-mode-auto').click();
    });
    await flush();
    await act(async () => {
      container.querySelector<HTMLInputElement>('input[data-testid="provider-use-custom-model-checkbox"]')?.click();
    });
    await flush();
    await act(async () => {
      setInputValue(elementByTestId(container, 'provider-default-model-input'), 'gpt-image-2');
    });
    await flush();
    await flush(6);

    expect(activeFixture.requestedUrls().filter((url) => url === 'https://node-a.example.com/v1')).toHaveLength(1);
    expect(container.textContent).toContain('Endpoint selected automatically');

    await act(async () => {
      buttonByTestId(container, 'provider-save-button').click();
    });
    await flush(6);

    const savedProfiles = await activeFixture.persistedProfiles();
    const saved = savedProfiles.find((profile) => profile.displayName === 'Multi Endpoint');
    expect(saved).toBeDefined();
    expect((saved?.config.connection as { endpoints: unknown[] }).endpoints).toHaveLength(1);
    expect(container.textContent).toContain('Multi Endpoint');
    await act(async () => {
      buttonByTestId(container, 'providers-back-button').click();
    });
    await flush(4);
    await sendPrompt(container, 'generate using best endpoint');

    expect(activeFixture.requestedUrls().filter((url) => url.includes('/v1/images/generations'))).toEqual([
      'https://node-a.example.com/v1/images/generations',
    ]);
    const tasks = await listTaskRecords();
    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.status).toBe('completed');
  });

  it('fails over from preferred endpoint to secondary and completes one successful task', async () => {
    const profile = storedImageEndpointProfile({
      profileId: 'profile-failover',
      displayName: 'Failover Profile',
      config: profileConnection('https://node-a.example.com/v1', {
        selectionMode: 'auto',
        extraEndpoints: [
          { id: 'secondary', url: 'https://node-b.example.com/v1', enabled: true },
          { id: 'tertiary', url: 'https://node-c.example.com/v1', enabled: true },
        ],
        defaultModel: 'gpt-image-2',
      }),
      secretRef: 'secret:provider-profile:profile-failover:apiKey',
    });
    activeFixture = await createFlowFixture({
      storedProfiles: [profile],
      storedSecrets: { 'secret:provider-profile:profile-failover:apiKey': 'sk-test' },
      endpoints: {
        nodeA: {
          baseUrl: 'https://node-a.example.com',
          steps: [{ kind: 'response', status: 503, data: { error: { message: 'Unavailable' } } }],
        },
        nodeB: {
          baseUrl: 'https://node-b.example.com',
          steps: [generatedImageResponse('https://cdn.example.com/node-b.png')],
        },
        nodeC: {
          baseUrl: 'https://node-c.example.com',
          steps: [generatedImageResponse('https://cdn.example.com/node-c.png')],
        },
      },
    });
    const { container } = activeFixture;

    await act(async () => {
      buttonByTestId(container, 'main-profile-selector').click();
    });
    await flush();
    await act(async () => {
      elementByTestId<HTMLElement>(container, 'profile-menu-option-profile-failover').click();
    });
    await flush();
    await sendPrompt(container, 'failover prompt');

    const generationUrls = activeFixture.requestedUrls().filter((url) => url.includes('/v1/images/generations'));
    expect(generationUrls).toEqual([
      'https://node-a.example.com/v1/images/generations',
      'https://node-b.example.com/v1/images/generations',
    ]);
    expect(generationUrls.some((url) => url.startsWith('https://node-c.example.com'))).toBe(false);
    const tasks = await listTaskRecords();
    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.status).toBe('completed');
    expect(container.querySelectorAll('[data-round-id]')).toHaveLength(1);
    expect(container.querySelectorAll('.err-card')).toHaveLength(0);
  });

  it('shows a toast after endpoint speed test and keeps endpoint latency visible', async () => {
    activeFixture = await createFlowFixture({
      endpoints: {
        nodeA: {
          baseUrl: 'https://node-a.example.com',
          steps: [{ kind: 'response', status: 200 }],
        },
      },
    });
    const { container } = activeFixture;

    await openSettings(container);
    await openAddProvider(container);
    await act(async () => {
      setInputValue(elementByTestId(container, 'provider-endpoint-detect-input'), 'https://node-a.example.com/v1/images/generations');
      setInputValue(elementByTestId(container, 'provider-api-key-input'), 'sk-test');
    });
    await flush();

    await act(async () => {
      buttonByTestId(container, 'provider-speed-test-button').click();
    });
    await flush(6);

    expect(container.querySelector('[data-testid="toast"]')?.textContent).toMatch(/Endpoint response time checked|已检查端点响应时间/);
    expect(container.textContent).toMatch(/ms|OK/);
    expect(activeFixture.requestedUrls()).toContain('https://node-a.example.com/v1');
    expect(activeFixture.counting.calls[0]?.method).toBe('HEAD');
    expect(activeFixture.counting.calls[0]?.headers).toEqual({});
  });

  it('stops immediately on non-failover auth error and leaves other endpoints untouched', async () => {
    const profile = storedImageEndpointProfile({
      profileId: 'profile-auth-stop',
      displayName: 'Auth Stop Profile',
      config: profileConnection('https://node-a.example.com/v1', {
        selectionMode: 'auto',
        extraEndpoints: [{ id: 'secondary', url: 'https://node-b.example.com/v1', enabled: true }],
        defaultModel: 'gpt-image-2',
      }),
      secretRef: 'secret:provider-profile:profile-auth-stop:apiKey',
    });
    activeFixture = await createFlowFixture({
      storedProfiles: [profile],
      storedSecrets: { 'secret:provider-profile:profile-auth-stop:apiKey': 'sk-test' },
      endpoints: {
        nodeA: {
          baseUrl: 'https://node-a.example.com',
          steps: [{ kind: 'response', status: 401, data: { error: { message: 'Unauthorized' } } }],
        },
        nodeB: {
          baseUrl: 'https://node-b.example.com',
          steps: [generatedImageResponse('https://cdn.example.com/node-b.png')],
        },
      },
    });
    const { container } = activeFixture;

    await act(async () => {
      buttonByTestId(container, 'main-profile-selector').click();
    });
    await flush();
    await act(async () => {
      elementByTestId<HTMLElement>(container, 'profile-menu-option-profile-auth-stop').click();
    });
    await flush();
    await sendPrompt(container, 'auth should stop');

    const generationUrls = activeFixture.requestedUrls().filter((url) => url.includes('/v1/images/generations'));
    expect(generationUrls).toEqual(['https://node-a.example.com/v1/images/generations']);
    const tasks = await listTaskRecords();
    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.status).toBe('failed');
    expect(container.textContent).toContain('Unauthorized');
    const persisted = (await activeFixture.persistedProfiles()).find((item) => item.profileId === 'profile-auth-stop');
    expect((persisted?.config.connection as { selectedEndpointId?: string }).selectedEndpointId).toBeUndefined();
  });

  it('keeps one failed task when all endpoints fail within bounded attempts', async () => {
    const profile = storedImageEndpointProfile({
      profileId: 'profile-all-fail',
      displayName: 'All Fail Profile',
      config: profileConnection('https://node-a.example.com/v1', {
        id: 'fail-primary',
        selectionMode: 'auto',
        extraEndpoints: [
          { id: 'fail-secondary', url: 'https://node-b.example.com/v1', enabled: true },
          { id: 'fail-tertiary', url: 'https://node-c.example.com/v1', enabled: true },
        ],
        defaultModel: 'gpt-image-2',
      }),
      secretRef: 'secret:provider-profile:profile-all-fail:apiKey',
    });
    activeFixture = await createFlowFixture({
      storedProfiles: [profile],
      storedSecrets: { 'secret:provider-profile:profile-all-fail:apiKey': 'sk-test' },
      endpoints: {
        nodeA: {
          baseUrl: 'https://node-a.example.com',
          steps: [{ kind: 'network_error' }],
        },
        nodeB: {
          baseUrl: 'https://node-b.example.com',
          steps: [{ kind: 'response', status: 503, data: { error: { message: 'Unavailable' } } }],
        },
        nodeC: {
          baseUrl: 'https://node-c.example.com',
          steps: [{ kind: 'timeout' }],
        },
      },
    });
    const { container } = activeFixture;

    await act(async () => {
      buttonByTestId(container, 'main-profile-selector').click();
    });
    await flush();
    await act(async () => {
      elementByTestId<HTMLElement>(container, 'profile-menu-option-profile-all-fail').click();
    });
    await flush();
    await sendPrompt(container, 'all endpoints fail');

    const generationUrls = activeFixture.requestedUrls().filter((url) => url.includes('/v1/images/generations'));
    expect(generationUrls).toEqual([
      'https://node-a.example.com/v1/images/generations',
      'https://node-b.example.com/v1/images/generations',
      'https://node-c.example.com/v1/images/generations',
    ]);
    const tasks = await listTaskRecords();
    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.status).toBe('failed');
    expect(container.querySelectorAll('.err-card')).toHaveLength(1);
  });
});
