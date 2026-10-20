import { useEffect, useState } from 'react';
import type { PromptTemplate } from '../../ports/prompt-settings';
import { isPromptTemplateValid } from '../../ports/prompt-settings';
import { FieldGroup, HelpText, Icon, IconButton, PageFrame, PageHeader, PageScroll, SettingsFormSection, TextField, UxpTextAreaField } from '../ui-system';
import { useI18n } from '../i18n/i18n-context';

interface Props { readonly template: PromptTemplate | null; readonly onSave: (template: PromptTemplate) => Promise<void>; readonly onNav: (view: string) => void; }

function createPromptTemplateDraft(): PromptTemplate {
  return { id: `template-${Date.now().toString(36)}`, name: '', systemPrompt: '', userPrompt: '' };
}

export function PromptTemplateDetailPage({ template, onSave, onNav }: Props) {
  const { messages: t } = useI18n();
  const [draft, setDraft] = useState<PromptTemplate>(() => template ?? createPromptTemplateDraft());
  const [saving, setSaving] = useState(false);
  useEffect(() => setDraft(template ?? createPromptTemplateDraft()), [template]);
  const valid = isPromptTemplateValid(draft);
  const save = async () => { if (!valid || saving) return; setSaving(true); try { await onSave(draft); onNav('prompt-settings'); } finally { setSaving(false); } };
  return <PageFrame watch={`prompt-template-detail:${template?.id ?? 'new'}`}><div className="page page-enter settings-page">
    <PageHeader title={template ? t.settings.editPromptTemplate : t.settings.addPromptTemplate} back={<IconButton className="hdr-btn" quiet icon={<Icon name="chevron-left" />} tooltip={t.common.back} onClick={() => onNav('prompt-settings')} />} right={<IconButton data-testid="prompt-template-save" aria-label={t.common.save} disabled={!valid || saving} className="ui-page-header-action" icon={<Icon name="save" size={16} />} tooltip={saving ? t.settings.saving : t.common.save} onClick={() => void save()} />} />
    <PageScroll><div className="settings-detail-layout">
      <SettingsFormSection>
        <FieldGroup label={t.settings.templateName} htmlFor="prompt-template-name"><TextField id="prompt-template-name" className="field-input ui-field-control" value={draft.name} onValue={(name) => setDraft((v) => ({ ...v, name }))} /></FieldGroup>
        <FieldGroup label={t.settings.systemPrompt} htmlFor="prompt-template-system"><UxpTextAreaField id="prompt-template-system" className="field-textarea-input" value={draft.systemPrompt} onValue={(systemPrompt) => setDraft((v) => ({ ...v, systemPrompt }))} hint={<HelpText className="field-hint">{t.settings.systemPromptHint}</HelpText>} /></FieldGroup>
        <FieldGroup label={t.settings.userPromptTemplate} htmlFor="prompt-template-user"><UxpTextAreaField id="prompt-template-user" className="field-textarea-input" value={draft.userPrompt} onValue={(userPrompt) => setDraft((v) => ({ ...v, userPrompt }))} hint={<HelpText className="field-hint" variant={valid ? undefined : 'negative'}>{t.settings.userPromptTemplateHint}</HelpText>} invalid={!valid} /></FieldGroup>
      </SettingsFormSection>
    </div></PageScroll>
  </div></PageFrame>;
}
