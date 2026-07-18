import { cp, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
await mkdir(join(packageRoot, 'dist', 'contract'), { recursive: true });
await cp(join(packageRoot, 'contract'), join(packageRoot, 'dist', 'contract'), {
  recursive: true,
  force: true,
});
