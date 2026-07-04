import { useMemo, useState, type KeyboardEvent } from 'react';
import type { ProviderProfile } from '@imagen-ps/application';
import type { PromptPreset, PromptPresetMode, PromptSettings } from '../../ports/prompt-settings';
import type {
  PromptOptimizationActivationState,
  PromptPresetView,
  PromptSettingsSaveState,
} from '../hooks/use-prompt-settings';
import { hasExactlyOnePromptPlaceholder } from '../hooks/use-prompt-settings';
import { FieldLabel, HelpText } from '../primitives/native-controls';
import { TextSelect } from '../components/text-select';
import { Icon } from '../components/icons';
import { IconButton } from '../primitives/icon-button';
import { UxpTextArea } from '../components/uxp-form-controls';
import { useI18n } from '../i18n/i18n-context';

interface PromptSettingsPageProps {
  readonly settings: PromptSettings;
  readonly profiles: readonly ProviderProfile[];
  readonly loading: boolean;
  readonly error: string | null;
  readonly saveState: PromptSettingsSaveState;
  readonly templateValid: boolean;
  readonly activationState: PromptOptimizationActivationState;
  readonly presetViews: readonly PromptPresetView[];
  readonly onSave: (settings: PromptSettings) => Promise<void>;
  readonly onSelectPreset: (presetId: string | null) => Promise<void>;
  readonly onDeletePreset: (presetId: string) => Promise<void>;
  readonly onOpenPreset: (presetId: string | null) => void;
  readonly onNav: (view: string) => void;
}

function onRowKeyDown(event: KeyboardEvent<HTMLDivElement>, action: () => void): void {
  if (event.key !== 'Enter' && event.key !== ' ') {
    return;
  }
  event.preventDefault();
  action();
}

function activationMessage(state: PromptOptimizationActivationState, t: ReturnType<typeof useI18n>['messages']): string {
  if (state === 'invalid-template') {
    return t.settings.optimizationInvalidTemplate;
  }
  if (state === 'missing-profile') {
    return t.settings.optimizationMissingProfile;
  }
  return t.settings.optimizationNoProfile;
}

function presetModeLabel(mode: PromptPresetMode, t: ReturnType<typeof useI18n>['messages']): string {
  if (mode === 'prepend') {
    return t.settings.presetModePrepend;
  }
  if (mode === 'replace') {
    return t.settings.presetModeReplace;
  }
  return t.settings.presetModeAppend;
}

export function PromptSettingsPage({
  settings,
  profiles,
  loading,
  error,
  saveState,
  templateValid,
  activationState,
  presetViews,
  onSave,
  onSelectPreset,
  onDeletePreset,
  onOpenPreset,
  onNav,
}: PromptSettingsPageProps) {
  const { messages: t } = useI18n();
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const profileOptions = useMemo(() => [
    { id: 'none', label: t.settings.none },
    ...profiles.map((profile) => ({ id: profile.profileId, label: profile.displayName })),
  ], [profiles, t.settings.none]);
  const selectedProfileLabel = settings.optimization.profileId
    ? profileOptions.find((option) => option.id === settings.optimization.profileId)?.label ?? t.settings.optimizationMissingProfile
    : t.settings.none;
  const saveStatus = saveState === 'saving'
    ? t.settings.saving
    : saveState === 'saved'
      ? t.settings.saved
      : error;
  const activationHint = activationState === 'active' ? null : activationMessage(activationState, t);

  return (
    <div className="page page-enter settings-page" onClick={() => {
      setProfileMenuOpen(false);
    }}>
      <header className="hdr">
        <IconButton
          data-testid="prompt-settings-back-button"
          className="hdr-btn"
          quiet
          icon={<Icon name="chevron-left" />}
          tooltip={t.common.back}
          onClick={() => onNav('settings')}
        />
        <div className="hdr-title">{t.settings.promptSettings}</div>
        <div style={{ width: 32 }} />
      </header>
      <div className="scroll">
        <div className="settings-detail-layout scroll-footer-pad generation-settings-layout">
          <section className="section generation-settings-section">
            <div className="field">
              <FieldLabel htmlFor="prompt-optimizer-profile-trigger">{t.settings.optimizerProfile}</FieldLabel>
              <TextSelect
                testId="prompt-optimizer-profile-selector"
                triggerId="prompt-optimizer-profile-trigger"
                containerClassName="cmp-select settings-select"
                menuClassName="cmp-select-menu cmp-select-menu-compact"
                label={t.settings.optimizerProfile}
                value={selectedProfileLabel}
                disabled={loading}
                open={profileMenuOpen}
                onOpenChange={setProfileMenuOpen}
                options={profileOptions}
                selectedId={settings.optimization.profileId ?? 'none'}
                onSelect={(value) => void onSave({
                  ...settings,
                  optimization: {
                    ...settings.optimization,
                    profileId: value === 'none' ? null : value,
                  },
                })}
              />
              {activationHint ? <HelpText className="field-hint">{activationHint}</HelpText> : null}
            </div>
            <div className="field field-textarea">
              <FieldLabel htmlFor="prompt-optimization-template">{t.settings.optimizationTemplate}</FieldLabel>
              <UxpTextArea
                data-testid="prompt-optimization-template"
                id="prompt-optimization-template"
                className="field-textarea-input"
                value={settings.optimization.template}
                disabled={loading}
                onValue={(value) => void onSave({
                  ...settings,
                  optimization: {
                    ...settings.optimization,
                    template: value,
                  },
                })}
              />
              <HelpText
                data-testid="prompt-optimization-template-status"
                className="field-hint"
                variant={templateValid ? undefined : 'negative'}
              >
                {templateValid ? t.settings.templateValid : t.settings.templateInvalidReason}
              </HelpText>
            </div>
          </section>

          <section className="section generation-settings-section">
            <div className="settings-section-header">
              <div className="section-title settings-section-heading">{t.settings.promptPresets}</div>
              <IconButton
                data-testid="prompt-preset-add-button"
                className="settings-icon-button"
                compactSquare
                icon={<Icon name="add" size={16} />}
                tooltip={t.settings.addPreset}
                aria-label={t.settings.addPreset}
                onClick={() => onOpenPreset(null)}
              />
            </div>
            <div className="field prompt-preset-list" role="listbox" aria-label={t.settings.promptPresets}>
              {presetViews.map((view) => {
                const valid = view.contentValid;
                return (
                  <div
                    key={view.preset.id}
                    data-testid={`prompt-preset-row-${view.preset.id}`}
                    className={`prompt-preset-row${view.selected ? ' is-selected' : ''}${valid ? '' : ' is-invalid'}`}
                    role="option"
                    aria-selected={view.selected}
                    tabIndex={0}
                    onClick={() => void onSelectPreset(view.preset.id)}
                    onKeyDown={(event) => onRowKeyDown(event, () => void onSelectPreset(view.preset.id))}
                  >
                    <div className="prompt-preset-row-main">
                      <span
                        className="prompt-preset-radio"
                        aria-hidden="true"
                        data-selected={view.selected ? 'true' : 'false'}
                      />
                      <span className="prompt-preset-name">{view.preset.name || t.settings.editPreset}</span>
                      <span className={`prompt-preset-mode${valid ? '' : ' is-invalid'}`}>
                        {presetModeLabel(view.preset.mode, t)}
                      </span>
                      <IconButton
                        data-testid={`prompt-preset-edit-${view.preset.id}`}
                        className="settings-icon-button prompt-preset-action"
                        compactSquare
                        quiet
                        icon={<Icon name="pencil" size={16} />}
                        tooltip={t.settings.editPreset}
                        aria-label={t.settings.editPreset}
                        onClick={(event) => {
                          event.stopPropagation();
                          onOpenPreset(view.preset.id);
                        }}
                      />
                      <IconButton
                        data-testid={`prompt-preset-delete-${view.preset.id}`}
                        className="settings-icon-button prompt-preset-action danger"
                        compactSquare
                        quiet
                        icon={<Icon name="trash" size={16} />}
                        tooltip={t.common.delete}
                        aria-label={t.common.delete}
                        onClick={(event) => {
                          event.stopPropagation();
                          void onDeletePreset(view.preset.id);
                        }}
                      />
                    </div>
                    {valid ? null : (
                      <HelpText className="prompt-preset-error" variant="negative">
                        {t.settings.presetReplaceInvalid}
                      </HelpText>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          <section className="section generation-settings-section generation-settings-meta-section generation-settings-secondary-section">
            {saveStatus ? (
              <div data-testid="prompt-settings-save-status" className="save-status">
                <span>{saveStatus}</span>
              </div>
            ) : null}
          </section>
        </div>
      </div>
    </div>
  );
}

export function promptPresetStatus(preset: PromptPreset, messages: ReturnType<typeof useI18n>['messages']): string {
  return preset.mode === 'replace' && !hasExactlyOnePromptPlaceholder(preset.content)
    ? messages.settings.presetReplaceInvalid
    : messages.settings.presetContentValid;
}
