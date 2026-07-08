import { useEffect, useState } from 'react';
import { PopupLayerProvider, PopupLayerRoot, usePopupLayer } from '../../../shared/ui/components/popup-layer';
import { TextSelect } from '../../../shared/ui/components/text-select';
import { UxpTextAreaField } from '../../../shared/ui/components/uxp-form-controls';
import { TextField } from '../../../shared/ui/primitives/native-controls';

const HARNESS_CSS = `
.popup-overlap-harness-root{
  min-height:100vh;
  background:linear-gradient(180deg, #f7f1e3 0%, #efe4cf 100%);
  color:#2e2418;
  padding:24px;
  box-sizing:border-box;
  font-family:"Avenir Next", "Helvetica Neue", sans-serif;
}
.popup-overlap-harness-panel{
  position:relative;
  width:min(440px, 100%);
  min-height:420px;
  margin:0 auto;
  border:1px solid rgba(46,36,24,.12);
  border-radius:18px;
  background:rgba(255,250,240,.86);
  box-shadow:0 24px 60px rgba(110,84,45,.14);
  overflow:hidden;
}
.popup-overlap-harness-scroll{
  height:420px;
  overflow:auto;
}
.popup-overlap-harness-body{
  padding:24px 24px 160px;
}
.popup-overlap-harness-title{
  margin:0 0 10px;
  font-size:22px;
  line-height:28px;
  font-weight:700;
  letter-spacing:.01em;
}
.popup-overlap-harness-copy{
  margin:0 0 18px;
  color:rgba(46,36,24,.72);
  font-size:13px;
  line-height:18px;
}
.popup-overlap-harness-field{
  margin:0 0 18px;
}
.popup-overlap-harness-label{
  display:block;
  margin:0 0 6px;
  font-size:12px;
  line-height:16px;
  font-weight:700;
  text-transform:uppercase;
  letter-spacing:.08em;
  color:rgba(46,36,24,.58);
}
.popup-overlap-harness-spacer{
  height:8px;
}
.popup-overlap-harness-debug{
  margin-top:16px;
  padding:12px 14px;
  border-radius:12px;
  background:rgba(93,66,30,.08);
  font-size:12px;
  line-height:17px;
}
.popup-overlap-harness-debug strong{
  font-weight:700;
}
`;

function ensureHarnessCss(): void {
  if (document.getElementById('imagen-ps-popup-overlap-harness-styles')) {
    return;
  }
  const style = document.createElement('style');
  style.id = 'imagen-ps-popup-overlap-harness-styles';
  style.textContent = HARNESS_CSS;
  document.head.appendChild(style);
}

function SuspendedDebug({
  editorId,
  label,
  testId,
}: {
  readonly editorId: string;
  readonly label: string;
  readonly testId: string;
}) {
  const popupLayer = usePopupLayer();
  const suspended = popupLayer?.isNativeEditorSuspended(editorId) ?? false;
  return (
    <div className="popup-overlap-harness-debug" data-testid={testId}>
      <strong>{label}</strong> {suspended ? 'true' : 'false'}
    </div>
  );
}

export function PopupLayerOverlapHarnessPage() {
  const [open, setOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'x-goog-api-key' | 'bearer' | 'none'>('x-goog-api-key');
  const [billingPath, setBillingPath] = useState('/client/openapi/getCredits');
  const [systemInstruction, setSystemInstruction] = useState(
    'Use a crisp editorial tone. Keep the product framing natural and restrained.',
  );

  useEffect(() => {
    ensureHarnessCss();
  }, []);

  return (
    <div className="popup-overlap-harness-root">
      <PopupLayerProvider>
        <div className="panel popup-overlap-harness-panel" data-testid="popup-layer-overlap-panel">
          <div className="scroll popup-overlap-harness-scroll" data-testid="popup-layer-overlap-scroll">
            <div className="popup-overlap-harness-body">
              <h1 className="popup-overlap-harness-title">Popup Layer Overlap</h1>
              <p className="popup-overlap-harness-copy">
                Open the Auth mode dropdown and verify both the single-line input and textarea below report suspended while the popup overlaps them.
              </p>

              <div className="popup-overlap-harness-field">
                <span className="popup-overlap-harness-label">Auth mode</span>
                <TextSelect
                  label="Auth mode"
                  value={authMode === 'x-goog-api-key' ? 'x-goog-api-key' : authMode === 'bearer' ? 'Bearer' : 'None'}
                  open={open}
                  onOpenChange={setOpen}
                  options={[
                    { id: 'x-goog-api-key', label: 'x-goog-api-key' },
                    { id: 'bearer', label: 'Bearer' },
                    { id: 'none', label: 'None' },
                  ]}
                  selectedId={authMode}
                  onSelect={(id) => {
                    setAuthMode(id as 'x-goog-api-key' | 'bearer' | 'none');
                    setOpen(false);
                  }}
                  testId="provider-auth-mode-selector"
                  triggerId="provider-auth-mode-selector"
                  containerClassName="cmp-select cmp-select-model provider-model-select"
                  menuClassName="cmp-select-menu cmp-select-menu-model"
                />
              </div>

              <div className="popup-overlap-harness-field">
                <span className="popup-overlap-harness-label">Billing path</span>
                <TextField
                  data-testid="provider-billing-path-input"
                  id="provider-billing-path-input"
                  className="field-input mono ui-field-control"
                  value={billingPath}
                  onValue={setBillingPath}
                />
              </div>

              <div className="popup-overlap-harness-field">
                <span className="popup-overlap-harness-label">System instruction</span>
                <UxpTextAreaField
                  data-testid="provider-system-instructions-input"
                  id="provider-system-instructions-input"
                  className="field-textarea-input"
                  value={systemInstruction}
                  onValue={setSystemInstruction}
                />
              </div>

              <SuspendedDebug
                editorId="provider-billing-path-input"
                label="Single-line editor suspended:"
                testId="popup-layer-overlap-debug-input"
              />
              <SuspendedDebug
                editorId="provider-system-instructions-input"
                label="Textarea editor suspended:"
                testId="popup-layer-overlap-debug-textarea"
              />
            </div>
          </div>
          <PopupLayerRoot />
        </div>
      </PopupLayerProvider>
    </div>
  );
}
