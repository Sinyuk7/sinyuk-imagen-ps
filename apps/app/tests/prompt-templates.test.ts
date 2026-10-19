import { describe, expect, it } from 'vitest';
import {
  assemblePromptTemplate,
  createDefaultPromptSettings,
  isPromptTemplateValid,
  promptTemplateNeedsInput,
} from '../src/shared/ports/prompt-settings';

describe('prompt templates', () => {
  it('assembles system and user prompts without side effects', () => {
    const template = { id: 't1', name: 'Portrait', systemPrompt: 'Keep identity.', userPrompt: 'Improve: {prompt}' };
    expect(assemblePromptTemplate(template, 'Soft light')).toEqual({
      systemPrompt: 'Keep identity.',
      userPrompt: 'Improve: Soft light',
    });
    expect(template.userPrompt).toBe('Improve: {prompt}');
  });

  it('supports standalone templates and validates placeholder rules', () => {
    const standalone = { id: 't1', name: 'Direct', systemPrompt: '', userPrompt: 'A paper collage.' };
    expect(promptTemplateNeedsInput(standalone)).toBe(false);
    expect(assemblePromptTemplate(standalone, '')).toEqual({ systemPrompt: '', userPrompt: 'A paper collage.' });
    expect(isPromptTemplateValid(standalone)).toBe(true);
    expect(isPromptTemplateValid({ ...standalone, userPrompt: '{prompt} {prompt}' })).toBe(false);
    expect(isPromptTemplateValid({ ...standalone, systemPrompt: '{prompt}' })).toBe(false);
  });

  it('starts with one ordinary editable template', () => {
    const settings = createDefaultPromptSettings();
    expect(settings.templates).toHaveLength(1);
    expect(settings.selectedTemplateId).toBe(settings.templates[0]!.id);
  });
});
