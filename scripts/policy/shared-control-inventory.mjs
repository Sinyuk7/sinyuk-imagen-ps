import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { walkFiles } from './shared.mjs';

const SHARED_ROOTS = [
  'apps/app/src/shared/ui/primitives',
  'apps/app/src/shared/ui/components',
  'apps/app/src/shared/ui/patterns',
];
const RAW_CONTROL_NAMES = new Set(['button', 'input', 'textarea', 'select']);
const ALLOWED_HOST_SEAMS = new Set(['notice.tsx']);
const ALLOWED_CUSTOM_FALLBACKS = new Set([
  'apps/app/src/shared/ui/components/composer-select-menu.tsx:ComposerSelectMenu:button',
  'apps/app/src/shared/ui/components/overlay-controls.tsx:OverlayTriggerButton:button',
  'apps/app/src/shared/ui/patterns/index.tsx:SegmentedTabs:button',
]);

function lineFor(sourceFile, node) {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function ownerFor(sourceFile, node) {
  let current = node.parent;
  while (current) {
    if (ts.isFunctionDeclaration(current) && current.name) return current.name.text;
    if (ts.isVariableDeclaration(current) && ts.isIdentifier(current.name)) return current.name.text;
    if (ts.isMethodDeclaration(current) && current.name) return current.name.getText(sourceFile);
    current = current.parent;
  }
  return 'module';
}

function scanFile(repoRoot, relativeFile) {
  const absoluteFile = path.join(repoRoot, relativeFile);
  const source = fs.readFileSync(absoluteFile, 'utf8');
  const sourceFile = ts.createSourceFile(relativeFile, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const entries = [];
  const visit = (node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(sourceFile);
      if (RAW_CONTROL_NAMES.has(tag)) {
        const owner = ownerFor(sourceFile, node);
        const hostSeam = ALLOWED_HOST_SEAMS.has(path.basename(relativeFile));
        const customFallback = ALLOWED_CUSTOM_FALLBACKS.has(`${relativeFile.replaceAll(path.sep, '/')}:${owner}:${tag}`);
        entries.push({
          file: relativeFile.replaceAll(path.sep, '/'),
          line: lineFor(sourceFile, node),
          owner,
          tag,
          allowed: hostSeam || customFallback,
          reason: hostSeam ? 'host-seam' : customFallback ? 'custom-fallback' : 'production-shared-control',
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return entries;
}

export function scanSharedControlInventory(repoRoot) {
  return SHARED_ROOTS.flatMap((root) => walkFiles(repoRoot, root, new Set(['.tsx'])))
    .sort()
    .flatMap((file) => scanFile(repoRoot, file));
}

export function checkSharedControlInventory(repoRoot) {
  return scanSharedControlInventory(repoRoot)
    .filter((entry) => !entry.allowed)
    .map((entry) => ({
      rule: 'Shared UI raw native control',
      file: entry.file,
      line: entry.line,
      text: `<${entry.tag}> in ${entry.owner}; use ui-system renderer or register an explicit host seam`,
    }));
}

if (import.meta.url === new URL(process.argv[1], 'file:').href) {
  const repoRoot = process.cwd();
  if (process.argv.includes('--inventory')) {
    console.log(JSON.stringify(scanSharedControlInventory(repoRoot), null, 2));
  } else {
    const violations = checkSharedControlInventory(repoRoot);
    if (violations.length) throw new Error(`Shared control policy failed:\n${violations.map((item) => `- ${item.file}:${item.line} ${item.text}`).join('\n')}`);
    console.log('Shared control policy passed.');
  }
}
