import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import {
  activityPulseRecipe,
  attachmentPresenceRecipe,
  buttonStateRecipe,
  contentCrossfadeRecipe,
  fadeRecipe,
  floatingControlPresenceRecipe,
  imageRevealRecipe,
  inlineNoticePresenceRecipe,
  pageCrossfadeRecipe,
  popoverPresenceRecipe,
  surfaceHighlightRecipe,
  toastPresenceRecipe,
  useMotionController,
  useMotionPresence,
  type MotionHandle,
  type MotionRecipe,
} from '../motion';

interface MotionPresenceViewProps {
  readonly visible: boolean;
  readonly kind: 'popover' | 'toast' | 'floating' | 'attachment' | 'inline-notice';
  readonly onExitComplete?: () => void;
  readonly children: (input: { ref: (element: HTMLElement | null) => void; state: string }) => ReactNode;
}

function recipeForKind(kind: MotionPresenceViewProps['kind']): (
  element: HTMLElement | null,
  input: { readonly enter: boolean; readonly onComplete?: () => void },
) => MotionRecipe {
  switch (kind) {
    case 'toast':
      return toastPresenceRecipe;
    case 'floating':
      return floatingControlPresenceRecipe;
    case 'attachment':
      return attachmentPresenceRecipe;
    case 'inline-notice':
      return inlineNoticePresenceRecipe;
    case 'popover':
      return popoverPresenceRecipe;
  }
}

export function MotionPresenceView({ visible, kind, onExitComplete, children }: MotionPresenceViewProps) {
  const presence = useMotionPresence(visible, recipeForKind(kind), { onExitComplete });
  if (!presence.present) {
    return null;
  }
  return <>{children({ ref: presence.ref, state: presence.state })}</>;
}

export function MotionActivityDot({ className }: { readonly className: string }) {
  const controller = useMotionController();
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handle = controller.play(activityPulseRecipe(ref.current));
    return () => handle.stop();
  }, [controller]);

  return <div ref={ref} className={className} />;
}

export function MotionActivityIcon({ children, className }: { readonly children: ReactNode; readonly className?: string }) {
  const controller = useMotionController();
  const ref = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    const handle = controller.play(activityPulseRecipe(ref.current));
    return () => handle.stop();
  }, [controller]);

  return <span ref={ref} className={className}>{children}</span>;
}

export function MotionButtonSurface({ children }: { readonly children: ReactNode }) {
  const controller = useMotionController();
  const ref = useRef<HTMLElement | null>(null);
  const releaseRef = useRef<MotionHandle | null>(null);

  const press = () => {
    releaseRef.current?.stop();
    releaseRef.current = controller.play(buttonStateRecipe(ref.current, { pressed: true }));
  };
  const release = () => {
    releaseRef.current?.stop();
    releaseRef.current = controller.play(buttonStateRecipe(ref.current, { pressed: false }));
  };

  return (
    <span
      ref={ref}
      className="motion-button-surface"
      onPointerDown={press}
      onPointerUp={release}
      onPointerCancel={release}
      onBlur={release}
    >
      {children}
    </span>
  );
}

export function MotionImage({
  src,
  className,
  alt,
  style,
}: {
  readonly src: string;
  readonly className?: string;
  readonly alt: string | undefined;
  readonly style?: CSSProperties;
}) {
  const controller = useMotionController();
  const ref = useRef<HTMLImageElement | null>(null);
  const revealedSrcRef = useRef<string | null>(null);

  return (
    <img
      ref={ref}
      src={src}
      className={className}
      alt={alt}
      style={style}
      onLoad={() => {
        if (revealedSrcRef.current === src) {
          return;
        }
        revealedSrcRef.current = src;
        controller.play(imageRevealRecipe(ref.current));
      }}
    />
  );
}

export function MotionContent({ watch, children }: { readonly watch: string; readonly children: ReactNode }) {
  const controller = useMotionController();
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    controller.play(contentCrossfadeRecipe(ref.current));
  }, [controller, watch]);

  return <div ref={ref} className="motion-content">{children}</div>;
}

export function MotionDimSurface({ dim, className, children }: { readonly dim: boolean; readonly className: string; readonly children: ReactNode }) {
  const controller = useMotionController();
  const ref = useRef<HTMLDivElement | null>(null);
  const previousRef = useRef(dim);

  useEffect(() => {
    const from = previousRef.current ? 0.38 : 1;
    const to = dim ? 0.38 : 1;
    previousRef.current = dim;
    const handle = controller.play(fadeRecipe(ref.current, { from, to, channel: 'state' }));
    return () => handle.stop();
  }, [controller, dim]);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}

export function MotionPageFrame({ watch, children }: { readonly watch: string; readonly children: ReactNode }) {
  const controller = useMotionController();
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handle = controller.play(pageCrossfadeRecipe(ref.current, { enter: true }));
    return () => handle.stop();
  }, [controller, watch]);

  return <div ref={ref} className="motion-page-frame">{children}</div>;
}

export function MotionHighlight({ activeKey }: { readonly activeKey: string | null | undefined }) {
  const controller = useMotionController();
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!activeKey) {
      return undefined;
    }
    setVisible(true);
    const handle = controller.play(surfaceHighlightRecipe(ref.current, {
      onComplete: () => setVisible(false),
    }));
    return () => handle.stop();
  }, [activeKey, controller]);

  return <div ref={ref} className="motion-highlight" data-visible={visible ? 'true' : undefined} aria-hidden="true" />;
}
