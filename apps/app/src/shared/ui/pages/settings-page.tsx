import { useEffect, useRef, type KeyboardEvent } from 'react';
import type { ProviderProfile } from '@imagen-ps/application';
import { profileToProviderRow } from '../../domain/mappers';
import { useAppServices } from '../../ports/app-services-context';
import { Icon } from '../components/icons';
import { ActionButton } from '../primitives/spectrum-controls';
import { useI18n } from '../i18n/i18n-context';

interface SettingsPageProps {
  readonly onNav: (view: string) => void;
  readonly profiles: readonly ProviderProfile[];
  readonly loading: boolean;
  readonly error: string | null;
  readonly onReload: () => Promise<void>;
  readonly onOpenProfile: (profileId: string) => void;
  readonly promptOptimizerProfile?: ProviderProfile | null;
  readonly onOpenPromptOptimizer?: () => void;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'P';
}

interface ProviderListRow {
  readonly profileId: string;
  readonly providerId: string;
  readonly displayName: string;
  readonly enabled: boolean;
  readonly family: string;
  readonly defaultModel?: string;
}

interface ProviderListItemProps {
  readonly row: ProviderListRow;
  readonly special?: boolean;
  readonly onOpen: () => void;
  readonly labels: {
    readonly enabled: string;
    readonly disabled: string;
    readonly ready: string;
    readonly needsSetup: string;
    readonly configured: string;
  };
}

interface HeaderActionDiagnosticTarget {
  readonly name: 'back' | 'refresh' | 'add';
  readonly element: HTMLElement | null;
}

function readNumericRect(element: Element): Record<string, number> {
  const rect = element.getBoundingClientRect();
  return {
    width: Number(rect.width.toFixed(2)),
    height: Number(rect.height.toFixed(2)),
    x: Number(rect.x.toFixed(2)),
    y: Number(rect.y.toFixed(2)),
  };
}

function readComputedSnapshot(element: HTMLElement): Record<string, string> {
  const style = window.getComputedStyle(element);
  return {
    display: style.display,
    width: style.width,
    height: style.height,
    color: style.color,
    backgroundColor: style.backgroundColor,
    position: style.position,
    spectrumBackgroundBase: style.getPropertyValue('--spectrum-background-base-color').trim(),
    spectrumNeutralBackground: style.getPropertyValue('--spectrum-neutral-background-color-default').trim(),
    spectrumAccentBackground: style.getPropertyValue('--spectrum-accent-background-color-default').trim(),
  };
}

function readElementSnapshot(element: HTMLElement | null): Record<string, unknown> | null {
  if (!element) {
    return null;
  }

  const icon = element.querySelector<HTMLElement>('[slot="icon"]');
  return {
    tagName: element.tagName.toLowerCase(),
    constructorName: element.constructor.name,
    isConnected: element.isConnected,
    childElementCount: element.childElementCount,
    shadowRootMode: element.shadowRoot?.mode ?? null,
    shadowChildCount: element.shadowRoot?.childElementCount ?? 0,
    attributes: Array.from(element.attributes).map((attr) => `${attr.name}=${attr.value}`),
    rect: readNumericRect(element),
    clientWidth: element.clientWidth,
    clientHeight: element.clientHeight,
    computed: readComputedSnapshot(element),
    icon: icon
      ? {
          tagName: icon.tagName.toLowerCase(),
          constructorName: icon.constructor.name,
          isConnected: icon.isConnected,
          shadowRootMode: icon.shadowRoot?.mode ?? null,
          shadowChildCount: icon.shadowRoot?.childElementCount ?? 0,
          assignedSlot: icon.assignedSlot?.name ?? null,
          rect: readNumericRect(icon),
          clientWidth: icon.clientWidth,
          clientHeight: icon.clientHeight,
          computed: readComputedSnapshot(icon),
        }
      : null,
  };
}

function readThemeSnapshot(targets: readonly HeaderActionDiagnosticTarget[]): Record<string, unknown> | null {
  const theme = targets.find((target) => target.element)?.element?.closest('sp-theme') as HTMLElement | null;
  if (!theme) {
    return null;
  }
  return {
    tagName: theme.tagName.toLowerCase(),
    constructorName: theme.constructor.name,
    isConnected: theme.isConnected,
    shadowRootMode: theme.shadowRoot?.mode ?? null,
    shadowChildCount: theme.shadowRoot?.childElementCount ?? 0,
    attributes: Array.from(theme.attributes).map((attr) => `${attr.name}=${attr.value}`),
    rect: readNumericRect(theme),
    computed: readComputedSnapshot(theme),
  };
}

function useProvidersHeaderDiagnostics(
  active: boolean,
  targets: readonly HeaderActionDiagnosticTarget[],
): void {
  const services = useAppServices();

  useEffect(() => {
    if (!active || !services.diagnostics) {
      return;
    }

    let disposed = false;
    let frameId: number | undefined;
    let timerId: number | undefined;

    const capture = (phase: string) => {
      if (disposed) {
        return;
      }
      void services.diagnostics?.checkpoint('uxp.ui.settings.providers_header.snapshot', {
        phase,
        definitions: {
          spTheme: customElements.get('sp-theme')?.name ?? null,
          spActionButton: customElements.get('sp-action-button')?.name ?? null,
        },
        theme: readThemeSnapshot(targets),
        actions: targets.map((target) => ({
          name: target.name,
          snapshot: readElementSnapshot(target.element),
        })),
      });
    };

    capture('sync');
    queueMicrotask(() => capture('microtask'));
    frameId = window.requestAnimationFrame(() => capture('raf'));
    timerId = window.setTimeout(() => capture('timeout_50ms'), 50);

    return () => {
      disposed = true;
      if (frameId !== undefined) {
        window.cancelAnimationFrame(frameId);
      }
      if (timerId !== undefined) {
        window.clearTimeout(timerId);
      }
    };
  }, [active, services, targets]);
}

function onRowKeyDown(event: KeyboardEvent<HTMLDivElement>, onOpen: () => void): void {
  if (event.key !== 'Enter' && event.key !== ' ') {
    return;
  }
  event.preventDefault();
  onOpen();
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
    <div
      data-testid={`provider-row-${row.profileId}`}
      className={`prov-row settings-provider-row ${special ? 'is-special' : ''} ${row.enabled ? 'is-enabled' : 'is-disabled'}`}
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => onRowKeyDown(event, onOpen)}
    >
      <div className="prov-leading">
        <div
          className="prov-ico"
          style={special
            ? { background: 'var(--app-color-informative-subtle)', color: 'var(--app-color-informative)' }
            : { background: 'var(--app-color-accent-subtle)', color: 'var(--app-color-accent-default)' }}
        >
          {special ? <Icon name="magic-wand" size={14} /> : initials(row.displayName)}
        </div>
      </div>
      <div className="prov-content">
        <div className="prov-title-row">
          <span className="prov-name">{row.displayName}</span>
          <span className={`badge prov-primary-status ${row.enabled ? 'connected' : 'none'}`}>
            {row.enabled ? labels.enabled : labels.disabled}
          </span>
        </div>
        <div className="prov-meta-row">
          <span className="prov-family">{row.family}</span>
          <span className="prov-meta-sep" aria-hidden="true">•</span>
          <span className="prov-model">{row.defaultModel ?? row.providerId}</span>
        </div>
      </div>
      <div className="prov-end">
        <div className={`prov-readiness ${readinessTone}`} aria-label={readinessLabel}>
          <span className="prov-readiness-dot" aria-hidden="true" />
          <span className="prov-status-text">{readinessLabel}</span>
        </div>
        <div className="prov-trail"><Icon name="chevron-right" /></div>
      </div>
    </div>
  );
}

export function SettingsPage({
  onNav,
  profiles,
  loading,
  error,
  onReload,
  onOpenProfile,
  promptOptimizerProfile,
  onOpenPromptOptimizer,
}: SettingsPageProps) {
  const backButtonRef = useRef<HTMLElement | null>(null);
  const refreshButtonRef = useRef<HTMLElement | null>(null);
  const addButtonRef = useRef<HTMLElement | null>(null);
  const { messages: t } = useI18n();
  const rows = profiles.map(profileToProviderRow);
  const optimizerRow = promptOptimizerProfile ? profileToProviderRow(promptOptimizerProfile) : null;
  const labels = {
    enabled: t.common.enabled,
    disabled: t.common.disabled,
    ready: t.common.ready,
    needsSetup: t.common.needsSetup,
    configured: t.settings.configured,
  };
  const headerTargets: readonly HeaderActionDiagnosticTarget[] = [
    { name: 'back', element: backButtonRef.current },
    { name: 'refresh', element: refreshButtonRef.current },
    { name: 'add', element: addButtonRef.current },
  ];

  useProvidersHeaderDiagnostics(true, headerTargets);

  return (
    <div className="page page-enter">
      <header className="hdr">
        <ActionButton
          ref={backButtonRef}
          data-testid="providers-back-button"
          className="hdr-btn"
          quiet
          onClick={() => onNav('main')}
        >
          <Icon name="chevron-left" slot="icon" />
        </ActionButton>
        <div className="hdr-title">Providers</div>
        <ActionButton
          ref={refreshButtonRef}
          data-testid="providers-refresh-button"
          className="hdr-btn"
          quiet
          label={t.common.refresh}
          onClick={() => void onReload()}
        >
          <Icon name="refresh" slot="icon" />
        </ActionButton>
        <ActionButton
          ref={addButtonRef}
          data-testid="providers-add-button"
          className="hdr-btn"
          quiet
          label={t.common.addProvider}
          placement="bottom"
          onClick={() => onNav('settings-add')}
        >
          <Icon name="add" slot="icon" />
        </ActionButton>
      </header>
      <div className="scroll">
        <div className="sec-lbl">{t.settings.configured}</div>
        {loading && <div style={{ padding: 16, color: 'var(--app-color-text-muted)', fontSize: 12 }}>{t.settings.loading}</div>}
        {error && <div style={{ padding: 16, color: 'var(--app-color-negative)', fontSize: 12 }}>{error}</div>}
        {!loading && rows.length === 0 && !optimizerRow && (
          <div style={{ padding: 16, color: 'var(--app-color-text-muted)', fontSize: 12 }}>{t.settings.noProviderProfile}</div>
        )}
        {optimizerRow && (
          <ProviderListItem
            row={optimizerRow}
            special
            labels={labels}
            onOpen={() => onOpenPromptOptimizer?.()}
          />
        )}
        {rows.map((row) => (
          <ProviderListItem
            key={row.profileId}
            row={row}
            labels={labels}
            onOpen={() => onOpenProfile(row.profileId)}
          />
        ))}
        <div className="footer-info">
          <span style={{ fontFamily: 'var(--app-font-family-mono)', fontSize: 10, color: 'var(--app-color-text-muted)' }}>imagen-ps app</span>
        </div>
      </div>
    </div>
  );
}
