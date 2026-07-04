import {
  NoticeView,
  defaultNoticeIcon,
  type NoticeAction,
  type NoticeAnnouncement,
  type NoticeState,
  type NoticeTone,
} from './notice';

export type StatusTone = NoticeTone;
export type StatusAnnouncement = NoticeAnnouncement;

export interface StatusNoticeProps {
  readonly tone: StatusTone;
  readonly message: string;
  readonly detail?: string | null;
  readonly copyText?: string | null;
  readonly announcement?: StatusAnnouncement;
  readonly action?: NoticeAction | null;
  readonly icon?: NoticeState['icon'];
}

function announcementProps(announcement: StatusAnnouncement | undefined): Pick<NoticeState, 'role' | 'ariaLive'> {
  if (announcement === 'polite') {
    return { role: 'status', ariaLive: 'polite' };
  }
  if (announcement === 'assertive') {
    return { role: 'alert', ariaLive: 'assertive' };
  }
  return { role: undefined, ariaLive: undefined };
}

export function StatusNotice({
  tone,
  message,
  detail,
  copyText,
  announcement = 'none',
  action,
  icon,
}: StatusNoticeProps) {
  const noticeAnnouncement = announcementProps(announcement);
  const notice: NoticeState = {
    tone,
    message,
    detail,
    copyText: copyText ?? null,
    action: action ?? null,
    role: noticeAnnouncement.role,
    ariaLive: noticeAnnouncement.ariaLive,
    icon: icon === undefined ? defaultNoticeIcon(tone) : icon,
  };
  return <NoticeView notice={notice} kind="inline" />;
}
