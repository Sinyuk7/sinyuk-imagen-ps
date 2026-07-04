import { useEffect, useMemo, useState } from 'react';
import type { PromptPreset, PromptPresetMode } from '../../ports/prompt-settings';
import { createPromptPresetDraft, hasExactlyOnePromptPlaceholder } from '../hooks/use-prompt-settings';
import { FieldLabel, HelpText } from '../primitives/native-controls';
import { TextField } from '../primitives/native-controls';
import { TextSelect } from '../components/text-select';
import { Icon } from '../components/icons';
import { IconButton } from '../primitives/icon-button';
import { ProviderSettingsFooter, ProviderSettingsPageHeader } from '../components/provider-settings-sections';
import { UxpTextArea } from '../components/uxp-form-controls';
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
    <div className="page page-enter settings-page" onClick={() => setModeMenuOpen(false)}>
      <ProviderSettingsPageHeader
        backButtonTestId="prompt-preset-detail-back-button"
        title={t.settings.editPreset}
        onBack={() => onNav('prompt-settings')}
        rightSlot={(
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
      <div className="scroll scroll-footer-pad">
        <div className="settings-detail-layout">
          <section className="section">
            <div className="field">
              <FieldLabel htmlFor="prompt-preset-name">{t.settings.presetName}</FieldLabel>
              <TextField
                data-testid="prompt-preset-name"
                id="prompt-preset-name"
                className="field-input ui-field-control"
                value={draft.name}
                disabled={saveBusy}
                onValue={(value) => setDraft((current) => ({ ...current, name: value }))}
              />
            </div>
            <div className="field">
              <FieldLabel htmlFor="prompt-preset-mode-trigger">{t.settings.presetMode}</FieldLabel>
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
            </div>
            <div className="field field-textarea">
              <FieldLabel htmlFor="prompt-preset-content">{t.settings.presetContent}</FieldLabel>
              <UxpTextArea
                data-testid="prompt-preset-content"
                id="prompt-preset-content"
                className="field-textarea-input"
                value={draft.content}
                disabled={saveBusy}
                onValue={(value) => setDraft((current) => ({ ...current, content: value }))}
              />
              <HelpText
                data-testid="prompt-preset-content-status"
                className="field-hint"
                variant={contentValid ? undefined : 'negative'}
              >
                {contentValid ? t.settings.presetContentValid : t.settings.presetReplaceInvalid}
              </HelpText>
            </div>
          </section>
        </div>
      </div>
      <ProviderSettingsFooter
        footerClassName="det-footer"
        innerClassName="settings-detail-footer-inner"
        saveGroupClassName="settings-detail-footer-save-group"
        testBusy={false}
        saveBusy={saveBusy}
        testSupported={false}
        saveDisabled={false}
        onTest={() => undefined}
        onSave={() => void save()}
      />
    </div>
  );
}
