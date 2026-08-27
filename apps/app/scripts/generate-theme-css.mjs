#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outFile = path.join(appRoot, 'src/shared/ui/styles/generated/theme-css.ts');
const checkOnly = process.argv.includes('--check');

function semanticVars(mode) {
  const light = mode === 'light';
  const colors = light
    ? {
        background: '#F0F0F0', layer1: '#F7F7F7', layer2: '#EAEAEA', elevated: '#E1E1E1', border: '#B8B8B8', strongBorder: '#888888',
        text: '#1E1E1E', secondaryText: '#4B4B4B', mutedText: '#6E6E6E', canvas: '#FFFFFF', hover: 'rgba(0,0,0,.06)', active: 'rgba(0,0,0,.12)',
      }
    : {
        background: '#323232', layer1: '#3C3C3C', layer2: '#464646', elevated: '#505050', border: '#5A5A5A', strongBorder: '#777777',
        text: '#F5F5F5', secondaryText: '#D0D0D0', mutedText: '#A6A6A6', canvas: '#2B2B2B', hover: 'rgba(255,255,255,.08)', active: 'rgba(255,255,255,.14)',
      };
  const accent = '#1473E6';
  const positive = '#2D9D78';
  const notice = '#E68619';
  const negative = '#EC5B62';
  const informative = '#2680EB';
  const foreground = '#FFFFFF';
  return [
    `--app-color-background-base:var(--uxp-host-background-color, ${colors.background});`,
    `--app-color-background-layer-1:${colors.layer1};`,
    `--app-color-background-layer-2:${colors.layer2};`,
    `--app-color-background-elevated:${colors.elevated};`,
    `--app-color-border-default:var(--uxp-host-border-color, ${colors.border});`,
    `--app-color-border-strong:${colors.strongBorder};`,
    `--app-color-text-primary:var(--uxp-host-text-color, ${colors.text});`,
    `--app-color-text-secondary:${colors.secondaryText};`,
    `--app-color-text-muted:${colors.mutedText};`,
    `--app-color-text-on-accent:${foreground};`,
    `--app-color-link:var(--uxp-host-link-text-color, ${informative});`,
    `--app-color-accent-default:${accent};`,
    '--app-color-accent-hover:#0D66D0;',
    '--app-color-accent-down:#095ABA;',
    '--app-color-accent-subtle:rgba(20,115,230,.16);',
    `--app-color-positive:${positive};`,
    `--app-color-on-positive:${foreground};`,
    '--app-color-positive-subtle:rgba(45,157,120,.16);',
    `--app-color-informative:${informative};`,
    `--app-color-on-informative:${foreground};`,
    '--app-color-informative-subtle:rgba(38,128,235,.16);',
    `--app-color-notice:${notice};`,
    `--app-color-on-notice:${foreground};`,
    '--app-color-notice-subtle:rgba(230,134,25,.16);',
    `--app-color-negative:${negative};`,
    `--app-color-on-negative:${foreground};`,
    '--app-color-negative-subtle:rgba(236,91,98,.16);',
    '--app-notice-neutral-background:var(--app-color-background-layer-1);',
    '--app-notice-neutral-foreground:var(--app-color-text-primary);',
    '--app-notice-neutral-icon:var(--app-color-text-muted);',
    '--app-notice-neutral-border:transparent;',
    '--app-notice-info-background:var(--app-color-informative-subtle);',
    '--app-notice-info-foreground:var(--app-color-text-primary);',
    '--app-notice-info-icon:var(--app-color-informative);',
    '--app-notice-info-border:transparent;',
    '--app-notice-positive-background:var(--app-color-positive-subtle);',
    '--app-notice-positive-foreground:var(--app-color-text-primary);',
    '--app-notice-positive-icon:var(--app-color-positive);',
    '--app-notice-positive-border:transparent;',
    '--app-notice-warning-background:var(--app-color-notice-subtle);',
    '--app-notice-warning-foreground:var(--app-color-text-primary);',
    '--app-notice-warning-icon:var(--app-color-notice);',
    '--app-notice-warning-border:transparent;',
    '--app-notice-negative-background:var(--app-color-negative-subtle);',
    '--app-notice-negative-foreground:var(--app-color-text-primary);',
    '--app-notice-negative-icon:var(--app-color-negative);',
    '--app-notice-negative-border:transparent;',
    `--app-color-canvas:${colors.canvas};`,
    `--app-hover-overlay-fallback:${colors.hover};`,
    '--app-color-hover-overlay:var(--uxp-host-widget-hover-background-color, var(--app-hover-overlay-fallback));',
    `--app-color-active-overlay:${colors.active};`,
    '--app-color-focus-ring:var(--app-color-accent-default);',
    '--toast-bg-neutral:var(--app-color-background-layer-2);',
    '--toast-bg-info:var(--app-color-informative-subtle);',
    '--toast-bg-positive:var(--app-color-positive-subtle);',
    '--toast-bg-warning:var(--app-color-notice-subtle);',
    '--toast-bg-negative:var(--app-color-negative-subtle);',
    '--toast-fg-primary:var(--app-color-text-primary);',
    '--toast-fg-secondary:var(--app-color-text-secondary);',
    '--toast-icon-neutral:var(--app-color-text-muted);',
    '--toast-icon-info:var(--app-color-informative);',
    '--toast-icon-positive:var(--app-color-positive);',
    '--toast-icon-warning:var(--app-color-notice);',
    '--toast-icon-negative:var(--app-color-negative);',
    '--toast-border-neutral:var(--app-color-border-default);',
    '--toast-border-info:var(--app-color-informative);',
    '--toast-border-positive:var(--app-color-positive);',
    '--toast-border-warning:var(--app-color-notice);',
    '--toast-border-negative:var(--app-color-negative);',
    '--toast-radius:4px;',
    '--toast-min-height:40px;',
    '--toast-max-width:320px;',
    '--toast-padding-x:12px;',
    '--toast-padding-y:9px;',
    '--toast-gap:8px;',
    '--app-radius-small:4px;',
    '--app-radius-medium:4px;',
    '--app-radius-large:6px;',
    '--app-radius-pill:4px;',
    '--app-space-1:4px;',
    '--app-space-2:8px;',
    '--app-space-3:12px;',
    '--app-space-4:16px;',
    "--app-font-family-base:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;",
    "--app-font-family-mono:'SF Mono','Menlo',monospace;",
  ].map((line) => `  ${line}`).join('\n');
}

const generated = `/** 由 apps/app/scripts/generate-theme-css.mjs 生成，请勿手改。 */\nexport const GENERATED_THEME_CSS = \`\n:root{\n${semanticVars('dark')}\n}\n\n@media (prefers-color-scheme: light){\n  :root{\n${semanticVars('light')}\n  }\n}\n\n.panel[data-app-theme="light"]{\n${semanticVars('light')}\n}\n\n.panel[data-app-theme="dark"]{\n${semanticVars('dark')}\n}\n\`;\n`;

const current = fs.existsSync(outFile) ? fs.readFileSync(outFile, 'utf8') : '';
if (checkOnly) {
  if (current !== generated) {
    throw new Error('Generated Spectrum host theme is stale. Run pnpm --filter @imagen-ps/app theme:generate.');
  }
  process.exit(0);
}

if (current !== generated) {
  fs.writeFileSync(outFile, generated);
}
