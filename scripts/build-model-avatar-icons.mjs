import fs from 'node:fs/promises';
import path from 'node:path';

const repoRoot = process.cwd();
const outputDir = path.join(repoRoot, 'asset/model-avatar-icons');
const runtimeModulePath = path.join(
  repoRoot,
  'apps/app/src/shared/ui/components/generated/model-avatar-icons.ts',
);

const ICON_SLUGS = [
  'gpt',
  'nano-banana',
  'google',
  'qwen',
  'grok',
  'doubao',
  'default',
];

const DISALLOWED_SVG_RE = /<(?:defs|linearGradient|radialGradient|filter|image|foreignObject|script|style)\b/i;
const SHADOW_OR_FILTER_RE = /\b(?:filter|box-shadow|text-shadow|drop-shadow|linear-gradient|radial-gradient)\b/i;
const MIN_WHITE_FOREGROUND_CONTRAST = 4.5;

function normalizeSvg(svg) {
  const cleaned = svg
    .replace(/\r\n/g, '\n')
    .replace(/<\?xml[\s\S]*?\?>/g, '')
    .replace(/<!DOCTYPE[\s\S]*?>/gi, '')
    .trim();

  return cleaned
    .replace(
      /<svg\b([^>]*)>/i,
      (_match, attributes) => {
        const rootAttrs = String(attributes)
          .replace(/\s+xmlns(:[a-zA-Z0-9_-]+)?="[^"]*"/g, '')
          .replace(/\s+(width|height|class|style|fill|stroke|p-id|t|version)="[^"]*"/g, '')
          .trim();
        return `<svg${rootAttrs ? ` ${rootAttrs}` : ''} xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">`;
      },
    )
    .replace(/\s+style="[^"]*"/g, '')
    .replace(/>\s+</g, '><')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function channelToLinear(value) {
  const normalized = value / 255;
  return normalized <= 0.03928
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(hex) {
  const red = Number.parseInt(hex.slice(1, 3), 16);
  const green = Number.parseInt(hex.slice(3, 5), 16);
  const blue = Number.parseInt(hex.slice(5, 7), 16);
  return (0.2126 * channelToLinear(red)) + (0.7152 * channelToLinear(green)) + (0.0722 * channelToLinear(blue));
}

function whiteContrastRatio(background) {
  return 1.05 / (relativeLuminance(background) + 0.05);
}

function assertModelAvatarSvgContract(slug, svg) {
  if (DISALLOWED_SVG_RE.test(svg) || SHADOW_OR_FILTER_RE.test(svg)) {
    throw new Error(`${slug}: model avatar SVG must not contain gradients, filters, shadows, styles, scripts, or embedded images.`);
  }
  if (!/<svg\b[^>]*\bviewBox="0 0 32 32"/.test(svg)) {
    throw new Error(`${slug}: model avatar SVG must use viewBox="0 0 32 32".`);
  }
  if (!/<circle\b[^>]*\bcx="16"[^>]*\bcy="16"[^>]*\br="16"[^>]*\bfill="#[0-9A-Fa-f]{6}"/.test(svg)) {
    throw new Error(`${slug}: model avatar SVG must start with a single-color 32px circle background.`);
  }
  const background = svg.match(/<circle\b[^>]*\bfill="(#[0-9A-Fa-f]{6})"/)?.[1];
  if (!background || whiteContrastRatio(background) < MIN_WHITE_FOREGROUND_CONTRAST) {
    throw new Error(`${slug}: model avatar background must keep at least ${MIN_WHITE_FOREGROUND_CONTRAST}:1 contrast with white foreground.`);
  }
  const backgroundMatches = svg.match(/<circle\b/g) ?? [];
  if (backgroundMatches.length !== 1) {
    throw new Error(`${slug}: model avatar SVG must contain exactly one circle background.`);
  }
  const foregroundShapes = Array.from(svg.matchAll(/<(path|rect|polygon|polyline|ellipse)\b[^>]*>/g));
  if (foregroundShapes.length === 0) {
    throw new Error(`${slug}: model avatar SVG must contain at least one white foreground shape.`);
  }
  for (const [shape] of foregroundShapes) {
    if (!/\bfill="#FFFFFF"/.test(shape)) {
      throw new Error(`${slug}: model avatar foreground shapes must use fill="#FFFFFF".`);
    }
  }
  if (/\bstroke=/.test(svg)) {
    throw new Error(`${slug}: model avatar SVG must avoid stroke.`);
  }
  if (/\bfill="(?:currentColor|none)"/i.test(svg)) {
    throw new Error(`${slug}: model avatar SVG must use explicit background color and white foreground fill.`);
  }
}

function toComponentName(slug) {
  return slug
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

function runtimeModuleSource(entries) {
  const union = entries.map((entry) => `'${entry.slug}'`).join(' | ');
  const iconMap = entries
    .map((entry) => `  '${entry.slug}': ${entry.componentName},`)
    .join('\n');

  const components = entries
    .map((entry) => {
      const svgLiteral = JSON.stringify(entry.svg);
      return `const ${entry.componentName} = ${svgLiteral};`;
    })
    .join('\n\n');

  return `/**
 * 由 \`scripts/build-model-avatar-icons.mjs\` 生成。
 *
 * 不要手改这个文件；修改 \`asset/model-avatar-icons/*.svg\` 后重新运行生成脚本。
 */
export type ModelAvatarIconName = ${union};

${components}

export const MODEL_AVATAR_SVG_BY_NAME: Record<ModelAvatarIconName, string> = {
${iconMap}
};
`;
}

async function main() {
  await fs.mkdir(outputDir, { recursive: true });
  const parsed = await Promise.all(
    ICON_SLUGS.map(async (slug) => {
      const svgPath = path.join(outputDir, `${slug}.svg`);
      const svg = normalizeSvg(await fs.readFile(svgPath, 'utf8'));
      assertModelAvatarSvgContract(slug, svg);
      await fs.writeFile(svgPath, `${svg}\n`, 'utf8');
      return {
        slug,
        svg,
        componentName: `${toComponentName(slug)}Svg`,
      };
    }),
  );

  await fs.mkdir(path.dirname(runtimeModulePath), { recursive: true });

  await fs.writeFile(runtimeModulePath, runtimeModuleSource(parsed), 'utf8');
}

await main();
