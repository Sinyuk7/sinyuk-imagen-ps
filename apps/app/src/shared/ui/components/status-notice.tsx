import {
  NoticeView,
  createNoticeState,
  type NoticeOptions,
  type NoticeTone,
} from './notice';
import type { IconName } from './icons';

export type StatusTone = NoticeTone;
export type StatusAnnouncement = 'none' | 'polite' | 'assertive';

export interface StatusNoticeAction {
  readonly label: string;
  readonly ariaLabel?: string;
  readonly onAction: () => void | Promise<void>;
}

export interface StatusNoticeProps {
  readonly tone: StatusTone;
  readonly message: string;
  readonly description?: string | null;
  readonly detail?: string | null;
  readonly copyText?: string | null;
  readonly announcement?: StatusAnnouncement;
  readonly action?: StatusNoticeAction | null;
  readonly icon?: IconName | null;
}

function announcementProps(announcement: StatusAnnouncement | undefined): Pick<NoticeOptions, 'role' | 'ariaLive'> {
  if (announcement === 'polite') {
    return { role: 'status', ariaLive: 'polite' };
  }
  if (announcement === 'assertive') {
    return { role: 'alert', ariaLive: 'assertive' };
  }
  return { role: null, ariaLive: null };
}

export function StatusNotice({
  tone,
  message,
  description,
  detail,
  copyText,
  announcement = 'none',
  action,
  icon,
}: StatusNoticeProps) {
  const notice = createNoticeState(
    message,
    tone,
    {
      ...announcementProps(announcement),
      description: description ?? null,
      detail: detail ?? null,
      copyText: copyText ?? null,
      action: action ?? null,
      icon,
    },
    null,
  );
  return <NoticeView notice={notice} kind="inline" />;
}
