import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ComposerOperation } from '../composer-readiness';
import type { ConversationAttachment } from './use-conversation';

function releaseAttachment(attachment: ConversationAttachment): void {
  attachment.previewDispose?.();
  attachment.image.preview.dispose?.();
}

function releaseAttachments(attachments: readonly ConversationAttachment[]): void {
  for (const attachment of attachments) {
    releaseAttachment(attachment);
  }
}

/** 共享 draft 的 operation 只由当前 attachment 集合推导，避免 main/settings 各自分叉。 */
export function composerOperationForAttachments(
  attachments: readonly ConversationAttachment[],
): ComposerOperation {
  return attachments.length > 0 ? 'image-edit' : 'text-to-image';
}

export interface ComposerDraftController {
  readonly input: string;
  readonly attachments: readonly ConversationAttachment[];
  readonly operation: ComposerOperation;
  setInput(next: string): void;
  replaceAttachments(next: readonly ConversationAttachment[]): void;
  addAttachment(attachment: ConversationAttachment): void;
  updateAttachmentPreview(
    attachmentId: string,
    previewGeneration: number,
    preview: { readonly url: string; readonly dispose?: () => void },
  ): void;
  removeAttachment(attachmentId: string): void;
  clearAttachments(): void;
  reset(options?: { readonly releaseAttachments?: boolean }): void;
}

/**
 * AppShell 拥有 composer draft 单一真源。
 *
 * 这里仅承载可跨页面复用的 prompt / attachments / derived operation。
 * menu open、hover/highlight、copy state、selector popup 等 UI 瞬态仍留在页面本地。
 * failed-round restore 与成功发送后的 reset 都必须经过这里，确保 attachment release 只有一个 owner。
 */
export function useComposerDraft(): ComposerDraftController {
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<readonly ConversationAttachment[]>([]);
  const attachmentsRef = useRef<readonly ConversationAttachment[]>(attachments);

  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

  useEffect(() => {
    return () => {
      releaseAttachments(attachmentsRef.current);
      attachmentsRef.current = [];
    };
  }, []);

  const replaceAttachments = useCallback((next: readonly ConversationAttachment[]) => {
    setAttachments((current) => {
      releaseAttachments(current.filter((attachment) => !next.includes(attachment)));
      return next;
    });
  }, []);

  const addAttachment = useCallback((attachment: ConversationAttachment) => {
    setAttachments((current) => [...current, attachment]);
  }, []);

  const updateAttachmentPreview = useCallback((
    attachmentId: string,
    previewGeneration: number,
    preview: { readonly url: string; readonly dispose?: () => void },
  ) => {
    setAttachments((current) => {
      let consumed = false;
      const next = current.map((attachment) => {
        if (attachment.id !== attachmentId || attachment.previewGeneration !== previewGeneration) {
          return attachment;
        }
        consumed = true;
        attachment.previewDispose?.();
        return {
          ...attachment,
          previewUrl: preview.url,
          previewFallback: undefined,
          previewDispose: preview.dispose,
        };
      });
      if (!consumed) {
        preview.dispose?.();
        return current;
      }
      return next;
    });
  }, []);

  const removeAttachment = useCallback((attachmentId: string) => {
    setAttachments((current) => {
      const removed = current.find((attachment) => attachment.id === attachmentId);
      if (removed) {
        releaseAttachment(removed);
      }
      return current.filter((attachment) => attachment.id !== attachmentId);
    });
  }, []);

  const clearAttachments = useCallback(() => {
    setAttachments((current) => {
      releaseAttachments(current);
      return [];
    });
  }, []);

  const reset = useCallback((options?: { readonly releaseAttachments?: boolean }) => {
    const shouldRelease = options?.releaseAttachments !== false;
    setInput('');
    setAttachments((current) => {
      if (shouldRelease) {
        releaseAttachments(current);
      }
      attachmentsRef.current = [];
      return [];
    });
  }, []);

  const operation = useMemo(() => composerOperationForAttachments(attachments), [attachments]);

  return {
    input,
    attachments,
    operation,
    setInput,
    replaceAttachments,
    addAttachment,
    updateAttachmentPreview,
    removeAttachment,
    clearAttachments,
    reset,
  };
}
