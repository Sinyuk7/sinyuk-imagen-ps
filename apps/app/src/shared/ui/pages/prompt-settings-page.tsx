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
  if (state === 'active') {
    return t.settings.optimizationActive;
  }
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
  const [presetMenuOpen, setPresetMenuOpen] = useState(false);
  const profileOptions = useMemo(() => [
    { id: 'none', label: t.settings.none },
    ...profiles.map((profile) => ({ id: profile.profileId, label: profile.displayName })),
  ], [profiles, t.settings.none]);
  const presetOptions = useMemo(() => [
    { id: 'none', label: t.settings.presetNone },
    ...settings.presets.items.map((preset) => ({ id: preset.id, label: preset.name || t.settings.editPreset })),
  ], [settings.presets.items, t.settings.editPreset, t.settings.presetNone]);
  const selectedProfileLabel = settings.optimization.profileId
    ? profileOptions.find((option) => option.id === settings.optimization.profileId)?.label ?? t.settings.optimizationMissingProfile
    : t.settings.none;
  const selectedPresetLabel = settings.presets.selectedId
    ? presetOptions.find((option) => option.id === settings.presets.selectedId)?.label ?? t.settings.presetNone
    : t.settings.presetNone;
  const saveStatus = saveState === 'saving'
    ? t.settings.saving
    : saveState === 'saved'
      ? t.settings.saved
      : error;

  return (
    <div className="page page-enter settings-page" onClick={() => {
      setProfileMenuOpen(false);
      setPresetMenuOpen(false);
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
            <div className="section-title settings-section-heading">{t.settings.promptOptimization}</div>
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
              <HelpText className="field-hint">{activationMessage(activationState, t)}</HelpText>
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
            <div className="field">
              <FieldLabel htmlFor="prompt-preset-selector-trigger">{t.settings.selectedPreset}</FieldLabel>
              <TextSelect
                testId="prompt-preset-selector"
                triggerId="prompt-preset-selector-trigger"
                containerClassName="cmp-select settings-select"
                menuClassName="cmp-select-menu cmp-select-menu-compact"
                label={t.settings.selectedPreset}
                value={selectedPresetLabel}
                disabled={loading}
                open={presetMenuOpen}
                onOpenChange={setPresetMenuOpen}
                options={presetOptions}
                selectedId={settings.presets.selectedId ?? 'none'}
                onSelect={(value) => void onSelectPreset(value === 'none' ? null : value)}
              />
            </div>
            <div className="field provider-endpoint-list">
              {presetViews.map((view) => {
                const valid = view.contentValid;
                return (
                  <div
                    key={view.preset.id}
                    data-testid={`prompt-preset-row-${view.preset.id}`}
                    className={`provider-endpoint-row${view.selected ? ' provider-endpoint-row-current' : ''}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => onOpenPreset(view.preset.id)}
                    onKeyDown={(event) => onRowKeyDown(event, () => onOpenPreset(view.preset.id))}
                  >
                    <div className="provider-endpoint-header">
                      <div className="provider-endpoint-title-row">
                        {view.selected ? (
                          <span className="provider-endpoint-preferred-dot" aria-label={t.settings.selectedPreset} />
                        ) : null}
                        <span className="provider-endpoint-meta provider-endpoint-meta-current">
                          {view.preset.name || t.settings.editPreset}
                        </span>
                        <span className={`provider-endpoint-meta${valid ? '' : ' provider-endpoint-meta-failed'}`}>
                          {presetModeLabel(view.preset.mode, t)}
                        </span>
                        <IconButton
                          data-testid={`prompt-preset-edit-${view.preset.id}`}
                          className="settings-icon-button"
                          compactSquare
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
                          className="settings-icon-button danger"
                          compactSquare
                          icon={<Icon name="trash" size={16} />}
                          tooltip={t.common.delete}
                          aria-label={t.common.delete}
                          onClick={(event) => {
                            event.stopPropagation();
                            void onDeletePreset(view.preset.id);
                          }}
                        />
                      </div>
                    </div>
                    <HelpText className="field-hint" variant={valid ? undefined : 'negative'}>
                      {valid ? t.settings.presetContentValid : t.settings.presetReplaceInvalid}
                    </HelpText>
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
