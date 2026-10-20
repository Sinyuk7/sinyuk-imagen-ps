export interface PromptTemplate {
  readonly id: string;
  readonly name: string;
  readonly systemPrompt: string;
  readonly userPrompt: string;
}

export interface PromptSettings {
  readonly selectedTemplateId: string | null;
  readonly templates: readonly PromptTemplate[];
}

export interface PromptSettingsStore {
  load(): Promise<PromptSettings | null>;
  save(settings: PromptSettings): Promise<void>;
}

export const DEFAULT_PROMPT_TEMPLATES: readonly PromptTemplate[] = [{
  id: 'template-default',
  name: 'Default',
  systemPrompt: '',
  userPrompt: 'Improve this image prompt while preserving the user intent:\n\n{prompt}',
}];

export function assemblePromptTemplate(template: PromptTemplate | null | undefined, input: string): {
  readonly systemPrompt: string;
  readonly userPrompt: string;
} {
  if (!template) return { systemPrompt: '', userPrompt: input };
  return {
    systemPrompt: template.systemPrompt,
    userPrompt: template.userPrompt.replace('{prompt}', input),
  };
}

export function promptTemplateNeedsInput(template: PromptTemplate | null | undefined): boolean {
  return template?.userPrompt.includes('{prompt}') ?? false;
}

export function isPromptTemplateValid(template: PromptTemplate): boolean {
  return template.name.trim().length > 0
    && template.userPrompt.trim().length > 0
    && (template.userPrompt.match(/\{prompt\}/g)?.length ?? 0) <= 1
    && !template.systemPrompt.includes('{prompt}');
}

export function normalizePromptSettings(input: unknown): PromptSettings {
  const value = typeof input === 'object' && input !== null ? input as Record<string, unknown> : {};
  const templates = Array.isArray(value.templates) ? value.templates.flatMap((item, index) => {
    if (!item || typeof item !== 'object') return [];
    const row = item as Record<string, unknown>;
    return [{
      id: typeof row.id === 'string' ? row.id : `template-${index + 1}`,
      name: typeof row.name === 'string' ? row.name : '',
      systemPrompt: typeof row.systemPrompt === 'string' ? row.systemPrompt : '',
      userPrompt: typeof row.userPrompt === 'string' ? row.userPrompt : '',
    }];
  }) : [];
  const safeTemplates = templates;
  const requestedId = typeof value.selectedTemplateId === 'string' ? value.selectedTemplateId : null;
  return {
    selectedTemplateId: requestedId !== null && safeTemplates.some((item) => item.id === requestedId) ? requestedId : null,
    templates: safeTemplates,
  };
}

export function createDefaultPromptSettings(): PromptSettings {
  return normalizePromptSettings({ templates: DEFAULT_PROMPT_TEMPLATES, selectedTemplateId: null });
}

export function createMemoryPromptSettingsStore(initial?: PromptSettings | null): PromptSettingsStore {
  let current = initial == null ? null : normalizePromptSettings(initial);
  return {
    async load() { return current === null ? null : normalizePromptSettings(current); },
    async save(settings) { current = normalizePromptSettings(settings); },
  };
}
