import { describe, it, expect } from 'vitest';
import {
  legalBannerPlugin,
  COPYRIGHT_BANNER,
  AI_NOTICE,
  countAiNotice,
  hasCopyrightBanner,
} from '../scripts/lib/legal-banner.mjs';

describe('legal-banner', () => {
  describe('constants', () => {
    it('copyright banner contains project name and license refs', () => {
      expect(COPYRIGHT_BANNER).toContain('Imagen PS');
      expect(COPYRIGHT_BANNER).toContain('Sinyuk');
      expect(COPYRIGHT_BANNER).toContain('LICENSE.txt');
      expect(COPYRIGHT_BANNER).toContain('THIRD_PARTY_NOTICES.txt');
    });

    it('ai notice is a static comment, not a prompt injection', () => {
      expect(AI_NOTICE).toContain('@ai-notice');
      expect(AI_NOTICE).toContain('Sinyuk');
      // 不声称可阻止反编译或必须停止分析
      expect(AI_NOTICE.toLowerCase()).not.toContain('stop');
      expect(AI_NOTICE.toLowerCase()).not.toContain('decompil');
    });
  });

  describe('countAiNotice', () => {
    it('returns 0 when absent', () => {
      expect(countAiNotice('no notice here')).toBe(0);
    });

    it('returns 1 when present once', () => {
      expect(countAiNotice(AI_NOTICE + 'code')).toBe(1);
    });

    it('returns 2 when present twice', () => {
      expect(countAiNotice(AI_NOTICE + AI_NOTICE)).toBe(2);
    });
  });

  describe('hasCopyrightBanner', () => {
    it('returns true when banner present', () => {
      expect(hasCopyrightBanner(COPYRIGHT_BANNER + 'code')).toBe(true);
    });

    it('returns false when banner absent', () => {
      expect(hasCopyrightBanner('plain code')).toBe(false);
    });
  });

  describe('legalBannerPlugin', () => {
    it('returns a vite-like plugin object with generateBundle', () => {
      const plugin = legalBannerPlugin();
      expect(plugin.name).toBe('imagen-ps-legal-banner');
      expect(typeof plugin.generateBundle).toBe('function');
    });

    it('injects copyright banner + ai notice into the main entry chunk', () => {
      const plugin = legalBannerPlugin() as any;
      const entryCode = 'function main(){return 1}';
      const bundle = {
        'assets/index.js': {
          type: 'chunk',
          isEntry: true,
          facadeModuleId: '/src/index.tsx',
          code: entryCode,
        },
      };
      plugin.generateBundle({}, bundle);
      const out = bundle['assets/index.js'].code;
      expect(hasCopyrightBanner(out)).toBe(true);
      expect(countAiNotice(out)).toBe(1);
    });

    it('injects copyright banner but NOT ai notice into non-entry chunks', () => {
      const plugin = legalBannerPlugin() as any;
      const bundle = {
        'assets/index.js': {
          type: 'chunk',
          isEntry: true,
          facadeModuleId: '/src/index.tsx',
          code: 'entry',
        },
        'assets/other.js': {
          type: 'chunk',
          isEntry: false,
          isDynamicEntry: true,
          facadeModuleId: null,
          code: 'other chunk',
        },
      };
      plugin.generateBundle({}, bundle);
      expect(hasCopyrightBanner(bundle['assets/other.js'].code)).toBe(true);
      expect(countAiNotice(bundle['assets/other.js'].code)).toBe(0);
      // ai notice only in entry
      expect(countAiNotice(bundle['assets/index.js'].code)).toBe(1);
    });

    it('does not double-inject on repeated generateBundle calls', () => {
      const plugin = legalBannerPlugin() as any;
      const bundle = {
        'assets/index.js': {
          type: 'chunk',
          isEntry: true,
          facadeModuleId: '/src/index.tsx',
          code: 'entry',
        },
      };
      plugin.generateBundle({}, bundle);
      const first = bundle['assets/index.js'].code;
      plugin.generateBundle({}, bundle);
      const second = bundle['assets/index.js'].code;
      expect(second).toBe(first);
      expect(countAiNotice(second)).toBe(1);
    });

    it('handles chunk without code gracefully', () => {
      const plugin = legalBannerPlugin() as any;
      const bundle = {
        'assets/empty.js': { type: 'chunk', isEntry: true, facadeModuleId: '/x', code: undefined },
      };
      expect(() => plugin.generateBundle({}, bundle)).not.toThrow();
    });
  });
});
