import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { walkFiles } from './shared.mjs';

const PAGE_ROOT = 'apps/app/src/shared/ui/pages';
const RAW_CONTROL_NAMES = new Set(['button', 'input', 'textarea', 'select']);
const INTERNAL_UI_IMPORT = /(?:^|\/)shared\/ui\/(?:primitives|components|styles)\/|^\.\.\/(?:primitives|components|styles)(?:\/|$)/;
const COLOR_LITERAL = /(?:#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\()/i;

function lineFor(sourceFile, node) {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function textFor(sourceFile, node) {
  return node.getText(sourceFile).split('\n')[0]?.trim() ?? '';
}

function violation(sourceFile, node, rule, replacement) {
  return {
    file: sourceFile.fileName.replaceAll(path.sep, '/'),
    line: lineFor(sourceFile, node),
    rule,
    replacement,
    text: textFor(sourceFile, node),
  };
}

function isVisualStyle(attribute) {
  if (!attribute.initializer || !ts.isJsxExpression(attribute.initializer) || !attribute.initializer.expression) {
    return true;
  }
  let expression = attribute.initializer.expression;
  while (ts.isParenthesizedExpression(expression) || ts.isAsExpression(expression) || ts.isSatisfiesExpression(expression)) {
    expression = expression.expression;
  }
  if (!ts.isObjectLiteralExpression(expression)) {
    return true;
  }
  return expression.properties.some((property) => {
    if (!ts.isPropertyAssignment(property)) {
      return true;
    }
    const name = property.name.getText().replaceAll(/['"]/g, '');
    return !name.startsWith('--ui-');
  });
}

/**
 * 解析 page JSX，返回可由 policy 和 inventory 共用的结构化违规。
 */
export function scanUiCompositionSource(file, source) {
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const violations = [];

  const visit = (node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const moduleName = node.moduleSpecifier.text;
      if (INTERNAL_UI_IMPORT.test(moduleName)) {
        violations.push(violation(sourceFile, node, 'internal-ui-import', 'Import approved UI from ui-system.ts.'));
      }
    }

    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tagName = node.tagName.getText(sourceFile);
      if (RAW_CONTROL_NAMES.has(tagName)) {
        violations.push(violation(sourceFile, node, 'raw-native-control', 'Use an approved public UI primitive or pattern.'));
      }
      if (tagName === 'style') {
        violations.push(violation(sourceFile, node, 'style-element', 'Move visual CSS into PANEL_CSS-owned styles.'));
      }
      for (const attribute of node.attributes.properties) {
        if (!ts.isJsxAttribute(attribute)) {
          continue;
        }
        if (attribute.name.text === 'style' && isVisualStyle(attribute)) {
          violations.push(violation(sourceFile, attribute, 'visual-inline-style', 'Move visual styling into an approved pattern or PANEL_CSS.'));
        }
      }
    }

    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      if (node.text.includes('--md-sys-')) {
        violations.push(violation(sourceFile, node, 'material-token-reference', 'Use an existing --app-* or component token.'));
      }
      if (COLOR_LITERAL.test(node.text)) {
        violations.push(violation(sourceFile, node, 'raw-color-literal', 'Use an existing --app-* or component token.'));
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return violations;
}

export function scanUiCompositionPages(repoRoot) {
  return walkFiles(repoRoot, PAGE_ROOT, new Set(['.tsx']))
    .sort()
    .flatMap((file) => scanUiCompositionSource(file, fs.readFileSync(path.join(repoRoot, file), 'utf8')));
}

/** 将零容忍 page composition 结果转换为统一 policy violation 格式。 */
export function checkUiComposition(repoRoot) {
  return scanUiCompositionPages(repoRoot).map((item) => ({
    rule: `UI composition: ${item.rule}`,
    file: item.file,
    line: item.line,
    text: `${item.text} // ${item.replacement}`,
  }));
}

function main() {
  const repoRoot = process.cwd();
  const violations = scanUiCompositionPages(repoRoot);
  if (process.argv.includes('--inventory')) {
    console.log(JSON.stringify(violations, null, 2));
    return;
  }
  const policyViolations = checkUiComposition(repoRoot);
  if (policyViolations.length > 0) {
    throw new Error(`UI composition policy failed:\n${policyViolations.map((item) => `- ${item.text}`).join('\n')}`);
  }
}

if (import.meta.url === new URL(process.argv[1], 'file:').href) {
  main();
}
