import type {
  ProviderBalanceSnapshot,
} from '../../contract/billing.js';

interface QueryBalanceRequest {
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly signal?: AbortSignal;
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
    method: 'GET',
    headers: request.headers,
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
