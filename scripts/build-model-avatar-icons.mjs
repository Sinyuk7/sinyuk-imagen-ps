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
        return `<svg${rootAttrs ? ` ${rootAttrs}` : ''} xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" fill="currentColor">`;
      },
    )
    .replace(/\s+style="[^"]*"/g, '')
    .replace(/\s+fill="(?!none\b)[^"]*"/gi, ' fill="currentColor"')
    .replace(/\s+stroke="(?!none\b)[^"]*"/gi, ' stroke="currentColor"')
    .replace(/>\s+</g, '><')
    .replace(/\s{2,}/g, ' ')
    .trim();
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
