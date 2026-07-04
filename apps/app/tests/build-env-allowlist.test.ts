import { describe, it, expect } from 'vitest';
import {
  ALLOWED_CLIENT_DEFINES,
  ALLOWED_VITE_VARS,
  scanForbiddenEnvAccess,
  scanUnknownViteVars,
  auditViteEnvConfig,
} from '../scripts/lib/build-env-allowlist.mjs';

describe('build-env-allowlist', () => {
  describe('constants', () => {
    it('allows only __IMAGEN_PS_DEV__ as client define', () => {
      expect(ALLOWED_CLIENT_DEFINES).toContain('__IMAGEN_PS_DEV__');
    });

    it('has empty VITE_ allowlist by default', () => {
      expect(ALLOWED_VITE_VARS.length).toBe(0);
    });
  });

  describe('scanForbiddenEnvAccess', () => {
    it('detects process.env reference', () => {
      expect(scanForbiddenEnvAccess('const x = process.env.KEY')).toContain('process.env reference');
    });

    it('detects import.meta.env reference', () => {
      expect(scanForbiddenEnvAccess('const x = import.meta.env.VITE_X')).toContain('import.meta.env reference');
    });

    it('detects JSON.stringify(process.env)', () => {
      expect(scanForbiddenEnvAccess('JSON.stringify(process.env)')).toContain('JSON.stringify(process.env)');
    });

    it('passes clean code', () => {
      expect(scanForbiddenEnvAccess('function f(){return 1}')).toEqual([]);
    });
  });

  describe('scanUnknownViteVars', () => {
    it('detects VITE_ vars not in allowlist', () => {
      expect(scanUnknownViteVars('var x = VITE_API_KEY;')).toContain('VITE_API_KEY');
    });

    it('detects multiple distinct VITE_ vars', () => {
      const r = scanUnknownViteVars('VITE_A=1;VITE_B=2');
      expect(r).toEqual(['VITE_A', 'VITE_B']);
    });

    it('respects allowlist', () => {
      expect(scanUnknownViteVars('VITE_A=1;VITE_B=2', ['VITE_A'])).toEqual(['VITE_B']);
    });

    it('does not match lowercase vite_ prefix', () => {
      expect(scanUnknownViteVars('vite_foo=1')).toEqual([]);
    });

    it('passes when no VITE_ vars present', () => {
      expect(scanUnknownViteVars('function f(){return 1}')).toEqual([]);
    });
  });

  describe('auditViteEnvConfig', () => {
    it('passes a clean config with only allowlisted define', () => {
      expect(auditViteEnvConfig({ define: { __IMAGEN_PS_DEV__: 'true' } })).toEqual([]);
    });

    it('flags envPrefix empty string', () => {
      expect(auditViteEnvConfig({ envPrefix: '' })).toContain(
        'envPrefix is empty string — Vite will inject ALL env vars into client',
      );
    });

    it('flags non-allowlisted define key', () => {
      expect(auditViteEnvConfig({ define: { VITE_SECRET: '"x"' } })).toContain(
        'define injects non-allowlisted key: VITE_SECRET',
      );
    });

    it('flags define referencing process.env', () => {
      expect(auditViteEnvConfig({ define: { __IMAGEN_PS_DEV__: 'process.env.NODE_ENV' } })).toContain(
        'define __IMAGEN_PS_DEV__ references process.env — may leak env vars',
      );
    });
  });
});
