import { describe, expect, it } from 'vitest';
import {
  isLogComponent,
  isLogLevel,
  isLogPackage,
  isLogStatus,
  isLogSurface,
  SCHEMA_VERSION,
} from './schema.js';

describe('schema', () => {
  it('schema version is 1', () => {
    expect(SCHEMA_VERSION).toBe(1);
  });

  it('validates levels', () => {
    expect(isLogLevel('info')).toBe(true);
    expect(isLogLevel('verbose')).toBe(false);
  });

  it('validates statuses', () => {
    expect(isLogStatus('start')).toBe(true);
    expect(isLogStatus('done')).toBe(false);
  });

  it('validates surfaces', () => {
    expect(isLogSurface('cli')).toBe(true);
    expect(isLogSurface('browser')).toBe(false);
  });

  it('validates packages', () => {
    expect(isLogPackage('core-engine')).toBe(true);
    expect(isLogPackage('unknown')).toBe(false);
  });

  it('validates components', () => {
    expect(isLogComponent('runner')).toBe(true);
    expect(isLogComponent('ui')).toBe(false);
  });
});
