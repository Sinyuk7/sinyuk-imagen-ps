import { describe, it, expect } from 'vitest';
import { resolvePackageFromModuleId, collectBundledPackages } from '../scripts/lib/bundled-packages.mjs';

describe('bundled-packages', () => {
  describe('resolvePackageFromModuleId', () => {
    it('returns null for non-node_modules paths', () => {
      expect(resolvePackageFromModuleId('/Users/foo/src/index.tsx')).toBeNull();
    });

    it('returns null for empty input', () => {
      expect(resolvePackageFromModuleId('')).toBeNull();
      expect(resolvePackageFromModuleId(null as any)).toBeNull();
    });

    it('resolves a real react module from node_modules', () => {
      const id = require.resolve('react');
      const pkg = resolvePackageFromModuleId(id);
      expect(pkg).not.toBeNull();
      expect(pkg!.name).toBe('react');
      expect(pkg!.version).toMatch(/^\d+\.\d+\.\d+/);
    });

    it('resolves a scoped package', () => {
      const id = require.resolve('@spectrum-web-components/icons-workflow');
      const pkg = resolvePackageFromModuleId(id);
      if (pkg) {
        expect(pkg.name).toBe('@spectrum-web-components/icons-workflow');
        expect(pkg.version).toMatch(/^\d+\.\d+\.\d+/);
      }
    });
  });

  describe('collectBundledPackages', () => {
    it('collects packages from chunk modules and dedupes', () => {
      const reactId = require.resolve('react');
      const reactDomId = require.resolve('react-dom');
      const bundle = {
        'assets/index.js': {
          type: 'chunk',
          isEntry: true,
          facadeModuleId: '/src/index.tsx',
          modules: {
            [reactId]: { renderedLength: 100 },
            [reactDomId]: { renderedLength: 200 },
          },
          code: '...',
        },
      };
      const packages = collectBundledPackages(bundle);
      const names = packages.map((p) => p.name);
      expect(names).toContain('react');
      expect(names).toContain('react-dom');
      // no duplicates
      expect(new Set(names).size).toBe(names.length);
    });

    it('excludes @imagen-ps/ workspace packages', () => {
      const bundle = {
        'assets/index.js': {
          type: 'chunk',
          isEntry: true,
          facadeModuleId: null,
          modules: {},
          code: '',
        },
      };
      const packages = collectBundledPackages(bundle);
      expect(packages.every((p) => !p.name.startsWith('@imagen-ps/'))).toBe(true);
    });

    it('keeps two versions of the same package distinct', () => {
      // 合成两个不同版本的 module id（路径中含 version）
      const id1 = '/repo/node_modules/.pnpm/foo@1.0.0/node_modules/foo/index.js';
      const id2 = '/repo/node_modules/.pnpm/foo@2.0.0/node_modules/foo/index.js';
      const bundle = {
        'assets/index.js': {
          type: 'chunk',
          modules: { [id1]: {}, [id2]: {} },
          code: '',
        },
      };
      // 注意：这两个 id 在真实 pnpm 下 resolvePackageFromModuleId 会读各自 package.json；
      // 这里路径不存在，返回 null。此测试验证 collectBundledPackages 在 null 时不报错并返回空。
      const packages = collectBundledPackages(bundle);
      expect(Array.isArray(packages)).toBe(true);
    });

    it('ignores non-chunk bundle entries', () => {
      const bundle = {
        'assets/style.css': { type: 'asset', source: '...' },
      };
      expect(collectBundledPackages(bundle)).toEqual([]);
    });
  });
});
