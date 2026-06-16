/**
 * 黑盒 CLI E2E smoke 测试（配置驱动）。
 *
 * 通过子进程执行 `dist/index.js`，跑真实命令序列：
 *   profile save → 健康检查（refresh-models / models）→ job submit --out → 校验落盘产物。
 *
 * 所有可变量（matrix entries、prompt、源图/mask 路径、输出尺寸、baseURL、model、跑哪些 task）
 * 都来自配置文件 `e2e.config.json`，无需改代码。密钥仍走 `.test.env`，由 entry.apiKeyEnv 按名引用。
 * 用 `IMAGEN_SMOKE_CONFIG=<path>` 可指向自定义配置。
 *
 * 双开关：`.test.env`（凭证，setup.env.ts 载入）+ 命令行 `IMAGEN_RUN_SMOKE=1`（激活 live）。
 * 缺任一 → live entry 自动 skip，默认 `pnpm test` 仅 mock、零费用。
 *
 * 设计稿：docs/testing-e2e-design.md
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const cliPath = path.resolve(here, '../../dist/index.js'); // apps/cli/dist/index.js
const repoRoot = path.resolve(here, '../../../..');
const smokeRunId = new Date().toISOString().replace(/[:.]/g, '-');
const smokeOutputRoot = path.join(repoRoot, '.test-output', 'smoke', `${smokeRunId}-${process.pid}`);

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff]);
const RIFF_MAGIC = Buffer.from([0x52, 0x49, 0x46, 0x46]);
const WEBP_MAGIC = Buffer.from([0x57, 0x45, 0x42, 0x50]);

// ---- 配置加载 -----------------------------------------------------------

interface TaskSpec {
  workflow: string;
  operation: string;
  prompt: string;
  source?: string;
  mask?: string;
}

interface OutputSpec {
  count?: number;
  width?: number;
  height?: number;
  quality?: string;
}

interface EntrySpec {
  name: string;
  providerId: 'mock' | 'image-endpoint' | 'chat-image';
  family: 'image-endpoint' | 'chat-image';
  baseURL: string;
  baseURLEnv?: string;
  model: string;
  modelEnv?: string;
  apiKey?: string;
  apiKeyEnv?: string;
  live: boolean;
  implemented: boolean;
  required?: boolean;
  tasks: string[];
  output?: OutputSpec;
}

interface E2EConfig {
  output: OutputSpec;
  tasks: Record<string, TaskSpec>;
  entries: EntrySpec[];
}

const configPath = process.env.IMAGEN_SMOKE_CONFIG
  ? path.resolve(repoRoot, process.env.IMAGEN_SMOKE_CONFIG)
  : path.join(here, 'e2e.config.json');

const config: E2EConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

// ---- 子进程执行 ---------------------------------------------------------

interface RunResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

function runCli(args: string[], configDir: string): RunResult {
  const res = spawnSync('node', [cliPath, ...args], {
    encoding: 'utf-8',
    env: { ...process.env, IMAGEN_CONFIG_DIR: configDir },
    maxBuffer: 64 * 1024 * 1024,
  });
  return { status: res.status, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
}

function parseStdout(res: RunResult): any {
  try {
    return JSON.parse(res.stdout);
  } catch {
    throw new Error(
      `stdout not JSON. status=${res.status}\nstdout(head)=${res.stdout.slice(0, 500)}\nstderr=${res.stderr.slice(0, 500)}`,
    );
  }
}

// ---- 配置解析辅助 -------------------------------------------------------

function resolveBaseUrl(entry: EntrySpec): string {
  return (entry.baseURLEnv && process.env[entry.baseURLEnv]) || entry.baseURL;
}

function resolveModel(entry: EntrySpec): string {
  return (entry.modelEnv && process.env[entry.modelEnv]) || entry.model;
}

function resolveOutput(entry: EntrySpec): OutputSpec {
  return { ...config.output, ...(entry.output ?? {}) };
}

/** entry 是否应跳过；返回 skip 原因或 null。 */
function skipReason(entry: EntrySpec): string | null {
  if (!entry.implemented) {
    return `provider not implemented: ${entry.providerId}`;
  }
  if (entry.live) {
    if (process.env.IMAGEN_RUN_SMOKE !== '1') {
      return 'live disabled (set IMAGEN_RUN_SMOKE=1)';
    }
    if (entry.apiKeyEnv && !process.env[entry.apiKeyEnv]) {
      return `env missing: ${entry.apiKeyEnv}`;
    }
  }
  return null;
}

function buildProfileJson(entry: EntrySpec): string {
  const profileId = `e2e-${entry.name}`;
  const displayName = `E2E ${entry.name}`;
  const apiKey = entry.live && entry.apiKeyEnv ? `env:${entry.apiKeyEnv}` : entry.apiKey ?? 'mock-key';
  return JSON.stringify({
    profileId,
    providerId: entry.providerId,
    displayName,
    config: {
      providerId: entry.providerId,
      displayName,
      family: entry.family,
      baseURL: resolveBaseUrl(entry),
      defaultModel: resolveModel(entry),
    },
    secretValues: { apiKey },
  });
}

function fileAsBase64(rel: string): string {
  return fs.readFileSync(path.resolve(repoRoot, rel)).toString('base64');
}

/** 把 job input 写入临时文件，返回 `@path`，避免大 base64 撑爆 argv (ARG_MAX)。 */
function writeInput(dir: string, name: string, obj: unknown): string {
  const p = path.join(dir, `input-${name}.json`);
  fs.writeFileSync(p, JSON.stringify(obj));
  return `@${p}`;
}

/** 按 task 规格构造 job input。 */
function buildTaskInput(entry: EntrySpec, task: TaskSpec): Record<string, unknown> {
  const input: Record<string, unknown> = {
    profileId: `e2e-${entry.name}`,
    prompt: task.prompt,
    output: resolveOutput(entry),
  };
  if (task.source) {
    input.images = [{ type: 'image', data: fileAsBase64(task.source), mimeType: 'image/png' }];
  }
  if (task.mask) {
    input.maskImage = { type: 'image', data: fileAsBase64(task.mask), mimeType: 'image/png' };
  }
  return input;
}

/** 校验单个落盘产物 + sidecar 自洽。 */
function verifySavedImage(
  saved: { imagePath: string; sidecarPath: string; sha256: string },
  meta: { providerId: string; operation: string; prompt: string },
): void {
  expect(fs.existsSync(saved.imagePath), `image exists: ${saved.imagePath}`).toBe(true);
  const bytes = fs.readFileSync(saved.imagePath);
  expect(bytes.byteLength, `image non-empty: ${saved.imagePath}`).toBeGreaterThan(0);
  const isPng = bytes.subarray(0, 8).equals(PNG_MAGIC);
  const isJpeg = bytes.subarray(0, 3).equals(JPEG_MAGIC);
  const isWebp = bytes.subarray(0, 4).equals(RIFF_MAGIC) && bytes.subarray(8, 12).equals(WEBP_MAGIC);
  expect(
    isPng || isJpeg || isWebp,
    `image magic: ${saved.imagePath} (first bytes ${bytes.subarray(0, 12).toString('hex')})`,
  ).toBe(true);

  const actualSha = createHash('sha256').update(bytes).digest('hex');
  expect(actualSha, 'returned sha256 matches file').toBe(saved.sha256);

  expect(fs.existsSync(saved.sidecarPath), `sidecar exists: ${saved.sidecarPath}`).toBe(true);
  const sidecar = JSON.parse(fs.readFileSync(saved.sidecarPath, 'utf-8'));
  expect(sidecar.sha256, 'sidecar.sha256 matches file').toBe(actualSha);
  expect(sidecar.providerId).toBe(meta.providerId);
  expect(sidecar.operation).toBe(meta.operation);
  expect(sidecar.prompt).toBe(meta.prompt);
  expect(typeof sidecar.model, 'sidecar.model present').toBe('string');
  expect(sidecar.model.length).toBeGreaterThan(0);
  expect(typeof sidecar.savedAt, 'sidecar.savedAt present').toBe('string');
}

// ---- 测试生成 -----------------------------------------------------------

for (const entry of config.entries) {
  const reason = skipReason(entry);
  const d = reason ? describe.skip : describe;

  d(`e2e[${entry.name}] (${entry.providerId})${reason ? ` — SKIP: ${reason}` : ''}`, () => {
    const profileId = `e2e-${entry.name}`;
    let configDir = '';
    let outDir = '';

    beforeAll(() => {
      configDir = fs.mkdtempSync(path.join(os.tmpdir(), `imagen-e2e-config-${entry.name}-`));
      outDir = path.join(smokeOutputRoot, entry.name);
      fs.mkdirSync(outDir, { recursive: true });
    });

    afterAll(() => {
      if (configDir) {
        fs.rmSync(configDir, { recursive: true, force: true });
      }
    });

    it('1. profile save', () => {
      const res = runCli(['profile', 'save', buildProfileJson(entry)], configDir);
      expect(res.status, `save failed: ${res.stderr}`).toBe(0);
      const { profile } = parseStdout(res); // CLI 输出形如 { profile: {...} }
      expect(profile.profileId).toBe(profileId);
      expect(profile.providerId).toBe(entry.providerId);
    });

    it('2. health check (/models)', () => {
      if (entry.live) {
        // live provider：refresh-models 验证鉴权、baseURL 与 model discovery。
        const res = runCli(['profile', 'refresh-models', profileId], configDir);
        expect(res.status, `refresh-models failed: ${res.stderr}`).toBe(0);
        expect(parseStdout(res)).toBeTruthy();
      } else {
        // mock 不支持 discoverModels；用 profile models 取 descriptor 兜底清单。
        const res = runCli(['profile', 'models', profileId], configDir);
        expect(res.status, `models failed: ${res.stderr}`).toBe(0);
        expect(res.stdout).toContain(resolveModel(entry));
      }
    });

    for (const taskName of entry.tasks) {
      const task = config.tasks[taskName];
      if (!task) {
        throw new Error(`Unknown task "${taskName}" in entry "${entry.name}" (not defined in config.tasks)`);
      }

      it(`task: ${taskName} → 落盘 + sidecar + sha256`, () => {
        const input = buildTaskInput(entry, task);
        const inputRef = writeInput(configDir, taskName, input);
        const res = runCli(['job', 'submit', task.workflow, inputRef, '--out', outDir], configDir);
        expect(res.status, `submit failed: ${res.stderr}`).toBe(0);

        const job = parseStdout(res);
        expect(
          job.status,
          `job not completed: ${JSON.stringify(job.error ?? job.status)}`,
        ).toBe('completed');
        expect(Array.isArray(job.savedImages), 'savedImages present').toBe(true);
        expect(job.savedImages.length).toBeGreaterThanOrEqual(1);

        for (const saved of job.savedImages) {
          verifySavedImage(saved, {
            providerId: entry.providerId,
            operation: task.operation,
            prompt: task.prompt,
          });
        }
      });
    }
  });
}
