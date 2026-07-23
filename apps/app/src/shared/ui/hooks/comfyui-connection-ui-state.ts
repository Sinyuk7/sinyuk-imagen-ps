import {
  normalizeComfyUiBaseUrl,
  type ComfyUiConnectionError,
  type ComfyUiConnectionPhase,
  type ComfyUiConnectionSnapshot,
} from '@imagen-ps/application';

export type ComfyUiConnectionUiState =
  | { readonly kind: 'invalid'; readonly action: 'connect'; readonly disabled: true; readonly activeBaseUrl?: string }
  | { readonly kind: 'ready'; readonly action: 'connect'; readonly disabled: false; readonly baseUrl: string; readonly activeBaseUrl?: string }
  | { readonly kind: 'connecting'; readonly action: 'connecting'; readonly disabled: true; readonly baseUrl: string; readonly phase: ComfyUiConnectionPhase; readonly activeBaseUrl?: string }
  | { readonly kind: 'connected'; readonly action: 'reconnect'; readonly disabled: false; readonly baseUrl: string }
  | { readonly kind: 'failed'; readonly action: 'retry'; readonly disabled: false; readonly baseUrl: string; readonly failure: ComfyUiConnectionError; readonly activeBaseUrl?: string };

function canonicalDraft(value: string): string | undefined {
  try {
    return normalizeComfyUiBaseUrl(value);
  } catch {
    return undefined;
  }
}

/** 将 connection snapshot 纯投影为单输入、单动作 UI 状态。 */
export function deriveComfyUiConnectionUiState(
  draftBaseUrl: string,
  snapshot: ComfyUiConnectionSnapshot,
): ComfyUiConnectionUiState {
  const baseUrl = canonicalDraft(draftBaseUrl);
  const activeBaseUrl = snapshot.activeConnection?.target.baseUrl;
  if (baseUrl === undefined) {
    return { kind: 'invalid', action: 'connect', disabled: true, ...(activeBaseUrl === undefined ? {} : { activeBaseUrl }) };
  }

  const attempt = snapshot.provisionalAttempt;
  if (attempt?.target.baseUrl === baseUrl) {
    return {
      kind: 'connecting',
      action: 'connecting',
      disabled: true,
      baseUrl,
      phase: attempt.phase,
      ...(activeBaseUrl === undefined ? {} : { activeBaseUrl }),
    };
  }

  const failure = snapshot.lastFailure;
  if (failure?.target.baseUrl === baseUrl && failure.code !== 'ABORTED' && failure.code !== 'SUPERSEDED') {
    return {
      kind: 'failed',
      action: 'retry',
      disabled: false,
      baseUrl,
      failure,
      ...(activeBaseUrl === undefined ? {} : { activeBaseUrl }),
    };
  }

  if (activeBaseUrl === baseUrl) {
    return { kind: 'connected', action: 'reconnect', disabled: false, baseUrl };
  }

  return {
    kind: 'ready',
    action: 'connect',
    disabled: false,
    baseUrl,
    ...(activeBaseUrl === undefined ? {} : { activeBaseUrl }),
  };
}
