#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();

const sourceExtensions = new Set(['.ts', '.tsx', '.js', '.jsx']);
const ignoredDirs = new Set(['node_modules', 'dist', '.turbo']);

const rules = [
  {
    name: 'CLI 只能依赖 application 层，不能依赖 UI、UXP、Photoshop 或 runtime internals',
    roots: ['apps/cli/src', 'apps/cli/tests'],
    patterns: [
      /\bfrom\s+['"]@imagen-ps\/(?:core-engine|providers)(?:['"/])/,
      /\bimport\s+['"]@imagen-ps\/(?:core-engine|providers)(?:['"/])/,
      /\brequire\(['"]@imagen-ps\/(?:core-engine|providers)(?:['"/])/,
      /\bfrom\s+['"]react(?:\/[^'"]*)?['"]/,
      /\bimport\s+['"]react(?:\/[^'"]*)?['"]/,
      /\bfrom\s+['"](?:photoshop|uxp)['"]/i,
      /\bimport\s+['"](?:photoshop|uxp)['"]/i,
      /\brequire\(['"](?:photoshop|uxp)['"]\)/i,
    ],
  },
  {
    name: 'UXP app 只能通过 application seam 接入共享业务层',
    roots: ['apps/app/src', 'apps/app/tests'],
    patterns: [
      /\bfrom\s+['"]@imagen-ps\/(?:core-engine|providers|cli)(?:['"/])/,
      /\bimport\s+['"]@imagen-ps\/(?:core-engine|providers|cli)(?:['"/])/,
      /\brequire\(['"]@imagen-ps\/(?:core-engine|providers|cli)(?:['"/])/,
    ],
  },
  {
    name: 'application 层必须保持 host-agnostic',
    roots: ['packages/application/src'],
    patterns: [
      /\bfrom\s+['"]react(?:\/[^'"]*)?['"]/,
      /\bimport\s+['"]react(?:\/[^'"]*)?['"]/,
      /\bfrom\s+['"]node:(?:fs|path|os)['"]/,
      /\bimport\s+['"]node:(?:fs|path|os)['"]/,
      /\brequire\(['"]node:(?:fs|path|os)['"]\)/,
      /\bfrom\s+['"](?:fs|path|os)['"]/,
      /\bimport\s+['"](?:fs|path|os)['"]/,
      /\brequire\(['"](?:fs|path|os)['"]\)/,
      /\bfrom\s+['"](?:photoshop|uxp)['"]/i,
      /\bimport\s+['"](?:photoshop|uxp)['"]/i,
      /\brequire\(['"](?:photoshop|uxp)['"]\)/i,
      /\bfrom\s+['"]@imagen-ps\/(?:app|cli)(?:['"/])/,
      /\bimport\s+['"]@imagen-ps\/(?:app|cli)(?:['"/])/,
      /\brequire\(['"]@imagen-ps\/(?:app|cli)(?:['"/])/,
    ],
  },
  {
    name: 'core-engine 不能依赖 provider、application 或 surface package',
    roots: ['packages/core-engine/src'],
    patterns: [
      /\bfrom\s+['"]@imagen-ps\/(?:providers|application|app|cli)(?:['"/])/,
      /\bimport\s+['"]@imagen-ps\/(?:providers|application|app|cli)(?:['"/])/,
      /\brequire\(['"]@imagen-ps\/(?:providers|application|app|cli)(?:['"/])/,
    ],
  },
  {
    name: 'providers 不能依赖 application 或 surface package',
    roots: ['packages/providers/src', 'packages/providers/tests'],
    patterns: [
      /\bfrom\s+['"]@imagen-ps\/(?:application|app|cli)(?:['"/])/,
      /\bimport\s+['"]@imagen-ps\/(?:application|app|cli)(?:['"/])/,
      /\brequire\(['"]@imagen-ps\/(?:application|app|cli)(?:['"/])/,
    ],
  },
];

function walk(dir) {
  const absDir = path.join(repoRoot, dir);
  if (!fs.existsSync(absDir)) {
    return [];
  }

  const entries = fs.readdirSync(absDir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (ignoredDirs.has(entry.name)) {
      continue;
    }

    const rel = path.join(dir, entry.name).replaceAll(path.sep, '/');
    if (entry.isDirectory()) {
      files.push(...walk(rel));
      continue;
    }

    if (sourceExtensions.has(path.extname(entry.name))) {
      files.push(rel);
    }
  }

  return files;
}

const violations = [];

for (const rule of rules) {
  for (const root of rule.roots) {
    for (const file of walk(root)) {
      const text = fs.readFileSync(path.join(repoRoot, file), 'utf8');
      const lines = text.split('\n');

      lines.forEach((line, index) => {
        for (const pattern of rule.patterns) {
          if (pattern.test(line)) {
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
  }
}

if (violations.length > 0) {
  console.error('Boundary check failed:');
  for (const violation of violations) {
    console.error(`- ${violation.file}:${violation.line} ${violation.rule}`);
    console.error(`  ${violation.text}`);
  }
  process.exit(1);
}

console.log('边界检查通过。');
