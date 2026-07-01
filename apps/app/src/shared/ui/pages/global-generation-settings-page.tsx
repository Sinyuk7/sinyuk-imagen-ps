import { useEffect, useState } from 'react';
import type {
  AppAspectRatio,
  AppGenerationSettings,
  AppOutputFormat,
  AppOutputSizePreset,
} from '../../ports/app-generation-settings';
import { Button, FieldLabel, HelpText, TextField } from '../primitives/native-controls';
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

type MenuId = 'size' | 'format' | 'aspect' | null;

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

function labelFor<T extends string>(options: ReadonlyArray<{ readonly id: T; readonly label: string }>, id: T): string {
  return options.find((option) => option.id === id)?.label ?? id;
}

function positiveInteger(value: string, fallback: number): number {
  return /^\d+$/.test(value) && Number(value) > 0 ? Number(value) : fallback;
}

export function GlobalGenerationSettingsPage({
  settings,
  loading,
  error,
  onSave,
  onNav,
}: GlobalGenerationSettingsPageProps) {
  const { messages: t } = useI18n();
  const [draft, setDraft] = useState<AppGenerationSettings>(settings);
  const [maxSideText, setMaxSideText] = useState(String(settings.providerInputMaxSide));
  const [saving, setSaving] = useState(false);
  const [openMenu, setOpenMenu] = useState<MenuId>(null);

  const updateDraft = (next: Partial<AppGenerationSettings>) => {
    setDraft((current) => ({ ...current, ...next }));
  };

  useEffect(() => {
    setDraft(settings);
    setMaxSideText(String(settings.providerInputMaxSide));
  }, [settings]);

  const save = async () => {
    setSaving(true);
    try {
      const next = {
        ...draft,
        providerInputMaxSide: positiveInteger(maxSideText, settings.providerInputMaxSide),
      };
      await onSave(next);
      setDraft(next);
      setMaxSideText(String(next.providerInputMaxSide));
    } finally {
      setSaving(false);
    }
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
        <div className="settings-detail-layout scroll-footer-pad">
          <section className="section">
            <div className="section-title">{t.settings.outputGroup}</div>
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
          <section className="section">
            <div className="section-title">{t.settings.inputGroup}</div>
            <div className="field">
              <FieldLabel htmlFor="provider-input-max-side">{t.settings.providerInputMaxSide}</FieldLabel>
              <TextField
                id="provider-input-max-side"
                data-testid="provider-input-max-side-input"
                className="field-input"
                value={maxSideText}
                onValue={setMaxSideText}
              />
              <HelpText className="field-hint">{t.settings.providerInputMaxSideHint}</HelpText>
            </div>
          </section>
          {error && <div style={{ padding: 16, color: 'var(--app-color-negative)', fontSize: 12 }}>{error}</div>}
        </div>
      </div>
      <footer className="det-footer">
        <div className="settings-detail-footer-inner">
          <Button data-testid="global-settings-save-button" className="btn-save" variant="accent" disabled={saving} onClick={() => void save()}>
            {saving ? t.settings.saving : t.common.save}
          </Button>
        </div>
      </footer>
    </div>
  );
}
