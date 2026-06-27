import { defineConfig, mergeConfig, type Plugin } from 'vite';
import { aliases as swcUxpAliases } from '@swc-uxp-wrappers/utils';
import { appViteBaseConfig } from './vite.base.config';

const UXP_SHARED_SWC_ALIAS_KEYS = [
  '@spectrum-web-components/action-button',
  '@spectrum-web-components/avatar',
  '@spectrum-web-components/button',
  '@spectrum-web-components/checkbox',
  '@spectrum-web-components/divider',
  '@spectrum-web-components/field-label',
  '@spectrum-web-components/field-label',
  '@spectrum-web-components/help-text',
  '@spectrum-web-components/menu',
  '@spectrum-web-components/popover',
  '@spectrum-web-components/tags',
  '@spectrum-web-components/textfield',
  '@spectrum-web-components/toast',
  '@spectrum-web-components/tooltip',
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

/**
 * UXP host 以 classic script 加载主 bundle，`import.meta` 是语法错误。即便
 * `modulePreload: false` + `inlineDynamicImports: true`，vite 的 `__vitePreload`
 * 仍会为内联后的动态 import 注入 `import.meta.url` 作为 preload base。该参数在
 * modulePreload 关闭时不被使用，因此在 renderChunk 阶段把 `import.meta.url`
 * 替换为空串，彻底消除 `import.meta`，避免重新出现启动问题。
 */
function uxpImportMetaCompatPlugin(): Plugin {
  return {
    name: 'imagen-ps-uxp-import-meta-compat',
    renderChunk(code) {
      if (!code.includes('import.meta')) {
        return null;
      }
      return { code: code.replaceAll('import.meta.url', '""'), map: null };
    },
  };
}

export default defineConfig(
  mergeConfig(appViteBaseConfig, {
    resolve: {
      alias: uxpSharedSwcAliases,
    },
    plugins: [uxpSwcFocusVisibleCompatPlugin(), uxpImportMetaCompatPlugin()],
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      modulePreload: false,
      rollupOptions: {
        input: 'index.html',
        output: {
          // UXP host 以 classic script 执行单 bundle：内联所有动态 import，避免 Rollup
          // 为 sp-tooltip self-managed overlay / focus-visible 生成基于 import.meta.url 的
          // chunk loader（会重新引入 import.meta 启动问题）。单入口下可安全内联。
          inlineDynamicImports: true,
          entryFileNames: 'assets/[name].js',
          chunkFileNames: 'assets/[name].js',
          assetFileNames: 'assets/[name][extname]',
        },
      },
    },
  }),
);
