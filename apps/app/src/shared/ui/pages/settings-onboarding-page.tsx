import { Icon } from '../components/icons';
import { useI18n } from '../i18n/i18n-context';
import { IconButton } from '../primitives/icon-button';

interface SettingsOnboardingPageProps {
  readonly onBack: () => void;
}

export function SettingsOnboardingPage({ onBack }: SettingsOnboardingPageProps) {
  const { messages: t } = useI18n();

  return (
    <div className="page page-enter settings-page settings-onboarding-page" data-testid="settings-onboarding-page">
      <header className="hdr">
        <IconButton
          data-testid="settings-onboarding-back-button"
          className="hdr-btn"
          quiet
          icon={<Icon name="chevron-left" />}
          tooltip={t.common.back}
          onClick={onBack}
        />
        <div className="hdr-title">{t.settings.configuration}</div>
        <div style={{ width: 32 }} />
      </header>
      <div className="scroll">
        <section className="section settings-onboarding-card">
          <p className="settings-onboarding-eyebrow">{t.settings.configuration}</p>
          <h1 className="settings-onboarding-title">{t.settings.onboardingTitle}</h1>
          <p className="settings-onboarding-copy">{t.settings.onboardingIntro}</p>
          <ol className="settings-onboarding-list">
            <li>
              <code>Model Configuration</code>
              <span>{t.settings.onboardingStepModelConfiguration}</span>
            </li>
            <li>
              <code>Provider Profile</code>
              <span>{t.settings.onboardingStepProviderProfile}</span>
            </li>
            <li>
              <code>Main</code>
              <span>{t.settings.onboardingStepReturnHome}</span>
            </li>
          </ol>
          <p className="settings-onboarding-note">{t.settings.onboardingHint}</p>
        </section>
      </div>
    </div>
  );
}
