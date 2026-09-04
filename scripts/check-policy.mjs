#!/usr/bin/env node
import { checkArchitecture } from './policy/architecture.mjs';
import { checkDocs } from './policy/docs.mjs';
import { checkPaths } from './policy/paths.mjs';
import { checkTextInputSeam } from './policy/text-input-seam.mjs';
import { checkTaskV2 } from './policy/task-v2.mjs';
import { checkThemeSource } from './policy/theme-source.mjs';
import { checkUxpCss } from './policy/uxp-css.mjs';
import { checkUiComposition } from './policy/ui-composition.mjs';
import { checkSharedControlInventory } from './policy/shared-control-inventory.mjs';
import { printViolations } from './policy/shared.mjs';

const repoRoot = process.cwd();

const violations = [
  ...checkArchitecture(repoRoot),
  ...checkDocs(repoRoot),
  ...checkPaths(repoRoot),
  ...checkTextInputSeam(repoRoot),
  ...checkTaskV2(repoRoot),
  ...checkThemeSource(repoRoot),
  ...checkUxpCss(repoRoot),
  ...checkUiComposition(repoRoot),
  ...checkSharedControlInventory(repoRoot),
];

if (violations.length > 0) {
  printViolations(violations);
  process.exit(1);
}

console.log('Project policy checks passed.');
