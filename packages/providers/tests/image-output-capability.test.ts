import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  getOfficialModelPreset,
  resolveProviderResolvedOutput,
  validateImageModelCatalog,
  type ImageOutputSelection,
} from '../src/index.js';
import { GEMINI_GENERATE_CONTENT_MODEL_CAPABILITIES } from '../src/contract/image-model-catalog/rules/gemini-generate-content.js';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..');
const SCAN_EXTENSIONS = new Set(['.ts', '.tsx', '.md', '.json']);
const SCAN_SKIP_DIRS = new Set(['.git', 'node_modules', 'dist']);
const BASE_NAME = ['Nano', 'Banana'].join(' ');
const LITE_NAME = `${BASE_NAME} Lite`;
const FORBIDDEN_MODEL_NAME_PATTERNS = [
  new RegExp(`\\b${LITE_NAME}\\b`, 'g'),
  new RegExp(`\\b${BASE_NAME}\\b(?! (?:2|2 Lite|Pro)\\b)`, 'g'),
] as const;

function walkFiles(root: string): string[] {
  const entries = readdirSync(root, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (SCAN_SKIP_DIRS.has(entry.name)) {
        continue;
      }
      files.push(...walkFiles(join(root, entry.name)));
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }
    if (!Array.from(SCAN_EXTENSIONS).some((ext) => entry.name.endsWith(ext))) {
      continue;
    }
    files.push(join(root, entry.name));
  }
  return files;
}

function findForbiddenModelNameHits(): string[] {
  const hits: string[] = [];
  for (const file of walkFiles(REPO_ROOT)) {
    const content = readFileSync(file, 'utf8');
    const lines = content.split('\n');
    lines.forEach((line, index) => {
      for (const pattern of FORBIDDEN_MODEL_NAME_PATTERNS) {
        pattern.lastIndex = 0;
        const match = pattern.exec(line);
        if (match) {
          hits.push(`${file}:${index + 1}:${match[0]}`);
        }
      }
    });
  }
  return hits;
}

describe('image output capability contract', () => {
  it('forbids legacy Gemini image display names anywhere in repo source', () => {
    expect(findForbiddenModelNameHits()).toEqual([]);
  });

  it('declares flexible pixel truth separately from recommended presets', () => {
    const preset = getOfficialModelPreset('openai-images', 'gpt-image-2');

    expect(preset?.outputCapability.geometry.kind).toBe('flexible-pixels');
    expect(preset?.outputExposure.kind).toBe('flexible-pixels');
    expect(preset?.outputCapability.geometry).toMatchObject({
      constraints: {
        maxSide: 3840,
        multipleOf: 16,
        maxAspectRatio: 3,
      },
      editDerived: { exactSize: true },
    });
    expect(preset?.outputCapability.geometry.kind === 'flexible-pixels'
      ? preset.outputCapability.geometry.recommendedPresets.map((entry) => entry.id)
      : []).toEqual(['1k', '2k', '4k']);
  });

  it('declares Gemini ratio-resolution truth as native dimensions', () => {
    const preset = getOfficialModelPreset('gemini-generate-content', 'gemini-3.1-flash-image');

    expect(preset?.outputCapability.geometry).toMatchObject({
      kind: 'ratio-resolution',
      aspectRatios: ['1:1', '1:4', '1:8', '2:3', '3:2', '3:4', '4:1', '4:3', '4:5', '5:4', '8:1', '9:16', '16:9', '21:9'],
      resolutions: ['512', '1k', '2k', '4k'],
    });
    expect(preset?.outputExposure).toMatchObject({
      kind: 'ratio-resolution',
      aspectRatios: ['1:1', '1:4', '1:8', '2:3', '3:2', '3:4', '4:1', '4:3', '4:5', '5:4', '8:1', '9:16', '16:9', '21:9'],
      resolutions: ['512', '1k', '2k', '4k'],
    });
  });

  it('keeps Gemini image model dimensions model-specific', () => {
    const pro = getOfficialModelPreset('gemini-generate-content', 'gemini-3-pro-image');
    const lite = getOfficialModelPreset('gemini-generate-content', 'gemini-3.1-flash-lite-image');

    expect(pro?.outputCapability.geometry.kind === 'ratio-resolution'
      ? pro.outputCapability.geometry.aspectRatios
      : []).toEqual(['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9']);
    expect(pro?.outputCapability.geometry.kind === 'ratio-resolution'
      ? pro.outputCapability.geometry.resolutions
      : []).toEqual(['1k', '2k', '4k']);
    expect(lite?.outputCapability.geometry.kind === 'ratio-resolution'
      ? lite.outputCapability.geometry.resolutions
      : []).toEqual(['1k']);
    expect(lite?.outputMatrix.every((matrix) =>
      matrix.cells.every((cell) =>
        cell.selection.geometry.kind !== 'ratio-resolution' || cell.selection.geometry.resolution === '1k',
      ),
    )).toBe(true);
  });

  it('maps Use Input Size through normalized primary edit input geometry', () => {
    const selection: ImageOutputSelection = {
      geometry: { kind: 'input-derived', mode: 'exact-size' },
      outputFormat: 'png',
    };

    expect(resolveProviderResolvedOutput({
      providerId: 'image-endpoint',
      capabilityModelId: 'gpt-image-2',
      operation: 'image_edit',
      output: { selection },
      inputContext: {
        primaryEditInput: {
          width: 1024,
          height: 1536,
        },
      },
    })).toEqual({
      kind: 'image-endpoint',
      size: '1024x1536',
      outputFormat: 'png',
    });
  });

  it('normalizes exact-size to provider default for text-to-image without input geometry', () => {
    const selection: ImageOutputSelection = {
      geometry: { kind: 'input-derived', mode: 'exact-size' },
      outputFormat: 'webp',
    };

    expect(resolveProviderResolvedOutput({
      providerId: 'image-endpoint',
      capabilityModelId: 'gpt-image-2',
      operation: 'text_to_image',
      output: { selection },
    })).toEqual({
      kind: 'image-endpoint',
      size: 'auto',
      outputFormat: 'webp',
    });
  });

  it('fails closed for invalid exact-size geometry instead of rewriting it', () => {
    const selection: ImageOutputSelection = {
      geometry: { kind: 'input-derived', mode: 'exact-size' },
      outputFormat: 'png',
    };

    expect(() => resolveProviderResolvedOutput({
      providerId: 'image-endpoint',
      capabilityModelId: 'gpt-image-2',
      operation: 'image_edit',
      output: { selection },
      inputContext: {
        primaryEditInput: {
          width: 1001,
          height: 1001,
        },
      },
    })).toThrow('cannot resolve exact output size "1001x1001"');
  });

  it('maps Gemini ratio-resolution selection to native provider fields', () => {
    expect(resolveProviderResolvedOutput({
      providerId: 'gemini-generate-content',
      capabilityModelId: 'gemini-3.1-flash-image',
      operation: 'text_to_image',
      output: {
        selection: {
          geometry: {
            kind: 'ratio-resolution',
            resolution: '512',
            aspectRatio: '1:8',
          },
          outputFormat: 'png',
        },
      },
    })).toEqual({
      kind: 'gemini-generate-content',
      imageConfig: {
        imageSize: '512',
        aspectRatio: '1:8',
      },
    });
  });

  it('validates catalog selection projections', () => {
    expect(validateImageModelCatalog()).toEqual([]);
  });

  it('rejects blank catalog display names', () => {
    const [first, ...rest] = GEMINI_GENERATE_CONTENT_MODEL_CAPABILITIES;
    expect(validateImageModelCatalog([
      { ...first, displayName: '   ' },
      ...rest,
    ])).toContain(`Rule "${first.ruleId}" has empty displayName.`);
  });
});
