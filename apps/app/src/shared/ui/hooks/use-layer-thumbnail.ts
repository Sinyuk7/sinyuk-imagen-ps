import { useCallback, useEffect, useRef, useState } from 'react';
import type { HostPort } from '../../ports/host-port';

interface LayerThumbnailState {
  readonly url: string | undefined;
  readonly loading: boolean;
}

/**
 * 为图层列表中的单个行按需加载缩略图。
 *
 * - 通过 IntersectionObserver 只在行进入可视区域时才请求，避免几百个图层同时触发 imaging。
 * - 组件卸载或图层 id 变化时释放 RuntimeImageUrl，防止 blob/data URL 泄漏。
 * - 请求过程中行被卸载会 abort 并丢弃结果。
 */
export function useLayerThumbnail(
  host: HostPort,
  layerId: number,
): {
  readonly url: string | undefined;
  readonly loading: boolean;
  readonly ref: (element: HTMLElement | null) => void;
} {
  const [state, setState] = useState<LayerThumbnailState>({ url: undefined, loading: false });
  const releaseRef = useRef<(() => void) | undefined>(undefined);
  const abortRef = useRef<AbortController | undefined>(undefined);
  const observerRef = useRef<IntersectionObserver | undefined>(undefined);
  const loadedRef = useRef(false);

  const release = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = undefined;
    releaseRef.current?.();
    releaseRef.current = undefined;
    loadedRef.current = false;
    setState((current) => (current.url || current.loading ? { url: undefined, loading: false } : current));
  }, []);

  const load = useCallback(async () => {
    if (!host.capabilities.canGetLayerThumbnails || loadedRef.current) {
      return;
    }
    release();
    loadedRef.current = true;
    const abort = new AbortController();
    abortRef.current = abort;
    setState({ url: undefined, loading: true });

    try {
      const result = await host.getLayerThumbnail(layerId);
      if (abort.signal.aborted) {
        result?.release();
        return;
      }
      if (result) {
        releaseRef.current = result.release;
        setState({ url: result.url, loading: false });
      } else {
        setState({ url: undefined, loading: false });
      }
    } catch {
      if (!abort.signal.aborted) {
        setState({ url: undefined, loading: false });
      }
    }
  }, [host, layerId, release]);

  const ref = useCallback(
    (element: HTMLElement | null) => {
      observerRef.current?.disconnect();
      observerRef.current = undefined;

      if (!element) {
        release();
        return;
      }

      if (typeof IntersectionObserver === 'undefined') {
        void load();
        return;
      }

      const root = element.closest('.layer-scroll') as HTMLElement | null;
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              void load();
            }
          });
        },
        { root, threshold: 0 },
      );
      observer.observe(element);
      observerRef.current = observer;
    },
    [load, release],
  );

  useEffect(() => {
    return () => {
      observerRef.current?.disconnect();
      observerRef.current = undefined;
      release();
    };
  }, [release]);

  return { url: state.url, loading: state.loading, ref };
}
