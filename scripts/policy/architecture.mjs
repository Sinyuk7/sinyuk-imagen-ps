import { scanLineRules, sourceExtensions, walkFiles } from './shared.mjs';

const architectureRules = [
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
  {
    name: 'foundation 必须保持 host-agnostic且不能依赖 workspace 包',
    roots: ['packages/foundation/src'],
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
      /\bfrom\s+['"]@imagen-ps\/(?:application|core-engine|providers|app|cli)(?:['"/])/,
      /\bimport\s+['"]@imagen-ps\/(?:application|core-engine|providers|app|cli)(?:['"/])/,
      /\brequire\(['"]@imagen-ps\/(?:application|core-engine|providers|app|cli)(?:['"/])/,
    ],
  },
];

export function checkArchitecture(repoRoot) {
  const violations = [];

  for (const rule of architectureRules) {
    const files = rule.roots.flatMap((root) => walkFiles(repoRoot, root, sourceExtensions));
    const lineRules = rule.patterns.map((pattern) => ({ name: rule.name, pattern }));
    violations.push(...scanLineRules(repoRoot, files, lineRules));
  }

  return violations;
}
