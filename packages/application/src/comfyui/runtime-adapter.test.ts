import { afterEach, describe, expect, it } from 'vitest';
import { _resetForTesting, getRuntime } from '../runtime.js';
import { setComfyUiExecutionHostPorts } from './runtime-adapter.js';

afterEach(() => {
  _resetForTesting();
});

describe('Application ComfyUI runtime adapter composition', () => {
  it('registers the stable adapter and fails closed until host ports exist', async () => {
    await expect(getRuntime().dispatcher.dispatch({
      adapter: 'comfyui',
      params: {},
    })).rejects.toMatchObject({
      category: 'execution',
      details: {
        stage: 'prepare',
        code: 'invalid-connection',
        retryDisposition: 'same-task-new-job',
      },
    });

    setComfyUiExecutionHostPorts({
      httpTransport: {
        async request() {
          throw new Error('network must not run for an invalid request');
        },
      },
    });
    await expect(getRuntime().dispatcher.dispatch({
      adapter: 'comfyui',
      params: {},
    })).rejects.toMatchObject({
      category: 'execution',
      details: {
        stage: 'prepare',
        code: 'invalid-workflow',
      },
    });
  });
});
