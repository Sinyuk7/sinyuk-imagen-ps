import { NoticeView, type NoticeState, type NoticeTone } from './notice';

export type StatusTone = NoticeTone;

export interface StatusNoticeProps {
  readonly tone: StatusTone;
  readonly message: string;
}

export function StatusNotice({ tone, message }: StatusNoticeProps) {
  const notice: NoticeState = { tone, message };
  return <NoticeView notice={notice} kind="inline" />;
}
