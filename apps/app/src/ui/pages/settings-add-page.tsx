import { useMemo, useState } from 'react';
import { useAppServices } from '../../app-services/app-services-context';
import { providerConfigFromForm, useProviderCatalog } from '../hooks/use-provider-settings';
import { SI } from '../components/icons';

interface SettingsAddPageProps {
  readonly onNav: (view: string) => void;
  readonly onProfileSaved: (profileId: string) => Promise<void>;
}

function profileIdFrom(providerId: string, displayName: string): string {
  const safeName = displayName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${providerId}-${safeName || Date.now()}`;
}

function defaultBaseUrl(providerId: string): string {
  return providerId === 'mock' ? 'https://mock.local' : '';
}

export function SettingsAddPage({ onNav, onProfileSaved }: SettingsAddPageProps) {
  const services = useAppServices();
  const providers = useProviderCatalog(services);
  const [step, setStep] = useState(1);
  const [providerId, setProviderId] = useState<string | null>(providers[0]?.id ?? null);
  const [name, setName] = useState('');
  const [baseUrl, setBaseUrl] = useState(defaultBaseUrl(providers[0]?.id ?? ''));
  const [apiKey, setApiKey] = useState('');
  const [defaultModel, setDefaultModel] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const selected = useMemo(() => providers.find((provider) => provider.id === providerId), [providerId, providers]);

  const saveProfile = async (): Promise<string> => {
    if (!selected) {
      throw new Error('请选择 Provider 类型');
    }
    const displayName = name.trim() || selected.displayName;
    const profileId = profileIdFrom(selected.id, displayName);
    const result = await services.commands.saveProviderProfile({
      profileId,
      providerId: selected.id,
      displayName,
      enabled: true,
      config: providerConfigFromForm(selected.id, displayName, selected.family, baseUrl.trim(), defaultModel),
      ...(apiKey.trim() ? { secretValues: { apiKey: apiKey.trim() } } : {}),
    });
    if (!result.ok) {
      throw new Error(`${result.error.category}: ${result.error.message}`);
    }
    return result.value.profileId;
  };

  const handleSave = async () => {
    setBusy(true);
    setStatus(null);
    try {
      const profileId = await saveProfile();
      await onProfileSaved(profileId);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const handleTest = async () => {
    setBusy(true);
    setStatus(null);
    try {
      const profileId = await saveProfile();
      const result = await services.commands.testProviderProfile(profileId, { connect: true });
      if (!result.ok) {
        throw new Error(`${result.error.category}: ${result.error.message}`);
      }
      const reachable = result.value.connectivity?.reachable;
      setStatus(reachable === false ? '配置有效；该 provider 未返回可用模型列表' : '连接成功');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page page-enter">
      <header className="hdr">
        <button className="hdr-btn" onClick={() => (step === 1 ? onNav('settings') : setStep(1))}>
          <SI d="m15 18-6-6 6-6" />
        </button>
        <div className="hdr-center">
          <span style={{ fontFamily: 'var(--fD)', fontSize: 14, fontWeight: 600, color: 'var(--tx)' }}>
            {step === 1 ? '添加 Provider' : selected?.displayName}
          </span>
          {step === 2 && <span style={{ fontFamily: 'var(--fM)', fontSize: 10, color: 'var(--txd)' }}>2 / 2</span>}
        </div>
        <div style={{ width: 32 }} />
      </header>

      <div className="scroll">
        {step === 1 ? (
          <div>
            <div className="sec-lbl" style={{ paddingTop: 16 }}>选择类型</div>
            {providers.map((provider) => (
              <div
                key={provider.id}
                className="prov-row"
                onClick={() => {
                  setProviderId(provider.id);
                  setBaseUrl(defaultBaseUrl(provider.id));
                  setStep(2);
                }}
              >
                <div className="prov-ico" style={{ background: 'var(--s2)', color: 'var(--txm)', fontFamily: 'var(--fM)', fontSize: 10 }}>
                  {provider.displayName.slice(0, 2).toUpperCase()}
                </div>
                <div className="prov-info">
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--tx)' }}>{provider.displayName}</div>
                  <div style={{ fontFamily: 'var(--fM)', fontSize: 10, color: 'var(--txd)', marginTop: 2 }}>{provider.family}</div>
                </div>
                <SI d="m9 18 6-6-6-6" style={{ color: 'var(--txd)' }} />
              </div>
            ))}
          </div>
        ) : (
          <div>
            <div className="section">
              <div className="section-title">Profile</div>
              <div className="field">
                <label className="field-label">显示名称</label>
                <input className="field-input" placeholder={selected?.displayName} value={name} onChange={(event) => setName(event.target.value)} />
              </div>
              <div className="field">
                <label className="field-label">Base URL</label>
                <input className="field-input mono" placeholder="https://api.example.com" value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} />
                <div className="field-hint">服务商提供的 API base URL</div>
              </div>
              <div className="field">
                <label className="field-label">默认模型</label>
                <input className="field-input mono" placeholder="gpt-image-2" value={defaultModel} onChange={(event) => setDefaultModel(event.target.value)} />
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label className="field-label">API Key</label>
                <div className="pw-wrap">
                  <input
                    type={showKey ? 'text' : 'password'}
                    className="field-input mono"
                    placeholder="sk-..."
                    value={apiKey}
                    onChange={(event) => setApiKey(event.target.value)}
                  />
                  <button className="pw-toggle" onClick={() => setShowKey((shown) => !shown)}>
                    <SI d={showKey
                      ? 'M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24'
                      : 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z'
                    } />
                  </button>
                </div>
              </div>
            </div>
            <div className="test-area">
              <button className="test-btn" disabled={busy} onClick={() => void handleTest()}>
                {busy
                  ? <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="spin"><path d="M21 12a9 9 0 1 1-9-9" /></svg> 测试中...</>
                  : '测试连接'
                }
              </button>
              {status && <div className={status.includes(':') ? 'test-result err' : 'test-result ok'}>{status}</div>}
            </div>
          </div>
        )}
      </div>

      {step === 2 && (
        <footer className="det-footer">
          <button className="btn-save" disabled={busy} onClick={() => void handleSave()}>保存</button>
          <button
            style={{ padding: '10px 14px', borderRadius: 'var(--rsm)', border: '1px solid var(--bd)', background: 'transparent', color: 'var(--txm)', fontFamily: 'var(--fB)', fontSize: 13, cursor: 'pointer' }}
            onClick={() => onNav('settings')}
          >
            取消
          </button>
        </footer>
      )}
    </div>
  );
}
