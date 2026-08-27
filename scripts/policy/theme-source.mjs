import { spawnSync } from 'node:child_process';

export function checkThemeSource(repoRoot) {
  const result = spawnSync('node', ['apps/app/scripts/generate-theme-css.mjs', '--check'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });

  if (result.status === 0) {
    return [];
  }

  return [
    {
      rule: 'spectrum-theme-generated-css',
      file: 'apps/app/src/shared/ui/styles/generated/theme-css.ts',
      line: 1,
      text: (result.stderr || result.stdout || 'Theme source validation failed.').trim(),
    },
  ];
}
