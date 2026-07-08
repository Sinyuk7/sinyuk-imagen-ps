import type { ReactNode } from 'react';
import type { ImagePreviewFallbackDensity, ImagePreviewFallbackState } from '../../image/preview-fallback';
import { Icon } from './icons';
import type { AppMessages } from '../i18n/messages';

interface ImageFallbackContentProps {
  readonly density: ImagePreviewFallbackDensity;
  readonly state: ImagePreviewFallbackState;
  readonly title?: string;
  readonly detail?: string;
  readonly actionSlot?: ReactNode;
  readonly className?: string;
}

function ImageFallbackGlyph({ density }: { readonly density: ImagePreviewFallbackDensity }) {
  const size = density === 'thumbnail' ? 18 : density === 'large-empty' ? 34 : 26;
  return (
    <svg
      className="image-fallback-glyph"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="4.5" y="5.5" width="15" height="13" rx="2.5" />
      <path d="M7.5 15.5l3.2-3.4 2.4 2.2 2.8-3.3 2.1 4.5" />
      <circle cx="9" cy="9.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function imageFallbackTitle(
  messages: AppMessages['imageFallback'],
  state: ImagePreviewFallbackState,
): string {
  switch (state) {
    case 'loading':
      return messages.loading;
    case 'empty':
      return messages.empty;
    case 'file-missing':
      return messages.fileMissing;
    case 'resource-unresolvable':
      return messages.resourceUnresolvable;
    case 'preview-unavailable':
      return messages.previewUnavailable;
  }
}

export function ImageFallbackContent({
  density,
  state,
  title,
  detail,
  actionSlot,
  className,
}: ImageFallbackContentProps) {
  const showCopy = density !== 'thumbnail' && (title || detail || actionSlot);
  return (
    <div
      className={className ? `image-fallback ${className}` : 'image-fallback'}
      data-density={density}
      data-state={state}
    >
      <div className="image-fallback-inner">
        <div className="image-fallback-icon" aria-hidden="true">
          {state === 'loading'
            ? <Icon name="spinner" size={density === 'thumbnail' ? 16 : 18} />
            : <ImageFallbackGlyph density={density} />
          }
        </div>
        {showCopy ? (
          <div className="image-fallback-copy">
            {title ? <div className="image-fallback-title">{title}</div> : null}
            {detail ? <div className="image-fallback-detail">{detail}</div> : null}
            {actionSlot ? <div className="image-fallback-action">{actionSlot}</div> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
