#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';

const DEFAULT_PLUGIN_ID = undefined;
const DEFAULT_LOG_DIRS = [
  path.join(os.homedir(), 'Library/Application Support/Adobe/Adobe UXP Developer Tool/Logs'),
  path.join(os.homedir(), 'Library/Application Support/Adobe/Adobe UXP Developer Tools/Logs'),
];
const CACHE_FILE = path.join(os.tmpdir(), 'imagen-uxp-debug-context.json');
const WS_OPEN_TIMEOUT_MS = 12000;
const CDP_RPC_TIMEOUT_MS = 45000;
const CONTEXT_TIMEOUT_MS = 45000;

const COMPUTED_PROPS = [
  'display',
  'position',
  'width',
  'height',
  'minWidth',
  'minHeight',
  'maxWidth',
  'maxHeight',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'gap',
  'rowGap',
  'columnGap',
  'marginTop',
  'marginRight',
  'marginBottom',
  'marginLeft',
  'borderRadius',
  'borderWidth',
  'overflow',
  'overflowX',
  'overflowY',
  'flexDirection',
  'flexGrow',
  'flexShrink',
  'flexBasis',
  'alignItems',
  'justifyContent',
  'lineHeight',
  'visibility',
  'opacity',
  'zIndex',
  'backgroundColor',
];

function usage(exitCode = 0) {
  const out = exitCode === 0 ? console.log : console.error;
  out(`Usage:
  node scripts/uxp-debug/uxp-debug.mjs targets [--plugin-id com.imagen-ps.panel]
  node scripts/uxp-debug/uxp-debug.mjs targets-all [--plugin-id com.imagen-ps.panel]
  node scripts/uxp-debug/uxp-debug.mjs eval <js> [--ws ws://...]
  node scripts/uxp-debug/uxp-debug.mjs inspect <selector>
  node scripts/uxp-debug/uxp-debug.mjs ancestors <selector> [depth]
  node scripts/uxp-debug/uxp-debug.mjs find-zero-size [selector]
  node scripts/uxp-debug/uxp-debug.mjs style <selector> <property> <value>
  node scripts/uxp-debug/uxp-debug.mjs outline <selector> [color]
  node scripts/uxp-debug/uxp-debug.mjs reset <selector> [property]
  node scripts/uxp-debug/uxp-debug.mjs reset --all
  node scripts/uxp-debug/uxp-debug.mjs click <selector>
  node scripts/uxp-debug/uxp-debug.mjs console [durationMs]

Options:
  --plugin-id <id>   UDT plugin id. Required unless exactly one target exists or --ws is used.
  --ws <url>         Explicit UDT relay WebSocket URL.
  --log-dir <dir>    Explicit Adobe UXP Developer Tool log directory.
`);
  process.exit(exitCode);
}

function parseArgs(argv) {
  const options = {
    pluginId: DEFAULT_PLUGIN_ID,
    wsUrl: undefined,
    logDir: undefined,
  };
  const positional = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      usage(0);
    }
    if (arg === '--plugin-id') {
      options.pluginId = requireValue(argv, ++i, arg);
      continue;
    }
    if (arg === '--ws') {
      options.wsUrl = requireValue(argv, ++i, arg);
      continue;
    }
    if (arg === '--log-dir') {
      options.logDir = requireValue(argv, ++i, arg);
      continue;
    }
    positional.push(arg);
  }
  return { options, positional };
}

function requireValue(argv, index, flag) {
  const value = argv[index];
  if (!value) {
    throw new Error(`${flag} requires a value.`);
  }
  return value;
}

function printJson(value) {
  console.log(JSON.stringify(value, null, 2));
}

function normalizeUdtWsUrl(raw) {
  if (!raw) {
    return undefined;
  }
  if (raw.startsWith('ws://') || raw.startsWith('wss://')) {
    return raw;
  }
  if (raw.startsWith('ws=')) {
    return `ws://${raw.slice(3)}`;
  }
  return raw;
}

function existingLogDirs(explicitDir) {
  if (explicitDir) {
    return [explicitDir];
  }
  return DEFAULT_LOG_DIRS.filter((dir) => fs.existsSync(dir));
}

function listUdtLogFiles(logDir) {
  if (!fs.existsSync(logDir)) {
    return [];
  }
  return fs.readdirSync(logDir)
    .filter((name) => /^appLogs-.*\.log$/.test(name))
    .map((name) => {
      const filePath = path.join(logDir, name);
      const stat = fs.statSync(filePath);
      return { filePath, mtimeMs: stat.mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
}

function extractTargetFromMessage(message) {
  const match = message.match(/"cdtDebugWsUrl":"([^"]+)"/);
  if (!match) {
    return undefined;
  }
  const wsUrl = normalizeUdtWsUrl(match[1]);
  const sessionId = wsUrl?.split('/').pop();
  const appInfoMatch = message.match(/"appInfo":(\{.*?\}),"cdtDebugWsUrl"/);
  let appInfo;
  if (appInfoMatch) {
    try {
      appInfo = JSON.parse(appInfoMatch[1]);
    } catch {
      appInfo = undefined;
    }
  }
  return { wsUrl, sessionId, appInfo };
}

function parsePluginCommandType(message) {
  const match = message.match(/\b(Load|Unload|Reload|Debug) Plugin Command\b/i);
  return match ? match[1].toLowerCase() : undefined;
}

function parsePluginLifecycleSuccessType(message) {
  if (message.includes('Load command successfull')) {
    return 'load';
  }
  if (message.includes('Unload command successfull')) {
    return 'unload';
  }
  if (message.includes('Reload command successfull')) {
    return 'reload';
  }
  if (message.includes('Debug command successfull') || message.includes('Debug command Succesful')) {
    return 'debug';
  }
  return undefined;
}

function readTargetInventory(options) {
  const targetsByWsUrl = new Map();
  let pendingPluginCommand;
  let lastKnownPluginId = options.pluginId;

  function invalidateKnownTargets(reason, pluginId) {
    for (const target of targetsByWsUrl.values()) {
      if (pluginId && target.pluginId !== pluginId) {
        continue;
      }
      if (!target.staleReason) {
        target.staleReason = reason;
      }
    }
  }

  for (const logDir of existingLogDirs(options.logDir)) {
    const logFiles = listUdtLogFiles(logDir).sort((a, b) => a.mtimeMs - b.mtimeMs);
    for (const { filePath, mtimeMs } of logFiles) {
      const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
      lines.forEach((line, index) => {
        if (!line.trim()) {
          return;
        }
        let record;
        try {
          record = JSON.parse(line);
        } catch {
          return;
        }

        const rawMessage = typeof record.message === 'string' ? record.message : '';
        const commandType = record.id && rawMessage ? parsePluginCommandType(rawMessage) : undefined;
        if (commandType) {
          pendingPluginCommand = {
            pluginId: record.id,
            commandType,
          };
          lastKnownPluginId = record.id;
          return;
        }

        const lifecycleSuccessType = rawMessage ? parsePluginLifecycleSuccessType(rawMessage) : undefined;
        if (lifecycleSuccessType && lifecycleSuccessType !== 'debug') {
          const pluginId = pendingPluginCommand?.commandType === lifecycleSuccessType
            ? pendingPluginCommand.pluginId
            : lastKnownPluginId;
          invalidateKnownTargets(
            `${lifecycleSuccessType} success at ${path.basename(filePath)}:${index + 1}`,
            pluginId,
          );
          pendingPluginCommand = undefined;
          return;
        }

        if (!rawMessage.includes('cdtDebugWsUrl')) {
          return;
        }

        const pluginId = pendingPluginCommand?.commandType === 'debug'
          ? pendingPluginCommand.pluginId
          : (record.id ?? lastKnownPluginId ?? 'unknown');
        const target = extractTargetFromMessage(rawMessage);
        if (!target?.wsUrl) {
          return;
        }

        targetsByWsUrl.set(target.wsUrl, {
          pluginId,
          wsUrl: target.wsUrl,
          sessionId: target.sessionId,
          appInfo: target.appInfo,
          logFile: filePath,
          line: index + 1,
          logMtimeMs: mtimeMs,
          staleReason: null,
        });
        pendingPluginCommand = undefined;
      });
    }
  }

  const targets = Array.from(targetsByWsUrl.values());
  const filteredTargets = options.pluginId ? targets.filter((target) => target.pluginId === options.pluginId) : targets;
  return filteredTargets
    .sort((a, b) => (b.logMtimeMs - a.logMtimeMs) || (b.line - a.line))
    .filter((target, index, all) => all.findIndex((item) => item.wsUrl === target.wsUrl) === index);
}

function readTargets(options) {
  return readTargetInventory(options).filter((target) => !target.staleReason);
}

function readContextCache(options) {
  try {
    const raw = fs.readFileSync(CACHE_FILE, 'utf8');
    const cache = JSON.parse(raw);
    if (options.pluginId && cache.pluginId !== options.pluginId) {
      return undefined;
    }
    return cache;
  } catch {
    return undefined;
  }
}

function writeContextCache(target, uniqueContextId) {
  if (!uniqueContextId) {
    return;
  }
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify({
      pluginId: target.pluginId,
      wsUrl: target.wsUrl,
      sessionId: target.sessionId,
      uniqueContextId,
      updatedAt: new Date().toISOString(),
    }, null, 2));
  } catch {
    // ignore
  }
}

function resolveTarget(options) {
  if (options.wsUrl) {
    return {
      pluginId: options.pluginId,
      wsUrl: normalizeUdtWsUrl(options.wsUrl),
      source: 'cli',
    };
  }
  const targets = readTargets(options);
  if (!options.pluginId) {
    if (targets.length === 1) {
      return { ...targets[0], source: 'udt-log' };
    }
    throw new Error(
      `Multiple or zero UDT debug targets found (${targets.length}). Pass --plugin-id com.imagen-ps.panel, or run targets to inspect candidates.`,
    );
  }
  const target = targets[0];
  if (!target) {
    const staleTargets = readTargetInventory(options);
    if (staleTargets.length > 0) {
      throw new Error(
        `All discovered UDT debug targets for ${options.pluginId} were invalidated by a later plugin load/reload/unload. Run Debug once again for ${options.pluginId}.`,
      );
    }
    throw new Error(`No UDT debug target found for plugin id ${options.pluginId}. Open UDT and run Debug once for ${options.pluginId}.`);
  }
  return { ...target, source: 'udt-log' };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class CdpClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.nextId = 1;
    this.pending = new Map();
    this.consoleEvents = [];
    this.uniqueContextId = undefined;
    this.usedCachedContext = false;
    this.contextReady = new Promise((resolve) => {
      this.resolveContext = resolve;
    });
  }

  async connect(cachedUniqueContextId) {
    this.ws = new WebSocket(this.wsUrl);
    this.ws.on('message', (data) => {
      void this.handleMessage(data);
    });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timeout opening UDT relay WebSocket.')), WS_OPEN_TIMEOUT_MS);
      const cleanup = () => {
        this.ws.off?.('open', handleOpen);
        this.ws.off?.('error', handleError);
      };
      const handleOpen = () => {
        clearTimeout(timer);
        cleanup();
        resolve();
      };
      const handleError = (event) => {
        clearTimeout(timer);
        cleanup();
        reject(new Error(`WebSocket error: ${event?.message ?? event?.error?.message ?? event?.type ?? 'unknown'}`));
      };
      this.ws.on('open', handleOpen);
      this.ws.on('error', handleError);
    });
    if (cachedUniqueContextId) {
      try {
        this.uniqueContextId = cachedUniqueContextId;
        await this.evaluate('void 0');
        this.usedCachedContext = true;
        return;
      } catch {
        this.uniqueContextId = undefined;
        this.usedCachedContext = false;
      }
    }
    await this.rpc('Runtime.enable').catch(() => undefined);
    await Promise.race([
      this.contextReady,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout waiting for Runtime.executionContextCreated.')), CONTEXT_TIMEOUT_MS)),
    ]);
  }

  close() {
    try {
      for (const pending of this.pending.values()) {
        pending.reject(new Error('CDP client closed.'));
      }
      this.pending.clear();
      if (!this.ws) {
        return;
      }
      const ws = this.ws;
      this.ws = undefined;
      ws.close();
      setTimeout(() => {
        try {
          ws.close();
        } catch {
          // ignore
        }
      }, 50).unref?.();
    } catch {
      // ignore
    }
  }

  rpc(method, params = {}) {
    const id = this.nextId;
    this.nextId += 1;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timeout waiting for ${method}.`));
      }, CDP_RPC_TIMEOUT_MS);
      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
        timer,
      });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async handleMessage(data) {
    const raw = await decodeWsData(data);
    let message;
    try {
      message = JSON.parse(raw);
    } catch {
      return;
    }
    if (message.method === 'Runtime.executionContextCreated') {
      const uniqueId = message.params?.context?.uniqueId;
      if (typeof uniqueId === 'string' && !this.uniqueContextId) {
        this.uniqueContextId = uniqueId;
        this.resolveContext(uniqueId);
      }
      return;
    }
    if (message.method === 'Runtime.executionContextDestroyed' || message.method === 'Runtime.executionContextsCleared') {
      this.uniqueContextId = undefined;
      return;
    }
    if (message.method === 'Runtime.consoleAPICalled') {
      this.consoleEvents.push(formatConsoleEvent(message.params));
      return;
    }
    if (message.id !== undefined && this.pending.has(message.id)) {
      const pending = this.pending.get(message.id);
      this.pending.delete(message.id);
      pending.resolve(message);
    }
  }

  assertResponse(label, message) {
    if (message.error) {
      throw new Error(`${label} CDP error: ${JSON.stringify(message.error)}`);
    }
    if (message.result?.exceptionDetails) {
      throw new Error(`${label} exception: ${JSON.stringify(message.result.exceptionDetails)}`);
    }
    return message.result;
  }

  async evaluate(expression) {
    if (!this.uniqueContextId) {
      throw new Error('No Runtime uniqueContextId captured.');
    }
    const result = this.assertResponse('Runtime.evaluate', await this.rpc('Runtime.evaluate', {
      expression,
      uniqueContextId: this.uniqueContextId,
      returnByValue: true,
      awaitPromise: true,
    }));
    return result?.result;
  }

  drainConsoleEvents() {
    const events = this.consoleEvents;
    this.consoleEvents = [];
    return events;
  }
}

function formatConsoleEvent(params) {
  return {
    type: params?.type ?? 'unknown',
    timestamp: params?.timestamp,
    args: Array.isArray(params?.args) ? params.args.map((arg) => {
      if (Object.prototype.hasOwnProperty.call(arg, 'value')) {
        return arg.value;
      }
      if (arg.description) {
        return arg.description;
      }
      return arg.type ?? 'unknown';
    }) : [],
    stack: Array.isArray(params?.stackTrace?.callFrames)
      ? params.stackTrace.callFrames.slice(0, 5).map((frame) => ({
        functionName: frame.functionName,
        url: frame.url,
        lineNumber: frame.lineNumber,
        columnNumber: frame.columnNumber,
      }))
      : [],
  };
}

async function decodeWsData(data) {
  if (typeof data === 'string') {
    return data;
  }
  if (data instanceof ArrayBuffer) {
    return Buffer.from(data).toString('utf8');
  }
  if (data && typeof data.text === 'function') {
    return data.text();
  }
  return String(data);
}

function valueExpression(selector) {
  return JSON.stringify(selector);
}

function runtimeHelpersExpression() {
  return `
    function cssNameToJsName(name) {
      return String(name).replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase());
    }
    function computedValue(el, property) {
      const computed = getComputedStyle(el);
      const direct = computed.getPropertyValue(property);
      if (direct !== undefined && direct !== '') return direct;
      const jsName = cssNameToJsName(property);
      return computed[jsName] !== undefined ? computed[jsName] : direct;
    }
    function inlineDeclaration(el, property) {
      const cssText = String(el.style.cssText || '');
      const wanted = String(property).toLowerCase();
      const parts = cssText.split(';');
      for (const part of parts) {
        const index = part.indexOf(':');
        if (index === -1) continue;
        const name = part.slice(0, index).trim().toLowerCase();
        if (name !== wanted) continue;
        const rawValue = part.slice(index + 1).trim();
        return {
          exists: true,
          value: rawValue.replace(/\\s*!important\\s*$/i, '').trim(),
          priority: /!important\\s*$/i.test(rawValue) ? 'important' : '',
        };
      }
      return { exists: false, value: '', priority: '' };
    }
  `;
}

function computedPropsExpression() {
  return JSON.stringify(COMPUTED_PROPS);
}

function inspectExpression(selector) {
  return `(() => {
    const selector = ${valueExpression(selector)};
    const props = ${computedPropsExpression()};
    const el = document.querySelector(selector);
    if (!el) return { ok: false, selector, error: 'not found' };
    const rect = el.getBoundingClientRect();
    const computed = getComputedStyle(el);
    const parent = el.parentElement;
    const parentRect = parent ? parent.getBoundingClientRect() : null;
    const pick = {};
    for (const prop of props) pick[prop] = computed[prop];
    return {
      ok: true,
      selector,
      tagName: el.tagName,
      id: el.id || '',
      className: String(el.className || ''),
      text: (el.textContent || '').trim().slice(0, 160),
      rect: rectToObject(rect),
      offset: {
        width: el.offsetWidth,
        height: el.offsetHeight,
        left: el.offsetLeft,
        top: el.offsetTop,
      },
      client: {
        width: el.clientWidth,
        height: el.clientHeight,
        left: el.clientLeft,
        top: el.clientTop,
      },
      scroll: {
        width: el.scrollWidth,
        height: el.scrollHeight,
        left: el.scrollLeft,
        top: el.scrollTop,
      },
      computed: pick,
      parent: parent ? {
        tagName: parent.tagName,
        id: parent.id || '',
        className: String(parent.className || ''),
        rect: rectToObject(parentRect),
      } : null,
    };
    function rectToObject(r) {
      if (!r) return null;
      return { x:r.x, y:r.y, top:r.top, right:r.right, bottom:r.bottom, left:r.left, width:r.width, height:r.height };
    }
  })()`;
}

function ancestorsExpression(selector, depth) {
  return `(() => {
    const selector = ${valueExpression(selector)};
    const depth = ${Number.isFinite(depth) ? depth : 12};
    const props = ${computedPropsExpression()};
    const start = document.querySelector(selector);
    if (!start) return { ok: false, selector, error: 'not found' };
    const ancestors = [];
    let el = start;
    for (let index = 0; el && index < depth; index += 1, el = el.parentElement) {
      const rect = el.getBoundingClientRect();
      const computed = getComputedStyle(el);
      const pick = {};
      for (const prop of props) pick[prop] = computed[prop];
      ancestors.push({
        index,
        tagName: el.tagName,
        id: el.id || '',
        className: String(el.className || ''),
        testId: el.getAttribute('data-testid') || '',
        role: el.getAttribute('role') || '',
        rect: {
          x: rect.x,
          y: rect.y,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          left: rect.left,
          width: rect.width,
          height: rect.height,
        },
        offset: {
          width: el.offsetWidth,
          height: el.offsetHeight,
          left: el.offsetLeft,
          top: el.offsetTop,
          offsetParent: el.offsetParent ? {
            tagName: el.offsetParent.tagName,
            id: el.offsetParent.id || '',
            className: String(el.offsetParent.className || ''),
          } : null,
        },
        client: {
          width: el.clientWidth,
          height: el.clientHeight,
        },
        scroll: {
          width: el.scrollWidth,
          height: el.scrollHeight,
        },
        computed: pick,
        flags: {
          zeroRect: rect.width === 0 || rect.height === 0,
          zeroOffset: el.offsetWidth === 0 || el.offsetHeight === 0,
          clips: computed.overflow === 'hidden' || computed.overflowX === 'hidden' || computed.overflowY === 'hidden',
          flexShrink: computed.flexShrink,
          positioned: computed.position !== 'static',
          hidden: computed.display === 'none' || computed.visibility === 'hidden' || computed.opacity === '0',
        },
      });
    }
    return { ok: true, selector, ancestors };
  })()`;
}

function findZeroSizeExpression(selector) {
  return `(() => {
    const rootSelector = ${selector ? valueExpression(selector) : 'null'};
    const root = rootSelector ? document.querySelector(rootSelector) : document.body;
    if (!root) return { ok: false, selector: rootSelector, error: 'root not found' };
    const elements = [root, ...Array.from(root.querySelectorAll('*'))];
    const findings = [];
    for (const el of elements) {
      if (!isActionable(el)) continue;
      const rect = el.getBoundingClientRect();
      const computed = getComputedStyle(el);
      const hidden = computed.display === 'none' || computed.visibility === 'hidden' || computed.opacity === '0';
      const zeroRect = rect.width === 0 || rect.height === 0;
      const zeroOffset = el.offsetWidth === 0 || el.offsetHeight === 0;
      if (!hidden && !zeroRect && !zeroOffset) continue;
      findings.push({
        tagName: el.tagName,
        id: el.id || '',
        className: String(el.className || ''),
        testId: el.getAttribute('data-testid') || '',
        iconName: el.getAttribute('data-icon-name') || '',
        text: (el.textContent || '').trim().slice(0, 80),
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        offset: { width: el.offsetWidth, height: el.offsetHeight },
        computed: {
          display: computed.display,
          visibility: computed.visibility,
          opacity: computed.opacity,
          overflow: computed.overflow,
          position: computed.position,
          width: computed.width,
          height: computed.height,
        },
      });
    }
    return { ok: true, selector: rootSelector || 'body', count: findings.length, limit: 80, findings: findings.slice(0, 80) };

    function isActionable(el) {
      if (el === root) return true;
      const tagName = el.tagName;
      const className = el.getAttribute('class') || String(el.className || '');
      if (/\\bui-icon-button-icon-slot\\b/.test(className)) return false;
      if (tagName === 'SVG' && el.closest('.ui-icon-button-icon-slot')) return false;
      if (['BUTTON', 'INPUT', 'TEXTAREA', 'SELECT', 'IMG', 'A'].includes(tagName)) return true;
      if (el.getAttribute('data-testid') || el.getAttribute('data-icon-name') || el.getAttribute('role')) return true;
      if (/\\b(ui-|cmp-|prov-|history-|settings-|harness-)/.test(className)) return true;
      return false;
    }
  })()`;
}

function styleExpression(selector, property, value) {
  return `(() => {
    ${runtimeHelpersExpression()}
    const selector = ${valueExpression(selector)};
    const property = ${valueExpression(property)};
    const value = ${valueExpression(value)};
    const el = document.querySelector(selector);
    if (!el) return { ok: false, selector, error: 'not found' };
    const store = ensurePatchStore();
    const key = patchKey(selector, property);
    if (!store.patches[key]) {
      const originalInline = inlineDeclaration(el, property);
      store.patches[key] = {
        selector,
        property,
        originalValue: originalInline.value,
        originalPriority: originalInline.priority,
        hadInlineValue: originalInline.exists,
        originalCssText: String(el.style.cssText || ''),
      };
    }
    const before = computedValue(el, property);
    el.style.setProperty(property, value);
    const after = computedValue(el, property);
    const rect = el.getBoundingClientRect();
    return { ok: true, selector, property, value, before, after, patchKey: key, rect: { x:rect.x, y:rect.y, width:rect.width, height:rect.height } };

    function ensurePatchStore() {
      const root = typeof window !== 'undefined' ? window : globalThis;
      if (!root.__UXP_DEBUG_PATCHES__) {
        root.__UXP_DEBUG_PATCHES__ = { patches: {} };
      }
      if (!root.__UXP_DEBUG_PATCHES__.patches) {
        root.__UXP_DEBUG_PATCHES__.patches = {};
      }
      if (globalThis !== root) {
        globalThis.__UXP_DEBUG_PATCHES__ = root.__UXP_DEBUG_PATCHES__;
      }
      return root.__UXP_DEBUG_PATCHES__;
    }
    function patchKey(selector, property) {
      return selector + '::' + property;
    }
  })()`;
}

function resetStyleExpression(selector, property, resetAll = false) {
  return `(() => {
    ${runtimeHelpersExpression()}
    const selector = ${selector ? valueExpression(selector) : 'null'};
    const property = ${property ? valueExpression(property) : 'null'};
    const resetAll = ${resetAll ? 'true' : 'false'};
    const root = typeof window !== 'undefined' ? window : globalThis;
    const store = root.__UXP_DEBUG_PATCHES__ || globalThis.__UXP_DEBUG_PATCHES__;
    if (!store || !store.patches) return { ok: true, selector, property, restored: [], missing: [], note: 'no patch store' };
    const restored = [];
    const missing = [];
    for (const key of Object.keys(store.patches)) {
      const patch = store.patches[key];
      if (!resetAll && selector && patch.selector !== selector) continue;
      if (!resetAll && property && patch.property !== property) continue;
      const el = document.querySelector(patch.selector);
      if (!el) {
        missing.push({ key, selector: patch.selector, property: patch.property, error: 'not found' });
        continue;
      }
      const before = computedValue(el, patch.property);
      if (typeof patch.originalCssText === 'string') {
        el.style.cssText = patch.originalCssText;
      } else if (patch.hadInlineValue) {
        el.style.setProperty(patch.property, patch.originalValue, patch.originalPriority || '');
      } else {
        el.style.removeProperty(patch.property);
      }
      const after = computedValue(el, patch.property);
      restored.push({
        key,
        selector: patch.selector,
        property: patch.property,
        before,
        after,
        originalValue: patch.originalValue,
        originalPriority: patch.originalPriority,
        hadInlineValue: patch.hadInlineValue,
      });
      delete store.patches[key];
    }
    return { ok: true, selector, property, resetAll, restored, missing, remaining: Object.keys(store.patches).length };
  })()`;
}

function outlineExpression(selector, color) {
  return `(() => {
    const selector = ${valueExpression(selector)};
    const color = ${valueExpression(color || '#ff3b30')};
    const el = document.querySelector(selector);
    if (!el) return { ok: false, selector, error: 'not found' };
    const before = el.style.outline;
    el.style.setProperty('outline', '2px solid ' + color);
    el.style.setProperty('outline-offset', '-2px');
    const after = getComputedStyle(el).outline;
    const rect = el.getBoundingClientRect();
    return { ok: true, selector, color, before, after, rect: { x:rect.x, y:rect.y, width:rect.width, height:rect.height } };
  })()`;
}

function clickExpression(selector) {
  return `(() => {
    const selector = ${valueExpression(selector)};
    const el = document.querySelector(selector);
    if (!el) return { ok: false, selector, error: 'not found' };
    const beforeActive = document.activeElement === el;
    const rect = el.getBoundingClientRect();
    if (typeof el.click === 'function') {
      el.click();
    } else {
      const event = new MouseEvent('click', { bubbles: true, cancelable: true, view: window });
      el.dispatchEvent(event);
    }
    const afterActive = document.activeElement === el;
    return {
      ok: true,
      selector,
      tagName: el.tagName,
      id: el.id || '',
      className: String(el.className || ''),
      beforeActive,
      afterActive,
      rect: { x:rect.x, y:rect.y, width:rect.width, height:rect.height },
    };
  })()`;
}

async function runWithClient(options, expression) {
  let target = resolveTarget(options);
  let contextCache = readContextCache(options);
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const client = new CdpClient(target.wsUrl);
    try {
      await client.connect(contextCache?.uniqueContextId);
      const result = await client.evaluate(expression);
      writeContextCache(target, client.uniqueContextId);
      return {
        target: {
          pluginId: target.pluginId,
          wsUrl: target.wsUrl,
          sessionId: target.sessionId,
          source: target.source,
          reconnectAttempt: attempt,
        },
        context: {
          uniqueContextId: client.uniqueContextId,
          source: client.usedCachedContext ? 'cache' : 'event',
        },
        result,
      };
    } catch (error) {
      lastError = error;
      if (options.wsUrl || attempt === 1) {
        throw error;
      }
      await sleep(300);
      target = resolveTarget(options);
      contextCache = readContextCache(options);
    } finally {
      client.close();
    }
  }
  throw lastError;
}

async function runConsole(options, durationMs) {
  let target = resolveTarget(options);
  let contextCache = readContextCache(options);
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const client = new CdpClient(target.wsUrl);
    try {
      await client.connect(contextCache?.uniqueContextId);
      client.drainConsoleEvents();
      await new Promise((resolve) => setTimeout(resolve, durationMs));
      writeContextCache(target, client.uniqueContextId);
      return {
        target: {
          pluginId: target.pluginId,
          wsUrl: target.wsUrl,
          sessionId: target.sessionId,
          source: target.source,
          reconnectAttempt: attempt,
        },
        context: {
          uniqueContextId: client.uniqueContextId,
          source: client.usedCachedContext ? 'cache' : 'event',
        },
        durationMs,
        events: client.drainConsoleEvents(),
      };
    } catch (error) {
      lastError = error;
      if (options.wsUrl || attempt === 1) {
        throw error;
      }
      await sleep(300);
      target = resolveTarget(options);
      contextCache = readContextCache(options);
    } finally {
      client.close();
    }
  }
  throw lastError;
}

async function main() {
  const { options, positional } = parseArgs(process.argv.slice(2));
  const [command, ...args] = positional;
  if (!command) {
    usage(1);
  }

  if (command === 'targets') {
    printJson(readTargets(options));
    return;
  }

  if (command === 'targets-all') {
    printJson(readTargetInventory(options));
    return;
  }

  if (command === 'eval') {
    if (args.length < 1) usage(1);
    printJson(await runWithClient(options, args.join(' ')));
    return;
  }

  if (command === 'inspect') {
    if (args.length !== 1) usage(1);
    printJson(await runWithClient(options, inspectExpression(args[0])));
    return;
  }

  if (command === 'ancestors') {
    if (args.length < 1 || args.length > 2) usage(1);
    const depth = args[1] === undefined ? 6 : Number(args[1]);
    printJson(await runWithClient(options, ancestorsExpression(args[0], depth)));
    return;
  }

  if (command === 'find-zero-size') {
    if (args.length > 1) usage(1);
    printJson(await runWithClient(options, findZeroSizeExpression(args[0])));
    return;
  }

  if (command === 'style') {
    if (args.length !== 3) usage(1);
    printJson(await runWithClient(options, styleExpression(args[0], args[1], args[2])));
    return;
  }

  if (command === 'outline') {
    if (args.length < 1 || args.length > 2) usage(1);
    printJson(await runWithClient(options, outlineExpression(args[0], args[1])));
    return;
  }

  if (command === 'reset' || command === 'reset-style') {
    if (args[0] === '--all') {
      if (args.length !== 1) usage(1);
      printJson(await runWithClient(options, resetStyleExpression(undefined, undefined, true)));
      return;
    }
    if (args.length < 1 || args.length > 2) usage(1);
    printJson(await runWithClient(options, resetStyleExpression(args[0], args[1])));
    return;
  }

  if (command === 'click') {
    if (args.length !== 1) usage(1);
    printJson(await runWithClient(options, clickExpression(args[0])));
    return;
  }

  if (command === 'console') {
    if (args.length > 1) usage(1);
    const durationMs = args[0] === undefined ? 3000 : Number(args[0]);
    if (!Number.isFinite(durationMs) || durationMs < 0) {
      throw new Error('console durationMs must be a non-negative number.');
    }
    printJson(await runConsole(options, durationMs));
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

main().then(() => {
  process.exit(0);
}).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
