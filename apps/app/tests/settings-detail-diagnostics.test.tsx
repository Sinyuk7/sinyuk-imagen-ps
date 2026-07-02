import { act } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  buttonByText,
  changeInput,
  cleanupSettingsDetailRoot,
  flush,
  installFlightRecorder,
  queryByTestId,
  renderDetail,
  switchToCustomModel,
} from './settings-detail-harness';

afterEach(async () => {
  await cleanupSettingsDetailRoot();
});

describe('SettingsDetailPage contract — diagnostics', () => {
  it('writes sanitized UI save checkpoints without form secrets or provider values', async () => {
    const records = installFlightRecorder();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const { onProfilesChanged } = await renderDetail(container);

    await act(async () => {
      changeInput(queryByTestId(container, 'provider-alias-input'), 'Sensitive Alias Should Not Log');
      changeInput(queryByTestId(container, 'provider-endpoint-url-0'), 'https://secret.example.local/path');
      changeInput(queryByTestId(container, 'provider-api-key-input'), 'sk_live_secret_should_not_log');
    });
    await switchToCustomModel(container);
    await act(async () => {
      changeInput(queryByTestId(container, 'provider-default-model-input'), 'mock-image-v2-secret-name');
    });
    await act(async () => {
      container.querySelector<HTMLButtonElement>('.btn-save')!.click();
    });
    await flush();

    expect(onProfilesChanged).toHaveBeenCalledWith('mock-profile');
    const events = records.map((record) => record.event);
    expect(events).toEqual(expect.arrayContaining([
      'uxp.ui.settings_detail.save.entered',
      'uxp.ui.settings_detail.save.busy_set',
      'uxp.ui.settings_detail.persist.input_prepared',
      'uxp.ui.profile_detail.save.before_command',
      'uxp.ui.profile_detail.save.after_command',
      'uxp.ui.profile_detail.save.before_set_profile',
      'uxp.ui.profile_detail.save.after_set_profile',
      'uxp.ui.settings_detail.save.after_persist',
      'uxp.ui.settings_detail.save.before_success_feedback',
      'uxp.ui.settings_detail.save.after_success_feedback',
      'uxp.ui.settings_detail.save.before_profiles_changed',
      'uxp.ui.settings_detail.save.after_profiles_changed',
      'uxp.ui.settings_detail.save.before_busy_clear',
      'uxp.ui.settings_detail.save.after_busy_clear',
    ]));
    expect(events.indexOf('uxp.ui.settings_detail.save.before_profiles_changed')).toBeLessThan(
      events.indexOf('uxp.ui.settings_detail.save.after_profiles_changed'),
    );

    const text = JSON.stringify(records);
    expect(text).toContain('"hasDirtyCredential":true');
    expect(text).toContain('"modelIdLength":25');
    expect(text).not.toContain('Sensitive Alias Should Not Log');
    expect(text).not.toContain('https://secret.example.local');
    expect(text).not.toContain('sk_live_secret_should_not_log');
    expect(text).not.toContain('mock-image-v2-secret-name');
    expect(text).not.toContain('secret:provider-profile');
  });

  it('can disable UI flight recorder with diagnostic flag without changing save callback', async () => {
    const records = installFlightRecorder();
    globalThis.__IMAGEN_PS_DIAGNOSTIC_DISABLE_UI_FLIGHT_RECORDER__ = true;
    const container = document.createElement('div');
    document.body.appendChild(container);
    const { onProfilesChanged } = await renderDetail(container);

    await act(async () => {
      container.querySelector<HTMLButtonElement>('.btn-save')!.click();
    });
    await flush();

    expect(onProfilesChanged).toHaveBeenCalledWith('mock-profile');
    expect(records).toEqual([]);
  });
});
