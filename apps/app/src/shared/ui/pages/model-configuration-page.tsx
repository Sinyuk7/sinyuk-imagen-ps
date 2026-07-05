import { useEffect, useMemo, useState } from 'react';
import type {
  ApiFormat,
  ImageOutputMatrix,
  OfficialModelPreset,
  SaveUserModelConfigInput,
  UserModelConfig,
} from '@imagen-ps/application';
import { useAppServices } from '../../ports/app-services-context';
import { ProviderSettingsPageHeader } from '../components/provider-settings-sections';
import { Icon } from '../components/icons';
import { StatusNotice } from '../components/status-notice';
import { TextSelect } from '../components/text-select';
import { useI18n } from '../i18n/i18n-context';
import { Button, Checkbox, FieldLabel, HelpText, TextField } from '../primitives/native-controls';
import { IconButton } from '../primitives/icon-button';

interface ModelConfigurationPageProps {
  readonly onNav: (view: string) => void;
  readonly onSaved?: (result: { readonly apiFormat: ApiFormat; readonly modelId: string }) => void;
  readonly initialEditorState?: {
    readonly apiFormat?: ApiFormat | null;
    readonly modelId?: string | null;
  } | null;
}

interface MatrixCellOption {
  readonly id: string;
  readonly label: string;
}

interface MultiSelectFieldProps {
  readonly title: string;
  readonly values: readonly MatrixCellOption[];
  readonly selected: readonly string[];
  readonly disabled?: boolean;
  readonly emptyMessage: string;
  readonly onToggle: (value: string, checked: boolean) => void;
}

function MultiSelectField({
  title,
  values,
  selected,
  disabled,
  emptyMessage,
  onToggle,
}: MultiSelectFieldProps) {
  if (values.length === 0) {
    return <HelpText className="field-hint">{emptyMessage}</HelpText>;
  }

  return (
    <div className="field">
      <div className="settings-subsection-heading">{title}</div>
      <div className="model-config-multi-list">
        {values.map((value) => (
          <Checkbox
            key={value.id}
            checked={selected.includes(value.id)}
            disabled={disabled}
            className="model-config-checkbox"
            onChecked={(checked) => onToggle(value.id, checked)}
          >
            {value.label}
          </Checkbox>
        ))}
      </div>
    </div>
  );
}

function commandMessage(error: { readonly category: string; readonly message: string }): string {
  return `${error.category}: ${error.message}`;
}

function uniqueStrings(values: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = value.trim();
    if (normalized.length === 0 || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function sourceLabel(config: UserModelConfig, presets: readonly OfficialModelPreset[], t: ReturnType<typeof useI18n>['messages']): string {
  const preset = presets.find((item) => item.apiFormat === config.apiFormat && item.modelId === config.baseModelId);
  return preset ? `${t.settings.modelConfigCatalogSource} · ${preset.displayName}` : t.settings.modelConfigUserSource;
}

function allCellIds(preset: OfficialModelPreset | undefined): readonly string[] {
  return preset?.outputMatrix.flatMap((matrix) => matrix.cells.map((cell) => cell.id)) ?? [];
}

function configCellIds(config: UserModelConfig | null | undefined): readonly string[] {
  return config?.outputMatrix.flatMap((matrix) => matrix.cells.map((cell) => cell.id)) ?? [];
}

function matrixCellOptions(preset: OfficialModelPreset | undefined): readonly MatrixCellOption[] {
  return preset?.outputMatrix.flatMap((matrix) =>
    matrix.cells.map((cell) => ({
      id: cell.id,
      label: `${matrix.operation} · ${cell.imageSize.toUpperCase()} · ${cell.ratio} · ${cell.outputFormat.toUpperCase()}`,
    })),
  ) ?? [];
}

function subsetMatrix(matrix: ImageOutputMatrix, selectedCellIds: ReadonlySet<string>): ImageOutputMatrix {
  const cells = matrix.cells.filter((cell) => selectedCellIds.has(cell.id));
  const imageSizeIds = new Set(cells.map((cell) => cell.imageSize));
  const ratioIds = new Set(cells.map((cell) => cell.ratio));
  const outputFormatIds = new Set(cells.map((cell) => cell.outputFormat));
  return {
    operation: matrix.operation,
    imageSizes: matrix.imageSizes.filter((option) => imageSizeIds.has(option.id)),
    ratios: matrix.ratios.filter((option) => ratioIds.has(option.id)),
    outputFormats: matrix.outputFormats.filter((option) => outputFormatIds.has(option.id)),
    defaultCellId: cells.some((cell) => cell.id === matrix.defaultCellId) ? matrix.defaultCellId : cells[0]?.id ?? matrix.defaultCellId,
    cells,
  };
}

export function ModelConfigurationPage({ onNav, onSaved, initialEditorState = null }: ModelConfigurationPageProps) {
  const services = useAppServices();
  const { messages: t } = useI18n();
  const [configs, setConfigs] = useState<readonly UserModelConfig[]>([]);
  const [presets, setPresets] = useState<readonly OfficialModelPreset[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [apiFormatMenuOpen, setApiFormatMenuOpen] = useState(false);
  const [presetMenuOpen, setPresetMenuOpen] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [apiFormat, setApiFormat] = useState<ApiFormat>('openai-images');
  const [modelId, setModelId] = useState('');
  const [baseModelId, setBaseModelId] = useState('');
  const [requestStrategyId, setRequestStrategyId] = useState('');
  const [selectedCellIds, setSelectedCellIds] = useState<readonly string[]>([]);
  const [editingKey, setEditingKey] = useState<string | null>(null);

  const loadApiFormatData = async (nextApiFormat: ApiFormat) => {
    const presetResult = await services.commands.listOfficialModelConfigPresets(nextApiFormat);
    if (!presetResult.ok) {
      throw new Error(commandMessage(presetResult.error));
    }
    setPresets(presetResult.value);
    return {
      presets: presetResult.value,
    };
  };

  const reloadConfigs = async () => {
    setLoading(true);
    try {
      const result = await services.commands.listUserModelConfigs();
      if (!result.ok) {
        throw new Error(commandMessage(result.error));
      }
      setConfigs(result.value);
      setError(null);
    } catch (nextError) {
      setConfigs([]);
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reloadConfigs();
    void loadApiFormatData(apiFormat).catch((nextError) => {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    });
  }, []);

  useEffect(() => {
    const nextApiFormat = initialEditorState?.apiFormat;
    const nextModelId = initialEditorState?.modelId?.trim();
    if (!nextApiFormat && !nextModelId) {
      return;
    }
    void (async () => {
      try {
        const resolvedApiFormat = nextApiFormat ?? apiFormat;
        setApiFormat(resolvedApiFormat);
        const { presets: nextPresets } = await loadApiFormatData(resolvedApiFormat);
        const configResult = nextModelId
          ? await services.commands.getUserModelConfig(resolvedApiFormat, nextModelId)
          : { ok: true as const, value: null };
        if (!configResult.ok) {
          throw new Error(commandMessage(configResult.error));
        }
        const config = configResult.value;
        const preset = config
          ? nextPresets.find((item) => item.modelId === config.baseModelId)
          : nextPresets.find((item) => item.modelId === nextModelId) ?? nextPresets[0];
        setModelId(nextModelId ?? preset?.modelId ?? '');
        setBaseModelId(preset?.modelId ?? '');
        setRequestStrategyId(preset?.requestStrategyId ?? '');
        setSelectedCellIds(config ? configCellIds(config) : allCellIds(preset));
        setEditingKey(nextModelId ? `${resolvedApiFormat}:${nextModelId}` : null);
        setEditorOpen(true);
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : String(nextError));
      }
    })();
  }, [initialEditorState]);

  const presetOptions = useMemo(
    () => presets.map((preset) => ({
      id: preset.modelId,
      label: `${preset.displayName} · ${preset.modelId}`,
    })),
    [presets],
  );
  const apiFormatOptions = useMemo(
    () => [
      { id: 'openai-images', label: 'OpenAI Images' },
      { id: 'openai-chat-completions', label: 'OpenAI Chat Completions' },
      { id: 'gemini-generate-content', label: 'Gemini GenerateContent' },
    ],
    [],
  );

  const selectedPreset = presets.find((preset) => preset.modelId === baseModelId);
  const cellOptions = useMemo(() => matrixCellOptions(selectedPreset), [selectedPreset]);
  const validationMessage = useMemo(() => {
    if (!apiFormat) {
      return t.settings.modelConfigValidationApiFormat;
    }
    if (modelId.trim().length === 0) {
      return t.settings.modelConfigValidationModelId;
    }
    if (!selectedPreset) {
      return t.settings.modelConfigValidationPreset;
    }
    if (requestStrategyId.trim().length === 0) {
      return t.settings.modelConfigValidationStrategy;
    }
    for (const matrix of selectedPreset.outputMatrix) {
      if (!matrix.cells.some((cell) => selectedCellIds.includes(cell.id))) {
        return t.settings.modelConfigValidationMatrixCells;
      }
    }
    return null;
  }, [apiFormat, modelId, requestStrategyId, selectedCellIds, selectedPreset, t.settings]);

  const applyPreset = (preset: OfficialModelPreset | undefined, nextModelId?: string) => {
    setBaseModelId(preset?.modelId ?? '');
    setRequestStrategyId(preset?.requestStrategyId ?? '');
    setSelectedCellIds(allCellIds(preset));
    if (nextModelId !== undefined) {
      setModelId(nextModelId);
    }
  };

  const openCreateEditor = async () => {
    try {
      setApiFormat('openai-images');
      const { presets: nextPresets } = await loadApiFormatData('openai-images');
      const firstPreset = nextPresets[0];
      applyPreset(firstPreset, firstPreset?.modelId ?? '');
      setEditingKey(null);
      setEditorOpen(true);
      setError(null);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    }
  };

  const openEditEditor = async (config: UserModelConfig) => {
    try {
      setApiFormat(config.apiFormat);
      const { presets: nextPresets } = await loadApiFormatData(config.apiFormat);
      const preset = nextPresets.find((item) => item.modelId === config.baseModelId);
      setModelId(config.modelId);
      setBaseModelId(preset?.modelId ?? config.baseModelId);
      setRequestStrategyId(preset?.requestStrategyId ?? config.requestStrategyId);
      setSelectedCellIds(configCellIds(config));
      setEditingKey(`${config.apiFormat}:${config.modelId}`);
      setEditorOpen(true);
      setError(null);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    }
  };

  const toggleCell = (value: string, checked: boolean) => {
    setSelectedCellIds((current) => checked ? uniqueStrings([...current, value]) : current.filter((item) => item !== value));
  };

  const save = async () => {
    if (validationMessage) {
      setError(validationMessage);
      return;
    }
    if (!selectedPreset) {
      return;
    }
    setSaveBusy(true);
    try {
      const selected = new Set(selectedCellIds);
      const result = await services.commands.saveUserModelConfig({
        apiFormat,
        modelId,
        baseModelId: selectedPreset.modelId,
        requestStrategyId: selectedPreset.requestStrategyId,
        outputMatrix: selectedPreset.outputMatrix.map((matrix) => subsetMatrix(matrix, selected)),
      } satisfies SaveUserModelConfigInput);
      if (!result.ok) {
        throw new Error(commandMessage(result.error));
      }
      setEditorOpen(false);
      setEditingKey(null);
      await reloadConfigs();
      onSaved?.({ apiFormat: result.value.apiFormat, modelId: result.value.modelId });
      setError(null);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setSaveBusy(false);
    }
  };

  return (
    <div className="page page-enter settings-page" onClick={() => {
      setApiFormatMenuOpen(false);
      setPresetMenuOpen(false);
    }}>
      <ProviderSettingsPageHeader
        backButtonTestId="model-configuration-back-button"
        title={t.settings.modelConfiguration}
        onBack={() => onNav('settings')}
        rightSlot={(
          <IconButton
            data-testid="model-configuration-add-button"
            className="hdr-btn"
            quiet
            icon={<Icon name="add" />}
            tooltip={t.settings.createModelConfiguration}
            onClick={() => void openCreateEditor()}
          />
        )}
      />
      <div className="scroll scroll-footer-pad">
        {!editorOpen ? (
          <div className="settings-detail-layout">
            <section className="section generation-settings-section">
              <HelpText className="field-hint">{t.settings.modelConfigurationHint}</HelpText>
              {loading ? <HelpText className="field-hint">{t.common.loading}</HelpText> : null}
              {error ? <StatusNotice tone="warning" message={error} copyText={error} /> : null}
              {!loading && configs.length === 0 ? (
                <StatusNotice
                  tone="info"
                  message={t.settings.modelConfigurationEmpty}
                  detail={t.settings.modelConfigurationSaveHint}
                />
              ) : null}
              <div className="model-config-list">
                {configs.map((config) => (
                  <div
                    key={`${config.apiFormat}:${config.modelId}`}
                    data-testid={`model-config-row-${config.apiFormat}-${config.modelId}`}
                    className="prompt-preset-row model-config-row"
                    role="button"
                    tabIndex={0}
                    onClick={() => void openEditEditor(config)}
                  >
                    <div className="prompt-preset-row-main model-config-row-main">
                      <span className="prompt-preset-name">{config.modelId}</span>
                      <span className="prompt-preset-mode">{sourceLabel(config, presets, t)}</span>
                      <IconButton
                        data-testid={`model-config-edit-${config.apiFormat}-${config.modelId}`}
                        className="settings-icon-button prompt-preset-action"
                        compactSquare
                        quiet
                        icon={<Icon name="pencil" size={16} />}
                        tooltip={t.settings.editModelConfiguration}
                        aria-label={t.settings.editModelConfiguration}
                        onClick={(event) => {
                          event.stopPropagation();
                          void openEditEditor(config);
                        }}
                      />
                    </div>
                    <HelpText className="field-hint">
                      {config.apiFormat} · {config.baseModelId} · {config.requestStrategyId}
                    </HelpText>
                  </div>
                ))}
              </div>
            </section>
          </div>
        ) : (
          <div className="settings-detail-layout">
            <section className="section generation-settings-section">
              <div className="field">
                <FieldLabel htmlFor="model-config-api-format-trigger">{t.settings.modelConfigApiFormat}</FieldLabel>
                <TextSelect
                  testId="model-config-api-format-selector"
                  triggerId="model-config-api-format-trigger"
                  containerClassName="cmp-select settings-select"
                  menuClassName="cmp-select-menu cmp-select-menu-compact"
                  label={t.settings.modelConfigApiFormat}
                  value={apiFormatOptions.find((option) => option.id === apiFormat)?.label ?? apiFormat}
                  disabled={saveBusy}
                  open={apiFormatMenuOpen}
                  onOpenChange={setApiFormatMenuOpen}
                  options={apiFormatOptions}
                  selectedId={apiFormat}
                  onSelect={(value) => {
                    const nextApiFormat = value as ApiFormat;
                    void (async () => {
                      setApiFormat(nextApiFormat);
                      const { presets: nextPresets } = await loadApiFormatData(nextApiFormat);
                      const firstPreset = nextPresets[0];
                      applyPreset(firstPreset, modelId.trim() || firstPreset?.modelId || '');
                    })().catch((nextError) => {
                      setError(nextError instanceof Error ? nextError.message : String(nextError));
                    });
                  }}
                />
              </div>
              <div className="field">
                <FieldLabel htmlFor="model-config-preset-trigger">{t.settings.modelConfigPreset}</FieldLabel>
                <TextSelect
                  testId="model-config-preset-selector"
                  triggerId="model-config-preset-trigger"
                  containerClassName="cmp-select settings-select"
                  menuClassName="cmp-select-menu cmp-select-menu-model"
                  label={t.settings.modelConfigPreset}
                  value={selectedPreset
                    ? `${selectedPreset.displayName} · ${selectedPreset.modelId}`
                    : t.settings.modelConfigValidationPreset}
                  disabled={saveBusy}
                  open={presetMenuOpen}
                  onOpenChange={setPresetMenuOpen}
                  options={presetOptions}
                  selectedId={selectedPreset?.modelId ?? ''}
                  onSelect={(value) => {
                    const preset = presets.find((item) => item.modelId === value);
                    applyPreset(preset);
                    setPresetMenuOpen(false);
                  }}
                />
              </div>
              <div className="field">
                <FieldLabel htmlFor="model-config-model-id">{t.settings.modelConfigModelId}</FieldLabel>
                <TextField
                  data-testid="model-config-model-id"
                  id="model-config-model-id"
                  className="field-input mono ui-field-control"
                  value={modelId}
                  disabled={saveBusy}
                  onValue={setModelId}
                />
              </div>
              <div className="field">
                <FieldLabel htmlFor="model-config-request-strategy">{t.settings.modelConfigRequestStrategy}</FieldLabel>
                <TextField
                  data-testid="model-config-strategy"
                  id="model-config-request-strategy"
                  className="field-input mono ui-field-control"
                  value={requestStrategyId}
                  disabled
                  onValue={() => undefined}
                />
              </div>
            </section>

            <section className="section generation-settings-section">
              <MultiSelectField
                title={t.settings.modelConfigMatrixCells}
                values={cellOptions}
                selected={selectedCellIds}
                disabled={saveBusy}
                emptyMessage={t.settings.modelConfigSelectAtLeastOne}
                onToggle={toggleCell}
              />
            </section>

            <section className="section generation-settings-section generation-settings-secondary-section">
              <HelpText className="field-hint">{t.settings.modelConfigurationSaveHint}</HelpText>
              {editingKey ? (
                <HelpText className="field-hint">{editingKey}</HelpText>
              ) : null}
              {validationMessage ? (
                <StatusNotice tone="warning" message={validationMessage} />
              ) : null}
              {error ? (
                <StatusNotice tone="warning" message={error} copyText={error} />
              ) : null}
            </section>
          </div>
        )}
      </div>
      {editorOpen ? (
        <footer className="det-footer">
          <div className="settings-detail-footer-inner">
            <div className="settings-detail-footer-actions">
              <Button
                data-testid="model-config-cancel-button"
                className="btn-save"
                disabled={saveBusy}
                onClick={() => {
                  setEditorOpen(false);
                  setEditingKey(null);
                  setError(null);
                }}
              >
                {t.common.cancel}
              </Button>
            </div>
            <div className="settings-detail-footer-save-group">
              <Button
                data-testid="model-config-save-button"
                className="btn-save"
                variant="accent"
                disabled={saveBusy}
                onClick={() => void save()}
              >
                {saveBusy ? t.settings.saving : t.common.save}
              </Button>
            </div>
          </div>
        </footer>
      ) : null}
    </div>
  );
}
