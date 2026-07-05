import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

function rectsIntersect(a: DOMRect, b: DOMRect): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

interface PopupLayerContextValue {
  readonly root: HTMLElement | null;
  readonly activePopupId: string | null;
  readonly setRoot: (root: HTMLElement | null) => void;
  readonly requestActivePopup: (id: string) => void;
  readonly releaseActivePopup: (id: string) => void;
  readonly setNativeEditorElement: (id: string, element: HTMLElement | null) => void;
  readonly setOccludingOverlayElement: (id: string, element: HTMLElement | null) => void;
  readonly isNativeEditorSuspended: (id: string) => boolean;
}

const PopupLayerContext = createContext<PopupLayerContextValue | null>(null);

/**
 * 为 panel 内 anchored popup 提供唯一坐标根。
 */
export function PopupLayerProvider({ children }: { readonly children: ReactNode }) {
  const [root, setRootState] = useState<HTMLElement | null>(null);
  const [activePopupId, setActivePopupId] = useState<string | null>(null);
  const [occlusionRevision, setOcclusionRevision] = useState(0);
  const [suspendedEditorIds, setSuspendedEditorIds] = useState<ReadonlySet<string>>(new Set());
  const nativeEditorsRef = useRef(new Map<string, HTMLElement>());
  const occludingOverlaysRef = useRef(new Map<string, HTMLElement>());
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const rafIdRef = useRef<number | null>(null);

  const bumpOcclusionRevision = useCallback(() => {
    setOcclusionRevision((current) => current + 1);
  }, []);

  const recomputeOcclusion = useCallback(() => {
    rafIdRef.current = null;
    const nextSuspended = new Set<string>();
    const editors = nativeEditorsRef.current;
    const overlays = occludingOverlaysRef.current;
    if (editors.size === 0 || overlays.size === 0) {
      setSuspendedEditorIds((current) => (current.size === 0 ? current : new Set()));
      return;
    }

    for (const [editorId, editorElement] of editors) {
      const editorRect = editorElement.getBoundingClientRect();
      if (editorRect.width <= 0 || editorRect.height <= 0) {
        continue;
      }
      for (const overlayElement of overlays.values()) {
        if (overlayElement === editorElement || overlayElement.contains(editorElement) || editorElement.contains(overlayElement)) {
          continue;
        }
        const overlayRect = overlayElement.getBoundingClientRect();
        if (overlayRect.width <= 0 || overlayRect.height <= 0) {
          continue;
        }
        if (rectsIntersect(editorRect, overlayRect)) {
          nextSuspended.add(editorId);
          break;
        }
      }
    }

    setSuspendedEditorIds((current) => {
      if (current.size === nextSuspended.size) {
        let same = true;
        for (const id of current) {
          if (!nextSuspended.has(id)) {
            same = false;
            break;
          }
        }
        if (same) {
          return current;
        }
      }
      return nextSuspended;
    });
  }, []);

  const scheduleOcclusionRecompute = useCallback(() => {
    if (rafIdRef.current !== null) {
      return;
    }
    rafIdRef.current = window.requestAnimationFrame(recomputeOcclusion);
  }, [recomputeOcclusion]);

  const setNativeEditorElement = useCallback((id: string, element: HTMLElement | null) => {
    const current = nativeEditorsRef.current.get(id) ?? null;
    if (current === element) {
      return;
    }
    if (current && resizeObserverRef.current && typeof resizeObserverRef.current.unobserve === 'function') {
      resizeObserverRef.current.unobserve(current);
    }
    if (element) {
      nativeEditorsRef.current.set(id, element);
      if (resizeObserverRef.current && typeof resizeObserverRef.current.observe === 'function') {
        resizeObserverRef.current.observe(element);
      }
    } else {
      nativeEditorsRef.current.delete(id);
    }
    bumpOcclusionRevision();
  }, [bumpOcclusionRevision]);

  const setOccludingOverlayElement = useCallback((id: string, element: HTMLElement | null) => {
    const current = occludingOverlaysRef.current.get(id) ?? null;
    if (current === element) {
      return;
    }
    if (current && resizeObserverRef.current && typeof resizeObserverRef.current.unobserve === 'function') {
      resizeObserverRef.current.unobserve(current);
    }
    if (element) {
      occludingOverlaysRef.current.set(id, element);
      if (resizeObserverRef.current && typeof resizeObserverRef.current.observe === 'function') {
        resizeObserverRef.current.observe(element);
      }
    } else {
      occludingOverlaysRef.current.delete(id);
    }
    bumpOcclusionRevision();
  }, [bumpOcclusionRevision]);

  const setRoot = useCallback((nextRoot: HTMLElement | null) => {
    setRootState((current) => (current === nextRoot ? current : nextRoot));
  }, []);
  const requestActivePopup = useCallback((id: string) => {
    setActivePopupId((current) => (current === id ? current : id));
  }, []);
  const releaseActivePopup = useCallback((id: string) => {
    setActivePopupId((current) => (current === id ? null : current));
  }, []);

  const isNativeEditorSuspended = useCallback((id: string) => suspendedEditorIds.has(id), [suspendedEditorIds]);

  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') {
      return undefined;
    }
    const observer = new ResizeObserver(() => {
      scheduleOcclusionRecompute();
    });
    resizeObserverRef.current = observer;
    for (const element of nativeEditorsRef.current.values()) {
      if (typeof observer.observe === 'function') {
        observer.observe(element);
      }
    }
    for (const element of occludingOverlaysRef.current.values()) {
      if (typeof observer.observe === 'function') {
        observer.observe(element);
      }
    }
    return () => {
      if (typeof observer.disconnect === 'function') {
        observer.disconnect();
      }
      resizeObserverRef.current = null;
    };
  }, [scheduleOcclusionRecompute]);

  useEffect(() => {
    scheduleOcclusionRecompute();
  }, [occlusionRevision, scheduleOcclusionRecompute]);

  useEffect(() => {
    const handleViewportMutation = () => {
      scheduleOcclusionRecompute();
    };
    window.addEventListener('resize', handleViewportMutation);
    document.addEventListener('scroll', handleViewportMutation, true);
    return () => {
      window.removeEventListener('resize', handleViewportMutation);
      document.removeEventListener('scroll', handleViewportMutation, true);
      if (rafIdRef.current !== null) {
        window.cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, [scheduleOcclusionRecompute]);

  const value = useMemo(() => ({
    root,
    activePopupId,
    setRoot,
    requestActivePopup,
    releaseActivePopup,
    setNativeEditorElement,
    setOccludingOverlayElement,
    isNativeEditorSuspended,
  }), [
    activePopupId,
    isNativeEditorSuspended,
    releaseActivePopup,
    requestActivePopup,
    root,
    setNativeEditorElement,
    setOccludingOverlayElement,
    setRoot,
  ]);

  return <PopupLayerContext.Provider value={value}>{children}</PopupLayerContext.Provider>;
}

/**
 * Panel 最后一层浮层根；定位节点和 hit-test 节点不允许使用 transform。
 */
export function PopupLayerRoot() {
  const context = useContext(PopupLayerContext);
  const setRoot = context?.setRoot;

  return <div ref={setRoot} className="ui-popup-layer-root" data-testid="popup-layer-root" />;
}

export function usePopupLayer(): PopupLayerContextValue | null {
  return useContext(PopupLayerContext);
}
