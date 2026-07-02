import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, mergeConfig, type Plugin } from 'vite';
import { appViteBaseConfig } from './vite.base.config';

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

  function installTextEncodingPolyfill() {
    function setGlobal(name, value) {
      try {
        if (typeof globalThis !== 'undefined') {
          globalThis[name] = value;
        }
      } catch (_) {
        // ignore globalThis assignment failures in host bootstrap
      }
      try {
        if (typeof window !== 'undefined') {
          window[name] = value;
        }
      } catch (_) {
        // ignore window assignment failures in host bootstrap
      }
    }

    function toUint8Array(input) {
      if (input instanceof Uint8Array) {
        return input;
      }
      if (input instanceof ArrayBuffer) {
        return new Uint8Array(input);
      }
      if (typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView && ArrayBuffer.isView(input)) {
        return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
      }
      if (Array.isArray(input)) {
        return new Uint8Array(input);
      }
      return new Uint8Array(0);
    }

    function fallbackDecode(bytes) {
      var output = '';
      for (var index = 0; index < bytes.length; index += 1) {
        output += String.fromCharCode(bytes[index]);
      }
      return output;
    }

    if (typeof TextEncoder === 'undefined') {
      function TextEncoderPolyfill() {}
      TextEncoderPolyfill.prototype.encode = function (value) {
        var encoded = unescape(encodeURIComponent(String(value)));
        var bytes = new Uint8Array(encoded.length);
        for (var index = 0; index < encoded.length; index += 1) {
          bytes[index] = encoded.charCodeAt(index);
        }
        return bytes;
      };
      setGlobal('TextEncoder', TextEncoderPolyfill);
    }

    if (typeof TextDecoder === 'undefined') {
      function TextDecoderPolyfill(label) {
        this.encoding = label || 'utf-8';
      }
      TextDecoderPolyfill.prototype.decode = function (input) {
        var bytes = toUint8Array(input);
        if (!bytes.length) {
          return '';
        }
        var encoded = '';
        for (var index = 0; index < bytes.length; index += 1) {
          var hex = bytes[index].toString(16).toUpperCase();
          encoded += '%' + (hex.length === 1 ? '0' + hex : hex);
        }
        try {
          return decodeURIComponent(encoded);
        } catch (_) {
          return fallbackDecode(bytes);
        }
      };
      setGlobal('TextDecoder', TextDecoderPolyfill);
    }
  }

  installTextEncodingPolyfill();

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
    plugins: [uxpImportMetaCompatPlugin(), uxpClassicHtmlBootstrapPlugin()],
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      modulePreload: false,
      rollupOptions: {
        input: 'index.html',
        output: {
          // UXP host 以 classic script 执行单 bundle：内联所有动态 import，避免 Rollup
          // 生成基于 import.meta.url 的 chunk loader（会重新引入 import.meta 启动问题）。
          // 单入口下可安全内联。
          inlineDynamicImports: true,
          entryFileNames: 'assets/[name].js',
          chunkFileNames: 'assets/[name].js',
          assetFileNames: 'assets/[name][extname]',
        },
      },
    },
  }),
);
