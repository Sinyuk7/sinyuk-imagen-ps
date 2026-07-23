import { policyTextExtensions, scanLineRules, unique, walkFiles } from './shared.mjs';

const textRoots = [
  'AGENTS.md',
  '.agents',
  'README.md',
  'docs',
  'apps',
  'packages',
  'package.json',
  'tsconfig.json',
  'tsconfig.base.json',
  'turbo.json',
  'skills-lock.json',
];

const ignoredPathScanDirectories = ['apps/app/test-results'];

const pathReferenceRules = [
  {
    name: '文档和配置不能引用本机绝对路径',
    pattern: /(^|[\s([`'"])\/Users\/[^\s)`'"]+/,
  },
  {
    name: '文档和配置不能引用 Windows 绝对路径',
    pattern: /\b[A-Za-z]:\\[^\s)`'"]*/,
  },
  {
    name: '文档和配置中的路径引用必须使用正斜杠',
    pattern: /(^|[\s([`'"])(?:\.{1,2}\\|[A-Za-z0-9_.-]+\\[A-Za-z0-9_.-]+)/,
  },
];

export function checkPaths(repoRoot) {
  const files = unique(textRoots.flatMap((root) => walkFiles(repoRoot, root, policyTextExtensions)))
    .filter((file) => !ignoredPathScanDirectories.some((dir) => file.startsWith(`${dir}/`)));
  return scanLineRules(repoRoot, files, pathReferenceRules);
}
