import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

interface PopupLayerContextValue {
  readonly root: HTMLElement | null;
  readonly activePopupId: string | null;
  readonly setRoot: (root: HTMLElement | null) => void;
  readonly requestActivePopup: (id: string) => void;
  readonly releaseActivePopup: (id: string) => void;
}

const PopupLayerContext = createContext<PopupLayerContextValue | null>(null);

/**
 * 为 panel 内 anchored popup 提供唯一坐标根。
 */
export function PopupLayerProvider({ children }: { readonly children: ReactNode }) {
  const [root, setRootState] = useState<HTMLElement | null>(null);
  const [activePopupId, setActivePopupId] = useState<string | null>(null);
  const setRoot = useCallback((nextRoot: HTMLElement | null) => {
    setRootState((current) => (current === nextRoot ? current : nextRoot));
  }, []);
  const requestActivePopup = useCallback((id: string) => {
    setActivePopupId((current) => (current === id ? current : id));
  }, []);
  const releaseActivePopup = useCallback((id: string) => {
    setActivePopupId((current) => (current === id ? null : current));
  }, []);
  const value = useMemo(() => ({
    root,
    activePopupId,
    setRoot,
    requestActivePopup,
    releaseActivePopup,
  }), [activePopupId, releaseActivePopup, requestActivePopup, root, setRoot]);

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
