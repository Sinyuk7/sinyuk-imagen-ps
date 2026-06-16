import { afterAll, beforeAll, expect } from 'vitest';
import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const cliPath = path.resolve(here, '../../dist/index.js');
export const repoRoot = path.resolve(here, '../../../..');
const contractRoot = path.join(os.tmpdir(), `imagen-cli-contract-${process.pid}`);
const binDir = path.join(contractRoot, 'bin');
const imagenPath = path.join(binDir, 'imagen');
const imagenShim = `#!/usr/bin/env node
const { spawnSync } = require('node:child_process');

const child = spawnSync(process.execPath, [${JSON.stringify(cliPath)}, ...process.argv.slice(2)], {
  stdio: 'inherit',
});

if (child.error) {
  throw child.error;
}

process.exit(child.status ?? 1);
`;
export const realHome = path.join(contractRoot, 'home');
export const sentinel = `SENTINEL_SECRET_DO_NOT_LEAK_${process.pid}`;

interface RunOptions {
  configDir?: string;
  env?: Record<string, string | undefined>;
  timeoutMs?: number;
}

interface RunResult {
  status: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  error?: SpawnSyncReturns<string>['error'];
}

export function mkdirp(dir: string): string {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function tempDir(name: string): string {
  return fs.mkdtempSync(path.join(contractRoot, `${name}-`));
}

export function runImagen(args: string[], options: RunOptions = {}): RunResult {
  const envOverrides = Object.fromEntries(
    Object.entries(options.env ?? {}).filter(([, value]) => value !== undefined),
  ) as Record<string, string>;
  const env: NodeJS.ProcessEnv = {
    PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ''}`,
    HOME: realHome,
    XDG_CONFIG_HOME: path.join(contractRoot, 'xdg-config'),
    XDG_CACHE_HOME: path.join(contractRoot, 'xdg-cache'),
    XDG_DATA_HOME: path.join(contractRoot, 'xdg-data'),
    ...(options.configDir ? { IMAGEN_CONFIG_DIR: options.configDir } : {}),
    ...envOverrides,
  };
  const res = spawnSync(imagenPath, args, {
    cwd: repoRoot,
    encoding: 'utf-8',
    env,
    shell: false,
    stdin: 'ignore',
    timeout: options.timeoutMs ?? 5_000,
    maxBuffer: 16 * 1024 * 1024,
  });
  return {
    status: res.status,
    signal: res.signal,
    stdout: res.stdout ?? '',
    stderr: res.stderr ?? '',
    error: res.error,
  };
}

function parseJson(text: string, label: string): any {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${label} is not JSON: ${text.slice(0, 500)}`);
  }
}

export function expectSuccess(res: RunResult): any {
  expect(res.error, `process error: ${String(res.error)}`).toBeUndefined();
  expect(res.signal).toBeNull();
  expect(res.status, `stderr: ${res.stderr}`).toBe(0);
  expect(res.stderr).toBe('');
  return parseJson(res.stdout, 'stdout');
}

export function expectFailureJson(res: RunResult): any {
  expect(res.error, `process error: ${String(res.error)}`).toBeUndefined();
  expect(res.signal).toBeNull();
  expect(res.status).not.toBe(0);
  expect(res.stdout).toBe('');
  const parsed = parseJson(res.stderr, 'stderr');
  expect(typeof parsed.error).toBe('string');
  return parsed;
}

export function writeJson(dir: string, name: string, value: unknown): string {
  mkdirp(dir);
  const file = path.join(dir, name);
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf-8');
  return file;
}

export function mockProfile(profileId: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const displayName = typeof overrides.displayName === 'string' ? overrides.displayName : 'Mock Dev';
  return {
    profileId,
    providerId: 'mock',
    displayName,
    config: {
      providerId: 'mock',
      family: 'image-endpoint',
      displayName,
      baseURL: 'https://mock.local',
      defaultModel: 'mock-image-v1',
      ...(overrides.config as Record<string, unknown> | undefined),
    },
    secretValues: {
      apiKey: sentinel,
      ...(overrides.secretValues as Record<string, string> | undefined),
    },
    ...Object.fromEntries(Object.entries(overrides).filter(([key]) => key !== 'config' && key !== 'secretValues')),
  };
}

export function saveProfile(configDir: string, profileId = 'mock-dev', overrides: Record<string, unknown> = {}): any {
  const fixtureDir = tempDir('fixtures');
  const profilePath = writeJson(fixtureDir, `${profileId}.json`, mockProfile(profileId, overrides));
  return expectSuccess(runImagen(['profile', 'save', `@${profilePath}`], { configDir })).profile;
}

export function readProfile(configDir: string, profileId = 'mock-dev'): any {
  return expectSuccess(runImagen(['profile', 'get', profileId], { configDir })).profile;
}

export function assertNoSentinel(...texts: string[]): void {
  for (const text of texts) {
    expect(text).not.toContain(sentinel);
  }
}

beforeAll(() => {
  fs.rmSync(contractRoot, { recursive: true, force: true });
  mkdirp(binDir);
  mkdirp(realHome);
  fs.writeFileSync(imagenPath, imagenShim, 'utf-8');
  fs.chmodSync(imagenPath, 0o755);
});

afterAll(() => {
  fs.rmSync(contractRoot, { recursive: true, force: true });
});
