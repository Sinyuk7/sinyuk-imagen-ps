import type { PromptSettings, PromptTemplate } from '../../ports/prompt-settings';
import type { PromptSettingsState } from '../hooks/use-prompt-settings';
import { Icon, IconButton, List, ListItemShell, PageFrame, PageHeader, PageScroll, SettingsFormSection } from '../ui-system';
import { useI18n } from '../i18n/i18n-context';

interface Props {
  readonly settings: PromptSettings;
  readonly loading: boolean;
  readonly error: string | null;
  readonly saveState: PromptSettingsState['saveState'];
  readonly onDeleteTemplate: (id: string) => Promise<void>;
  readonly onOpenTemplate: (id: string | null) => void;
  readonly onNav: (view: string) => void;
}

export function PromptSettingsPage({ settings, loading, error, onDeleteTemplate, onOpenTemplate, onNav }: Props) {
  const { messages: t } = useI18n();
  const remove = async (id: string) => onDeleteTemplate(id);
  return <PageFrame watch="prompt-settings"><div className="page page-enter settings-page">
    <PageHeader title={t.settings.promptTemplates} back={<IconButton className="hdr-btn" quiet icon={<Icon name="chevron-left" />} tooltip={t.common.back} onClick={() => onNav('settings')} />} right={<IconButton data-testid="prompt-template-add" aria-label={t.settings.addPromptTemplate} disabled={loading || Boolean(error)} className="ui-page-header-action" icon={<Icon name="add" size={16} />} tooltip={t.settings.addPromptTemplate} onClick={() => onOpenTemplate(null)} />} />
    <PageScroll><div className="settings-detail-layout">
      <SettingsFormSection title={t.settings.promptTemplates}>
        <div role="listbox" aria-label={t.settings.promptTemplates}>
          <List className="field prompt-template-list">
            {loading ? <div className="prompt-template-row prompt-template-list-state">{t.settings.promptTemplatesLoading}</div> : null}
            {!loading && error ? <div className="prompt-template-row prompt-template-list-state">{error}</div> : null}
            {!loading && !error ? settings.templates.map((template: PromptTemplate) => <ListItemShell key={template.id} title={template.name || t.settings.editPromptTemplate} description={template.userPrompt.includes('{prompt}') ? t.settings.templateRequiresInput : t.settings.templateStandalone} onPress={() => onOpenTemplate(template.id)} className={`prompt-template-row${settings.selectedTemplateId === template.id ? ' is-selected' : ''}`} trailing={<>
              <IconButton className="prompt-template-action" quiet icon={<Icon name="pencil" size={13} />} tooltip={t.settings.editPromptTemplate} aria-label={t.settings.editPromptTemplate} onClick={() => onOpenTemplate(template.id)} />
              <IconButton className="prompt-template-action danger" quiet icon={<Icon name="trash" size={13} />} tooltip={t.common.delete} aria-label={t.common.delete} onClick={() => void remove(template.id)} />
            </>} />) : null}
          </List>
        </div>
      </SettingsFormSection>
    </div></PageScroll>
  </div></PageFrame>;
}
