import { Icon, type IconName } from '../../../shared/ui/components/icons';

const ALL_ICONS: readonly IconName[] = [
  'add',
  'algorithm',
  'aspect-ratio',
  'arrow-right',
  'capture-selection',
  'check',
  'chevron-down',
  'chevron-left',
  'chevron-right',
  'close',
  'copy',
  'download',
  'error',
  'eye',
  'eye-off',
  'history',
  'info',
  'image-auto-mode',
  'image-check',
  'image-size',
  'magic-wand',
  'message',
  'network',
  'pencil',
  'place-ps',
  'plug',
  'ps-layers',
  'question',
  'refresh',
  'regenerate',
  'selection',
  'send',
  'settings',
  'spinner',
  'star',
  'target',
  'trash',
  'upload',
  'warning',
  'layer-pixel',
  'layer-smart-object',
  'layer-text',
  'layer-group',
] as const;

const SIZES = [16, 18, 20] as const;

const GALLERY_CSS = `
.icon-gallery-root{
  padding:16px;
  font-family:system-ui,-apple-system,sans-serif;
  font-size:11px;
  color:#17202c;
  background:#f4f7fb;
  min-width:0;
  overflow-y:auto;
}
.icon-gallery-title{
  font-size:14px;
  font-weight:600;
  margin:0 0 12px;
}
.icon-gallery-section{
  margin-bottom:20px;
}
.icon-gallery-section-title{
  font-size:12px;
  font-weight:600;
  margin:0 0 8px;
  color:#5a6a7e;
}
.icon-gallery-grid{
  display:flex;
  flex-wrap:wrap;
  margin:0 -2px;
}
.icon-gallery-cell{
  display:flex;
  flex-direction:column;
  align-items:center;
  justify-content:center;
  padding:8px 4px;
  border:1px solid #dde3ec;
  border-radius:6px;
  background:#fff;
  min-height:56px;
  width:120px;
  margin:2px;
}
.icon-gallery-cell-disabled{
  opacity:0.4;
}
.icon-gallery-cell-selected{
  background:#e8f0fe;
  border-color:#58a8ff;
  color:#1a6dd8;
}
.icon-gallery-name{
  font-size:9px;
  color:#8896a8;
  text-align:center;
  line-height:1.1;
  word-break:break-all;
  max-width:100%;
}
.icon-gallery-row{
  display:flex;
  align-items:center;
  margin:0 -2px;
}
.icon-gallery-size-label{
  font-size:9px;
  color:#8896a8;
  min-width:20px;
  text-align:right;
}
.icon-gallery-toolbar{
  display:flex;
  margin:0 -2px 12px;
  flex-wrap:wrap;
}
.icon-gallery-toolbar-cell{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  padding:6px 10px;
  border:1px solid #dde3ec;
  border-radius:6px;
  background:#fff;
  margin:2px;
}
`;

function IconRow({ name }: { readonly name: IconName }) {
  return (
    <div className="icon-gallery-row">
      <span className="icon-gallery-size-label">{name}</span>
      {SIZES.map((size) => (
        <div key={size} className="icon-gallery-cell" data-icon={name} data-size={size}>
          <Icon name={name} size={size} />
          <span className="icon-gallery-name">{size}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * Icon gallery harness — 在浏览器或 UXP 中渲染全部 icon 的 16/18/20px 对比。
 */
export function IconGalleryPage() {
  return (
    <div className="icon-gallery-root">
      <style>{GALLERY_CSS}</style>
      <div className="icon-gallery-title">Icon Gallery — All Sizes</div>

      <div className="icon-gallery-section">
        <div className="icon-gallery-section-title">Toolbar Specimens</div>
        <div className="icon-gallery-toolbar">
          {(['question', 'refresh', 'settings', 'add', 'trash', 'pencil', 'copy', 'download', 'upload', 'close', 'chevron-left', 'chevron-right', 'chevron-down'] as const).map((name) => (
            <div key={name} className="icon-gallery-toolbar-cell">
              <Icon name={name} size={14} />
              <Icon name={name} size={16} />
              <Icon name={name} size={18} />
              <span className="icon-gallery-name">{name}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="icon-gallery-section">
        <div className="icon-gallery-section-title">Default State — 16 / 18 / 20</div>
        <div className="icon-gallery-grid">
          {ALL_ICONS.map((name) => (
            <IconRow key={name} name={name} />
          ))}
        </div>
      </div>

      <div className="icon-gallery-section">
        <div className="icon-gallery-section-title">Disabled State — 18px</div>
        <div className="icon-gallery-grid">
          {ALL_ICONS.map((name) => (
            <div key={name} className="icon-gallery-cell icon-gallery-cell-disabled" data-icon-disabled={name}>
              <Icon name={name} size={18} />
              <span className="icon-gallery-name">{name}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="icon-gallery-section">
        <div className="icon-gallery-section-title">Selected / Active State — 18px</div>
        <div className="icon-gallery-grid">
          {ALL_ICONS.map((name) => (
            <div key={name} className="icon-gallery-cell icon-gallery-cell-selected" data-icon-selected={name}>
              <Icon name={name} size={18} />
              <span className="icon-gallery-name">{name}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
