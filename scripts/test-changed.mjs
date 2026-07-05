#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process';

function changedFiles() {
  try {
    const output = execFileSync('git', ['diff', '--name-only', '--relative', 'HEAD'], {
      encoding: 'utf8',
    }).trim();
    return output ? output.split('\n') : [];
  } catch {
    return [];
  }
}

const files = changedFiles();

const scopes = new Set();
for (const file of files) {
  if (file.startsWith('apps/app/')) {
    scopes.add('@imagen-ps/app');
  }
  if (file.startsWith('packages/providers/')) {
    scopes.add('@imagen-ps/providers');
  }
  if (file.startsWith('packages/application/')) {
    scopes.add('@imagen-ps/application');
  }
  if (file.startsWith('packages/core-engine/')) {
    scopes.add('@imagen-ps/core-engine');
  }
  if (file.startsWith('packages/foundation/')) {
    scopes.add('@imagen-ps/foundation');
  }
}

if (scopes.size === 0) {
  console.log('No changed workspace files detected. Falling back to pnpm test.');
  const result = spawnSync('pnpm', ['test'], { stdio: 'inherit' });
  process.exit(result.status ?? 1);
}

for (const scope of scopes) {
  console.log(`Running tests for ${scope}`);
  const result = spawnSync('pnpm', ['--filter', scope, 'test'], { stdio: 'inherit' });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
