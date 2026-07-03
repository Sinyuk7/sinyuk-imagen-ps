import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { MODEL_AVATAR_SVG_BY_NAME, type ModelAvatarIconName } from '../src/shared/ui/components/generated/model-avatar-icons';

const ICON_NAMES: readonly ModelAvatarIconName[] = [
  'gpt',
  'nano-banana',
  'google',
  'qwen',
  'grok',
  'doubao',
  'default',
] as const;

const REPO_ROOT = path.resolve(__dirname, '../../..');
const ICON_DIR = path.join(REPO_ROOT, 'asset/model-avatar-icons');
const DISALLOWED_SVG_RE = /<(?:defs|linearGradient|radialGradient|filter|image|foreignObject|script|style)\b/i;
const SHADOW_OR_FILTER_RE = /\b(?:filter|box-shadow|text-shadow|drop-shadow|linear-gradient|radial-gradient)\b/i;
const MIN_WHITE_FOREGROUND_CONTRAST = 4.5;

function sourceSvg(name: ModelAvatarIconName): string {
  return fs.readFileSync(path.join(ICON_DIR, `${name}.svg`), 'utf8').trim();
}

function channelToLinear(value: number): number {
  const normalized = value / 255;
  return normalized <= 0.03928
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(hex: string): number {
  const red = Number.parseInt(hex.slice(1, 3), 16);
  const green = Number.parseInt(hex.slice(3, 5), 16);
  const blue = Number.parseInt(hex.slice(5, 7), 16);
  return (0.2126 * channelToLinear(red)) + (0.7152 * channelToLinear(green)) + (0.0722 * channelToLinear(blue));
}

function whiteContrastRatio(background: string): number {
  return 1.05 / (relativeLuminance(background) + 0.05);
}

function expectSvgContract(name: ModelAvatarIconName, svg: string): void {
  expect(svg, `${name} has no disallowed SVG primitives`).not.toMatch(DISALLOWED_SVG_RE);
  expect(svg, `${name} has no shadow/filter/gradient CSS`).not.toMatch(SHADOW_OR_FILTER_RE);
  expect(svg, `${name} uses 32px viewBox`).toMatch(/<svg\b[^>]*\bviewBox="0 0 32 32"/);
  expect(svg, `${name} has no stroke`).not.toMatch(/\bstroke=/);
  expect(svg, `${name} has one circle background`).toMatch(/<circle\b[^>]*\bcx="16"[^>]*\bcy="16"[^>]*\br="16"[^>]*\bfill="#[0-9A-Fa-f]{6}"/);
  expect(svg.match(/<circle\b/g)?.length ?? 0, `${name} has exactly one circle`).toBe(1);
  const background = svg.match(/<circle\b[^>]*\bfill="(#[0-9A-Fa-f]{6})"/)?.[1];
  expect(background, `${name} has an explicit background color`).toBeDefined();
  expect(whiteContrastRatio(background ?? '#000000'), `${name} background contrasts with white foreground`).toBeGreaterThanOrEqual(MIN_WHITE_FOREGROUND_CONTRAST);
  expect(svg, `${name} has no currentColor fill`).not.toMatch(/\bfill="currentColor"/i);
  expect(svg, `${name} has white foreground`).toMatch(/<(?:path|rect)\b[^>]*\bfill="#FFFFFF"/);

  const foregrounds = Array.from(svg.matchAll(/<(path|rect|polygon|polyline|ellipse)\b[^>]*>/g));
  expect(foregrounds.length, `${name} has foreground shapes`).toBeGreaterThan(0);
  for (const [shape] of foregrounds) {
    expect(shape, `${name} foreground uses white fill`).toMatch(/\bfill="#FFFFFF"/);
  }
}

describe('model avatar SVG contract', () => {
  it('keeps source SVGs inside the Photoshop UXP avatar contract', () => {
    for (const name of ICON_NAMES) {
      expectSvgContract(name, sourceSvg(name));
    }
  });

  it('keeps generated registry synchronized with source SVGs', () => {
    for (const name of ICON_NAMES) {
      expect(MODEL_AVATAR_SVG_BY_NAME[name]).toBe(sourceSvg(name));
      expectSvgContract(name, MODEL_AVATAR_SVG_BY_NAME[name]);
    }
  });
});
