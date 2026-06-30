import { useEffect, useRef, useState } from 'react';
import { Icon } from '../../../shared/ui/components/icons';
import {
  activityPulseRecipe,
  iconCrossfadeRecipe,
  popoverPresenceRecipe,
  readMotionDebugSnapshot,
  useMotionController,
  useMotionPresence,
} from '../../../shared/ui/motion';

const HARNESS_CSS = `
.motion-harness-root{
  min-height:100vh;
  background:#101319;
  color:#f2f4f8;
  font-family:Inter, system-ui, sans-serif;
  padding:24px;
}
.motion-harness-panel{
  width:min(560px, 100%);
  margin-top:0;
  margin-right:auto;
  margin-bottom:0;
  margin-left:auto;
  border:1px solid rgba(255,255,255,.16);
  border-radius:8px;
  background:#181c24;
  padding:18px;
}
.motion-harness-title{
  margin-top:0;
  margin-right:0;
  margin-bottom:14px;
  margin-left:0;
  font-size:16px;
  font-weight:650;
}
.motion-harness-row{
  display:flex;
  align-items:center;
  min-height:38px;
  margin-top:0;
  margin-right:0;
  margin-bottom:12px;
  margin-left:0;
}
.motion-harness-button{
  height:30px;
  padding:0 10px;
  border-radius:6px;
  border:1px solid rgba(255,255,255,.18);
  background:#252b36;
  color:#f2f4f8;
  cursor:pointer;
  font-size:12px;
}
.motion-harness-popover{
  width:180px;
  border:1px solid rgba(255,255,255,.18);
  border-radius:6px;
  background:#242a35;
  padding:10px;
  font-size:12px;
}
.motion-harness-dot{
  width:8px;
  height:8px;
  border-radius:50%;
  background:#78e7c0;
  margin-right:8px;
}
.motion-harness-icon-wrap{
  width:28px;
  height:28px;
  display:flex;
  align-items:center;
  justify-content:center;
  color:#78e7c0;
}
.motion-harness-debug{
  font-family:ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size:11px;
  color:rgba(242,244,248,.72);
}
`;

function ensureHarnessCss(): void {
  if (document.getElementById('imagen-ps-motion-harness-styles')) {
    return;
  }
  const style = document.createElement('style');
  style.id = 'imagen-ps-motion-harness-styles';
  style.textContent = HARNESS_CSS;
  document.head.appendChild(style);
}

export function MotionPrototypeHarnessPage() {
  const controller = useMotionController();
  const [open, setOpen] = useState(true);
  const [activeIcon, setActiveIcon] = useState(false);
  const [debug, setDebug] = useState(readMotionDebugSnapshot());
  const pulseRef = useRef<HTMLSpanElement | null>(null);
  const iconRef = useRef<HTMLSpanElement | null>(null);
  const presence = useMotionPresence(open, popoverPresenceRecipe);

  useEffect(() => {
    ensureHarnessCss();
  }, []);

  useEffect(() => {
    const handle = controller.play(activityPulseRecipe(pulseRef.current));
    return () => handle.stop();
  }, [controller]);

  useEffect(() => {
    controller.play(iconCrossfadeRecipe(iconRef.current, { show: activeIcon }));
  }, [activeIcon, controller]);

  useEffect(() => {
    const timer = window.setInterval(() => setDebug(readMotionDebugSnapshot()), 120);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="motion-harness-root">
      <section className="motion-harness-panel">
        <h1 className="motion-harness-title">Motion Prototype</h1>
        <div className="motion-harness-row">
          <button type="button" className="motion-harness-button" onClick={() => setOpen((value) => !value)}>
            Toggle popover
          </button>
        </div>
        {presence.present && (
          <div ref={presence.ref} className="motion-harness-popover" data-motion-state={presence.state}>
            Popover presence
          </div>
        )}
        <div className="motion-harness-row">
          <span ref={pulseRef} className="motion-harness-dot" />
          Async activity pulse
        </div>
        <div className="motion-harness-row">
          <button type="button" className="motion-harness-button" onClick={() => setActiveIcon((value) => !value)}>
            Crossfade icon
          </button>
          <span ref={iconRef} className="motion-harness-icon-wrap">
            <Icon name={activeIcon ? 'check' : 'copy'} size={16} />
          </span>
        </div>
        <div className="motion-harness-debug">
          active={debug.activeTweenCount} scheduler={debug.schedulerState} orphans={debug.orphanCount}
        </div>
      </section>
    </div>
  );
}
