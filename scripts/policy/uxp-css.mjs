import fs from 'node:fs';
import path from 'node:path';
import {
  PROJECT_POLICY_CSS_RULES,
  UXP_UNSUPPORTED_CSS_RULES,
  uxpCssRoots,
  uxpCssSourceExtensions,
} from './uxp-css-contract.mjs';
import { unique, walkFiles } from './shared.mjs';

const CSS_LITERAL_START = /\b[A-Za-z0-9_]*CSS\s*=\s*`/u;

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
    let inCssLiteral = false;

    lines.forEach((line, index) => {
      let cssLine = null;

      if (!inCssLiteral) {
        const startMatch = line.match(CSS_LITERAL_START);
        if (startMatch) {
          const startIndex = line.indexOf('`', startMatch.index);
          const remainder = line.slice(startIndex + 1);
          const endIndex = remainder.indexOf('`');
          if (endIndex >= 0) {
            cssLine = remainder.slice(0, endIndex);
          } else {
            cssLine = remainder;
            inCssLiteral = true;
          }
        }
      } else {
        const endIndex = line.indexOf('`');
        if (endIndex >= 0) {
          cssLine = line.slice(0, endIndex);
          inCssLiteral = false;
        } else {
          cssLine = line;
        }
      }

      if (cssLine == null) {
        return;
      }

      for (const rule of rules) {
        if (rule.pattern.test(cssLine)) {
          violations.push({
            rule: `${prefix}: ${rule.name}`,
            file,
            line: index + 1,
            text: `${cssLine.trim()} // ${rule.message}`,
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
