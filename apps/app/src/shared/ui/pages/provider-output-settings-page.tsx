import { useState } from 'react';
import type { ImageAspectRatio, ImageOutputFormat, ImageOutputImageSize } from '@imagen-ps/application';
import type { ModelGenerationSettingsController } from '../hooks/use-model-generation-settings';
import { useI18n } from '../i18n/i18n-context';
import { FieldLabel, Icon, IconButton, PageFrame, PageHeader, PageScroll, SettingsFormSection, TextSelect, useToast } from '../ui-system';

interface ProviderOutputSettingsPageProps {
  readonly modelGenerationSettings: ModelGenerationSettingsController;
  readonly onBack: () => void;
}

type MenuId = 'size' | 'format' | 'aspect' | null;

function labelFor<T extends string>(options: ReadonlyArray<{ readonly id: T; readonly label: string }>, id: T): string {
  return options.find((option) => option.id === id)?.label ?? id;
}

/** Provider 输出参数页，只承载当前模型的输出能力。 */
export function ProviderOutputSettingsPage({ modelGenerationSettings, onBack }: ProviderOutputSettingsPageProps) {
  const { messages: t } = useI18n();
  const { show } = useToast();
  const [openMenu, setOpenMenu] = useState<MenuId>(null);
  const outputSelection = modelGenerationSettings.selection;
  const outputDisabled = modelGenerationSettings.loading || outputSelection === null || !modelGenerationSettings.ready;

  const selectOutputSize = (value: ImageOutputImageSize) => {
    void modelGenerationSettings.selectImageSize(value).then((saved) => {
      if (!saved && modelGenerationSettings.validationMessage) show(modelGenerationSettings.validationMessage, 'warning', { key: `provider-output-size-rejected:${value}` });
    });
  };
  const selectRatio = (value: ImageAspectRatio) => {
    void modelGenerationSettings.selectRatio(value).then((saved) => {
      if (!saved && modelGenerationSettings.validationMessage) show(modelGenerationSettings.validationMessage, 'warning', { key: `provider-output-ratio-rejected:${value}` });
    });
  };
  const selectOutputFormat = (value: ImageOutputFormat) => {
    void modelGenerationSettings.selectOutputFormat(value).then((saved) => {
      if (!saved && modelGenerationSettings.validationMessage) show(modelGenerationSettings.validationMessage, 'warning', { key: `provider-output-format-rejected:${value}` });
    });
  };

  return (
    <PageFrame watch="provider-output-settings"><div className="page page-enter settings-page" onClick={() => setOpenMenu(null)}>
      <PageHeader
        title={t.settings.providerOutput}
        back={(
          <IconButton data-testid="provider-output-back-button" className="hdr-btn" quiet icon={<Icon name="chevron-left" />} tooltip={t.common.back} onClick={onBack} />
        )}
      />
      <PageScroll>
        <div className="settings-detail-layout scroll-footer-pad generation-settings-layout">
          <SettingsFormSection title={t.settings.outputGroup}>
            <div className="generation-settings-grid">
              <div className="field">
                <FieldLabel htmlFor="global-output-size-trigger">{t.settings.outputSize}</FieldLabel>
                <TextSelect testId="global-output-size-selector" triggerId="global-output-size-trigger" containerClassName="cmp-select settings-select" menuClassName="cmp-select-menu cmp-select-menu-compact" label={t.settings.outputSize} value={outputSelection ? labelFor(modelGenerationSettings.imageSizeOptions, outputSelection.imageSize) : t.settings.loading} disabled={outputDisabled} open={openMenu === 'size'} onOpenChange={(open) => setOpenMenu(open ? 'size' : null)} options={modelGenerationSettings.imageSizeOptions} selectedId={outputSelection?.imageSize ?? ''} onSelect={(value) => selectOutputSize(value as ImageOutputImageSize)} />
              </div>
              <div className="field">
                <FieldLabel htmlFor="global-output-format-trigger">{t.settings.outputFormat}</FieldLabel>
                <TextSelect testId="global-output-format-selector" triggerId="global-output-format-trigger" containerClassName="cmp-select settings-select" menuClassName="cmp-select-menu cmp-select-menu-compact" label={t.settings.outputFormat} value={outputSelection ? labelFor(modelGenerationSettings.outputFormatOptions, outputSelection.outputFormat) : t.settings.loading} disabled={outputDisabled} open={openMenu === 'format'} onOpenChange={(open) => setOpenMenu(open ? 'format' : null)} options={modelGenerationSettings.outputFormatOptions} selectedId={outputSelection?.outputFormat ?? ''} onSelect={(value) => selectOutputFormat(value as ImageOutputFormat)} />
              </div>
              {modelGenerationSettings.showRatio ? (
                <div className="field">
                  <FieldLabel htmlFor="global-aspect-ratio-trigger">{t.settings.aspectRatio}</FieldLabel>
                  <TextSelect testId="global-aspect-ratio-selector" triggerId="global-aspect-ratio-trigger" containerClassName="cmp-select settings-select" menuClassName="cmp-select-menu cmp-select-menu-compact" label={t.settings.aspectRatio} value={outputSelection ? labelFor(modelGenerationSettings.ratioOptions, outputSelection.ratio) : t.settings.loading} disabled={outputDisabled} open={openMenu === 'aspect'} onOpenChange={(open) => setOpenMenu(open ? 'aspect' : null)} options={modelGenerationSettings.ratioOptions} selectedId={outputSelection?.ratio ?? ''} onSelect={(value) => selectRatio(value as ImageAspectRatio)} />
                </div>
              ) : null}
            </div>
          </SettingsFormSection>
        </div>
      </PageScroll>
    </div></PageFrame>
  );
}
