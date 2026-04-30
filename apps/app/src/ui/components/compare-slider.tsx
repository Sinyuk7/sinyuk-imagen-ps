import { useState, useRef, useCallback } from 'react';
import { SI } from './icons';

interface CompareSliderProps {
  gradA: string;
  gradB: string;
  onClose: () => void;
  onPlace: () => void;
  onDownload: () => void;
}

export function CompareSlider({ gradA, gradB, onClose, onPlace, onDownload }: CompareSliderProps) {
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
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#444" strokeWidth="2">
                <path d="M8 9l-3 3 3 3M16 9l3 3-3 3" />
              </svg>
            </div>
          </div>
          <div className="cmp-lbl" style={{ left: 10 }}>参考</div>
          <div className="cmp-lbl" style={{ right: 10 }}>生成</div>
        </div>
        <div className="lb-actions">
          <button className="lb-btn prim" onClick={onPlace}>
            <SI d={["M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z", "M17 21V13H7v8", "M7 3v5h8"]} />
            置入 Photoshop
          </button>
          <button className="lb-btn sec" onClick={onDownload}>
            <SI d={["M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4", "M7 10l5 5 5-5", "M12 15V3"]} />
            下载
          </button>
        </div>
      </div>
    </div>
  );
}
