#!/usr/bin/env node
/**
 * Chrome 端一键开发脚本。
 *
 * 解决手动流程的几个麻烦：
 * - 自动 build:chrome --watch，改代码后刷新浏览器即生效
 * - 自动检测并清理占用的端口，避免 "Address already in use"
 * - 启动静态 server 时禁用缓存，避免浏览器缓存旧产物
 * - 自动打开 Chrome（或系统默认浏览器）
 * - 支持 test harness query params
 *
 * 用法：
 *   pnpm dev:chrome
 *   pnpm dev:chrome -- --test-harness --seed-profile=mock --seed-history
 *   pnpm dev:chrome -- --port 8080 --no-open
 */

import { createServer } from 'node:http';
import { spawn, exec } from 'node:child_process';
import { promises as fs, existsSync, createReadStream } from 'node:fs';
import { resolve, extname, normalize, sep, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createConnection } from 'node:net';
import process from 'node:process';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const appRoot = resolve(__dirname, '..');
const distWeb = resolve(appRoot, 'dist/web');
const DEFAULT_PORT = 4173;

function log(message) {
  // eslint-disable-next-line no-console
  console.log(`[dev:chrome] ${message}`);
}

function error(message) {
  // eslint-disable-next-line no-console
  console.error(`[dev:chrome] ${message}`);
}

/**
 * 解析命令行参数。
 */
function parseArgs(argv) {
  const options = {
    port: DEFAULT_PORT,
    open: true,
    testHarness: false,
    seedProfile: undefined,
    seedHistory: false,
    storage: undefined,
    db: undefined,
    resetStorage: false,
    scenario: undefined,
    filePicker: undefined,
    mockFailure: undefined,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];

    if (arg === '--port' || arg === '-p') {
      options.port = Number(next);
      i += 1;
    } else if (arg.startsWith('--port=')) {
      options.port = Number(arg.slice('--port='.length));
    } else if (arg === '--no-open') {
      options.open = false;
    } else if (arg === '--test-harness') {
      options.testHarness = true;
    } else if (arg === '--seed-profile') {
      options.seedProfile = next;
      i += 1;
    } else if (arg.startsWith('--seed-profile=')) {
      options.seedProfile = arg.slice('--seed-profile='.length);
    } else if (arg === '--seed-history') {
      options.seedHistory = true;
    } else if (arg === '--storage') {
      options.storage = next;
      i += 1;
    } else if (arg.startsWith('--storage=')) {
      options.storage = arg.slice('--storage='.length);
    } else if (arg === '--db') {
      options.db = next;
      i += 1;
    } else if (arg.startsWith('--db=')) {
      options.db = arg.slice('--db='.length);
    } else if (arg === '--reset-storage') {
      options.resetStorage = true;
    } else if (arg === '--scenario') {
      options.scenario = next;
      i += 1;
    } else if (arg.startsWith('--scenario=')) {
      options.scenario = arg.slice('--scenario='.length);
    } else if (arg === '--file-picker') {
      options.filePicker = next;
      i += 1;
    } else if (arg.startsWith('--file-picker=')) {
      options.filePicker = arg.slice('--file-picker='.length);
    } else if (arg === '--mock-failure') {
      options.mockFailure = next;
      i += 1;
    } else if (arg.startsWith('--mock-failure=')) {
      options.mockFailure = arg.slice('--mock-failure='.length);
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
  }

  return options;
}

function printHelp() {
  log(`
Chrome surface development helper.

Usage:
  pnpm dev:chrome [options]

Options:
  --port <number>          Server port (default: ${DEFAULT_PORT})
  --no-open                Do not open browser automatically
  --test-harness           Enable chrome test harness (?testHarness=1)
  --seed-profile <value>   Seed profile, e.g. mock (?seedProfile=mock)
  --seed-history           Seed history records (?seedHistory=1)
  --storage <memory|indexed-db>  Storage backend (?storage=...)
  --db <name>              IndexedDB name (?db=...)
  --reset-storage          Reset storage on load (?resetStorage=1)
  --scenario <id>          Photoshop simulator scenario (?scenario=...)
  --file-picker <image|cancel>   File picker mode (?filePicker=...)
  --mock-failure <always|none>   Mock failure mode (?mockFailure=...)
  --help, -h               Show this help

Examples:
  pnpm dev:chrome
  pnpm dev:chrome -- --test-harness --seed-profile=mock --seed-history
  pnpm dev:chrome -- --port 8080 --no-open
`);
}

/**
 * 构建带 query params 的访问 URL。
 */
function buildUrl(port, options) {
  const params = new URLSearchParams();
  if (options.testHarness) params.set('testHarness', '1');
  if (options.seedProfile) params.set('seedProfile', options.seedProfile);
  if (options.seedHistory) params.set('seedHistory', '1');
  if (options.storage) params.set('storage', options.storage);
  if (options.db) params.set('db', options.db);
  if (options.resetStorage) params.set('resetStorage', '1');
  if (options.scenario) params.set('scenario', options.scenario);
  if (options.filePicker) params.set('filePicker', options.filePicker);
  if (options.mockFailure) params.set('mockFailure', options.mockFailure);

  const query = params.toString();
  return `http://localhost:${port}/${query ? `?${query}` : ''}`;
}

/**
 * 检查端口是否被占用。
 */
function isPortInUse(port) {
  return new Promise((resolve) => {
    const socket = createConnection(port, '127.0.0.1');
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => {
      resolve(false);
    });
  });
}

/**
 * 获取占用端口的 PID 列表（跨平台）。
 */
function getPortPids(port) {
  return new Promise((resolve) => {
    const platform = process.platform;
    let command;

    if (platform === 'darwin' || platform === 'linux') {
      command = `lsof -ti tcp:${port}`;
    } else if (platform === 'win32') {
      command = `netstat -ano | findstr :${port}`;
    } else {
      resolve([]);
      return;
    }

    exec(command, { stdio: 'pipe' }, (err, stdout) => {
      if (err || !stdout) {
        resolve([]);
        return;
      }

      if (platform === 'win32') {
        const pids = stdout
          .split('\n')
          .map((line) => line.trim().split(/\s+/).pop())
          .filter((pid) => /^\d+$/.test(pid))
          .map((pid) => Number(pid));
        resolve(pids);
      } else {
        const pids = stdout
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => /^\d+$/.test(line))
          .map((line) => Number(line));
        resolve(pids);
      }
    });
  });
}

/**
 * 尝试结束占用端口的进程。
 */
async function killPortOccupiers(port) {
  const pids = await getPortPids(port);
  if (pids.length === 0) {
    return false;
  }

  log(`Port ${port} is occupied by PID(s): ${pids.join(', ')}. Stopping...`);

  for (const pid of pids) {
    try {
      if (process.platform === 'win32') {
        spawn('taskkill', ['/PID', String(pid), '/F'], { stdio: 'ignore' });
      } else {
        process.kill(pid, 'SIGTERM');
      }
    } catch (err) {
      error(`Failed to stop PID ${pid}: ${err.message}`);
    }
  }

  // 等待端口释放
  for (let i = 0; i < 20; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    if (!(await isPortInUse(port))) {
      return true;
    }
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, 100));
  }

  return !(await isPortInUse(port));
}

/**
 * 确保 dist/web 存在。
 */
async function ensureDistExists() {
  if (!existsSync(distWeb)) {
    await fs.mkdir(distWeb, { recursive: true });
  }
}

/**
 * 启动 Vite watch build。
 * 返回 { process, ready: Promise }，ready 在第一次构建完成后 resolve。
 */
function startWatchBuild() {
  log('Starting vite build:chrome --watch...');

  const vite = spawn(
    'pnpm',
    ['exec', 'vite', 'build', '--config', 'vite.chrome.config.ts', '--watch'],
    {
      cwd: appRoot,
      stdio: 'pipe',
      shell: process.platform === 'win32',
    },
  );

  let readyResolve;
  let readyReject;
  const ready = new Promise((resolve, reject) => {
    readyResolve = resolve;
    readyReject = reject;
  });

  let outputBuffer = '';

  vite.stdout.on('data', (data) => {
    const text = data.toString();
    outputBuffer += text;
    process.stdout.write(text);

    // Vite watch 首次构建完成会输出 "built in ..."
    if (/built in \d+ms/.test(text) && readyResolve) {
      readyResolve();
      readyResolve = undefined;
      readyReject = undefined;
    }
  });

  vite.stderr.on('data', (data) => {
    process.stderr.write(data.toString());
  });

  vite.on('error', (err) => {
    if (readyReject) {
      readyReject(err);
    }
  });

  vite.on('exit', (code) => {
    if (readyReject) {
      readyReject(new Error(`Vite watch build exited with code ${code}`));
    }
  });

  // 兜底：如果 60 秒内还没看到 built in，也 resolve（可能输出格式变化）
  setTimeout(() => {
    if (readyResolve) {
      log('Build ready timeout fallback triggered.');
      readyResolve();
    }
  }, 60000);

  return { process: vite, ready };
}

/**
 * 安全的文件路径解析，防止目录遍历。
 */
function safeFilePath(urlPath) {
  const decoded = decodeURIComponent(urlPath);
  const normalized = normalize(decoded).replace(/\\/g, '/');
  if (normalized.startsWith('..') || normalized.includes('/../')) {
    return null;
  }
  return join(distWeb, normalized);
}

/**
 * 根据扩展名返回 MIME type。
 */
function mimeType(filePath) {
  const map = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.mjs': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.map': 'application/json',
  };
  return map[extname(filePath).toLowerCase()] || 'application/octet-stream';
}

/**
 * 启动静态 server，禁用缓存。
 */
function startStaticServer(port) {
  const server = createServer(async (req, res) => {
    let filePath = safeFilePath(req.url.split('?')[0]);
    if (!filePath) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    try {
      const stat = await fs.stat(filePath);
      if (stat.isDirectory()) {
        filePath = join(filePath, 'index.html');
      }
    } catch {
      // 文件不存在，尝试 fallback 到 index.html（支持 SPA 路由）
      const fallback = join(distWeb, 'index.html');
      if (existsSync(fallback)) {
        filePath = fallback;
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not found');
        return;
      }
    }

    if (!existsSync(filePath)) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }

    res.writeHead(200, {
      'Content-Type': mimeType(filePath),
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      Pragma: 'no-cache',
      Expires: '0',
    });

    createReadStream(filePath).pipe(res);
  });

  return new Promise((resolve, reject) => {
    server.listen(port, '127.0.0.1', (err) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(server);
    });
  });
}

/**
 * 打开系统默认浏览器。
 */
function openBrowser(url) {
  const platform = process.platform;
  const command = platform === 'darwin' ? 'open' : platform === 'win32' ? 'start' : 'xdg-open';
  const args = platform === 'win32' ? ['""', url] : [url];

  try {
    spawn(command, args, {
      stdio: 'ignore',
      detached: true,
      shell: platform === 'win32',
    });
  } catch (err) {
    error(`Failed to open browser: ${err.message}`);
  }
}

/**
 * 主流程。
 */
async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (Number.isNaN(options.port) || options.port < 1 || options.port > 65535) {
    error(`Invalid port: ${options.port}`);
    process.exit(1);
  }

  await ensureDistExists();

  // 检查并清理端口占用
  if (await isPortInUse(options.port)) {
    const killed = await killPortOccupiers(options.port);
    if (!killed) {
      error(`Could not free port ${options.port}. Please stop the existing server manually.`);
      process.exit(1);
    }
    log(`Port ${options.port} is now free.`);
  }

  // 启动 watch build
  const build = startWatchBuild();

  try {
    await build.ready;
    log('Initial chrome build complete.');
  } catch (err) {
    error(`Build failed: ${err.message}`);
    process.exit(1);
  }

  // 启动静态 server
  let server;
  try {
    server = await startStaticServer(options.port);
    log(`Static server running at http://localhost:${options.port}`);
  } catch (err) {
    error(`Failed to start server: ${err.message}`);
    build.process.kill('SIGTERM');
    process.exit(1);
  }

  const url = buildUrl(options.port, options);
  log(`Open ${url}`);

  if (options.open) {
    openBrowser(url);
  }

  // 优雅关闭
  function shutdown(signal) {
    log(`Received ${signal}. Shutting down...`);
    server.close(() => {
      build.process.kill('SIGTERM');
      process.exit(0);
    });

    // 兜底：3 秒后强制退出
    setTimeout(() => {
      build.process.kill('SIGKILL');
      process.exit(1);
    }, 3000);
  }

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // 保持进程运行
  // eslint-disable-next-line no-constant-condition
  while (true) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, 1000));
  }
}

main().catch((err) => {
  error(err.message);
  process.exit(1);
});
