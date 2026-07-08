import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { IconSelect } from '../../../shared/ui/components/icon-select';
import { TextSelect } from '../../../shared/ui/components/text-select';
import type { ComposerSelectOption } from '../../../shared/ui/components/composer-select';
import { PopupLayerProvider, PopupLayerRoot } from '../../../shared/ui/components/popup-layer';
import { PANEL_CSS } from '../../../shared/ui/panel-css';
import { ASPECT_OPTIONS, MODEL_OPTIONS, TARGET_OPTIONS } from './composer-select-harness-data';

const HARNESS_CSS = `
.harness-root{
  background:
    radial-gradient(circle at top left, rgba(120,231,192,.12), transparent 34%),
    linear-gradient(180deg, #0a0f15 0%, #060a0f 100%);
  color:var(--tx);
}
.harness-scroll{
  flex:1 1 auto;
  min-width:0;
  min-height:0;
}
.harness-page{
  min-height:100vh;
  padding:24px;
}
.harness-shell{
  width:100%;
  max-width:1100px;
  margin:0 auto;
  display:flex;
  flex-direction:column;
}
.harness-shell > .harness-card{
  margin-top:18px;
}
.harness-shell > .harness-card:first-child{
  margin-top:0;
}
.harness-card{
  border:1px solid var(--bd);
  border-radius:8px;
  background:rgba(21,26,34,.88);
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
}
.harness-card-body > *{
  margin-top:14px;
}
.harness-card-body > *:first-child{
  margin-top:0;
}
.harness-card-body[data-overflow-visible="true"]{
  overflow:visible;
}
.harness-controls{
  display:flex;
  flex-wrap:wrap;
  margin-top:0;
  margin-right:-14px;
  margin-bottom:-10px;
  margin-left:0;
}
.harness-field{
  display:flex;
  flex-direction:column;
  flex:1 1 180px;
  min-width:180px;
  margin-top:0;
  margin-right:14px;
  margin-bottom:10px;
  margin-left:0;
}
.harness-label{
  font-family:var(--fM);
  font-size:10px;
  letter-spacing:.04em;
  color:var(--txd);
  text-transform:uppercase;
  margin-top:0;
  margin-right:0;
  margin-bottom:6px;
  margin-left:0;
}
.harness-range-row{
  display:flex;
  align-items:center;
}
.harness-range-row > .harness-range{
  margin-top:0;
  margin-right:12px;
  margin-bottom:0;
  margin-left:0;
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
  margin-top:0;
  margin-right:-8px;
  margin-bottom:-8px;
  margin-left:0;
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
  margin-top:0;
  margin-right:8px;
  margin-bottom:8px;
  margin-left:0;
}
.harness-toggle[data-active="true"]{
  border-color:var(--pr);
  color:var(--pr);
  background:var(--prs);
}
.harness-command-row{
  display:flex;
  flex-wrap:wrap;
  margin-top:0;
  margin-right:-8px;
  margin-bottom:-8px;
  margin-left:0;
}
.harness-command{
  min-height:30px;
  padding:6px 10px;
  border:1px solid var(--bd);
  border-radius:6px;
  background:var(--s1);
  color:var(--tx);
  font-family:var(--fM);
  font-size:11px;
  cursor:pointer;
  margin-top:0;
  margin-right:8px;
  margin-bottom:8px;
  margin-left:0;
}
.harness-command:hover{
  border-color:var(--pr);
  color:var(--pr);
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
  border-radius:8px;
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
  border-radius:8px;
  border:1px solid rgba(255,255,255,.08);
  background:rgba(13,17,23,.92);
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
  border-radius:8px;
  padding:12px;
}
.harness-edge-anchor{
  position:absolute;
  display:flex;
  min-width:110px;
  width:var(--harness-edge-width);
  max-width:calc(100% - 24px);
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
.harness-page-grid{
  display:flex;
  flex-direction:column;
  min-width:0;
}
.harness-page-grid > *{
  margin-top:18px;
}
.harness-page-grid > *:first-child{
  margin-top:0;
}
.harness-diagnostics-header{
  flex:0 0 auto;
  padding:10px 14px;
  border-bottom:1px solid rgba(255,255,255,.1);
  background:rgba(14,20,27,.96);
}
.harness-diagnostics-header-title{
  margin-top:0;
  margin-right:0;
  margin-bottom:6px;
  margin-left:0;
  font-family:var(--fD);
  font-size:12px;
  line-height:16px;
  font-weight:600;
  color:var(--tx);
}
.harness-diagnostics-revision{
  margin-top:-4px;
  margin-right:0;
  margin-bottom:6px;
  margin-left:0;
  font-family:var(--fM);
  font-size:10px;
  line-height:14px;
  color:var(--txd);
}
.harness-diagnostics-list{
  display:flex;
  flex-wrap:wrap;
  margin-top:0;
  margin-right:-10px;
  margin-bottom:-6px;
  margin-left:0;
}
.harness-diagnostic-row{
  display:flex;
  align-items:flex-start;
  min-width:220px;
  max-width:100%;
  margin-top:0;
  margin-right:10px;
  margin-bottom:6px;
  margin-left:0;
  font-family:var(--fM);
  font-size:10px;
  line-height:14px;
}
.harness-diagnostic-key{
  flex:0 0 auto;
  width:76px;
  color:var(--txd);
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap;
}
.harness-diagnostic-value{
  flex:1 1 auto;
  min-width:0;
  color:var(--tx);
  overflow-wrap:anywhere;
}
.harness-diagnostic-row[data-status="bad"] .harness-diagnostic-value{
  color:#ff9e9e;
}
.harness-diagnostic-row[data-status="warn"] .harness-diagnostic-value{
  color:#ffd37e;
}
.harness-diagnostic-row[data-status="ok"] .harness-diagnostic-value{
  color:#8ee7c1;
}
.harness-log{
  display:flex;
  flex-direction:column;
  min-height:30px;
  max-height:56px;
  overflow:auto;
  padding:8px;
  border:1px solid rgba(255,255,255,.08);
  border-radius:6px;
  background:rgba(0,0,0,.18);
  font-family:var(--fM);
  font-size:10px;
  line-height:14px;
  margin-top:8px;
}
.harness-log-line{
  color:var(--txm);
  margin-bottom:4px;
}
.harness-log-line:last-child{
  margin-bottom:0;
}
.harness-composer-stage{
  width:100%;
  min-height:310px;
  display:flex;
  align-items:flex-end;
  padding:12px;
  border:1px dashed rgba(255,255,255,.1);
  border-radius:8px;
  background:
    linear-gradient(90deg, rgba(255,255,255,.04) 1px, transparent 1px),
    linear-gradient(180deg, rgba(255,255,255,.04) 1px, transparent 1px),
    rgba(8,11,15,.88);
  background-size:24px 24px;
}
.harness-composer-panel{
  height:auto;
  min-height:250px;
}
.harness-faux-composer{
  width:100%;
  min-height:230px;
  display:flex;
  flex-direction:column;
  justify-content:flex-end;
  padding:12px;
  border:1px solid var(--app-color-border-default);
  border-radius:8px;
  background:var(--app-color-background-base);
  overflow:hidden;
}
.harness-faux-prompt{
  flex:1 1 auto;
  min-height:0;
  padding:12px 4px;
  font-family:var(--app-font-family-base);
  font-size:18px;
  line-height:23px;
  color:var(--app-color-text-secondary);
  user-select:text;
  -webkit-user-select:text;
}
.harness-faux-toolbar{
  display:flex;
  align-items:center;
  min-width:0;
}
.harness-faux-toolbar-left{
  flex:1 1 auto;
  min-width:0;
  margin-right:8px;
}
.harness-faux-toolbar-right{
  flex:0 0 auto;
}
.harness-hit-stage{
  width:100%;
  min-height:300px;
  position:relative;
  border:1px dashed rgba(255,255,255,.1);
  border-radius:8px;
  overflow:hidden;
  background:
    linear-gradient(135deg, rgba(255,255,255,.08) 0 25%, transparent 25% 50%, rgba(255,255,255,.08) 50% 75%, transparent 75%),
    rgba(9,12,16,.92);
  background-size:28px 28px;
}
.harness-hit-backdrop{
  position:absolute;
  top:72px;
  right:12px;
  left:12px;
  height:170px;
  padding:12px;
  border:1px solid rgba(255,255,255,.08);
  border-radius:8px;
  color:rgba(255,255,255,.52);
  font-family:var(--app-font-family-base);
  font-size:18px;
  line-height:24px;
  user-select:text;
  -webkit-user-select:text;
  background:rgba(255,255,255,.02);
  resize:none;
  outline:none;
  z-index:1;
}
.harness-hit-control{
  position:absolute;
  top:18px;
  left:18px;
  width:280px;
  max-width:calc(100% - 36px);
  z-index:2;
}
.harness-stress-grid{
  display:flex;
  flex-wrap:wrap;
  margin-top:0;
  margin-right:-10px;
  margin-bottom:-10px;
  margin-left:0;
}
.harness-stress-cell{
  min-width:0;
  padding:10px;
  border:1px solid rgba(255,255,255,.08);
  border-radius:8px;
  background:rgba(255,255,255,.025);
  margin-top:0;
  margin-right:10px;
  margin-bottom:10px;
  margin-left:0;
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
  .harness-stress-cell{ width:100% !important; }
}
`;

interface HarnessSelectState {
  readonly modelId: string;
  readonly targetId: string;
  readonly aspectId: string;
}

type HarnessMenuId = 'model' | 'target' | 'aspect' | null;
type MainComposerMenuId = 'main-model' | 'main-size' | null;

const HARNESS_REVISION = 'composer-select-uxp-r9-text-overlay';

interface DiagnosticRow {
  readonly key: string;
  readonly value: string;
  readonly status?: 'ok' | 'warn' | 'bad';
}

const DEFAULT_STATE: HarnessSelectState = {
  modelId: MODEL_OPTIONS[0]?.id ?? '',
  targetId: TARGET_OPTIONS[0]?.id ?? 'layer',
  aspectId: ASPECT_OPTIONS[0]?.id ?? 'auto',
};

function ensureHarnessStyles(): void {
  const styleId = 'imagen-ps-composer-select-harness-styles';
  if (typeof document === 'undefined') {
    return;
  }
  const existing = document.getElementById(styleId);
  const style = existing?.tagName.toLowerCase() === 'style' ? existing : document.createElement('style');
  if (!existing) {
    style.id = styleId;
    document.head.appendChild(style);
  }
  style.textContent = `${PANEL_CSS}\n${HARNESS_CSS}`;
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

function HarnessCommand({
  label,
  onClick,
}: {
  readonly label: string;
  readonly onClick: () => void;
}) {
  return (
    <button type="button" className="harness-command" onClick={onClick}>
      {label}
    </button>
  );
}

function pushLog(current: readonly string[], line: string): readonly string[] {
  return [`${new Date().toLocaleTimeString()} ${line}`, ...current].slice(0, 12);
}

function describeNode(node: Element | null): string {
  if (!node) return 'none';
  const testId = node.getAttribute('data-testid');
  const value = node.getAttribute('data-value');
  const role = node.getAttribute('role');
  const classes = typeof node.className === 'string' ? node.className.split(/\s+/u).filter(Boolean).slice(0, 2).join('.') : '';
  return [
    node.tagName.toLowerCase(),
    testId ? `[${testId}]` : '',
    value ? `[value=${value}]` : '',
    role ? `[role=${role}]` : '',
    classes ? `.${classes}` : '',
  ].join('');
}

function rectLabel(rect: DOMRect): string {
  return `${Math.round(rect.left)},${Math.round(rect.top)} ${Math.round(rect.width)}x${Math.round(rect.height)}`;
}

function elementFromPointSafe(x: number, y: number): Element | null | 'unsupported' {
  const reader = document.elementFromPoint;
  if (typeof reader !== 'function') {
    return 'unsupported';
  }
  return reader.call(document, x, y);
}

function viewportFallbackSize(): { readonly width: number; readonly height: number } {
  const rootRect = document.querySelector('.panel')?.getBoundingClientRect();
  return {
    width: typeof window.innerWidth === 'number' && Number.isFinite(window.innerWidth)
      ? window.innerWidth
      : rootRect?.right ?? 0,
    height: typeof window.innerHeight === 'number' && Number.isFinite(window.innerHeight)
      ? window.innerHeight
      : rootRect?.bottom ?? 0,
  };
}

function useMenuDiagnostics(): readonly DiagnosticRow[] {
  const [rows, setRows] = useState<readonly DiagnosticRow[]>([]);

  useEffect(() => {
    const update = () => {
      const popovers = Array.from(document.querySelectorAll<HTMLElement>('[data-testid$="-popover"]'));
      if (popovers.length === 0) {
        setRows([{ key: 'menu', value: 'none open', status: 'warn' }]);
        return;
      }

      const next: DiagnosticRow[] = [];
      for (const popover of popovers) {
        const testId = popover.getAttribute('data-testid') ?? 'popover';
        const style = window.getComputedStyle(popover);
        const rect = popover.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + Math.min(rect.height / 2, 18);
        const hit = elementFromPointSafe(centerX, centerY);
        const viewport = viewportFallbackSize();
        const opacity = Number.parseFloat(style.opacity || '1');
        const transform = style.transform === 'none' ? 'none' : style.transform;
        const clipLeft = rect.left < 0;
        const clipRight = rect.right > viewport.width;
        const clipTop = rect.top < 0;
        const clipBottom = rect.bottom > viewport.height;
        const clipped = clipLeft || clipRight || clipTop || clipBottom;
        const hitInside = hit !== 'unsupported' && hit ? popover.contains(hit) || hit === popover : false;

        next.push({
          key: testId.replace('-popover', ''),
          value: `rect ${rectLabel(rect)} | opacity ${style.opacity || '1'} | transform ${transform}`,
          status: opacity < 0.98 ? 'bad' : transform !== 'none' ? 'warn' : 'ok',
        });
        next.push({
          key: 'viewport',
          value: clipped ? `clipped l=${clipLeft} r=${clipRight} t=${clipTop} b=${clipBottom}` : 'inside viewport',
          status: clipped ? 'bad' : 'ok',
        });
        next.push({
          key: 'hit',
          value: hit === 'unsupported' ? 'document.elementFromPoint unsupported in this host' : `${hitInside ? 'inside' : 'outside'} -> ${describeNode(hit)}`,
          status: hit === 'unsupported' ? 'warn' : hitInside ? 'ok' : 'bad',
        });
      }
      setRows(next);
    };

    update();
    const id = window.setInterval(update, 180);
    window.addEventListener('resize', update);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('resize', update);
    };
  }, []);

  return rows;
}

function DiagnosticsHeader({ logs }: { readonly logs: readonly string[] }) {
  const rows = useMenuDiagnostics();
  return (
    <div className="harness-diagnostics-header" data-testid="composer-select-diagnostics-header">
      <p className="harness-diagnostics-header-title">Live Diagnostics</p>
      <p className="harness-diagnostics-revision" data-testid="composer-select-harness-revision">{HARNESS_REVISION}</p>
      <div className="harness-diagnostics-list">
        {rows.map((row, index) => (
          <div key={`${row.key}-${index}`} className="harness-diagnostic-row" data-status={row.status}>
            <span className="harness-diagnostic-key">{row.key}</span>
            <span className="harness-diagnostic-value">{row.value}</span>
          </div>
        ))}
      </div>
      <div className="harness-log" data-testid="composer-select-event-log">
        {logs.length === 0 ? (
          <div className="harness-log-line">No pointer/select events yet.</div>
        ) : logs.slice(0, 3).map((line, index) => (
          <div key={`${line}-${index}`} className="harness-log-line">{line}</div>
        ))}
      </div>
    </div>
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
      style={{ '--harness-edge-width': `${width}px` } as CSSProperties}
    >
      <TextSelect
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

function ComposerReplica({
  modelId,
  sizeId,
  open,
  onOpenChange,
  onModel,
  onSize,
  onBehindPointer,
}: {
  readonly modelId: string;
  readonly sizeId: string;
  readonly open: MainComposerMenuId;
  readonly onOpenChange: (open: MainComposerMenuId) => void;
  readonly onModel: (id: string) => void;
  readonly onSize: (id: string) => void;
  readonly onBehindPointer: (target: string) => void;
}) {
  return (
    <div className="harness-composer-stage">
      <div className="harness-composer-panel">
        <div className="harness-faux-composer">
          <div
            className="harness-faux-prompt"
            onPointerDown={(event) => onBehindPointer(`composer text pointerdown ${describeNode(event.target as Element)}`)}
            onClick={(event) => onBehindPointer(`composer text click ${describeNode(event.target as Element)}`)}
          >
            Describe the image you want. This text intentionally sits behind the opened menu so opacity and click-through bugs are obvious.
          </div>
          <div className="harness-faux-toolbar">
            <div className="harness-faux-toolbar-left">
              <IconSelect
                testId="diagnostic-main-model"
                containerClassName="cmp-select cmp-select-model"
                menuClassName="cmp-select-menu cmp-select-menu-model"
                label="Model"
                value={currentLabel(MODEL_OPTIONS, modelId)}
                icon="algorithm"
                open={open === 'main-model'}
                onOpenChange={(next) => onOpenChange(next ? 'main-model' : null)}
                options={MODEL_OPTIONS}
                selectedId={modelId}
                onSelect={onModel}
              />
            </div>
            <div className="harness-faux-toolbar-right">
              <IconSelect
                testId="diagnostic-main-size"
                containerClassName="cmp-select cmp-select-output-size"
                menuClassName="cmp-select-menu cmp-select-menu-compact"
                label="Output size"
                value={sizeId.toUpperCase()}
                icon="image-size"
                open={open === 'main-size'}
                onOpenChange={(next) => onOpenChange(next ? 'main-size' : null)}
                options={[
                  { id: '1k', label: '1K' },
                  { id: '2k', label: '2K' },
                  { id: '4k', label: '4K' },
                ]}
                selectedId={sizeId}
                onSelect={onSize}
              />
            </div>
          </div>
          </div>
        </div>
      </div>
  );
}

function HitTestLab({
  selectedId,
  open,
  onOpen,
  onSelect,
  onLog,
}: {
  readonly selectedId: string;
  readonly open: boolean;
  readonly onOpen: (open: boolean) => void;
  readonly onSelect: (id: string) => void;
  readonly onLog: (line: string) => void;
}) {
  return (
    <div className="harness-hit-stage">
      <textarea
        className="harness-hit-backdrop"
        defaultValue="Editable textarea behind the menu. If this receives pointer/click while clicking a visible menu item, the popover lost hit-test ownership."
        onPointerDown={(event) => onLog(`behind pointerdown ${describeNode(event.target as Element)}`)}
        onClick={(event) => onLog(`behind click ${describeNode(event.target as Element)}`)}
      />
      <div className="harness-hit-control">
        <TextSelect
          testId="diagnostic-hit-model"
          containerClassName="cmp-select harness-picker-fill"
          menuClassName="cmp-select-menu cmp-select-menu-model"
          label="Hit-test model"
          value={currentLabel(MODEL_OPTIONS, selectedId)}
          open={open}
          onOpenChange={onOpen}
          options={MODEL_OPTIONS}
          selectedId={selectedId}
          onSelect={(id) => {
            onLog(`select ${id}`);
            onSelect(id);
          }}
        />
      </div>
    </div>
  );
}

function StressCell({
  testId,
  label,
  width,
}: {
  readonly testId: string;
  readonly label: string;
  readonly width: number;
}) {
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(MODEL_OPTIONS[MODEL_OPTIONS.length - 1]?.id ?? MODEL_OPTIONS[0]?.id ?? '');

  return (
    <div className="harness-stress-cell" style={{ width }}>
      <TextSelect
        testId={testId}
        containerClassName="cmp-select harness-picker-fill"
        menuClassName="cmp-select-menu cmp-select-menu-model"
        label={label}
        value={currentLabel(MODEL_OPTIONS, selectedId)}
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
  const [mainModelId, setMainModelId] = useState(MODEL_OPTIONS[MODEL_OPTIONS.length - 1]?.id ?? MODEL_OPTIONS[0]?.id ?? '');
  const [mainSizeId, setMainSizeId] = useState('2k');
  const [mainOpen, setMainOpen] = useState<MainComposerMenuId>('main-model');
  const [hitOpen, setHitOpen] = useState(true);
  const [hitSelectedId, setHitSelectedId] = useState(MODEL_OPTIONS[2]?.id ?? MODEL_OPTIONS[0]?.id ?? '');
  const [logs, setLogs] = useState<readonly string[]>([]);
  const stressTimerRef = useRef<number | null>(null);

  const singleValue = useMemo(() => currentLabel(MODEL_OPTIONS, singleSelectedId), [singleSelectedId]);

  useEffect(() => () => {
    if (stressTimerRef.current !== null) {
      window.clearInterval(stressTimerRef.current);
    }
  }, []);

  const log = (line: string) => setLogs((current) => pushLog(current, line));
  const closeAll = () => {
    setSingleOpen(false);
    setTrioOpen(null);
    setOpenMenuOpen(false);
    setMainOpen(null);
    setHitOpen(false);
  };
  const startStress = () => {
    if (stressTimerRef.current !== null) {
      window.clearInterval(stressTimerRef.current);
      stressTimerRef.current = null;
      log('stress stopped');
      return;
    }
    let tick = 0;
    stressTimerRef.current = window.setInterval(() => {
      tick += 1;
      setMainOpen(tick % 2 === 0 ? 'main-model' : 'main-size');
      setHitOpen(tick % 3 !== 0);
      setContainerWidth((current) => current <= 220 ? 520 : current - 40);
    }, 520);
    log('stress started');
  };

  return (
    <PopupLayerProvider>
      <div className="panel harness-root" data-testid="composer-select-harness-panel">
        <DiagnosticsHeader logs={logs} />
        <div className="scroll harness-scroll" data-testid="composer-select-harness-scroll">
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
                <HarnessToggle
                  active={longModelValue}
                  label="Long single value"
                  onClick={() => {
                    setLongModelValue((current) => {
                      const next = !current;
                      setSingleSelectedId(next
                        ? MODEL_OPTIONS[MODEL_OPTIONS.length - 1]?.id ?? singleSelectedId
                        : MODEL_OPTIONS[0]?.id ?? singleSelectedId);
                      return next;
                    });
                  }}
                />
                <HarnessToggle active={singleOpen} label="Single menu open" onClick={() => setSingleOpen((current) => !current)} />
              </div>
              <div className="harness-command-row">
                <HarnessCommand label="Open main model" onClick={() => setMainOpen('main-model')} />
                <HarnessCommand label="Open output size" onClick={() => setMainOpen('main-size')} />
                <HarnessCommand label="Open hit-test menu" onClick={() => setHitOpen(true)} />
                <HarnessCommand label="Close all" onClick={closeAll} />
                <HarnessCommand label="Toggle stress" onClick={startStress} />
                <HarnessCommand label="Clear log" onClick={() => setLogs([])} />
              </div>
              <p className="harness-note">
                Drag the inner frame handle in the bottom-right corner for arbitrary width changes, or use the slider for repeatable widths.
              </p>
            </div>
          </section>

          <div className="harness-page-grid">
            <div>
              <section className="harness-card">
                <div className="harness-card-head">
                  <h2 className="harness-title">Mainpage Composer Replica</h2>
                  <p className="harness-copy">Model + output size over prompt text. This is the closest harness copy of the reported failure surface.</p>
                </div>
                <div className="harness-card-body">
                  <ComposerReplica
                    modelId={mainModelId}
                    sizeId={mainSizeId}
                    open={mainOpen}
                    onOpenChange={setMainOpen}
                    onModel={(id) => {
                      log(`main model select ${id}`);
                      setMainModelId(id);
                    }}
                    onSize={(id) => {
                      log(`output size select ${id}`);
                      setMainSizeId(id);
                    }}
                    onBehindPointer={log}
                  />
                </div>
              </section>

              <section className="harness-card">
                <div className="harness-card-head">
                  <h2 className="harness-title">Hit-Test Trap</h2>
                  <p className="harness-copy">Click visible menu rows. The event log should record select events only, never background pointer/click events.</p>
                </div>
                <div className="harness-card-body">
                  <HitTestLab
                    selectedId={hitSelectedId}
                    open={hitOpen}
                    onOpen={setHitOpen}
                    onSelect={setHitSelectedId}
                    onLog={log}
                  />
                </div>
              </section>
            </div>
          </div>

          <section className="harness-card">
            <div className="harness-card-head">
              <h2 className="harness-title">1. Three In A Row</h2>
              <p className="harness-copy">Model + target + aspect should keep spacing, avoid overlap, and shrink naturally until the minimum width limit is reached.</p>
            </div>
            <div className="harness-card-body">
              <div className="harness-surface">
                <div className="harness-panel">
                  <div className="harness-resizable" style={{ width: containerWidth }}>
                    <div className="harness-panel-inner">
                      <div className="harness-row">
                        <TextSelect
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
                        <IconSelect
                          testId="harness-trio-target"
                          containerClassName="cmp-select harness-picker-col"
                          menuClassName="cmp-select-menu cmp-select-menu-compact"
                          label="Target"
                          value={currentLabel(TARGET_OPTIONS, trio.targetId)}
                          icon={trio.targetId === 'layer' ? 'ps-layers' : 'selection'}
                          open={trioOpen === 'target'}
                          onOpenChange={(open) => setTrioOpen(open ? 'target' : null)}
                          options={TARGET_OPTIONS}
                          selectedId={trio.targetId}
                          onSelect={(targetId) => setTrio((current) => ({ ...current, targetId }))}
                        />
                        <IconSelect
                          testId="harness-trio-aspect"
                          containerClassName="cmp-select harness-picker-col"
                          menuClassName="cmp-select-menu cmp-select-menu-compact"
                          label="Aspect ratio"
                          value={currentLabel(ASPECT_OPTIONS, trio.aspectId)}
                          icon={ASPECT_OPTIONS.find((option) => option.id === trio.aspectId)?.icon ?? 'aspect-ratio'}
                          open={trioOpen === 'aspect'}
                          onOpenChange={(open) => setTrioOpen(open ? 'aspect' : null)}
                          options={ASPECT_OPTIONS}
                          selectedId={trio.aspectId}
                          onSelect={(aspectId) => setTrio((current) => ({ ...current, aspectId }))}
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
                    <div className="harness-panel-inner">
                      <div className="harness-col">
                        <TextSelect
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
                    <div className="harness-panel-inner">
                      <div className="harness-row">
                        <TextSelect
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
                  <div className="harness-panel-inner">
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

          <section className="harness-card">
            <div className="harness-card-head">
              <h2 className="harness-title">5. Width Stress Matrix</h2>
              <p className="harness-copy">Fixed narrow cells expose long-label truncation, menu width limits, and repeated popover stacking.</p>
            </div>
            <div className="harness-card-body">
              <div className="harness-stress-grid">
                <StressCell testId="stress-160" label="Stress 160" width={160} />
                <StressCell testId="stress-220" label="Stress 220" width={220} />
                <StressCell testId="stress-300" label="Stress 300" width={300} />
              </div>
            </div>
          </section>

        </div>
      </div>
        </div>
        <PopupLayerRoot />
      </div>
    </PopupLayerProvider>
  );
}
