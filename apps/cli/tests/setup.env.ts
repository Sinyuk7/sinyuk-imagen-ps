/**
 * vitest setupFile：把仓库根目录 `.test.env` 载入 `process.env`（若文件存在）。
 *
 * - 不覆盖已存在的环境变量（显式 export / CI 注入优先）。
 * - 文件缺失时静默跳过（默认 `pnpm test` 只跑 mock，无需 live key）。
 * - 极简 KEY=VALUE 解析，避免引入 dotenv 依赖。
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
// apps/cli/tests → 上溯三级到仓库根
const envPath = path.resolve(here, '../../../.test.env');

if (fs.existsSync(envPath)) {
  const raw = fs.readFileSync(envPath, 'utf-8');
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) {
      continue;
    }
    const eq = trimmed.indexOf('=');
    if (eq <= 0) {
      continue;
    }
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}
