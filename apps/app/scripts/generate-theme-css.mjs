#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceDir = path.join(appRoot, 'src/shared/ui/styles/theme-source');
const outFile = path.join(appRoot, 'src/shared/ui/styles/generated/theme-css.ts');
const checkOnly = process.argv.includes('--check');

const themeFiles = [
  ['dark', 'dark.css', '.dark', ':root'],
  ['dark-hc', 'dark-hc.css', '.dark-high-contrast', '@media (prefers-color-scheme: darkest)'],
  ['light', 'light.css', '.light', '@media (prefers-color-scheme: light)'],
  ['light-hc', 'light-hc.css', '.light-high-contrast', '@media (prefers-color-scheme: lightest)'],
  ['dark-mc', 'dark-mc.css', '.dark-medium-contrast', '.theme-dark-mc'],
  ['light-mc', 'light-mc.css', '.light-medium-contrast', '.theme-light-mc'],
];

const mdSysTokens = [
  'primary',
  'surface-tint',
  'on-primary',
  'primary-container',
  'on-primary-container',
  'secondary',
  'on-secondary',
  'secondary-container',
  'on-secondary-container',
  'tertiary',
  'on-tertiary',
  'tertiary-container',
  'on-tertiary-container',
  'error',
  'on-error',
  'error-container',
  'on-error-container',
  'background',
  'on-background',
  'surface',
  'on-surface',
  'surface-variant',
  'on-surface-variant',
  'outline',
  'outline-variant',
  'shadow',
  'scrim',
  'inverse-surface',
  'inverse-on-surface',
  'inverse-primary',
  'primary-fixed',
  'on-primary-fixed',
  'primary-fixed-dim',
  'on-primary-fixed-variant',
  'secondary-fixed',
  'on-secondary-fixed',
  'secondary-fixed-dim',
  'on-secondary-fixed-variant',
  'tertiary-fixed',
  'on-tertiary-fixed',
  'tertiary-fixed-dim',
  'on-tertiary-fixed-variant',
  'surface-dim',
  'surface-bright',
  'surface-container-lowest',
  'surface-container-low',
  'surface-container',
  'surface-container-high',
  'surface-container-highest',
];

const extendedFamilies = ['blue', 'green', 'yellow', 'red', 'orange'];
const extendedSuffixes = ['color', 'on-color', 'color-container', 'on-color-container'];
const requiredTokens = [
  ...mdSysTokens.map((token) => `--md-sys-color-${token}`),
  ...extendedFamilies.flatMap((family) =>
    extendedSuffixes.map((suffix) => `--md-extended-color-${family}-${suffix}`),
  ),
];

function fail(message) {
  throw new Error(`[theme-source] ${message}`);
}

function readSurfaceStrategy() {
  const arg = process.argv.find((item) => item.startsWith('--surface='));
  const value = arg ? arg.slice('--surface='.length) : (process.env.IMAGEN_THEME_SURFACE ?? 'host');
  if (value !== 'host' && value !== 'md') {
    fail(`--surface must be "host" or "md", got "${value}"`);
  }
  return value;
}

const surfaceStrategy = readSurfaceStrategy();

function normalizeColor(value) {
  const trimmed = value.trim();
  const rgb = trimmed.match(/^rgb\(\s*(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})\s*\)$/i);
  if (rgb) {
    return rgbToHex(Number(rgb[1]), Number(rgb[2]), Number(rgb[3]));
  }
  const hex = trimmed.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    return `#${hex[1].toUpperCase()}`;
  }
  fail(`unsupported color value "${value}"`);
}

function rgbToHex(r, g, b) {
  for (const channel of [r, g, b]) {
    if (!Number.isInteger(channel) || channel < 0 || channel > 255) {
      fail(`invalid rgb channel "${channel}"`);
    }
  }
  return `#${[r, g, b].map((channel) => channel.toString(16).padStart(2, '0').toUpperCase()).join('')}`;
}

function hexToRgb(hex) {
  const raw = hex.slice(1);
  return [0, 2, 4].map((index) => Number.parseInt(raw.slice(index, index + 2), 16));
}

function rgba(hex, alpha) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

function mix(hex, target, ratio) {
  const source = hexToRgb(hex);
  const mixed = source.map((channel, index) => Math.round(channel + (target[index] - channel) * ratio));
  return rgbToHex(mixed[0], mixed[1], mixed[2]);
}

function parseTheme(fileName, expectedSelector) {
  const filePath = path.join(sourceDir, fileName);
  if (!fs.existsSync(filePath)) {
    fail(`missing ${path.relative(appRoot, filePath)}`);
  }

  const text = fs.readFileSync(filePath, 'utf8').trim();
  const block = text.match(/^([^{]+)\{\s*([\s\S]*?)\s*\}$/);
  if (!block) {
    fail(`${fileName} must contain one CSS rule`);
  }

  const selector = block[1].trim();
  if (selector !== expectedSelector) {
    fail(`${fileName} selector must be "${expectedSelector}", got "${selector}"`);
  }

  const declarations = new Map();
  for (const declaration of block[2].split(';')) {
    const item = declaration.trim();
    if (!item) {
      continue;
    }
    const match = item.match(/^(--[-a-z0-9]+)\s*:\s*(.+)$/i);
    if (!match) {
      fail(`${fileName} has invalid declaration "${item}"`);
    }
    if (declarations.has(match[1])) {
      fail(`${fileName} repeats ${match[1]}`);
    }
    declarations.set(match[1], normalizeColor(match[2]));
  }

  const actual = [...declarations.keys()].sort();
  const expected = [...requiredTokens].sort();
  const missing = expected.filter((token) => !declarations.has(token));
  const extra = actual.filter((token) => !requiredTokens.includes(token));
  if (missing.length > 0 || extra.length > 0) {
    fail(`${fileName} token mismatch; missing: ${missing.join(', ') || 'none'}; extra: ${extra.join(', ') || 'none'}`);
  }

  return declarations;
}

function emitVars(tokens) {
  return requiredTokens.map((token) => `    ${token}:${tokens.get(token)};`).join('\n');
}

function toastPalette(mode) {
  const isLight = mode.startsWith('light');
  const colors = isLight
    ? {
        bgNeutral: '#E7E8EB',
        bgInfo: '#E4EBF5',
        bgPositive: '#E4ECE2',
        bgWarning: '#EFE8D8',
        bgNegative: '#F0E3E3',
        fgPrimary: '#26282D',
        fgSecondary: '#60646B',
        iconNeutral: '#60646B',
        iconInfo: '#426EA8',
        iconPositive: '#4A783F',
        iconWarning: '#806414',
        iconNegative: '#A94A4D',
        borderMix: 0.42,
      }
    : {
        bgNeutral: '#30343A',
        bgInfo: '#2C3747',
        bgPositive: '#303C33',
        bgWarning: '#433B2A',
        bgNegative: '#433235',
        fgPrimary: '#F0F1F3',
        fgSecondary: '#C9CDD3',
        iconNeutral: '#C9CDD3',
        iconInfo: '#ACC7FF',
        iconPositive: '#A3D967',
        iconWarning: '#FFE6A7',
        iconNegative: '#FFB4AB',
        borderMix: 0.34,
      };
  return {
    ...colors,
    borderNeutral: mix(colors.bgNeutral, hexToRgb(colors.iconNeutral), colors.borderMix),
    borderInfo: mix(colors.bgInfo, hexToRgb(colors.iconInfo), colors.borderMix),
    borderPositive: mix(colors.bgPositive, hexToRgb(colors.iconPositive), colors.borderMix),
    borderWarning: mix(colors.bgWarning, hexToRgb(colors.iconWarning), colors.borderMix),
    borderNegative: mix(colors.bgNegative, hexToRgb(colors.iconNegative), colors.borderMix),
  };
}

function toastVars(mode) {
  const palette = toastPalette(mode);
  return [
    `--toast-bg-neutral:${palette.bgNeutral};`,
    `--toast-bg-info:${palette.bgInfo};`,
    `--toast-bg-positive:${palette.bgPositive};`,
    `--toast-bg-warning:${palette.bgWarning};`,
    `--toast-bg-negative:${palette.bgNegative};`,
    `--toast-fg-primary:${palette.fgPrimary};`,
    `--toast-fg-secondary:${palette.fgSecondary};`,
    `--toast-icon-neutral:${palette.iconNeutral};`,
    `--toast-icon-info:${palette.iconInfo};`,
    `--toast-icon-positive:${palette.iconPositive};`,
    `--toast-icon-warning:${palette.iconWarning};`,
    `--toast-icon-negative:${palette.iconNegative};`,
    `--toast-border-neutral:${palette.borderNeutral};`,
    `--toast-border-info:${palette.borderInfo};`,
    `--toast-border-positive:${palette.borderPositive};`,
    `--toast-border-warning:${palette.borderWarning};`,
    `--toast-border-negative:${palette.borderNegative};`,
    '--toast-radius:8px;',
    '--toast-min-height:40px;',
    '--toast-max-width:320px;',
    '--toast-padding-x:12px;',
    '--toast-padding-y:9px;',
    '--toast-gap:8px;',
  ];
}

function appDerivedVars(tokens, mode, includeBase) {
  const primary = tokens.get('--md-sys-color-primary');
  const green = tokens.get('--md-extended-color-green-color');
  const yellow = tokens.get('--md-extended-color-yellow-color');
  const error = tokens.get('--md-sys-color-error');
  const isLight = mode.startsWith('light');
  const hoverOverlay = isLight ? 'rgba(0,0,0,.04)' : 'rgba(255,255,255,.05)';
  const activeOverlay = isLight ? 'rgba(0,0,0,.08)' : 'rgba(255,255,255,.09)';
  const lines = [
    `--app-color-accent-hover:${mix(primary, [255, 255, 255], 0.08)};`,
    `--app-color-accent-down:${mix(primary, [0, 0, 0], 0.08)};`,
    `--app-color-accent-subtle:${rgba(primary, '.14')};`,
    `--app-color-positive-subtle:${rgba(green, '.14')};`,
    `--app-color-informative-subtle:${rgba(primary, '.14')};`,
    `--app-color-notice-subtle:${rgba(yellow, '.14')};`,
    `--app-color-negative-subtle:${rgba(error, '.14')};`,
    ...toastVars(mode),
  ];
  if (includeBase) {
    lines.push(...appSurfaceVars(tokens, mode), ...appBaseVars(hoverOverlay, activeOverlay));
  } else if (isLight) {
    if (surfaceStrategy === 'host') {
      lines.push(...appSurfaceVars(tokens, mode));
    }
    lines.push(`--app-hover-overlay-fallback:${hoverOverlay};`, `--app-color-active-overlay:${activeOverlay};`);
  }
  return lines.map((line) => `    ${line}`).join('\n');
}

function appSurfaceVars(tokens, mode) {
  return surfaceStrategy === 'host' ? hostSurfaceVars(mode) : mdSurfaceVars();
}

function mdSurfaceVars() {
  return [
    '--app-color-background-base:var(--md-sys-color-surface);',
    '--app-color-background-layer-1:var(--md-sys-color-surface-container-low);',
    '--app-color-background-layer-2:var(--md-sys-color-surface-container);',
    '--app-color-background-elevated:var(--md-sys-color-surface-container-high);',
    '--app-color-border-default:var(--md-sys-color-outline-variant);',
    '--app-color-border-strong:var(--md-sys-color-outline);',
    '--app-color-text-primary:var(--md-sys-color-on-surface);',
    '--app-color-text-secondary:var(--md-sys-color-on-surface-variant);',
    '--app-color-text-muted:var(--md-sys-color-outline);',
    '--app-color-text-on-accent:var(--md-sys-color-on-primary);',
    '--app-color-link:var(--app-color-informative);',
    '--app-color-accent-default:var(--md-sys-color-primary);',
    '--app-color-positive:var(--md-extended-color-green-color);',
    '--app-color-on-positive:var(--md-extended-color-green-on-color);',
    '--app-color-informative:var(--md-sys-color-primary);',
    '--app-color-on-informative:var(--md-sys-color-on-primary);',
    '--app-color-notice:var(--md-extended-color-yellow-color);',
    '--app-color-on-notice:var(--md-extended-color-yellow-on-color);',
    '--app-color-negative:var(--md-sys-color-error);',
    '--app-color-on-negative:var(--md-sys-color-on-error);',
    '--app-color-focus-ring:var(--app-color-accent-default);',
    '--app-color-canvas:var(--md-sys-color-surface-container-lowest);',
  ];
}

function hostSurfaceVars(mode) {
  const isLight = mode.startsWith('light');
  if (isLight) {
    return [
      '--app-color-background-base:var(--uxp-host-background-color, var(--md-sys-color-surface));',
      '--app-color-background-layer-1:#EFEFF2;',
      '--app-color-background-layer-2:#E8E8EC;',
      '--app-color-background-elevated:#E0E1E6;',
      '--app-color-border-default:#B8BAC2;',
      '--app-color-border-strong:#8C909A;',
      '--app-color-text-primary:var(--uxp-host-text-color, var(--md-sys-color-on-surface));',
      '--app-color-text-secondary:#454A54;',
      '--app-color-text-muted:#707681;',
      '--app-color-text-on-accent:var(--md-sys-color-on-primary);',
      '--app-color-link:var(--uxp-host-link-text-color, var(--app-color-informative));',
      '--app-color-accent-default:var(--md-sys-color-primary);',
      '--app-color-positive:var(--md-extended-color-green-color);',
      '--app-color-on-positive:var(--md-extended-color-green-on-color);',
      '--app-color-informative:var(--md-sys-color-primary);',
      '--app-color-on-informative:var(--md-sys-color-on-primary);',
      '--app-color-notice:var(--md-extended-color-yellow-color);',
      '--app-color-on-notice:var(--md-extended-color-yellow-on-color);',
      '--app-color-negative:var(--md-sys-color-error);',
      '--app-color-on-negative:var(--md-sys-color-on-error);',
      '--app-color-focus-ring:var(--app-color-accent-default);',
      '--app-color-canvas:#FFFFFF;',
    ];
  }
  return [
    '--app-color-background-base:var(--uxp-host-background-color, var(--md-sys-color-surface));',
    '--app-color-background-layer-1:#4B4B4B;',
    '--app-color-background-layer-2:#464646;',
    '--app-color-background-elevated:#414141;',
    '--app-color-border-default:#6A6A6A;',
    '--app-color-border-strong:#858585;',
    '--app-color-text-primary:var(--uxp-host-text-color, var(--md-sys-color-on-surface));',
    '--app-color-text-secondary:#C1C1C1;',
    '--app-color-text-muted:#A6A6A6;',
    '--app-color-text-on-accent:var(--md-sys-color-on-primary);',
    '--app-color-link:var(--uxp-host-link-text-color, var(--app-color-informative));',
    '--app-color-accent-default:var(--md-sys-color-primary);',
    '--app-color-positive:var(--md-extended-color-green-color);',
    '--app-color-on-positive:var(--md-extended-color-green-on-color);',
    '--app-color-informative:var(--md-sys-color-primary);',
    '--app-color-on-informative:var(--md-sys-color-on-primary);',
    '--app-color-notice:var(--md-extended-color-yellow-color);',
    '--app-color-on-notice:var(--md-extended-color-yellow-on-color);',
    '--app-color-negative:var(--md-sys-color-error);',
    '--app-color-on-negative:var(--md-sys-color-on-error);',
    '--app-color-focus-ring:var(--app-color-accent-default);',
    '--app-color-canvas:#3D3D3D;',
  ];
}

function appBaseVars(hoverOverlay, activeOverlay) {
  return [
    `--app-hover-overlay-fallback:${hoverOverlay};`,
    '--app-color-hover-overlay:var(--uxp-host-widget-hover-background-color, var(--app-hover-overlay-fallback));',
    `--app-color-active-overlay:${activeOverlay};`,
    '--app-radius-small:8px;',
    '--app-radius-medium:12px;',
    '--app-radius-large:20px;',
    '--app-radius-pill:var(--app-radius-medium);',
    '--app-space-1:4px;',
    '--app-space-2:8px;',
    '--app-space-3:12px;',
    '--app-space-4:16px;',
    "--app-font-family-base:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;",
    "--app-font-family-mono:'SF Mono','Menlo',monospace;",
  ];
}

function panelOverrideVars(tokens, mode) {
  const primary = tokens.get('--md-sys-color-primary');
  const green = tokens.get('--md-extended-color-green-color');
  const yellow = tokens.get('--md-extended-color-yellow-color');
  const error = tokens.get('--md-sys-color-error');
  const isLight = mode === 'light';
  const hoverOverlay = isLight ? 'rgba(0,0,0,.04)' : 'rgba(255,255,255,.05)';
  const activeOverlay = isLight ? 'rgba(0,0,0,.08)' : 'rgba(255,255,255,.09)';
  const toast = toastPalette(mode);
  const pairs = [
    ['--app-color-background-base', tokens.get('--md-sys-color-surface')],
    ['--app-color-background-layer-1', tokens.get('--md-sys-color-surface-container-low')],
    ['--app-color-background-layer-2', tokens.get('--md-sys-color-surface-container')],
    ['--app-color-background-elevated', tokens.get('--md-sys-color-surface-container-high')],
    ['--app-color-border-default', tokens.get('--md-sys-color-outline-variant')],
    ['--app-color-border-strong', tokens.get('--md-sys-color-outline')],
    ['--app-color-text-primary', tokens.get('--md-sys-color-on-surface')],
    ['--app-color-text-secondary', tokens.get('--md-sys-color-on-surface-variant')],
    ['--app-color-text-muted', tokens.get('--md-sys-color-outline')],
    ['--app-color-text-on-accent', tokens.get('--md-sys-color-on-primary')],
    ['--app-color-link', primary],
    ['--app-color-accent-default', primary],
    ['--app-color-accent-hover', mix(primary, [255, 255, 255], 0.08)],
    ['--app-color-accent-down', mix(primary, [0, 0, 0], 0.08)],
    ['--app-color-accent-subtle', rgba(primary, '.14')],
    ['--app-color-positive', green],
    ['--app-color-on-positive', tokens.get('--md-extended-color-green-on-color')],
    ['--app-color-positive-subtle', rgba(green, '.14')],
    ['--app-color-informative', primary],
    ['--app-color-on-informative', tokens.get('--md-sys-color-on-primary')],
    ['--app-color-informative-subtle', rgba(primary, '.14')],
    ['--app-color-notice', yellow],
    ['--app-color-on-notice', tokens.get('--md-extended-color-yellow-on-color')],
    ['--app-color-notice-subtle', rgba(yellow, '.14')],
    ['--app-color-negative', error],
    ['--app-color-on-negative', tokens.get('--md-sys-color-on-error')],
    ['--app-color-negative-subtle', rgba(error, '.14')],
    ['--app-hover-overlay-fallback', hoverOverlay],
    ['--app-color-hover-overlay', hoverOverlay],
    ['--app-color-active-overlay', activeOverlay],
    ['--app-color-focus-ring', primary],
    ['--app-color-canvas', tokens.get('--md-sys-color-surface-container-lowest')],
    ['--toast-bg-neutral', toast.bgNeutral],
    ['--toast-bg-info', toast.bgInfo],
    ['--toast-bg-positive', toast.bgPositive],
    ['--toast-bg-warning', toast.bgWarning],
    ['--toast-bg-negative', toast.bgNegative],
    ['--toast-fg-primary', toast.fgPrimary],
    ['--toast-fg-secondary', toast.fgSecondary],
    ['--toast-icon-neutral', toast.iconNeutral],
    ['--toast-icon-info', toast.iconInfo],
    ['--toast-icon-positive', toast.iconPositive],
    ['--toast-icon-warning', toast.iconWarning],
    ['--toast-icon-negative', toast.iconNegative],
    ['--toast-border-neutral', toast.borderNeutral],
    ['--toast-border-info', toast.borderInfo],
    ['--toast-border-positive', toast.borderPositive],
    ['--toast-border-warning', toast.borderWarning],
    ['--toast-border-negative', toast.borderNegative],
    ['--toast-radius', '8px'],
    ['--toast-min-height', '40px'],
    ['--toast-max-width', '320px'],
    ['--toast-padding-x', '12px'],
    ['--toast-padding-y', '9px'],
    ['--toast-gap', '8px'],
  ];
  return pairs.map(([key, value]) => `  ${key}:${value};`).join('\n');
}

function wrapTheme(mode, cssSelector, tokens) {
  const body = [emitVars(tokens), appDerivedVars(tokens, mode, mode === 'dark')].filter(Boolean).join('\n\n');
  if (cssSelector === ':root') {
    return `:root{\n${body}\n}`;
  }
  if (cssSelector.startsWith('@media')) {
    return `${cssSelector}{\n  :root{\n${body}\n  }\n}`;
  }
  return `${cssSelector}{\n${body}\n}`;
}

function buildOutput() {
  const themes = new Map(themeFiles.map(([mode, fileName, sourceSelector]) => [mode, parseTheme(fileName, sourceSelector)]));
  const themeCss = themeFiles
    .map(([mode, , , cssSelector]) => wrapTheme(mode, cssSelector, themes.get(mode)))
    .join('\n\n');
  const panelOverrides = [
    `.panel[data-app-theme="dark"]{\n${panelOverrideVars(themes.get('dark'), 'dark')}\n}`,
    `.panel[data-app-theme="light"]{\n${panelOverrideVars(themes.get('light'), 'light')}\n}`,
  ].join('\n\n');
  return `/** 由 apps/app/scripts/generate-theme-css.mjs 生成，请勿手改。 */\nexport const GENERATED_THEME_CSS = \`\n${themeCss}\n\n${panelOverrides}\n\`;\n`;
}

function main() {
  const actualFiles = fs.readdirSync(sourceDir).filter((file) => file.endsWith('.css')).sort();
  const expectedFiles = themeFiles.map(([, fileName]) => fileName).sort();
  if (actualFiles.join('\n') !== expectedFiles.join('\n')) {
    fail(`expected exactly ${expectedFiles.join(', ')} in ${path.relative(appRoot, sourceDir)}`);
  }

  const output = buildOutput();
  if (checkOnly) {
    const current = fs.existsSync(outFile) ? fs.readFileSync(outFile, 'utf8') : '';
    if (current !== output) {
      fail(`${path.relative(appRoot, outFile)} is stale; run pnpm --filter @imagen-ps/app theme:generate`);
    }
    return;
  }

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, output);
  console.log(`Generated ${path.relative(appRoot, outFile)}`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
