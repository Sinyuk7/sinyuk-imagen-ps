import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const APP_ROOT = process.cwd();
const MANIFEST = JSON.parse(readFileSync(join(APP_ROOT, 'dist', 'manifest.json'), 'utf8')) as {
  readonly entrypoints: readonly Array<{
    readonly type: string;
    readonly minimumSize: { readonly width: number; readonly height: number };
    readonly preferredDockedSize: { readonly width: number; readonly height: number };
    readonly preferredFloatingSize: { readonly width: number; readonly height: number };
  }>;
};
const APP_SHELL_SOURCE = readFileSync(join(APP_ROOT, 'src', 'shared', 'ui', 'app-shell.tsx'), 'utf8');
const SHELL_SOURCE = readFileSync(join(APP_ROOT, 'src', 'shared', 'ui', 'styles', 'shell.ts'), 'utf8');
const RESPONSIVE_SOURCE = readFileSync(join(APP_ROOT, 'src', 'shared', 'ui', 'styles', 'responsive.ts'), 'utf8');
const CONVERSATION_SOURCE = readFileSync(join(APP_ROOT, 'src', 'shared', 'ui', 'styles', 'conversation.ts'), 'utf8');

function extractNumber(source: string, pattern: RegExp, label: string): number {
  const match = source.match(pattern);
  expect(match, `${label} not found`).not.toBeNull();
  return Number(match![1]);
}

function extractBlock(source: string, marker: string): string {
  const start = source.indexOf(marker);
  expect(start, `${marker} not found`).toBeGreaterThanOrEqual(0);
  const rest = source.slice(start);
  const end = rest.indexOf('}');
  expect(end, `${marker} block not closed`).toBeGreaterThanOrEqual(0);
  return rest.slice(0, end + 1);
}

function extractVarRaw(block: string, name: string): string {
  const match = block.match(new RegExp(`--${name}:([^;]+);`));
  expect(match, `${name} not found`).not.toBeNull();
  return match![1]!.trim();
}

function extractVarPx(block: string, name: string): number {
  const value = extractVarRaw(block, name);
  expect(value.endsWith('px'), `${name} is not px-backed`).toBe(true);
  return Number(value.slice(0, -2));
}

describe('chat history layout contract', () => {
  it('keeps manifest default widths inside intended panel width modes', () => {
    const panel = MANIFEST.entrypoints.find((entry) => entry.type === 'panel');
    expect(panel).toBeDefined();

    const compactMax = extractNumber(APP_SHELL_SOURCE, /const PANEL_COMPACT_MAX_WIDTH = (\d+);/, 'PANEL_COMPACT_MAX_WIDTH');
    const wideMin = extractNumber(APP_SHELL_SOURCE, /const PANEL_WIDE_MIN_WIDTH = (\d+);/, 'PANEL_WIDE_MIN_WIDTH');

    const classifyWidthMode = (width: number): 'compact' | 'regular' | 'wide' => {
      if (width <= compactMax) {
        return 'compact';
      }
      if (width >= wideMin) {
        return 'wide';
      }
      return 'regular';
    };

    expect(classifyWidthMode(panel!.minimumSize.width)).toBe('compact');
    expect(classifyWidthMode(panel!.preferredDockedSize.width)).toBe('regular');
    expect(classifyWidthMode(panel!.preferredFloatingSize.width)).toBe('regular');
    expect(classifyWidthMode(wideMin)).toBe('wide');
  });

  it('keeps regular chat tokens aligned to 360/420 default panel budgets', () => {
    const panel = MANIFEST.entrypoints.find((entry) => entry.type === 'panel');
    expect(panel).toBeDefined();

    const shellRoundList = extractBlock(SHELL_SOURCE, '.round-list{');
    const regularRoundList = extractBlock(RESPONSIVE_SOURCE, '.panel[data-panel-width-mode="regular"] .round-list{');
    const compactRoundList = extractBlock(RESPONSIVE_SOURCE, '.panel[data-panel-width-mode="compact"] .round-list{');
    const wideRoundList = extractBlock(RESPONSIVE_SOURCE, '.panel[data-panel-width-mode="wide"] .round-list{');
    const horizontalPadding = extractNumber(shellRoundList, /padding:(\d+)px \1px \1px;/, 'round-list padding');

    const dockedContentWidth = panel!.preferredDockedSize.width - (horizontalPadding * 2);
    const floatingContentWidth = panel!.preferredFloatingSize.width - (horizontalPadding * 2);
    const regularPrompt = extractVarPx(regularRoundList, 'chat-prompt-inline-max');
    const regularResult = extractVarPx(regularRoundList, 'chat-result-inline-max');
    const regularPreview = extractVarPx(regularRoundList, 'chat-preview-inline-max');
    const regularFallback = extractVarPx(regularRoundList, 'chat-preview-block-fallback');
    const wideResult = extractVarPx(wideRoundList, 'chat-result-inline-max');

    expect(extractVarPx(shellRoundList, 'chat-prompt-inline-max')).toBe(regularPrompt);
    expect(extractVarPx(shellRoundList, 'chat-result-inline-max')).toBe(regularResult);
    expect(extractVarPx(shellRoundList, 'chat-preview-inline-max')).toBe(regularPreview);
    expect(regularResult).toBeLessThanOrEqual(dockedContentWidth);
    expect(regularResult).toBeLessThanOrEqual(floatingContentWidth);
    expect(regularPreview).toBeLessThanOrEqual(dockedContentWidth);
    expect(regularPreview).toBeLessThanOrEqual(floatingContentWidth);
    expect(regularPrompt).toBeLessThan(regularResult);
    expect(regularFallback).toBeGreaterThan(0);
    expect(extractVarRaw(compactRoundList, 'chat-result-inline-max')).toBe('100%');
    expect(wideResult).toBeGreaterThan(regularResult);
  });

  it('keeps media cards media-driven and caps only super-tall previews', () => {
    const tallContainFrame = extractBlock(
      CONVERSATION_SOURCE,
      '.img-result[data-preview-layout="tall-contain"][data-preview-visual-mode="contained-well"][data-has-preview="true"] .img-frame{',
    );
    expect(CONVERSATION_SOURCE).toContain('background:var(--chat-preview-stage-surface);');
    expect(CONVERSATION_SOURCE).toContain('.img-frame[data-alpha-state="transparent"]{');
    expect(CONVERSATION_SOURCE).toContain('background:var(--chat-preview-alpha-surface);');
    expect(CONVERSATION_SOURCE).toContain('.prov-card-media{');
    expect(CONVERSATION_SOURCE).toContain('align-self:flex-start;');
    expect(CONVERSATION_SOURCE).toContain('width:auto;');
    expect(CONVERSATION_SOURCE).toContain('max-width:100%;');
    expect(CONVERSATION_SOURCE).toContain('.prov-media-header{');
    expect(CONVERSATION_SOURCE).toContain('.prov-media-provider-row{');
    expect(CONVERSATION_SOURCE).toContain('.prov-media-meta-row{');
    expect(CONVERSATION_SOURCE).toContain('.prov-media-status-group{');
    expect(CONVERSATION_SOURCE).not.toContain('.prov-card-media .prov-model-sep{ display:none; }');
    expect(CONVERSATION_SOURCE).toContain('.img-result{');
    expect(CONVERSATION_SOURCE).toContain('max-width:none;');
    expect(CONVERSATION_SOURCE).toContain('margin-right:0;');
    expect(CONVERSATION_SOURCE).toContain('margin-left:0;');
    expect(CONVERSATION_SOURCE).toContain('.prov-media-section{');
    expect(CONVERSATION_SOURCE).toContain('.img-frame{');
    expect(CONVERSATION_SOURCE).toContain('.img-result[data-preview-layout="tall-contain"][data-preview-visual-mode="contained-well"][data-has-preview="true"] .img-stage::before{');
    expect(CONVERSATION_SOURCE).toContain('padding-top:var(--chat-preview-portrait-cap-padding);');
    expect(tallContainFrame).toContain('width:auto;');
    expect(tallContainFrame).toContain('height:auto;');
    expect(CONVERSATION_SOURCE).toContain('.img-result[data-preview-visual-mode="full-bleed"][data-has-preview="true"] .img-media{');
    expect(RESPONSIVE_SOURCE).toContain('.panel[data-panel-width-mode="compact"] .prov-media-meta-row{ flex-direction:column; align-items:flex-start; flex-wrap:nowrap; }');
    expect(RESPONSIVE_SOURCE).toContain('.panel[data-panel-width-mode="compact"] .prov-media-status-group .prov-status-text{ max-width:none; text-align:left; white-space:nowrap; line-height:14px; }');
    expect(CONVERSATION_SOURCE).not.toContain('background-image:linear-gradient(45deg');
    expect(CONVERSATION_SOURCE).not.toContain('.img-result.media-wide .img-stage{ height:var(--chat-preview-block-wide); }');
    expect(CONVERSATION_SOURCE).not.toContain('.img-media-shell[data-alpha-backdrop="true"]{');
  });
});
