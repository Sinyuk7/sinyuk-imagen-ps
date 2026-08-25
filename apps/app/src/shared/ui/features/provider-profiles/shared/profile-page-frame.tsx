import type { ReactNode } from 'react';
import { PageFrame, PageHeader, PageScroll } from '../../../ui-system';

interface ProfilePageFrameProps {
  readonly watch: string;
  readonly title: string;
  readonly backLabel: string;
  readonly onBack: () => void;
  readonly children: ReactNode;
}

/** Provider Profile 页面的纯布局框架。 */
export function ProfilePageFrame({ watch, title, backLabel, onBack, children }: ProfilePageFrameProps) {
  return (
    <PageFrame watch={watch}>
      <div className="page page-enter settings-page">
        <PageHeader
          title={title}
          backLabel={backLabel}
          backTestId="provider-profile-back-button"
          onBack={onBack}
        />
        <PageScroll className="scroll scroll-footer-pad">
          <div className="settings-detail-layout">{children}</div>
        </PageScroll>
      </div>
    </PageFrame>
  );
}
