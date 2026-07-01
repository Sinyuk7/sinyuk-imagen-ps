import fs from 'node:fs/promises';
import path from 'node:path';

const repoRoot = process.cwd();
const outputDir = path.join(repoRoot, 'asset/model-avatar-icons');
const runtimeModulePath = path.join(
  repoRoot,
  'apps/app/src/shared/ui/components/generated/model-avatar-icons.ts',
);

const ICON_SLUGS = [
  'openapi',
  'gpt',
  'nano-banana',
  'qwen',
  'grok',
  'jimeng',
  'google',
  'debug-mock',
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

const MODEL_RULES_SOURCE = `/**
 * Header model/avatar 图标选择规则。
 *
 * 规则按顺序匹配；谁先写谁生效。
 */
import type { ModelAvatarIconName } from './generated/model-avatar-icons';

export interface ResolveModelAvatarIconInput {
  readonly modelId?: string;
  readonly providerId?: string;
  readonly providerName?: string;
}

const ORDERED_RULES: ReadonlyArray<{
  readonly icon: ModelAvatarIconName;
  readonly matches: ReadonlyArray<string>;
  readonly fields: ReadonlyArray<'modelId' | 'providerId' | 'providerName'>;
}> = [
  { icon: 'debug-mock', matches: ['mock'], fields: ['providerId', 'providerName'] },
  { icon: 'nano-banana', matches: ['banana', 'gemini'], fields: ['modelId'] },
  { icon: 'gpt', matches: ['gpt'], fields: ['modelId'] },
  { icon: 'qwen', matches: ['qwen'], fields: ['modelId'] },
  { icon: 'grok', matches: ['grok'], fields: ['modelId'] },
  { icon: 'jimeng', matches: ['jimeng', '即梦'], fields: ['modelId'] },
  { icon: 'google', matches: ['google'], fields: ['modelId'] },
  { icon: 'openapi', matches: ['openapi'], fields: ['modelId'] },
];

export function resolveModelAvatarIcon({
  modelId,
  providerId,
  providerName,
}: ResolveModelAvatarIconInput): ModelAvatarIconName {
  const normalized = {
    modelId: modelId?.toLowerCase() ?? '',
    providerId: providerId?.toLowerCase() ?? '',
    providerName: providerName?.toLowerCase() ?? '',
  };

  for (const rule of ORDERED_RULES) {
    for (const field of rule.fields) {
      const value = normalized[field];
      if (!value) {
        continue;
      }
      if (rule.matches.some((fragment) => value.includes(fragment.toLowerCase()))) {
        return rule.icon;
      }
    }
  }

  return 'default';
}
`;

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
  await fs.writeFile(
    path.join(repoRoot, 'apps/app/src/shared/ui/components/model-avatar-rules.ts'),
    MODEL_RULES_SOURCE,
    'utf8',
  );
}

await main();
