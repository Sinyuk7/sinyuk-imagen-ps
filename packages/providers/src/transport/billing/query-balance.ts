import type {
  ProviderBalanceSnapshot,
} from '../../contract/billing.js';

interface QueryBalanceRequest {
  readonly url: string;
  readonly method: 'GET' | 'POST';
  readonly headers: Readonly<Record<string, string>>;
  readonly body?: string;
  readonly signal?: AbortSignal;
}

/**
 * 余额接口固定挂在站点根路径时，按 origin 解析 endpoint，避免误继承 `/v1` 之类的 invoke base path。
 */
export function resolveRootBillingUrl(endpointUrl: string, billingPath: string): string {
  return new URL(billingPath, endpointUrl).toString();
}

function createHttpError(status: number, bodyText: string): Error & { readonly statusCode: number } {
  const message = bodyText.trim().length > 0
    ? `Billing query failed with HTTP ${status}: ${bodyText.trim()}`
    : `Billing query failed with HTTP ${status}.`;
  return Object.assign(new Error(message), {
    statusCode: status,
    name: 'ProviderBalanceQueryHttpError',
  }) as Error & { readonly statusCode: number };
}

export async function fetchProviderBalanceJson(
  request: QueryBalanceRequest,
): Promise<unknown> {
  const response = await fetch(request.url, {
    method: request.method,
    headers: request.headers,
    ...(typeof request.body === 'string' ? { body: request.body } : {}),
    ...(request.signal ? { signal: request.signal } : {}),
  });
  const text = await response.text();
  if (!response.ok) {
    throw createHttpError(response.status, text);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('Billing query returned invalid JSON.');
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseDecimalString(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }
  return undefined;
}

export function parseNewApiBalanceResponse(raw: unknown): ProviderBalanceSnapshot {
  if (!isRecord(raw)) {
    throw new Error('New API balance response is not a JSON object.');
  }
  const success = raw.success;
  if (success === false) {
    throw new Error(typeof raw.message === 'string' ? raw.message : 'New API balance query failed.');
  }
  const data = isRecord(raw.data) ? raw.data : raw;
  const remaining = parseDecimalString(data.quota);
  if (remaining === undefined) {
    throw new Error('New API balance response missing "quota".');
  }
  const used = parseDecimalString(data.used_quota);
  const details = used === undefined
    ? undefined
    : [{
        kind: 'quota' as const,
        label: 'Used quota',
        value: used,
        unit: 'quota',
      }];
  return {
    primary: {
      kind: 'quota',
      remaining,
      unit: 'quota',
    },
    ...(details ? { details } : {}),
  };
}

export function parseCreditsBalanceResponse(raw: unknown): ProviderBalanceSnapshot {
  if (!isRecord(raw)) {
    throw new Error('Credits balance response is not a JSON object.');
  }
  if (typeof raw.code === 'number' && raw.code !== 0) {
    throw new Error(typeof raw.msg === 'string' ? raw.msg : `Credits balance query failed with code ${raw.code}.`);
  }
  const data = isRecord(raw.data) ? raw.data : raw;
  const remaining = parseDecimalString(data.credits);
  if (remaining === undefined) {
    throw new Error('Credits balance response missing "credits".');
  }
  return {
    primary: {
      kind: 'quota',
      remaining,
      unit: 'credits',
    },
  };
}
