#!/usr/bin/env node
import { checkArchitecture } from './policy/architecture.mjs';
import { checkDocs } from './policy/docs.mjs';
import { checkPaths } from './policy/paths.mjs';
import { printViolations } from './policy/shared.mjs';

const repoRoot = process.cwd();

const violations = [
  ...checkArchitecture(repoRoot),
  ...checkDocs(repoRoot),
  ...checkPaths(repoRoot),
];

if (violations.length > 0) {
  printViolations(violations);
  process.exit(1);
}

console.log('Project policy checks passed.');
