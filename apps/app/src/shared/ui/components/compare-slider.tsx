import { useState, useRef, useCallback } from 'react';
import { Icon } from './icons';
import { useI18n } from '../i18n/i18n-context';

interface CompareSliderProps {
  gradA: string;
  gradB: string;
  onClose: () => void;
  onPlace: () => void;
  onDownload: () => void;
}

export function CompareSlider({ gradA, gradB, onClose, onPlace, onDownload }: CompareSliderProps) {
  const { messages: t } = useI18n();
  const [split, setSplit] = useState(50);
  const ref = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const move = useCallback((clientX: number) => {
    if (!ref.current) return;
    const r = ref.current.getBoundingClientRect();
    setSplit(Math.max(2, Math.min(98, ((clientX - r.left) / r.width) * 100)));
  }, []);

  return (
    <div className="lightbox" onClick={onClose}>
      <div className="lb-inner" onClick={e => e.stopPropagation()}>
        <button className="lb-close" onClick={onClose}>×</button>
        <div
          ref={ref}
          className="compare-wrap"
          style={{ cursor: 'col-resize' }}
          onMouseDown={e => { dragging.current = true; move(e.clientX); }}
          onMouseMove={e => { if (dragging.current) move(e.clientX); }}
          onMouseUp={() => { dragging.current = false; }}
          onMouseLeave={() => { dragging.current = false; }}
        >
          <div className="cmp-layer" style={{ background: gradB }} />
          <div className="cmp-layer" style={{ background: gradA, clipPath: `inset(0 ${100 - split}% 0 0)` }} />
          <div className="cmp-divider" style={{ left: `${split}%` }}>
            <div className="cmp-handle">
              <Icon name="compare-handle" size={16} />
            </div>
          </div>
          <div className="cmp-lbl" style={{ left: 10 }}>{t.main.referenceImage}</div>
          <div className="cmp-lbl" style={{ right: 10 }}>{t.main.generatedImage}</div>
        </div>
        <div className="lb-actions">
          <button className="lb-btn prim" onClick={onPlace}>
            <Icon name="place-ps" />
            {t.main.placePsLong}
          </button>
          <button className="lb-btn sec" onClick={onDownload}>
            <Icon name="download" />
            {t.main.download}
          </button>
        </div>
      </div>
    </div>
  );
}
