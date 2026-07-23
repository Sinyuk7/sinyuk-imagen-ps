import { describe, expect, it } from 'vitest';
import {
  deriveComfyUiConnectionTarget,
  type ComfyUiConnectionError,
  type ComfyUiConnectionSnapshot,
} from '@imagen-ps/application';
import { deriveComfyUiConnectionUiState } from '../../../../src/shared/ui/hooks/comfyui-connection-ui-state';

const policy = { requestTimeoutMs: 30_000, observationTimeoutMs: 300_000 };
const target = (baseUrl: string) => deriveComfyUiConnectionTarget(baseUrl, policy);
const generation = (baseUrl: string) => ({
  target: target(baseUrl),
  resolve: async () => undefined,
  retire() {},
  dispose() {},
});
const active = (baseUrl: string) => ({
  attemptId: 1,
  target: target(baseUrl),
  generation: generation(baseUrl),
  connectedAt: 1,
});

describe('deriveComfyUiConnectionUiState', () => {
  it('projects invalid, ready, connected, and startup committed-but-inactive states', () => {
    expect(deriveComfyUiConnectionUiState('localhost:8188', {})).toMatchObject({ kind: 'invalid', disabled: true });
    expect(deriveComfyUiConnectionUiState('http://localhost:8188/', {})).toMatchObject({
      kind: 'ready',
      baseUrl: 'http://localhost:8188',
    });
    expect(deriveComfyUiConnectionUiState('http://localhost:8188', {
      activeConnection: active('http://localhost:8188'),
    })).toMatchObject({ kind: 'connected', action: 'reconnect' });
    expect(deriveComfyUiConnectionUiState('http://localhost:8188', {
      committedTarget: target('http://localhost:8188'),
    })).toMatchObject({ kind: 'ready', action: 'connect' });
  });

  it('keeps the old active target visible during another target attempt', () => {
    const snapshot: ComfyUiConnectionSnapshot = {
      activeConnection: active('https://old.example'),
      provisionalAttempt: {
        attemptId: 2,
        target: target('https://next.example'),
        phase: 'bridge',
        startedAt: 2,
      },
    };

    expect(deriveComfyUiConnectionUiState('https://next.example', snapshot)).toEqual({
      kind: 'connecting',
      action: 'connecting',
      disabled: true,
      baseUrl: 'https://next.example',
      phase: 'bridge',
      activeBaseUrl: 'https://old.example',
    });
  });

  it('projects only a failure owned by the current canonical draft', () => {
    const failure: ComfyUiConnectionError = {
      code: 'BRIDGE_HANDSHAKE_TIMEOUT',
      phase: 'bridge',
      reason: 'timeout',
      attemptId: 2,
      target: target('https://failed.example'),
    };
    const snapshot: ComfyUiConnectionSnapshot = {
      activeConnection: active('https://old.example'),
      lastFailure: failure,
    };

    expect(deriveComfyUiConnectionUiState('https://failed.example/', snapshot)).toMatchObject({
      kind: 'failed',
      action: 'retry',
      activeBaseUrl: 'https://old.example',
    });
    expect(deriveComfyUiConnectionUiState('https://new.example', snapshot)).toMatchObject({
      kind: 'ready',
      action: 'connect',
      activeBaseUrl: 'https://old.example',
    });
  });
});
