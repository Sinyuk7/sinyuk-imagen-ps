import fs from 'node:fs';
import path from 'node:path';
import { sourceExtensions, walkFiles } from './shared.mjs';

const UI_ROOT = 'apps/app/src/shared/ui';
const TEXT_INPUT_SEAM_FILE = 'apps/app/src/shared/ui/components/uxp-form-controls.tsx';
const TEXT_FIELD_PUBLIC_FILE = 'apps/app/src/shared/ui/primitives/native-controls.tsx';

function lineNumberForOffset(text, offset) {
  return text.slice(0, offset).split('\n').length;
}

export function checkTextInputSeam(repoRoot) {
  const files = walkFiles(repoRoot, UI_ROOT, sourceExtensions);
  const violations = [];

  for (const file of files) {
    const source = fs.readFileSync(path.join(repoRoot, file), 'utf8');

    if (file !== TEXT_FIELD_PUBLIC_FILE) {
      const importMatch = source.match(/import\s*\{[\s\S]*?\bUxpTextInput\b[\s\S]*?\}\s*from\s*['"][^'"]*uxp-form-controls['"]/m);
      if (importMatch && importMatch.index !== undefined) {
        const line = lineNumberForOffset(source, importMatch.index);
        violations.push({
          rule: 'single-line popup-safe seam must stay behind public TextField',
          file,
          line,
          text: importMatch[0].split('\n')[0]?.trim() ?? 'import { UxpTextInput } ...',
        });
      }
    }

    if (file !== TEXT_INPUT_SEAM_FILE) {
      const markerMatch = source.match(/\bdata-uxp-textinput-native\b/);
      if (markerMatch && markerMatch.index !== undefined) {
        const line = lineNumberForOffset(source, markerMatch.index);
        const lineText = source.split('\n')[line - 1] ?? 'data-uxp-textinput-native';
        violations.push({
          rule: 'raw native text input marker is only allowed inside the shared text-input seam',
          file,
          line,
          text: lineText.trim(),
        });
      }
    }
  }

  return violations;
}
