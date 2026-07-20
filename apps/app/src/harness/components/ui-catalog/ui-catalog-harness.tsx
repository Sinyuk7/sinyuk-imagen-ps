import { useState } from 'react';
import {
  Button,
  FieldGroup,
  FooterActions,
  Icon,
  IconButton,
  PageFrame,
  PageHeader,
  PageScroll,
  PageState,
  PopupLayerProvider,
  PopupLayerRoot,
  SegmentedTabs,
  SettingsFormSection,
  SettingsListRow,
  SettingsListSection,
  TextField,
  TextSelect,
  UxpTextAreaField,
} from '../../../shared/ui/ui-system';

/** 双宿主共享的确定性 UI catalog；不创建 host 或 service。 */
export function UiCatalogHarnessPage() {
  const query = typeof window === 'undefined' ? new URLSearchParams() : new URLSearchParams(window.location.search);
  const locale = query.get('locale') === 'zh-CN' ? 'zh-CN' : 'en';
  const theme = query.get('theme') === 'light' || query.get('theme') === 'high-contrast' ? query.get('theme') : 'dark';
  const [tab, setTab] = useState('default');
  const [name, setName] = useState('Long deterministic fixture value');
  const [notes, setNotes] = useState('Stable native editor fixture');
  const [selectOpen, setSelectOpen] = useState(false);
  return <PopupLayerProvider><div className="panel" lang={locale} data-app-theme={theme === 'high-contrast' ? 'dark' : theme} data-testid="ui-catalog-panel" data-visual-ready="true" data-motion="reduced" data-catalog-themes="dark light high-contrast" data-catalog-locales="zh-CN en" data-catalog-panels="300x420 360x600 420x680 520x720">
    <PageFrame watch="ui-catalog"><PageHeader title={locale === 'zh-CN' ? '界面目录' : 'UI Catalog'} right={<Button>{locale === 'zh-CN' ? '保存' : 'Save'}</Button>} />
      <PageScroll><div data-testid="ui-catalog-scroll">
        <SegmentedTabs tabs={[{ id: 'default', label: 'Default' }, { id: 'disabled', label: 'Disabled', disabled: true }, { id: 'long', label: 'Long localized content' }]} selectedId={tab} onSelect={setTab} />
        <div data-visual-id="settings-list"><SettingsListSection title="List states">
          <SettingsListRow title="Default row" leading={<span>UI</span>} onOpen={() => setTab('default')} />
          <SettingsListRow title="Disabled row" leading={<span>UI</span>} disabled onOpen={() => undefined} />
        </SettingsListSection></div>
        <SettingsFormSection title="Form states"><FieldGroup label="Text field" help="Stable catalog fixture"><TextField id="catalog-text" value={name} onValue={setName} /></FieldGroup><FieldGroup label="Native editor" htmlFor="catalog-notes"><UxpTextAreaField id="catalog-notes" value={notes} onValue={setNotes} /></FieldGroup><TextSelect label="Popup state" value="Default" open={selectOpen} onOpenChange={setSelectOpen} options={[{ id: 'default', label: 'Default' }, { id: 'busy', label: 'Busy' }]} selectedId="default" onSelect={() => setSelectOpen(false)} /></SettingsFormSection>
        <div data-visual-id="content-states"><PageState tone="neutral" message={tab === 'default' ? 'Empty state' : 'Selected state'} /><PageState tone="info" message="Success state" /><PageState tone="warning" message="Warning state" /><PageState tone="negative" message="Error state" /></div>
        <div data-visual-id="icon-state"><IconButton icon={<Icon name="settings" />} tooltip="Settings" /></div>
        <nav data-visual-id="host-sensitive-links"><a href="?harness=popup-layer-overlap">Popup overlap</a><a href="?harness=uxp-css-contract">UXP CSS board</a></nav>
        <FooterActions><Button>Secondary</Button><Button variant="primary">Primary</Button></FooterActions>
      </div></PageScroll>
    </PageFrame><PopupLayerRoot />
  </div></PopupLayerProvider>;
}
