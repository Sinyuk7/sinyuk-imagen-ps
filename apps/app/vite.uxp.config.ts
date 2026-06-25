import { defineConfig, mergeConfig, type Plugin } from 'vite';
import { aliases as swcUxpAliases } from '@swc-uxp-wrappers/utils';
import { appViteBaseConfig } from './vite.base.config';

const UXP_SHARED_SWC_ALIAS_KEYS = [
  '@spectrum-web-components/button',
  '@spectrum-web-components/checkbox',
  '@spectrum-web-components/textfield',
] as const;

/**
 * Shared UI 源码统一引用原生 SWC 包名，UXP build 再借助官方 alias 表
 * 切到 wrapper，实现单一 `sp-*` 合同而不额外维护运行时 adapter。
 */
const uxpSharedSwcAliases = UXP_SHARED_SWC_ALIAS_KEYS.flatMap((find) => {
  const replacement = swcUxpAliases[find];
  return replacement ? [{ find, replacement }] : [];
});

const UXP_SWC_FOCUS_VISIBLE_SEGMENT = '@spectrum-web-components/shared/src/focus-visible';
const UXP_SWC_FOCUS_VISIBLE_COMPAT_SOURCE = `import "focus-visible";

/**
 * UXP host 里的主 bundle 按 classic script 执行，不能让 SWC 走到
 * import("focus-visible") 的懒加载分支，否则真实 Photoshop 面板会在
 * 解析 import.meta 时直接失败。
 *
 * 这里保留 SWC 原本的 mixin 合同，只把 polyfill 改成同步预加载，
 * 保证 shared UI 继续复用同一套 sp-* 焦点与键盘行为。
 */
let hasFocusVisible = true;

try {
  document.body.querySelector(":focus-visible");
} catch {
  hasFocusVisible = false;
}

export const FocusVisiblePolyfillMixin = (SuperClass) => {
  const coordinateWithPolyfill = (instance) => {
    if (instance.shadowRoot == null || instance.hasAttribute("data-js-focus-visible")) {
      return () => {};
    }

    if (self.applyFocusVisiblePolyfill) {
      self.applyFocusVisiblePolyfill(instance.shadowRoot);
      instance.manageAutoFocus?.();
      return () => {};
    }

    const coordinationHandler = () => {
      if (self.applyFocusVisiblePolyfill && instance.shadowRoot) {
        self.applyFocusVisiblePolyfill(instance.shadowRoot);
      }
      instance.manageAutoFocus?.();
    };

    self.addEventListener("focus-visible-polyfill-ready", coordinationHandler, { once: true });
    return () => {
      self.removeEventListener("focus-visible-polyfill-ready", coordinationHandler);
    };
  };

  const endPolyfillCoordination = Symbol("endPolyfillCoordination");

  return class FocusVisibleCoordinator extends SuperClass {
    connectedCallback() {
      super.connectedCallback?.();
      if (!hasFocusVisible) {
        requestAnimationFrame(() => {
          if (this[endPolyfillCoordination] == null) {
            this[endPolyfillCoordination] = coordinateWithPolyfill(this);
          }
        });
      }
    }

    disconnectedCallback() {
      super.disconnectedCallback?.();
      if (!hasFocusVisible) {
        requestAnimationFrame(() => {
          if (this[endPolyfillCoordination] != null) {
            this[endPolyfillCoordination]();
            this[endPolyfillCoordination] = null;
          }
        });
      }
    }
  };
};
`;

function uxpSwcFocusVisibleCompatPlugin(): Plugin {
  return {
    name: 'imagen-ps-uxp-focus-visible-compat',
    enforce: 'pre',
    transform(code, id) {
      const normalizedId = id.replaceAll('\\', '/');
      if (
        normalizedId.includes(UXP_SWC_FOCUS_VISIBLE_SEGMENT) ||
        (normalizedId.includes('/node_modules/') &&
          code.includes('import("focus-visible")') &&
          code.includes('focus-visible-polyfill-ready'))
      ) {
        return {
          code: UXP_SWC_FOCUS_VISIBLE_COMPAT_SOURCE,
          map: null,
        };
      }
      return null;
    },
  };
}

export default defineConfig(
  mergeConfig(appViteBaseConfig, {
    resolve: {
      alias: uxpSharedSwcAliases,
    },
    plugins: [uxpSwcFocusVisibleCompatPlugin()],
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      modulePreload: false,
      rollupOptions: {
        input: 'index.html',
        output: {
          entryFileNames: 'assets/[name].js',
          chunkFileNames: 'assets/[name].js',
          assetFileNames: 'assets/[name][extname]',
        },
      },
    },
  }),
);
