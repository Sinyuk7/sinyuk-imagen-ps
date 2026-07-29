import { afterEach, describe, expect, it, vi } from 'vitest';

const manager = vi.hoisted(() => ({
  execute: vi.fn(),
  dispose: vi.fn(),
}));
const createManager = vi.hoisted(() => vi.fn(() => manager));

vi.mock('./generation/provider-async-execution-manager.js', () => ({
  createProviderAsyncExecutionManager: createManager,
}));

import { _resetForTesting, getRuntime } from './runtime.js';

describe('Application runtime async execution composition', () => {
  afterEach(() => {
    _resetForTesting();
    manager.execute.mockReset();
    manager.dispose.mockReset();
    createManager.mockClear();
  });

  it('disposes the runtime-owned async manager before resetting the singleton', () => {
    getRuntime();
    _resetForTesting();

    expect(createManager).toHaveBeenCalledOnce();
    expect(manager.dispose).toHaveBeenCalledOnce();

    getRuntime();
    _resetForTesting();
    expect(createManager).toHaveBeenCalledTimes(2);
    expect(manager.dispose).toHaveBeenCalledTimes(2);
  });
});
