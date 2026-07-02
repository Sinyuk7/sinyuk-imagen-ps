import { NoticeView, type NoticeAriaLive, type NoticeRole, type NoticeState, type NoticeTone } from './notice';

export type StatusTone = NoticeTone;

export interface StatusNoticeProps {
  readonly tone: StatusTone;
  readonly message: string;
  readonly detail?: string | null;
  readonly dismissible?: boolean;
  readonly copyable?: boolean;
  readonly detailCopyable?: boolean;
  readonly durationMs?: number | null;
  readonly role?: NoticeRole;
  readonly ariaLive?: NoticeAriaLive;
  readonly icon?: NoticeState['icon'];
}

export function StatusNotice({
  tone,
  message,
  detail,
  dismissible,
  copyable,
  detailCopyable,
  durationMs,
  role,
  ariaLive,
  icon,
}: StatusNoticeProps) {
  const notice: NoticeState = {
    tone,
    message,
    detail,
    dismissible,
    copyable,
    detailCopyable,
    durationMs,
    role,
    ariaLive,
    icon,
  };
  return <NoticeView notice={notice} kind="inline" />;
}
