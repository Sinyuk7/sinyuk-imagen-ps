import type { ProviderSurfaceProjection } from '@imagen-ps/application';
import { useI18n } from '../../i18n/i18n-context';
import { List, PageFrame, PageHeader, PageScroll, SettingsListRow, SettingsListSection } from '../../ui-system';
import type { ProviderSurfaceRouteId } from '../../settings-route';
import { PROVIDER_SURFACE_DEFINITIONS, surfaceForRoute } from './routes';

interface ProviderPickerPageProps {
  readonly surfaces: readonly ProviderSurfaceProjection[];
  readonly onBack: () => void;
  readonly onSelect: (surfaceId: ProviderSurfaceRouteId) => void;
}

/** 固定 Provider 产品选择页。 */
export function ProviderPickerPage({ surfaces, onBack, onSelect }: ProviderPickerPageProps) {
  const { messages: t } = useI18n();
  return (
    <PageFrame watch="provider-picker">
      <div className="settings-page">
        <PageHeader
          title={t.common.addProvider}
          backLabel={t.common.back}
          backTestId="provider-picker-back-button"
          onBack={onBack}
        />
        <PageScroll>
          <SettingsListSection>
            <List aria-label={t.common.addProvider}>
              {PROVIDER_SURFACE_DEFINITIONS.map((definition) => {
                const available = Boolean(surfaceForRoute(surfaces, definition.id));
                return (
                  <SettingsListRow
                    key={definition.id}
                    testId={`provider-picker-${definition.id}`}
                    title={definition.label}
                    leading={<div className="prov-ico">{definition.shortLabel}</div>}
                    disabled={!available}
                    onOpen={() => onSelect(definition.id)}
                  />
                );
              })}
            </List>
          </SettingsListSection>
        </PageScroll>
      </div>
    </PageFrame>
  );
}
