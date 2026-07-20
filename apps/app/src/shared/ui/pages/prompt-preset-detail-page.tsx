import { useEffect, useMemo, useState } from 'react';
import type { PromptPreset, PromptPresetMode } from '../../ports/prompt-settings';
import { createPromptPresetDraft, hasExactlyOnePromptPlaceholder } from '../hooks/use-prompt-settings';
import {
  Button,
  FieldGroup,
  FooterActions,
  HelpText,
  Icon,
  IconButton,
  PageFrame,
  PageHeader,
  PageScroll,
  SettingsFormSection,
  TextField,
  TextSelect,
  UxpTextAreaField,
} from '../ui-system';
import { useI18n } from '../i18n/i18n-context';

interface PromptPresetDetailPageProps {
  readonly preset: PromptPreset | null;
  readonly onSave: (preset: PromptPreset) => Promise<void>;
  readonly onNav: (view: string) => void;
}

function modeLabel(mode: PromptPresetMode, t: ReturnType<typeof useI18n>['messages']): string {
  if (mode === 'prepend') {
    return t.settings.presetModePrepend;
  }
  if (mode === 'replace') {
    return t.settings.presetModeReplace;
  }
  return t.settings.presetModeAppend;
}

export function PromptPresetDetailPage({ preset, onSave, onNav }: PromptPresetDetailPageProps) {
  const { messages: t } = useI18n();
  const [draft, setDraft] = useState<PromptPreset>(() => preset ?? createPromptPresetDraft());
  const [modeMenuOpen, setModeMenuOpen] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);

  useEffect(() => {
    setDraft(preset ?? createPromptPresetDraft());
  }, [preset]);

  const modeOptions = useMemo(() => [
    { id: 'prepend', label: t.settings.presetModePrepend },
    { id: 'append', label: t.settings.presetModeAppend },
    { id: 'replace', label: t.settings.presetModeReplace },
  ], [t.settings.presetModeAppend, t.settings.presetModePrepend, t.settings.presetModeReplace]);
  const contentValid = draft.mode !== 'replace' || hasExactlyOnePromptPlaceholder(draft.content);

  const save = async () => {
    setSaveBusy(true);
    try {
      await onSave(draft);
      onNav('prompt-settings');
    } finally {
      setSaveBusy(false);
    }
  };

  return (
    <PageFrame watch={`prompt-preset-detail:${preset?.id ?? 'new'}`}><div className="page page-enter settings-page" onClick={() => setModeMenuOpen(false)}>
      <PageHeader
        title={t.settings.editPreset}
        back={(
          <IconButton
            data-testid="prompt-preset-detail-back-button"
            className="hdr-btn"
            quiet
            icon={<Icon name="chevron-left" />}
            tooltip={t.common.back}
            onClick={() => onNav('prompt-settings')}
          />
        )}
        right={(
          <IconButton
            data-testid="prompt-preset-detail-save-header"
            className="hdr-btn"
            quiet
            icon={<Icon name="check" />}
            tooltip={t.common.save}
            disabled={saveBusy}
            onClick={() => void save()}
          />
        )}
      />
      <PageScroll className="scroll-footer-pad">
        <div className="settings-detail-layout">
          <SettingsFormSection title={t.settings.editPreset}>
            <FieldGroup label={t.settings.presetName} htmlFor="prompt-preset-name">
              <TextField
                data-testid="prompt-preset-name"
                id="prompt-preset-name"
                className="field-input ui-field-control"
                value={draft.name}
                disabled={saveBusy}
                onValue={(value) => setDraft((current) => ({ ...current, name: value }))}
              />
            </FieldGroup>
            <FieldGroup label={t.settings.presetMode} htmlFor="prompt-preset-mode-trigger">
              <TextSelect
                testId="prompt-preset-mode-selector"
                triggerId="prompt-preset-mode-trigger"
                containerClassName="cmp-select settings-select"
                menuClassName="cmp-select-menu cmp-select-menu-compact"
                label={t.settings.presetMode}
                value={modeLabel(draft.mode, t)}
                disabled={saveBusy}
                open={modeMenuOpen}
                onOpenChange={setModeMenuOpen}
                options={modeOptions}
                selectedId={draft.mode}
                onSelect={(value) => setDraft((current) => ({ ...current, mode: value as PromptPresetMode }))}
              />
            </FieldGroup>
            <FieldGroup label={t.settings.presetContent} htmlFor="prompt-preset-content">
              <UxpTextAreaField
                data-testid="prompt-preset-content"
                id="prompt-preset-content"
                className="field-textarea-input"
                value={draft.content}
                disabled={saveBusy}
                nativeEditorSuspended={modeMenuOpen}
                onValue={(value) => setDraft((current) => ({ ...current, content: value }))}
                hint={(
                  <HelpText
                    data-testid="prompt-preset-content-status"
                    className="field-hint"
                    variant={contentValid ? undefined : 'negative'}
                  >
                    {contentValid ? t.settings.presetContentValid : t.settings.presetReplaceInvalid}
                  </HelpText>
                )}
                invalid={!contentValid}
              />
            </FieldGroup>
          </SettingsFormSection>
        </div>
      </PageScroll>
      <FooterActions className="det-footer">
        <div className="settings-detail-footer-inner">
          <div className="settings-detail-footer-save-group">
            <Button data-testid="provider-save-button" className="btn-save" variant="accent" disabled={saveBusy} onClick={() => void save()}>
              {saveBusy ? t.settings.saving : t.common.save}
            </Button>
          </div>
        </div>
      </FooterActions>
    </div></PageFrame>
  );
}
