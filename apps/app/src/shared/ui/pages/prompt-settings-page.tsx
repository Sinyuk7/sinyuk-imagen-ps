import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { ProviderProfile } from '@imagen-ps/application';
import type { PromptPreset, PromptPresetMode, PromptSettings } from '../../ports/prompt-settings';
import type {
  PromptOptimizationActivationState,
  PromptPresetView,
  PromptSettingsSaveState,
} from '../hooks/use-prompt-settings';
import { hasExactlyOnePromptPlaceholder } from '../hooks/use-prompt-settings';
import {
  FieldGroup,
  HelpText,
  Icon,
  IconButton,
  List,
  MotionButtonSurface,
  PageFrame,
  PageHeader,
  PageScroll,
  PageState,
  SettingsFormSection,
  TextSelect,
  UxpTextAreaField,
  useToast,
} from '../ui-system';
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

type PromptPresetListStateKind = 'loading' | 'empty' | 'error';

interface PromptPresetListStateProps {
  readonly kind: PromptPresetListStateKind;
  readonly title: string;
  readonly description?: string;
  readonly testId: string;
}

/** Prompt presets 列表专用静态行，保持与可选预设相同的行结构。 */
function PromptPresetListState({ kind, title, description, testId }: PromptPresetListStateProps) {
  return (
    <div
      aria-disabled="true"
      className={`prompt-preset-row prompt-preset-list-state prompt-preset-list-state--${kind}`}
      data-testid={testId}
      role="option"
    >
      <span className="prompt-preset-indicator" aria-hidden="true" data-selected="false" />
      <div className="prompt-preset-row-main">
        <span className="prompt-preset-radio" aria-hidden="true" data-selected="false" />
        <div className="prompt-preset-list-state-copy">
          <span className="prompt-preset-name">{title}</span>
          {description ? <span className="prompt-preset-list-state-description">{description}</span> : null}
        </div>
      </div>
    </div>
  );
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
  const { show } = useToast();
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [presetListInitialState, setPresetListInitialState] = useState<'pending' | 'ready' | 'error'>(
    loading ? 'pending' : error ? 'error' : 'ready',
  );
  const [initialPresetError, setInitialPresetError] = useState<string | null>(loading ? null : error);
  const previousSaveStateRef = useRef(saveState);

  useEffect(() => {
    if (presetListInitialState !== 'pending' || loading) {
      return;
    }
    setInitialPresetError(error);
    setPresetListInitialState(error ? 'error' : 'ready');
  }, [error, loading, presetListInitialState]);
  useEffect(() => {
    if (saveState === 'saved' && previousSaveStateRef.current !== 'saved') {
      show(t.settings.saved, 'positive', { key: 'prompt-settings-saved' });
    }
    previousSaveStateRef.current = saveState;
  }, [saveState, show, t.settings.saved]);
  const profileOptions = useMemo(() => [
    { id: 'none', label: t.settings.none },
    ...profiles.map((profile) => ({ id: profile.profileId, label: profile.displayName })),
  ], [profiles, t.settings.none]);
  const selectedProfileLabel = settings.optimization.profileId
    ? profileOptions.find((option) => option.id === settings.optimization.profileId)?.label ?? t.settings.optimizationMissingProfile
    : t.settings.none;
  const activationHint = activationState === 'active' ? null : activationMessage(activationState, t);

  return (
    <PageFrame watch="prompt-settings"><div className="page page-enter settings-page" onClick={() => {
      setProfileMenuOpen(false);
    }}>
      <PageHeader
        title={t.settings.promptSettings}
        back={(
          <IconButton
          data-testid="prompt-settings-back-button"
          className="hdr-btn"
          quiet
          icon={<Icon name="chevron-left" />}
          tooltip={t.common.back}
          onClick={() => onNav('settings')}
          />
        )}
      />
      <PageScroll>
        <div className="settings-detail-layout scroll-footer-pad generation-settings-layout">
          <SettingsFormSection title={t.settings.promptOptimization}>
            <FieldGroup
              label={t.settings.optimizerProfile}
              htmlFor="prompt-optimizer-profile-trigger"
              help={activationHint ? <HelpText className="field-hint">{activationHint}</HelpText> : undefined}
            >
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
            </FieldGroup>
            <FieldGroup label={t.settings.optimizationTemplate} htmlFor="prompt-optimization-template">
              <UxpTextAreaField
                data-testid="prompt-optimization-template"
                id="prompt-optimization-template"
                className="field-textarea-input"
                value={settings.optimization.template}
                placeholder={t.settings.templatePlaceholder}
                disabled={loading}
                nativeEditorSuspended={profileMenuOpen}
                onValue={(value) => void onSave({
                  ...settings,
                  optimization: {
                    ...settings.optimization,
                    template: value,
                  },
                })}
                hint={(
                  <HelpText
                    data-testid="prompt-optimization-template-status"
                    className="field-hint"
                    variant={templateValid ? undefined : 'negative'}
                  >
                    {t.settings.templateInputHint}
                  </HelpText>
                )}
                invalid={!templateValid}
              />
            </FieldGroup>
          </SettingsFormSection>

          <section className="section ui-settings-form-section prompt-preset-section">
            <div className="prompt-preset-section-header">
              <h2>{t.settings.promptPresets}</h2>
              <MotionButtonSurface>
                <IconButton
                  data-testid="prompt-preset-add-button"
                  className="settings-icon-button"
                  compactSquare
                  icon={<Icon name="add" size={16} />}
                  tooltip={t.settings.addPreset}
                  aria-label={t.settings.addPreset}
                  onClick={() => onOpenPreset(null)}
                />
              </MotionButtonSurface>
            </div>
            <div role="listbox" aria-label={t.settings.promptPresets}>
              <List className="field prompt-preset-list">
              {presetListInitialState === 'pending' ? (
                <PromptPresetListState
                  kind="loading"
                  testId="prompt-preset-loading-state"
                  title={t.settings.promptPresetsLoading}
                />
              ) : null}
              {presetListInitialState === 'error' ? (
                <PromptPresetListState
                  description={initialPresetError ?? undefined}
                  kind="error"
                  testId="prompt-preset-error-state"
                  title={t.settings.promptPresets}
                />
              ) : null}
              {presetListInitialState === 'ready' && presetViews.length === 0 ? (
                <PromptPresetListState
                  kind="empty"
                  testId="prompt-preset-empty-state"
                  title={t.settings.promptPresetsEmpty}
                />
              ) : null}
              {presetListInitialState === 'ready' ? presetViews.map((view) => {
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
                    <span
                      className="prompt-preset-indicator"
                      aria-hidden="true"
                      data-selected={view.selected ? 'true' : 'false'}
                    />
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
                      <div className="prompt-preset-actions">
                        <MotionButtonSurface>
                          <IconButton
                            data-testid={`prompt-preset-edit-${view.preset.id}`}
                            className="settings-icon-button prompt-preset-action"
                            hostClassName="prompt-preset-action-host"
                            overlayClassName="prompt-preset-action-overlay"
                            compactSquare
                            quiet
                            icon={<Icon name="pencil" size={15} />}
                            tooltip={t.settings.editPreset}
                            aria-label={t.settings.editPreset}
                            onClick={(event) => {
                              event.stopPropagation();
                              onOpenPreset(view.preset.id);
                            }}
                          />
                        </MotionButtonSurface>
                        <MotionButtonSurface>
                          <IconButton
                            data-testid={`prompt-preset-delete-${view.preset.id}`}
                            className="settings-icon-button prompt-preset-action danger"
                            hostClassName="prompt-preset-action-host"
                            overlayClassName="prompt-preset-action-overlay"
                            compactSquare
                            quiet
                            icon={<Icon name="trash" size={15} />}
                            tooltip={t.common.delete}
                            aria-label={t.common.delete}
                            onClick={(event) => {
                              event.stopPropagation();
                              void onDeletePreset(view.preset.id);
                            }}
                          />
                        </MotionButtonSurface>
                      </div>
                    </div>
                    {valid ? null : (
                      <HelpText className="prompt-preset-error" variant="negative">
                        {t.settings.presetReplaceInvalid}
                      </HelpText>
                    )}
                  </div>
                );
              }) : null}
              </List>
            </div>
          </section>

          {error ? <PageState tone="negative" message={error} /> : null}
        </div>
      </PageScroll>
    </div></PageFrame>
  );
}

export function promptPresetStatus(preset: PromptPreset, messages: ReturnType<typeof useI18n>['messages']): string {
  return preset.mode === 'replace' && !hasExactlyOnePromptPlaceholder(preset.content)
    ? messages.settings.presetReplaceInvalid
    : messages.settings.presetContentValid;
}
