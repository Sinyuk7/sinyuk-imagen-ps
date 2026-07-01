import { NoticeView, type NoticeAriaLive, type NoticeRole, type NoticeState, type NoticeTone } from './notice';

export type StatusTone = NoticeTone;

export interface StatusNoticeProps {
  readonly tone: StatusTone;
  readonly message: string;
  readonly dismissible?: boolean;
  readonly copyable?: boolean;
  readonly durationMs?: number | null;
  readonly role?: NoticeRole;
  readonly ariaLive?: NoticeAriaLive;
  readonly icon?: NoticeState['icon'];
}

export function StatusNotice({ tone, message, dismissible, copyable, durationMs, role, ariaLive, icon }: StatusNoticeProps) {
  const notice: NoticeState = { tone, message, dismissible, copyable, durationMs, role, ariaLive, icon };
  return <NoticeView notice={notice} kind="inline" />;
}
