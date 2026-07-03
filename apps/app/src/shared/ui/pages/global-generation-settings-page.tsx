import { useEffect, useState } from 'react';
import { useAppServices } from '../../ports/app-services-context';
import type {
  AppAspectRatio,
  AppGenerationSettings,
  AppProviderInputSizePreset,
  AppOutputFormat,
  AppOutputSizePreset,
} from '../../ports/app-generation-settings';
import { useAppPathInfo } from '../hooks/use-app-path-info';
import { StatusNotice } from '../components/status-notice';
import { Button, FieldLabel, HelpText } from '../primitives/native-controls';
import { TextSelect } from '../components/text-select';
import { Icon } from '../components/icons';
import { IconButton } from '../primitives/icon-button';
import { useI18n } from '../i18n/i18n-context';

interface GlobalGenerationSettingsPageProps {
  readonly settings: AppGenerationSettings;
  readonly loading: boolean;
  readonly error: string | null;
  readonly onSave: (settings: AppGenerationSettings) => Promise<void>;
  readonly onNav: (view: string) => void;
}

type MenuId = 'size' | 'format' | 'aspect' | 'provider-input-size' | null;

const SIZE_OPTIONS: ReadonlyArray<{ readonly id: AppOutputSizePreset; readonly label: string }> = [
  { id: '512', label: '512' },
  { id: '1k', label: '1K' },
  { id: '2k', label: '2K' },
  { id: '4k', label: '4K' },
];

const FORMAT_OPTIONS: ReadonlyArray<{ readonly id: AppOutputFormat; readonly label: string }> = [
  { id: 'png', label: 'PNG' },
  { id: 'jpeg', label: 'JPEG' },
  { id: 'webp', label: 'WebP' },
];

const ASPECT_OPTIONS: ReadonlyArray<{ readonly id: AppAspectRatio; readonly label: string }> = [
  { id: 'auto', label: 'Auto' },
  { id: '1:1', label: '1:1' },
  { id: '16:9', label: '16:9' },
  { id: '9:16', label: '9:16' },
];

const PROVIDER_INPUT_SIZE_OPTIONS: ReadonlyArray<{ readonly id: AppProviderInputSizePreset; readonly label: string }> = [
  { id: '1k', label: '1K' },
  { id: '2k', label: '2K' },
  { id: '4k', label: '4K' },
];

function labelFor<T extends string>(options: ReadonlyArray<{ readonly id: T; readonly label: string }>, id: T): string {
  return options.find((option) => option.id === id)?.label ?? id;
}

async function copyText(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && typeof navigator.clipboard?.writeText === 'function') {
    await navigator.clipboard.writeText(text);
    return true;
  }
  return false;
}

export function GlobalGenerationSettingsPage({
  settings,
  loading,
  error,
  onSave,
  onNav,
}: GlobalGenerationSettingsPageProps) {
  const services = useAppServices();
  const { messages: t } = useI18n();
  const pathInfo = useAppPathInfo(services);
  const [draft, setDraft] = useState<AppGenerationSettings>(settings);
  const [saving, setSaving] = useState(false);
  const [openMenu, setOpenMenu] = useState<MenuId>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const updateDraft = (next: Partial<AppGenerationSettings>) => {
    setDraft((current) => ({ ...current, ...next }));
  };

  useEffect(() => {
    setDraft(settings);
  }, [settings]);

  const save = async () => {
    setSaving(true);
    try {
      await onSave(draft);
      setDraft(draft);
    } finally {
      setSaving(false);
    }
  };

  const copyPath = async (key: string, value: string) => {
    const ok = await copyText(value).catch(() => false);
    if (!ok) {
      setCopiedKey(null);
      return;
    }
    setCopiedKey(key);
    window.setTimeout(() => {
      setCopiedKey((current) => (current === key ? null : current));
    }, 1200);
  };

  return (
    <div className="page page-enter settings-page" onClick={() => setOpenMenu(null)}>
      <header className="hdr">
        <IconButton
          data-testid="global-settings-back-button"
          className="hdr-btn"
          quiet
          icon={<Icon name="chevron-left" />}
          tooltip={t.common.back}
          onClick={() => onNav('settings')}
        />
        <div className="hdr-title">{t.settings.globalGeneration}</div>
        <div style={{ width: 32 }} />
      </header>
      <div className="scroll">
        <div className="settings-detail-layout scroll-footer-pad generation-settings-layout">
          <section className="section generation-settings-section">
            <div className="section-title settings-section-heading">{t.settings.outputGroup}</div>
            <div className="generation-settings-section-intro">
              <HelpText className="field-hint generation-settings-section-hint">
                {t.settings.outputSize} / {t.settings.outputFormat} / {t.settings.aspectRatio}
              </HelpText>
            </div>
            <div className="generation-settings-grid">
              <div className="field">
                <FieldLabel htmlFor="global-output-size-trigger">{t.settings.outputSize}</FieldLabel>
                <TextSelect
                  testId="global-output-size-selector"
                  triggerId="global-output-size-trigger"
                  containerClassName="cmp-select settings-select"
                  menuClassName="cmp-select-menu cmp-select-menu-compact"
                  label={t.settings.outputSize}
                  value={labelFor(SIZE_OPTIONS, draft.outputSizePreset)}
                  disabled={loading || saving}
                  open={openMenu === 'size'}
                  onOpenChange={(open) => setOpenMenu(open ? 'size' : null)}
                  options={SIZE_OPTIONS}
                  selectedId={draft.outputSizePreset}
                  onSelect={(value) => updateDraft({ outputSizePreset: value as AppOutputSizePreset })}
                />
              </div>
              <div className="field">
                <FieldLabel htmlFor="global-output-format-trigger">{t.settings.outputFormat}</FieldLabel>
                <TextSelect
                  testId="global-output-format-selector"
                  triggerId="global-output-format-trigger"
                  containerClassName="cmp-select settings-select"
                  menuClassName="cmp-select-menu cmp-select-menu-compact"
                  label={t.settings.outputFormat}
                  value={labelFor(FORMAT_OPTIONS, draft.outputFormat)}
                  disabled={loading || saving}
                  open={openMenu === 'format'}
                  onOpenChange={(open) => setOpenMenu(open ? 'format' : null)}
                  options={FORMAT_OPTIONS}
                  selectedId={draft.outputFormat}
                  onSelect={(value) => updateDraft({ outputFormat: value as AppOutputFormat })}
                />
              </div>
              <div className="field">
                <FieldLabel htmlFor="global-aspect-ratio-trigger">{t.settings.aspectRatio}</FieldLabel>
                <TextSelect
                  testId="global-aspect-ratio-selector"
                  triggerId="global-aspect-ratio-trigger"
                  containerClassName="cmp-select settings-select"
                  menuClassName="cmp-select-menu cmp-select-menu-compact"
                  label={t.settings.aspectRatio}
                  value={labelFor(ASPECT_OPTIONS, draft.aspectRatio)}
                  disabled={loading || saving}
                  open={openMenu === 'aspect'}
                  onOpenChange={(open) => setOpenMenu(open ? 'aspect' : null)}
                  options={ASPECT_OPTIONS}
                  selectedId={draft.aspectRatio}
                  onSelect={(value) => updateDraft({ aspectRatio: value as AppAspectRatio })}
                />
              </div>
            </div>
          </section>
          <section className="section generation-settings-section">
            <div className="section-title settings-section-heading">{t.settings.inputGroup}</div>
            <div className="field">
              <FieldLabel htmlFor="provider-input-size-trigger">{t.settings.providerInputSizePreset}</FieldLabel>
              <TextSelect
                testId="provider-input-size-selector"
                triggerId="provider-input-size-trigger"
                containerClassName="cmp-select settings-select"
                menuClassName="cmp-select-menu cmp-select-menu-compact"
                label={t.settings.providerInputSizePreset}
                value={labelFor(PROVIDER_INPUT_SIZE_OPTIONS, draft.providerInputSizePreset)}
                disabled={loading || saving}
                open={openMenu === 'provider-input-size'}
                onOpenChange={(open) => setOpenMenu(open ? 'provider-input-size' : null)}
                options={PROVIDER_INPUT_SIZE_OPTIONS}
                selectedId={draft.providerInputSizePreset}
                onSelect={(value) => updateDraft({ providerInputSizePreset: value as AppProviderInputSizePreset })}
              />
              <HelpText className="field-hint">{t.settings.providerInputSizePresetHint}</HelpText>
            </div>
          </section>
          <section className="section generation-settings-section generation-settings-secondary-section">
            <div className="section-title settings-section-heading">{t.settings.storageGroup}</div>
            <div className="generation-settings-section-intro">
              <HelpText className="field-hint generation-settings-section-hint">
                {t.settings.storageGroupHint}
              </HelpText>
            </div>
            {pathInfo.value ? (
              <div className="settings-path-list generation-settings-path-list">
                <div className="field">
                  <FieldLabel htmlFor="global-settings-copy-log-path">{t.settings.logPath}</FieldLabel>
                  <div className="field-input-affordance settings-path-affordance">
                    <code
                      className="settings-path-block field-input-embedded"
                      data-testid="global-settings-log-path"
                      title={pathInfo.value.logPath}
                    >
                      {pathInfo.value.logPath}
                    </code>
                    <IconButton
                      id="global-settings-copy-log-path"
                      data-testid="global-settings-copy-log-path"
                      className={`field-input-action settings-path-copy${copiedKey === 'logPath' ? ' cp' : ''}`}
                      quiet
                      icon={copiedKey === 'logPath' ? <Icon name="check" /> : <Icon name="copy" />}
                      tooltip={copiedKey === 'logPath' ? t.common.copied : t.common.copy}
                      onClick={() => void copyPath('logPath', pathInfo.value!.logPath)}
                    />
                  </div>
                </div>
                <div className="field">
                  <FieldLabel htmlFor="global-settings-copy-generated-image-path">{t.settings.generatedImagePath}</FieldLabel>
                  <div className="field-input-affordance settings-path-affordance">
                    <code
                      className="settings-path-block field-input-embedded"
                      data-testid="global-settings-generated-image-path"
                      title={pathInfo.value.generatedImagePath}
                    >
                      {pathInfo.value.generatedImagePath}
                    </code>
                    <IconButton
                      id="global-settings-copy-generated-image-path"
                      data-testid="global-settings-copy-generated-image-path"
                      className={`field-input-action settings-path-copy${copiedKey === 'generatedImagePath' ? ' cp' : ''}`}
                      quiet
                      icon={copiedKey === 'generatedImagePath' ? <Icon name="check" /> : <Icon name="copy" />}
                      tooltip={copiedKey === 'generatedImagePath' ? t.common.copied : t.common.copy}
                      onClick={() => void copyPath('generatedImagePath', pathInfo.value!.generatedImagePath)}
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div data-testid="global-settings-path-status">
                <StatusNotice
                  tone={pathInfo.error ? 'warning' : 'info'}
                  message={pathInfo.loading ? t.common.loading : pathInfo.error ?? t.settings.pathInfoUnavailable}
                  detail={pathInfo.error}
                  detailCopyable={Boolean(pathInfo.error)}
                />
              </div>
            )}
          </section>
          <section className="section generation-settings-section generation-settings-meta-section generation-settings-secondary-section">
            <div
              data-testid="global-settings-footer-statement"
              className="generation-settings-meta"
            >
              {t.settings.footerStatement}
            </div>
          </section>
          {error && (
            <section className="section generation-settings-section generation-settings-secondary-section">
              <div data-testid="global-settings-error-notice">
                <StatusNotice tone="negative" message={error} detailCopyable copyable />
              </div>
            </section>
          )}
        </div>
      </div>
      <footer className="det-footer">
        <div className="settings-detail-footer-inner generation-settings-footer">
          <Button data-testid="global-settings-save-button" className="btn-save" variant="accent" disabled={saving} onClick={() => void save()}>
            {saving ? t.settings.saving : t.common.save}
          </Button>
        </div>
      </footer>
    </div>
  );
}
