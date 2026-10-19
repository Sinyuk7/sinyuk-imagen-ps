import { useEffect, useRef, useState } from 'react';
import { useAppServices } from '../../ports/app-services-context';
import type {
  AppGenerationSettings,
  AppProviderInputSizePreset,
} from '../../ports/app-generation-settings';
import type { GenerationSettingsSaveState } from '../hooks/use-generation-settings';
import { useAppPathInfo } from '../hooks/use-app-path-info';
import { useI18n } from '../i18n/i18n-context';
import { HelpText, Icon, IconButton, List, PageFrame, PageHeader, PageScroll, SettingsFormSection, SettingsListRow, StatusNotice, TextSelect, useToast } from '../ui-system';

interface GlobalGenerationSettingsPageProps {
  readonly settings: AppGenerationSettings;
  readonly loading: boolean;
  readonly error: string | null;
  readonly saveState: GenerationSettingsSaveState;
  readonly onSave: (settings: AppGenerationSettings) => Promise<void>;
  readonly onBack: () => void;
}

type MenuId = 'provider-input-size' | null;

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

export function middleEllipsizePath(value: string, width: number): string {
  const visibleCharacters = Math.max(12, Math.floor(width / 7.2));
  if (value.length <= visibleCharacters) {
    return value;
  }
  const prefixLength = Math.ceil((visibleCharacters - 1) * 0.6);
  const suffixLength = Math.max(1, visibleCharacters - prefixLength - 1);
  return `${value.slice(0, prefixLength)}…${value.slice(-suffixLength)}`;
}

function ResponsivePathValue({ testId, value }: { readonly testId: string; readonly value: string }) {
  const ref = useRef<HTMLElement | null>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === 'undefined') {
      return;
    }
    const observer = new ResizeObserver(([entry]) => {
      setWidth(Math.round(entry.contentRect.width));
    });
    observer.observe(element);
    setWidth(element.clientWidth);
    return () => observer.disconnect();
  }, []);

  return (
    <code ref={ref} className="global-settings-path-value" data-testid={testId} title={value} aria-label={value}>
      {width > 0 ? middleEllipsizePath(value, width) : value}
    </code>
  );
}

export function GlobalGenerationSettingsPage({
  settings,
  loading,
  error,
  saveState,
  onSave,
  onBack,
}: GlobalGenerationSettingsPageProps) {
  const services = useAppServices();
  const { messages: t } = useI18n();
  const { show } = useToast();
  const pathInfo = useAppPathInfo(services);
  const [openMenu, setOpenMenu] = useState<MenuId>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const previousSaveStateRef = useRef(saveState);

  useEffect(() => {
    if (saveState === 'saved' && previousSaveStateRef.current !== 'saved') {
      show(t.settings.saved, 'positive', { key: 'global-generation-settings-saved' });
    }
    previousSaveStateRef.current = saveState;
  }, [saveState, show, t.settings.saved]);

  const updateSettings = (next: Partial<AppGenerationSettings>) => {
    void onSave({ ...settings, ...next });
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
    <PageFrame watch="global-generation-settings"><div className="page page-enter settings-page" onClick={() => setOpenMenu(null)}>
      <PageHeader
        title={t.settings.globalSettings}
        back={(
          <IconButton
            data-testid="global-settings-back-button"
            className="hdr-btn"
            quiet
            icon={<Icon name="chevron-left" />}
            tooltip={t.common.back}
            onClick={onBack}
          />
        )}
      />
      <PageScroll>
        <div className="settings-detail-layout scroll-footer-pad generation-settings-layout">
          <SettingsFormSection title={t.settings.inputGroup}>
            <div className="field">
              <TextSelect
                testId="provider-input-size-selector"
                triggerId="provider-input-size-trigger"
                containerClassName="cmp-select settings-select"
                menuClassName="cmp-select-menu cmp-select-menu-compact"
                label={t.settings.providerInputSizePreset}
                value={labelFor(PROVIDER_INPUT_SIZE_OPTIONS, settings.providerInputSizePreset)}
                disabled={loading}
                open={openMenu === 'provider-input-size'}
                onOpenChange={(open) => setOpenMenu(open ? 'provider-input-size' : null)}
                options={PROVIDER_INPUT_SIZE_OPTIONS}
                selectedId={settings.providerInputSizePreset}
                onSelect={(value) => updateSettings({ providerInputSizePreset: value as AppProviderInputSizePreset })}
              />
              <HelpText
                className="field-hint"
                data-testid="global-settings-provider-input-size-hint"
              >
                {t.settings.providerInputSizePresetHint}
              </HelpText>
            </div>
          </SettingsFormSection>
          <SettingsFormSection title={t.settings.storageGroup}>
            {pathInfo.value ? (
              <List className="global-settings-path-list" aria-label={t.settings.storageGroup}>
                <SettingsListRow
                  testId="global-settings-log-path-row"
                  title={t.settings.logPath}
                  trailingChevron={false}
                  leading={<div className="prov-ico global-settings-path-icon"><Icon name="history" size={14} /></div>}
                  meta={<ResponsivePathValue testId="global-settings-log-path" value={pathInfo.value.logPath} />}
                  end={(
                    <IconButton
                      id="global-settings-copy-log-path"
                      data-testid="global-settings-copy-log-path"
                      className={`global-settings-path-copy${copiedKey === 'logPath' ? ' cp' : ''}`}
                      quiet
                      icon={copiedKey === 'logPath' ? <Icon name="check" /> : <Icon name="copy" />}
                      tooltip={copiedKey === 'logPath' ? t.common.copied : t.common.copy}
                      onClick={() => void copyPath('logPath', pathInfo.value!.logPath)}
                    />
                  )}
                  onOpen={() => void copyPath('logPath', pathInfo.value!.logPath)}
                />
                <SettingsListRow
                  testId="global-settings-generated-image-path-row"
                  title={t.settings.generatedImagePath}
                  trailingChevron={false}
                  leading={<div className="prov-ico global-settings-path-icon"><Icon name="image-size" size={14} /></div>}
                  meta={<ResponsivePathValue testId="global-settings-generated-image-path" value={pathInfo.value.generatedImagePath} />}
                  end={(
                    <IconButton
                      id="global-settings-copy-generated-image-path"
                      data-testid="global-settings-copy-generated-image-path"
                      className={`global-settings-path-copy${copiedKey === 'generatedImagePath' ? ' cp' : ''}`}
                      quiet
                      icon={copiedKey === 'generatedImagePath' ? <Icon name="check" /> : <Icon name="copy" />}
                      tooltip={copiedKey === 'generatedImagePath' ? t.common.copied : t.common.copy}
                      onClick={() => void copyPath('generatedImagePath', pathInfo.value!.generatedImagePath)}
                    />
                  )}
                  onOpen={() => void copyPath('generatedImagePath', pathInfo.value!.generatedImagePath)}
                />
              </List>
            ) : (
              <div className="status-replacement-slot" data-testid="global-settings-path-status">
                <StatusNotice
                  tone={pathInfo.error ? 'warning' : 'info'}
                  message={pathInfo.loading ? t.common.loading : pathInfo.error ?? t.settings.pathInfoUnavailable}
                  detail={pathInfo.error}
                  copyText={pathInfo.error ?? null}
                />
              </div>
            )}
          </SettingsFormSection>
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
              <div className="status-warning-slot" data-testid="global-settings-error-notice">
                <StatusNotice tone="negative" message={error} copyText={error} />
              </div>
            </section>
          )}
        </div>
      </PageScroll>
    </div></PageFrame>
  );
}
