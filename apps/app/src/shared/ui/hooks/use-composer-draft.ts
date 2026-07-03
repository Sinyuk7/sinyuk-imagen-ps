import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ComposerOperation } from '../composer-readiness';
import type { ConversationAttachment } from './use-conversation';

function releaseAttachment(attachment: ConversationAttachment): void {
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
  removeAttachment(attachmentId: string): void;
  clearAttachments(): void;
  reset(): void;
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

  const reset = useCallback(() => {
    setInput('');
    setAttachments((current) => {
      releaseAttachments(current);
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
    removeAttachment,
    clearAttachments,
    reset,
  };
}
