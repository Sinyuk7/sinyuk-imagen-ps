import fs from 'node:fs';
import path from 'node:path';
import {
  PROJECT_POLICY_CSS_RULES,
  UXP_UNSUPPORTED_CSS_RULES,
  uxpCssRoots,
  uxpCssSourceExtensions,
} from './uxp-css-contract.mjs';
import { unique, walkFiles } from './shared.mjs';

function buildCssPolicyFiles(repoRoot) {
  return unique(
    uxpCssRoots.flatMap((root) => walkFiles(repoRoot, root, uxpCssSourceExtensions)),
  );
}

function collectViolations(repoRoot, files, rules, prefix) {
  const violations = [];

  for (const file of files) {
    const source = fs.readFileSync(path.join(repoRoot, file), 'utf8');
    const lines = source.split('\n');

    lines.forEach((line, index) => {
      for (const rule of rules) {
        if (rule.pattern.test(line)) {
          violations.push({
            rule: `${prefix}: ${rule.name}`,
            file,
            line: index + 1,
            text: `${line.trim()} // ${rule.message}`,
          });
        }
      }
    });
  }

  return violations;
}

export function checkUxpCss(repoRoot) {
  const files = buildCssPolicyFiles(repoRoot);
  return [
    ...collectViolations(repoRoot, files, UXP_UNSUPPORTED_CSS_RULES, 'UXP CSS contract'),
    ...collectViolations(repoRoot, files, PROJECT_POLICY_CSS_RULES, 'UXP CSS project policy'),
  ];
}
