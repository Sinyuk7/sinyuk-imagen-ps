import { createImmutableSnapshot, createValidationError } from '@imagen-ps/core-engine';
import type { ComfyUiConnectionTarget, ComfyUiRuntimePolicy } from './types.js';

const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;
const MAX_BASE_URL_LENGTH = 2_048;
const MAX_ROUTE_LENGTH = 512;

function boundedText(value: unknown, max: number, path: string): string {
  if (typeof value !== 'string') throw createValidationError(`${path} must be a string.`, { path });
  const result = value.trim();
  if (!result || result.length > max || CONTROL_CHARS.test(result)) {
    throw createValidationError(`${path} is invalid.`, { path });
  }
  return result;
}

/** 校验并 canonicalize 显式 scheme 的 ComfyUI base URL。 */
export function normalizeComfyUiBaseUrl(value: string): string {
  const text = boundedText(value, MAX_BASE_URL_LENGTH, 'ComfyUi.baseUrl');
  if (!/^https?:\/\//i.test(text)) {
    throw createValidationError('ComfyUI address must include http:// or https://.');
  }
  let parsed: URL;
  try {
    parsed = new URL(text);
  } catch {
    throw createValidationError('ComfyUI address is invalid.');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw createValidationError('ComfyUI address must use HTTP(S).');
  }
  if (!parsed.hostname || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw createValidationError('ComfyUI address contains unsupported URL fields.');
  }
  if (CONTROL_CHARS.test(parsed.pathname)) {
    throw createValidationError('ComfyUI address contains control characters.');
  }
  const path = parsed.pathname.replace(/\/{2,}/g, '/').replace(/\/+$/u, '');
  return `${parsed.origin}${path}`;
}

/** 在 canonical base path 下拼接 route，保留 reverse-proxy prefix。 */
export function joinComfyUiRoute(baseUrl: string, route: string): string {
  const base = normalizeComfyUiBaseUrl(baseUrl);
  const suffix = boundedText(route, MAX_ROUTE_LENGTH, 'ComfyUi.route');
  if (!suffix.startsWith('/') || suffix.startsWith('//') || CONTROL_CHARS.test(suffix)) {
    throw createValidationError('ComfyUI route is invalid.');
  }
  return `${base}${suffix}`;
}

/** 从一个 canonical base URL 派生 immutable connection target。 */
export function deriveComfyUiConnectionTarget(
  value: string,
  policy: Pick<ComfyUiRuntimePolicy, 'requestTimeoutMs' | 'observationTimeoutMs'>,
): ComfyUiConnectionTarget {
  const baseUrl = normalizeComfyUiBaseUrl(value);
  const parsed = new URL(baseUrl);
  const websocketScheme = parsed.protocol === 'https:' ? 'wss:' : 'ws:';
  const target: ComfyUiConnectionTarget = {
    baseUrl,
    origin: parsed.origin,
    probeUrl: joinComfyUiRoute(baseUrl, '/system_stats'),
    frontendBaseUrl: baseUrl,
    websocketUrl: `${websocketScheme}//${parsed.host}${parsed.pathname.replace(/\/+$/u, '')}/ws`,
    requestTimeoutMs: policy.requestTimeoutMs,
    observationTimeoutMs: policy.observationTimeoutMs,
  };
  return createImmutableSnapshot(target) as ComfyUiConnectionTarget;
}
