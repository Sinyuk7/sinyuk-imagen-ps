import type { ApiFormat, ProviderProfile } from '@imagen-ps/application';
import type { AppGenerationSettings } from '../../ports/app-generation-settings';
import type { ModelGenerationSettingsController } from '../hooks/use-model-generation-settings';
import { profileToProviderRow } from '../../domain/mappers';
import { Icon } from '../components/icons';
import { SettingsListRow } from '../components/settings-list-row';
import { IconButton } from '../primitives/icon-button';
import { useI18n } from '../i18n/i18n-context';

interface SettingsPageProps {
  readonly onNav: (view: string) => void;
  readonly profiles: readonly ProviderProfile[];
  readonly loading: boolean;
  readonly error: string | null;
  readonly onReload: () => Promise<void>;
  readonly onOpenProfile: (profileId: string) => void;
  readonly generationSettings?: AppGenerationSettings;
  readonly modelGenerationSettings?: ModelGenerationSettingsController;
  readonly onOpenGlobalGeneration?: () => void;
  readonly onOpenPromptSettings?: () => void;
  readonly onOpenModelConfiguration?: () => void;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'P';
}

function apiFormatMetaLabel(apiFormat: ApiFormat): string {
  if (apiFormat === 'openai-images') {
    return 'OpenAI Images';
  }
  if (apiFormat === 'openai-chat-completions') {
    return 'OpenAI Chat';
  }
  return 'Gemini GenerateContent';
}

interface ProviderListRow {
  readonly profileId: string;
  readonly apiFormat: ApiFormat;
  readonly displayName: string;
  readonly enabled: boolean;
  readonly apiFormatLabel: string;
  readonly defaultModel?: string;
}

interface ProviderListItemProps {
  readonly row: ProviderListRow;
  readonly special?: boolean;
  readonly onOpen: () => void;
  readonly labels: {
    readonly ready: string;
    readonly needsSetup: string;
    readonly configured: string;
  };
}

function ProviderListItem({
  row,
  special = false,
  onOpen,
  labels,
}: ProviderListItemProps) {
  const hasDefaultModel = Boolean(row.defaultModel);
  const readinessTone = !hasDefaultModel ? 'warning' : row.enabled ? 'ready' : 'configured';
  const readinessLabel = !hasDefaultModel ? labels.needsSetup : row.enabled ? labels.ready : labels.configured;

  return (
    <SettingsListRow
      testId={`provider-row-${row.profileId}`}
      watch={`${row.profileId}:${row.enabled}:${row.defaultModel ?? ''}`}
      title={row.displayName}
      special={special}
      disabled={!row.enabled}
      leading={(
        <div
          className="prov-ico"
          style={special
            ? { background: 'var(--app-color-background-layer-2)', color: 'var(--app-color-informative)' }
            : { background: 'var(--app-color-background-layer-2)', color: 'var(--app-color-accent-default)' }}
        >
          {special ? <Icon name="magic-wand" size={14} /> : initials(row.displayName)}
        </div>
      )}
      meta={(
        <>
          <span className="prov-model">{row.defaultModel ?? row.apiFormat}</span>
          <span className="prov-meta-sep">·</span>
          <span className="prov-family">{apiFormatMetaLabel(row.apiFormat)}</span>
        </>
      )}
      end={(
        <div className={`prov-readiness ${readinessTone}`} aria-label={readinessLabel}>
          <span className="prov-readiness-dot" aria-hidden="true" />
          <span className="prov-status-text">{readinessLabel}</span>
        </div>
      )}
      onOpen={onOpen}
    />
  );
}

export function SettingsPage({
  onNav,
  profiles,
  loading,
  error,
  onReload,
  onOpenProfile,
  generationSettings,
  modelGenerationSettings,
  onOpenGlobalGeneration,
  onOpenPromptSettings,
  onOpenModelConfiguration,
}: SettingsPageProps) {
  const { messages: t } = useI18n();
  const rows = profiles.map(profileToProviderRow);
  const labels = {
    ready: t.common.ready,
    needsSetup: t.common.needsSetup,
    configured: t.settings.configured,
  };

  return (
    <div className="page page-enter">
      <header className="hdr">
        <IconButton
          data-testid="providers-back-button"
          className="hdr-btn"
          quiet
          icon={<Icon name="chevron-left" />}
          tooltip={t.common.back}
          onClick={() => onNav('main')}
        />
        <div className="hdr-title">{t.settings.configuration}</div>
        <IconButton
          data-testid="providers-refresh-button"
          className="hdr-btn"
          quiet
          icon={<Icon name="refresh" />}
          tooltip={t.common.refresh}
          onClick={() => void onReload()}
        />
        <IconButton
          data-testid="providers-add-button"
          className="hdr-btn"
          quiet
          icon={<Icon name="add" />}
          tooltip={t.common.addProvider}
          placement="bottom"
          onClick={() => onNav('settings-add')}
        />
      </header>
      <div className="scroll">
        <div className="sec-lbl">{t.settings.configured}</div>
        <SettingsListRow
          testId="global-generation-settings-row"
          title={t.settings.globalGeneration}
          special
          leading={(
            <div className="prov-ico" style={{ background: 'var(--app-color-background-layer-2)', color: 'var(--app-color-accent-default)' }}>
              <Icon name="settings" size={14} />
            </div>
          )}
          meta={(
            <span className="prov-summary-mono">
              {modelGenerationSettings?.selection
                ? `${modelGenerationSettings.selection.imageSize.toUpperCase()} · ${modelGenerationSettings.selection.outputFormat.toUpperCase()} · ${modelGenerationSettings.selection.ratio}`
                : generationSettings
                  ? generationSettings.providerInputSizePreset.toUpperCase()
                  : t.settings.loading}
            </span>
          )}
          onOpen={() => onOpenGlobalGeneration?.()}
        />
        <SettingsListRow
          testId="prompt-settings-row"
          title={t.settings.promptSettings}
          special
          leading={(
            <div className="prov-ico" style={{ background: 'var(--app-color-background-layer-2)', color: 'var(--app-color-informative)' }}>
              <Icon name="pencil" size={14} />
            </div>
          )}
          meta={<span className="prov-summary">{t.settings.promptSettingsSummary}</span>}
          onOpen={() => onOpenPromptSettings?.()}
        />
        <SettingsListRow
          testId="model-configuration-row"
          title={t.settings.modelConfiguration}
          special
          leading={(
            <div className="prov-ico" style={{ background: 'var(--app-color-background-layer-2)', color: 'var(--app-color-positive)' }}>
              <Icon name="algorithm" size={14} />
            </div>
          )}
          meta={<span className="prov-summary">{t.settings.modelConfigurationSummary}</span>}
          onOpen={() => onOpenModelConfiguration?.()}
        />
        <div className="sec-lbl">{t.settings.providerProfiles}</div>
        {loading && <div style={{ padding: 16, color: 'var(--app-color-text-muted)', fontSize: 12 }}>{t.settings.loading}</div>}
        {error && <div style={{ padding: 16, color: 'var(--app-color-negative)', fontSize: 12 }}>{error}</div>}
        {!loading && rows.length === 0 && (
          <div style={{ padding: 16, color: 'var(--app-color-text-muted)', fontSize: 12 }}>{t.settings.noProviderProfile}</div>
        )}
        {rows.map((row) => (
          <ProviderListItem
            key={row.profileId}
            row={row}
            labels={labels}
            onOpen={() => onOpenProfile(row.profileId)}
          />
        ))}
      </div>
    </div>
  );
}
