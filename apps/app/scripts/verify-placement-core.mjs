import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(scriptDir, '..');
const repoRoot = path.resolve(appDir, '..', '..');

const scenarios = [
  {
    label: 'single frame-evidence round -> exact-frame',
    args: ['tests/use-conversation.test.tsx', '-t', 'derives request-level placement intent from submitted attachments'],
  },
  {
    label: 'document-only evidence round -> document-only',
    args: ['tests/use-conversation.test.tsx', '-t', 'derives request-level placement intent from submitted attachments'],
  },
  {
    label: 'source-document miss + active-document fallback',
    args: ['tests/photoshop-placement.test.ts', '-t', 'falls back to activeDocument after source-document resolution fails'],
  },
  {
    label: 'no evidence -> unbound',
    args: ['tests/use-conversation.test.tsx', '-t', 'derives request-level placement intent from submitted attachments'],
  },
  {
    label: 'multiple conflicting documents -> unbound',
    args: ['tests/use-conversation.test.tsx', '-t', 'derives request-level placement intent from submitted attachments'],
  },
];

for (const scenario of scenarios) {
  process.stdout.write(`\n[verify-placement-core] ${scenario.label}\n`);
  const result = spawnSync('pnpm', ['--filter', '@imagen-ps/app', 'exec', 'vitest', 'run', ...scenario.args], {
    cwd: repoRoot,
    stdio: 'inherit',
    env: process.env,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

process.stdout.write('\n[verify-placement-core] all placement core scenarios passed\n');
