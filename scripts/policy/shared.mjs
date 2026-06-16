import fs from 'node:fs';
import path from 'node:path';

export const sourceExtensions = new Set(['.ts', '.tsx', '.js', '.jsx']);
export const policyTextExtensions = new Set(['.md', '.json']);

const ignoredDirs = new Set(['node_modules', 'dist', '.turbo']);

export function walkFiles(repoRoot, dir, extensions) {
  const abs = path.join(repoRoot, dir);
  if (!fs.existsSync(abs)) {
    return [];
  }

  if (fs.statSync(abs).isFile()) {
    return extensions.has(path.extname(dir)) ? [dir] : [];
  }

  const entries = fs.readdirSync(abs, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (ignoredDirs.has(entry.name)) {
      continue;
    }

    const rel = path.join(dir, entry.name).replaceAll(path.sep, '/');
    if (entry.isDirectory()) {
      files.push(...walkFiles(repoRoot, rel, extensions));
      continue;
    }

    if (extensions.has(path.extname(entry.name))) {
      files.push(rel);
    }
  }

  return files;
}

export function existingFiles(repoRoot, files) {
  return files.filter((file) => fs.existsSync(path.join(repoRoot, file)));
}

export function unique(items) {
  return [...new Set(items)];
}

export function scanLineRules(repoRoot, files, rules) {
  const violations = [];

  for (const file of files) {
    const text = fs.readFileSync(path.join(repoRoot, file), 'utf8');
    const lines = text.split('\n');

    lines.forEach((line, index) => {
      for (const rule of rules) {
        if (rule.pattern.test(line)) {
          violations.push({
            rule: rule.name,
            file,
            line: index + 1,
            text: line.trim(),
          });
        }
      }
    });
  }

  return violations;
}

export function printViolations(violations) {
  console.error('Project policy check failed:');
  for (const violation of violations) {
    console.error(`- ${violation.file}:${violation.line} ${violation.rule}`);
    console.error(`  ${violation.text}`);
  }
}
