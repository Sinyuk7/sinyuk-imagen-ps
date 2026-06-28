import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, mergeConfig, type Plugin } from 'vite';
import { aliases as swcUxpAliases } from '@swc-uxp-wrappers/utils';
import { appViteBaseConfig } from './vite.base.config';

const UXP_SHARED_SWC_ALIAS_KEYS = [
  '@spectrum-web-components/action-bar',
  '@spectrum-web-components/action-group',
  '@spectrum-web-components/action-button',
  '@spectrum-web-components/asset',
  '@spectrum-web-components/avatar',
  '@spectrum-web-components/banner',
  '@spectrum-web-components/button',
  '@spectrum-web-components/button-group',
  '@spectrum-web-components/card',
  '@spectrum-web-components/checkbox',
  '@spectrum-web-components/dialog',
  '@spectrum-web-components/divider',
  '@spectrum-web-components/field-group',
  '@spectrum-web-components/field-label',
  '@spectrum-web-components/help-text',
  '@spectrum-web-components/illustrated-message',
  '@spectrum-web-components/link',
  '@spectrum-web-components/menu',
  '@spectrum-web-components/meter',
  '@spectrum-web-components/number-field',
  '@spectrum-web-components/overlay',
  '@spectrum-web-components/picker-button',
  '@spectrum-web-components/popover',
  '@spectrum-web-components/quick-actions',
  '@spectrum-web-components/radio',
  '@spectrum-web-components/search',
  '@spectrum-web-components/sidenav',
  '@spectrum-web-components/swatch',
  '@spectrum-web-components/tags',
  '@spectrum-web-components/switch',
  '@spectrum-web-components/table',
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

const UXP_BOOTSTRAP_LOGGER_SCRIPT = String.raw`(function () {
  var traceId = 'tr_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10) + '_bootstrap';
  var sequence = 0;
  var filePromise;

  function spanId() {
    sequence += 1;
    return 'sp_' + Date.now().toString(36) + '_' + sequence.toString(36) + '_bootstrap';
  }

  function isoDate() {
    return new Date().toISOString().slice(0, 10);
  }

  function redactString(value) {
    return String(value)
      .replace(/(^|\s)(\/Users\/[^\s]+)/g, '$1[REDACTED_PATH]')
      .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi, '$1 [REDACTED_SECRET]')
      .replace(/\b(sk|pk)_[A-Za-z0-9_-]+/g, '[REDACTED_SECRET]');
  }

  function redactValue(value) {
    if (typeof value === 'string') {
      return redactString(value);
    }
    if (Array.isArray(value)) {
      return value.map(redactValue);
    }
    if (value && typeof value === 'object') {
      var out = {};
      Object.keys(value).forEach(function (key) {
        if (/api[_-]?key|auth|authorization|bearer|cookie|password|secret|token/i.test(key)) {
          out[key] = '[REDACTED]';
          return;
        }
        out[key] = redactValue(value[key]);
      });
      return out;
    }
    return value;
  }

  function toLogError(error) {
    if (error && typeof error === 'object') {
      return {
        message: redactString(error.message || String(error)),
        details: {
          name: redactString(error.name || 'Error'),
          stack: redactString(error.stack || ''),
        },
      };
    }
    return { message: redactString(error || 'Unknown startup error') };
  }

  function ensureFolder(parent, name) {
    return parent.getEntry(name).then(
      function (entry) {
        if (entry && typeof entry.createFile === 'function') {
          return entry;
        }
        return parent.createFolder(name);
      },
      function () {
        return parent.createFolder(name);
      },
    );
  }

  function getOrCreateFile(parent, name) {
    return parent.getEntry(name).then(
      function (entry) {
        if (entry && typeof entry.write === 'function') {
          return entry;
        }
        return parent.createFile(name, { overwrite: true });
      },
      function () {
        return parent.createFile(name, { overwrite: true });
      },
    );
  }

  function getLogTarget() {
    if (filePromise) {
      return filePromise;
    }

    filePromise = Promise.resolve().then(function () {
      if (typeof require !== 'function') {
        throw new Error('UXP require is unavailable.');
      }

      var uxp = require('uxp');
      var storage = (uxp && uxp.storage) || {};
      var lfs = storage.localFileSystem;
      if (!lfs) {
        throw new Error('UXP localFileSystem is unavailable.');
      }

      var format = (storage.formats && storage.formats.utf8) || (lfs.formats && lfs.formats.utf8);
      return lfs.getDataFolder()
        .then(function (dataFolder) { return ensureFolder(dataFolder, 'logs'); })
        .then(function (logsFolder) { return ensureFolder(logsFolder, isoDate()); })
        .then(function (dateFolder) { return getOrCreateFile(dateFolder, 'imagen.jsonl'); })
        .then(function (file) { return { file: file, format: format }; });
    });

    return filePromise;
  }

  function write(level, event, attrs, extra) {
    var record = {
      schema_version: 1,
      timestamp: new Date().toISOString(),
      level: level,
      event: event,
      surface: 'uxp',
      package: 'app',
      component: 'host',
      trace_id: traceId,
      span_id: spanId(),
    };

    if (attrs !== undefined) {
      record.attrs = redactValue(attrs);
    }
    if (extra) {
      Object.keys(extra).forEach(function (key) {
        record[key] = redactValue(extra[key]);
      });
    }

    var line = JSON.stringify(record) + '\n';
    try {
      console.log(line);
    } catch (_) {
      // ignore console failures in host bootstrap
    }

    return getLogTarget()
      .then(function (target) {
        return target.file.write(line, { append: true, format: target.format });
      })
      .catch(function (error) {
        try {
          console.error('Imagen PS bootstrap log failed', error);
        } catch (_) {
          // ignore console failures in host bootstrap
        }
      });
  }

  window.__IMAGEN_PS_BOOTSTRAP_LOG__ = {
    traceId: traceId,
    checkpoint: function (event, attrs) {
      return write('info', event, attrs);
    },
    failure: function (event, error, attrs) {
      return write('error', event, attrs, { status: 'fail', error: toLogError(error) });
    },
  };

  window.addEventListener('error', function (event) {
    write(
      'error',
      'panel.bootstrap.window_error',
      {
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      },
      { status: 'fail', error: toLogError(event.error || event.message) },
    );
  });

  window.addEventListener('unhandledrejection', function (event) {
    write('error', 'panel.bootstrap.unhandled_rejection', undefined, {
      status: 'fail',
      error: toLogError(event.reason),
    });
  });

  write('info', 'panel.bootstrap.html.loaded', {
    hasRequire: typeof require === 'function',
    hasDocument: typeof document !== 'undefined',
  });
})();`;

/**
 * Photoshop UXP treats the host-loaded panel script as a classic script in the
 * real runtime. Keep the built bundle executable as a classic script and place a
 * zero-dependency bootstrap logger before the bundle so syntax/load failures are
 * still visible in `PluginData/logs/YYYY-MM-DD/imagen.jsonl`.
 */
function uxpClassicHtmlBootstrapPlugin(): Plugin {
  return {
    name: 'imagen-ps-uxp-classic-html-bootstrap',
    writeBundle(options) {
      const outDir = options.dir ?? 'dist';
      const htmlPath = resolve(outDir, 'index.html');
      const assetsDir = resolve(outDir, 'assets');
      const bootstrapPath = resolve(assetsDir, 'uxp-bootstrap.js');
      let html = readFileSync(htmlPath, 'utf8');

      mkdirSync(assetsDir, { recursive: true });
      writeFileSync(bootstrapPath, UXP_BOOTSTRAP_LOGGER_SCRIPT);

      html = html.replace(
        /<script\s+type="module"\s+crossorigin\s+src="\.\/assets\/index\.js"><\/script>/,
        '<script src="./assets/uxp-bootstrap.js"></script>\n    <script src="./assets/index.js"></script>',
      );

      html = html.replace(
        /<script\s+type="module"\s+src="\.\/assets\/index\.js"><\/script>/,
        '<script src="./assets/uxp-bootstrap.js"></script>\n    <script src="./assets/index.js"></script>',
      );

      writeFileSync(htmlPath, html);
    },
  };
}

export default defineConfig(
  mergeConfig(appViteBaseConfig, {
    resolve: {
      alias: uxpSharedSwcAliases,
    },
    plugins: [uxpSwcFocusVisibleCompatPlugin(), uxpImportMetaCompatPlugin(), uxpClassicHtmlBootstrapPlugin()],
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
