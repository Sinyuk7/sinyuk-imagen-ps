import { useEffect, useMemo, useState } from 'react';
import { ComposerSelect } from '../../../shared/ui/components/composer-select';
import type { ComposerSelectOption } from '../../../shared/ui/components/composer-select';
import { PANEL_CSS } from '../../../shared/ui/panel-css';
import { ASPECT_OPTIONS, MODEL_OPTIONS, TARGET_OPTIONS } from './composer-select-harness-data';

const HARNESS_CSS = `
.harness-root{
  min-height:100%;
  background:
    radial-gradient(circle at top left, rgba(120,231,192,.12), transparent 34%),
    linear-gradient(180deg, #0a0f15 0%, #060a0f 100%);
  color:var(--tx);
}
.harness-page{
  min-height:100vh;
  padding:24px;
}
.harness-shell{
  width:min(1100px, 100%);
  margin:0 auto;
  display:flex;
  flex-direction:column;
  gap:18px;
}
.harness-card{
  border:1px solid var(--bd);
  border-radius:18px;
  background:rgba(21,26,34,.88);
  box-shadow:0 18px 40px rgba(0,0,0,.22);
  overflow:hidden;
}
.harness-card[data-overflow-visible="true"]{
  overflow:visible;
}
.harness-card-head{
  padding:14px 16px 10px;
  border-bottom:1px solid rgba(255,255,255,.06);
}
.harness-title{
  margin:0;
  font-family:var(--fD);
  font-size:14px;
  font-weight:600;
}
.harness-copy{
  margin:6px 0 0;
  font-family:var(--fM);
  font-size:11px;
  line-height:16px;
  color:var(--txd);
}
.harness-card-body{
  padding:16px;
  display:flex;
  flex-direction:column;
  gap:14px;
}
.harness-card-body[data-overflow-visible="true"]{
  overflow:visible;
}
.harness-controls{
  display:grid;
  grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));
  gap:10px 14px;
}
.harness-field{
  display:flex;
  flex-direction:column;
  gap:6px;
}
.harness-label{
  font-family:var(--fM);
  font-size:10px;
  letter-spacing:.04em;
  color:var(--txd);
  text-transform:uppercase;
}
.harness-range-row{
  display:flex;
  align-items:center;
  gap:12px;
}
.harness-range{
  width:100%;
}
.harness-readout{
  min-width:64px;
  text-align:right;
  font-family:var(--fM);
  font-size:11px;
  color:var(--txm);
}
.harness-toggle-row{
  display:flex;
  flex-wrap:wrap;
  gap:8px;
}
.harness-toggle{
  padding:6px 10px;
  border:1px solid var(--bd);
  border-radius:999px;
  background:var(--s1);
  color:var(--txm);
  font-family:var(--fM);
  font-size:11px;
  cursor:pointer;
}
.harness-toggle[data-active="true"]{
  border-color:var(--pr);
  color:var(--pr);
  background:var(--prs);
}
.harness-surface{
  display:flex;
  justify-content:center;
}
.harness-panel{
  width:100%;
  min-height:220px;
  padding:18px;
  border:1px dashed rgba(255,255,255,.12);
  border-radius:16px;
  background:rgba(6,10,15,.78);
  display:flex;
  align-items:flex-start;
  justify-content:center;
  overflow:visible;
}
.harness-panel[data-overflow-visible="true"]{
  overflow:visible;
}
.harness-resizable{
  width:100%;
  max-width:100%;
  resize:horizontal;
  overflow:auto;
  min-width:180px;
  border-radius:14px;
  border:1px solid rgba(255,255,255,.08);
  background:rgba(13,17,23,.92);
  box-shadow:inset 0 0 0 1px rgba(255,255,255,.02);
}
.harness-panel-inner{
  width:100%;
  min-width:0;
  padding:14px;
}
.harness-panel-inner[data-overflow-visible="true"]{
  overflow:visible;
  padding-bottom:220px;
}
.harness-row{
  display:flex;
  align-items:center;
  min-width:0;
}
.harness-row .harness-picker-col{
  margin-top:0;
  margin-right:8px;
  margin-bottom:0;
  margin-left:0;
}
.harness-row .harness-picker-col:last-child{
  margin-right:0;
}
.harness-row-end{
  justify-content:flex-end;
}
.harness-col{
  display:flex;
  flex-direction:column;
}
.harness-col > .harness-note{
  margin-top:8px;
}
.harness-picker-col{
  flex:1 1 0;
  min-width:110px;
}
.harness-picker-fill{
  width:100%;
}
.harness-edge-wrap{
  width:100%;
  min-height:180px;
  position:relative;
  border:1px dashed rgba(255,255,255,.08);
  border-radius:14px;
  padding:12px;
}
.harness-edge-anchor{
  position:absolute;
  display:flex;
  min-width:110px;
  max-width:calc(100% - 24px);
  width:min(var(--harness-edge-width), calc(50% - 18px));
}
.harness-edge-anchor[data-x="left"]{ left:12px; }
.harness-edge-anchor[data-x="right"]{ right:12px; }
.harness-edge-anchor[data-y="top"]{ top:12px; }
.harness-edge-anchor[data-y="bottom"]{ bottom:12px; }
.harness-edge-anchor[data-x="center"]{
  left:50%;
  transform:translateX(-50%);
}
.harness-note{
  margin:0;
  font-family:var(--fM);
  font-size:11px;
  color:var(--txd);
}
.harness-picker-spike{
  width:100%;
  display:flex;
  flex-direction:column;
  min-width:0;
}
.harness-picker-spike-grid{
  display:flex;
  flex-wrap:wrap;
  margin-top:0;
  margin-right:-12px;
  margin-bottom:-12px;
  margin-left:0;
}
.harness-picker-spike-case{
  width:320px;
  max-width:100%;
  min-width:0;
  margin-top:0;
  margin-right:12px;
  margin-bottom:12px;
  margin-left:0;
  padding:12px;
  border:1px solid rgba(255,255,255,.08);
  border-radius:12px;
  background:rgba(255,255,255,.02);
}
.harness-picker-spike-title{
  margin-top:0;
  margin-right:0;
  margin-bottom:8px;
  margin-left:0;
  font-family:var(--app-font-family-base);
  font-size:12px;
  font-weight:600;
  color:var(--app-color-text-primary);
}
.harness-picker-spike-copy{
  margin-top:0;
  margin-right:0;
  margin-bottom:12px;
  margin-left:0;
  font-family:var(--app-font-family-mono);
  font-size:10px;
  line-height:14px;
  color:var(--app-color-text-secondary);
}
.harness-picker-row{
  width:100%;
  display:flex;
  min-width:0;
  overflow:visible;
}
.harness-picker-trigger{
  width:100%;
  min-width:0;
  display:inline-flex;
  --mod-picker-button-background-color:var(--app-color-background-layer-1);
  --mod-picker-button-background-color-hover:var(--app-color-background-layer-1);
  --mod-picker-button-background-color-down:var(--app-color-background-layer-2);
  --mod-picker-button-background-color-key-focus:var(--app-color-background-layer-1);
  --mod-picker-button-border-color:var(--app-color-border-default);
  --mod-picker-button-font-color:var(--app-color-text-secondary);
  --mod-picker-button-font-color-hover:var(--app-color-text-primary);
  --mod-picker-button-font-color-down:var(--app-color-text-primary);
  --mod-picker-button-font-color-key-focus:var(--app-color-text-primary);
  --mod-picker-button-icon-color:var(--app-color-text-secondary);
  --mod-picker-button-icon-color-hover:var(--app-color-text-primary);
  --mod-picker-button-icon-color-down:var(--app-color-text-primary);
  --mod-picker-button-icon-color-key-focus:var(--app-color-text-primary);
  --mod-picker-button-width:auto;
  --mod-picker-button-height:32px;
  --mod-picker-button-padding:10px;
  --mod-picker-button-fill-padding:0px;
  --mod-picker-button-label-padding:10px;
  --mod-picker-button-gap:8px;
  --mod-picker-button-border-radius:12px;
  --mod-picker-button-border-radius-rounded:12px;
}
.harness-picker-trigger .cmp-chip-body{
  display:inline-flex;
  align-items:center;
  min-width:0;
  flex:1 1 auto;
  font-family:var(--app-font-family-mono);
  font-size:10px;
  line-height:14px;
}
.harness-picker-trigger .harness-picker-icon{
  color:inherit;
  flex:0 0 auto;
}
.harness-picker-menu{
  margin-top:6px;
  width:100%;
  max-width:260px;
  position:relative;
  z-index:20;
  background:var(--app-color-background-elevated);
  border:1px solid var(--app-color-border-strong);
  border-radius:8px;
  padding:4px;
}
.harness-picker-menu-item{
  --mod-menu-item-label-color:var(--app-color-text-secondary);
  --mod-menu-item-label-color-hover:var(--app-color-text-primary);
}
@media (max-width: 720px){
  .harness-page{ padding:14px; }
  .harness-card-body{ padding:12px; }
  .harness-panel{ padding:12px; }
}
`;

interface HarnessSelectState {
  readonly modelId: string;
  readonly targetId: string;
  readonly aspectId: string;
}

type HarnessMenuId = 'model' | 'target' | 'aspect' | null;

const DEFAULT_STATE: HarnessSelectState = {
  modelId: MODEL_OPTIONS[0]?.id ?? '',
  targetId: TARGET_OPTIONS[0]?.id ?? 'layer',
  aspectId: ASPECT_OPTIONS[0]?.id ?? 'auto',
};

function ensureHarnessStyles(): void {
  const styleId = 'imagen-ps-composer-select-harness-styles';
  if (typeof document === 'undefined' || document.getElementById(styleId)) {
    return;
  }
  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `${PANEL_CSS}\n${HARNESS_CSS}`;
  document.head.appendChild(style);
}

function currentLabel(options: readonly ComposerSelectOption[], selectedId: string): string {
  return options.find((option) => option.id === selectedId)?.label ?? selectedId;
}

function useHarnessStyleMount(): void {
  useEffect(() => {
    ensureHarnessStyles();
  }, []);
}

function HarnessToggle({
  active,
  label,
  onClick,
}: {
  readonly active: boolean;
  readonly label: string;
  readonly onClick: () => void;
}) {
  return (
    <button type="button" className="harness-toggle" data-active={active} onClick={onClick}>
      {label}
    </button>
  );
}

function EdgeCaseSelect({
  x,
  y,
  width,
}: {
  readonly x: 'left' | 'right' | 'center';
  readonly y: 'top' | 'bottom';
  readonly width: number;
}) {
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(MODEL_OPTIONS[2]?.id ?? MODEL_OPTIONS[0]?.id ?? '');
  const label = currentLabel(MODEL_OPTIONS, selectedId);

  return (
    <div
      className="harness-edge-anchor"
      data-x={x}
      data-y={y}
      style={{ '--harness-edge-width': `${width}px` } as React.CSSProperties}
    >
      <ComposerSelect
        testId={`edge-${x}-${y}`}
        containerClassName="cmp-select harness-picker-fill"
        menuClassName="cmp-select-menu cmp-select-menu-model"
        label={`Edge ${x} ${y}`}
        value={label}
        open={open}
        onOpenChange={setOpen}
        options={MODEL_OPTIONS}
        selectedId={selectedId}
        onSelect={setSelectedId}
      />
    </div>
  );
}

export function ComposerSelectHarnessPage() {
  useHarnessStyleMount();

  const [containerWidth, setContainerWidth] = useState(360);
  const [longModelValue, setLongModelValue] = useState(true);
  const [trio, setTrio] = useState<HarnessSelectState>(DEFAULT_STATE);
  const [singleOpen, setSingleOpen] = useState(false);
  const [singleSelectedId, setSingleSelectedId] = useState(MODEL_OPTIONS[2]?.id ?? MODEL_OPTIONS[0]?.id ?? '');
  const [trioOpen, setTrioOpen] = useState<HarnessMenuId>(null);
  const [openMenuSelectedId, setOpenMenuSelectedId] = useState(MODEL_OPTIONS[1]?.id ?? MODEL_OPTIONS[0]?.id ?? '');
  const [openMenuOpen, setOpenMenuOpen] = useState(false);
  const [edgeWidth, setEdgeWidth] = useState(190);

  const singleValue = useMemo(() => {
    if (longModelValue) {
      return currentLabel(MODEL_OPTIONS, MODEL_OPTIONS[MODEL_OPTIONS.length - 1]?.id ?? singleSelectedId);
    }
    return currentLabel(MODEL_OPTIONS, singleSelectedId);
  }, [longModelValue, singleSelectedId]);

  return (
    <div className="harness-root">
      <div className="harness-page">
        <div className="harness-shell">
          <section className="harness-card">
            <div className="harness-card-head">
              <h1 className="harness-title">ComposerSelect Responsive Harness</h1>
              <p className="harness-copy">
                Focus on three-in-a-row shrink, long value truncation, open menu stability, and edge-aware menu placement.
              </p>
            </div>
            <div className="harness-card-body">
              <div className="harness-controls">
                <label className="harness-field">
                  <span className="harness-label">Container width</span>
                  <span className="harness-range-row">
                    <input
                      className="harness-range"
                      type="range"
                      min="180"
                      max="720"
                      step="1"
                      value={containerWidth}
                      onChange={(event) => setContainerWidth(Number(event.currentTarget.value))}
                    />
                    <span className="harness-readout">{containerWidth}px</span>
                  </span>
                </label>
                <label className="harness-field">
                  <span className="harness-label">Edge width</span>
                  <span className="harness-range-row">
                    <input
                      className="harness-range"
                      type="range"
                      min="140"
                      max="260"
                      step="1"
                      value={edgeWidth}
                      onChange={(event) => setEdgeWidth(Number(event.currentTarget.value))}
                    />
                    <span className="harness-readout">{edgeWidth}px</span>
                  </span>
                </label>
              </div>
              <div className="harness-toggle-row">
                <HarnessToggle active={longModelValue} label="Long single value" onClick={() => setLongModelValue((current) => !current)} />
                <HarnessToggle active={singleOpen} label="Single menu open" onClick={() => setSingleOpen((current) => !current)} />
              </div>
              <p className="harness-note">
                Drag the inner frame handle in the bottom-right corner for arbitrary width changes, or use the slider for repeatable widths.
              </p>
            </div>
          </section>

          <section className="harness-card">
            <div className="harness-card-head">
              <h2 className="harness-title">1. Three In A Row</h2>
              <p className="harness-copy">Model + target + aspect should keep spacing, avoid overlap, and shrink naturally until the minimum width limit is reached.</p>
            </div>
            <div className="harness-card-body">
              <div className="harness-surface">
                <div className="harness-panel">
                  <div className="harness-resizable" style={{ width: containerWidth }}>
                    <div className="panel harness-panel-inner">
                      <div className="harness-row">
                        <ComposerSelect
                          testId="harness-trio-model"
                          containerClassName="cmp-select harness-picker-col"
                          menuClassName="cmp-select-menu cmp-select-menu-model"
                          label="Model"
                          value={currentLabel(MODEL_OPTIONS, trio.modelId)}
                          open={trioOpen === 'model'}
                          onOpenChange={(open) => setTrioOpen(open ? 'model' : null)}
                          options={MODEL_OPTIONS}
                          selectedId={trio.modelId}
                          onSelect={(modelId) => setTrio((current) => ({ ...current, modelId }))}
                        />
                        <ComposerSelect
                          testId="harness-trio-target"
                          containerClassName="cmp-select harness-picker-col"
                          menuClassName="cmp-select-menu cmp-select-menu-compact"
                          label="Target"
                          value={currentLabel(TARGET_OPTIONS, trio.targetId)}
                          open={trioOpen === 'target'}
                          onOpenChange={(open) => setTrioOpen(open ? 'target' : null)}
                          options={TARGET_OPTIONS}
                          selectedId={trio.targetId}
                          onSelect={(targetId) => setTrio((current) => ({ ...current, targetId }))}
                          leadingIcon={trio.targetId === 'layer' ? 'ps-layers' : 'selection'}
                        />
                        <ComposerSelect
                          testId="harness-trio-aspect"
                          containerClassName="cmp-select harness-picker-col"
                          menuClassName="cmp-select-menu cmp-select-menu-compact"
                          label="Aspect ratio"
                          value={currentLabel(ASPECT_OPTIONS, trio.aspectId)}
                          open={trioOpen === 'aspect'}
                          onOpenChange={(open) => setTrioOpen(open ? 'aspect' : null)}
                          options={ASPECT_OPTIONS}
                          selectedId={trio.aspectId}
                          onSelect={(aspectId) => setTrio((current) => ({ ...current, aspectId }))}
                          leadingIcon={trio.aspectId === 'auto' ? 'image-auto-mode' : undefined}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="harness-card">
            <div className="harness-card-head">
              <h2 className="harness-title">2. Single Long Value</h2>
              <p className="harness-copy">Single trigger should keep icon/text/arrow readable, truncate long value correctly, and avoid stretching the parent layout.</p>
            </div>
            <div className="harness-card-body">
              <div className="harness-surface">
                <div className="harness-panel">
                  <div className="harness-resizable" style={{ width: containerWidth }}>
                    <div className="panel harness-panel-inner">
                      <div className="harness-col">
                        <ComposerSelect
                          testId="harness-single-model"
                          containerClassName="cmp-select harness-picker-fill"
                          menuClassName="cmp-select-menu cmp-select-menu-model"
                          label="Model"
                          value={singleValue}
                          open={singleOpen}
                          onOpenChange={setSingleOpen}
                          options={MODEL_OPTIONS}
                          selectedId={singleSelectedId}
                          onSelect={setSingleSelectedId}
                        />
                        <p className="harness-note">
                          Toggle “Long single value” above to switch between short and truncation-heavy content.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="harness-card">
            <div className="harness-card-head">
              <h2 className="harness-title">3. Open Menu</h2>
              <p className="harness-copy">Use the same resizable frame to inspect menu size, scrollability, and whether the open state remains stable under width changes.</p>
            </div>
            <div className="harness-card-body">
              <div className="harness-surface">
                <div className="harness-panel">
                  <div className="harness-resizable" style={{ width: containerWidth }}>
                    <div className="panel harness-panel-inner">
                      <div className="harness-row">
                        <ComposerSelect
                          testId="harness-open-menu"
                          containerClassName="cmp-select harness-picker-fill"
                          menuClassName="cmp-select-menu cmp-select-menu-model"
                          label="Model"
                          value={currentLabel(MODEL_OPTIONS, openMenuSelectedId)}
                          open={openMenuOpen}
                          onOpenChange={setOpenMenuOpen}
                          options={MODEL_OPTIONS}
                          selectedId={openMenuSelectedId}
                          onSelect={setOpenMenuSelectedId}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="harness-card">
            <div className="harness-card-head">
              <h2 className="harness-title">4. Edge Aware Placement</h2>
              <p className="harness-copy">Menus near container edges should choose a safe direction and alignment without clipping or disappearing.</p>
            </div>
            <div className="harness-card-body">
              <div className="harness-surface">
                <div className="harness-panel">
                  <div className="panel harness-panel-inner">
                    <div className="harness-edge-wrap">
                      <EdgeCaseSelect x="left" y="top" width={edgeWidth} />
                      <EdgeCaseSelect x="right" y="top" width={edgeWidth} />
                      <EdgeCaseSelect x="left" y="bottom" width={edgeWidth} />
                      <EdgeCaseSelect x="right" y="bottom" width={edgeWidth} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

        </div>
      </div>
    </div>
  );
}
