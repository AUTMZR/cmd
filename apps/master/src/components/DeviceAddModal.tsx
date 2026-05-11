'use client';

/**
 * Добавление нового устройства.
 * Два способа:
 *  - «Команда» (default): показываем curl-installer, юзер копирует и запускает сам.
 *              Плюс QR для сканирования со второго устройства. Polling статуса до online.
 *  - «SSH»:     юзер вводит host/user/password|key, master SSH'ится и сам всё ставит.
 *              Credentials живут только в памяти на время выполнения.
 */

import { useState, useEffect, useMemo, useRef } from 'react';
import { useTranslations } from 'next-intl';
import QRCode from 'qrcode';

interface Props { onClose: () => void }
type Intent = 'claude' | 'fs-only';
type Method = 'command' | 'ssh';
type AuthType = 'password' | 'key';
type AgentChoice = 'claude-code' | 'gemini-cli' | 'codex-cli';

export default function DeviceAddModal({ onClose }: Props) {
  const t = useTranslations('device.add');
  // Общие поля
  const [name, setName] = useState('');
  const [intent, setIntent] = useState<Intent>('claude');
  /** Какой CLI ставится дефолтным при подключении этого устройства.
   *  Используется только когда intent === 'claude'. */
  const [preferredAgent, setPreferredAgent] = useState<AgentChoice>('claude-code');
  const [method, setMethod] = useState<Method>('ssh');
  const [step, setStep] = useState<'form' | 'waiting' | 'ssh-running'>('form');
  const [cmd, setCmd] = useState<{ connect_cmd: string; id: string; token: string } | null>(null);
  const [online, setOnline] = useState(false);

  // Для таба «Команда»
  const [copied, setCopied] = useState(false);
  const [qrSvg, setQrSvg] = useState<string>('');

  // Для таба «SSH»
  const [sshHost, setSshHost] = useState('');
  const [sshPort, setSshPort] = useState('22');
  const [sshUser, setSshUser] = useState('root');
  const [sshAuthType, setSshAuthType] = useState<AuthType>('password');
  const [sshPassword, setSshPassword] = useState('');
  const [sshKey, setSshKey] = useState('');
  const [sshPassphrase, setSshPassphrase] = useState('');
  const [sshLog, setSshLog] = useState('');
  const [sshStatus, setSshStatus] = useState<'idle' | 'connecting' | 'running' | 'done' | 'error'>('idle');
  const sshLogRef = useRef<HTMLDivElement | null>(null);

  async function createDevice(): Promise<{ id: string; token: string; connect_cmd: string } | null> {
    if (!name.trim()) { alert(t('alertNoName')); return null; }
    const r = await fetch('/api/devices', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name, intent,
        preferred_agent: intent === 'claude' ? preferredAgent : null,
      }),
    });
    if (!r.ok) { alert(t('alertCreateFailed')); return null; }
    return await r.json();
  }

  async function handleCommandFlow() {
    const j = await createDevice();
    if (!j) return;
    setCmd({ connect_cmd: j.connect_cmd, id: j.id, token: j.token });
    setStep('waiting');

    // Генерим QR с командой. QR-reader iPhone Safari часто не знает что делать
    // с очень длинной строкой, поэтому в QR кладём команду as-is — на втором
    // устройстве пользователь тапает «Скопировать», идёт в терминал, вставляет.
    try {
      const svg = await QRCode.toString(j.connect_cmd, {
        type: 'svg', margin: 1, width: 280,
        color: { dark: '#0a0a0a', light: '#ffffff' },
      });
      setQrSvg(svg);
    } catch { setQrSvg(''); }
  }

  async function handleSshFlow() {
    if (!sshHost.trim() || !sshUser.trim()) { alert(t('alertHostUser')); return; }
    if (sshAuthType === 'password' && !sshPassword) { alert(t('alertPassword')); return; }
    if (sshAuthType === 'key' && !sshKey) { alert(t('alertKey')); return; }
    const j = await createDevice();
    if (!j) return;
    setCmd({ connect_cmd: j.connect_cmd, id: j.id, token: j.token });
    setStep('ssh-running');
    setSshStatus('connecting');
    setSshLog('');

    try {
      const res = await fetch('/api/devices/ssh-install', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          host: sshHost.trim(),
          port: Number(sshPort) || 22,
          username: sshUser.trim(),
          auth: sshAuthType === 'password'
            ? { type: 'password', password: sshPassword }
            : { type: 'key', key: sshKey, passphrase: sshPassphrase || undefined },
          connectCmd: j.connect_cmd,
        }),
      });
      if (!res.ok || !res.body) {
        setSshStatus('error');
        setSshLog(l => l + `HTTP ${res.status}\n`);
        return;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n'); buf = lines.pop() || '';
        for (const raw of lines) {
          const ln = raw.trim();
          if (!ln.startsWith('data:')) continue;
          try {
            const ev = JSON.parse(ln.slice(5).trim());
            if (ev.type === 'connecting') {
              setSshLog(l => l + `[info] connecting to ${ev.username}@${ev.host}:${ev.port}...\n`);
            } else if (ev.type === 'connected') {
              setSshLog(l => l + `[ok] SSH connected, running installer...\n`);
              setSshStatus('running');
            } else if (ev.type === 'out' || ev.type === 'err') {
              setSshLog(l => l + ev.text);
            } else if (ev.type === 'exit') {
              setSshLog(l => l + `\n[installer exit ${ev.code}]\n`);
              if (ev.code === 0) setSshStatus('done'); else setSshStatus('error');
            } else if (ev.type === 'error') {
              setSshLog(l => l + `\n[error] ${ev.message}\n`);
              setSshStatus('error');
            }
          } catch {}
        }
      }
    } catch (e) {
      setSshLog(l => l + `\n[error] ${(e as Error).message}\n`);
      setSshStatus('error');
    }
    // Затираем credentials из state сразу после использования
    setSshPassword('');
    setSshKey('');
    setSshPassphrase('');
  }

  // Polling — ждём пока agent реально подключится (общий для обоих потоков).
  useEffect(() => {
    if (!cmd || online) return;
    if (step !== 'waiting' && step !== 'ssh-running') return;
    const t = setInterval(async () => {
      try {
        const r = await fetch('/api/devices');
        if (!r.ok) return;
        const { devices } = await r.json();
        const d = devices.find((x: any) => x.id === cmd.id);
        if (d?.online) { setOnline(true); clearInterval(t); }
      } catch {}
    }, 2000);
    return () => clearInterval(t);
  }, [cmd, step, online]);

  // Автоскролл лога SSH
  useEffect(() => { sshLogRef.current?.scrollTo({ top: 1e9 }); }, [sshLog]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,.5)', backdropFilter: 'blur(6px)' }} onClick={onClose}>
      <div className="w-full max-w-md max-h-[90dvh] rounded-2xl p-5 flex flex-col overflow-hidden"
        style={{ background: 'var(--surface)', boxShadow: '0 8px 24px rgba(0,0,0,.15)' }}
        onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between mb-3 shrink-0">
          <div>
            <h3 className="text-base font-semibold">{t('title')}</h3>
            <p className="text-[11.5px]" style={{ color: 'var(--muted)' }}>
              {step === 'form' ? t('chooseHow') :
               step === 'waiting' ? t('waitingAgent') :
               t('installingSsh')}
            </p>
          </div>
          <button onClick={onClose} className="text-xl" style={{ color: 'var(--muted)' }}>×</button>
        </div>

        {/* Body scrollable */}
        <div className="flex-1 overflow-y-auto min-h-0">

        {/* ───── STEP: FORM ───── */}
        {step === 'form' && (
          <>
            <label className="block text-xs mb-1" style={{ color: 'var(--muted)' }}>{t('nameLabel')}</label>
            <input value={name} autoFocus onChange={(e) => setName(e.target.value)} placeholder={t('namePlaceholder')}
              className="w-full px-3 py-2 rounded-lg text-sm bg-transparent outline-none"
              style={{ border: '1px solid var(--border)', color: 'var(--fg)' }} />

            <label className="block text-xs mt-4 mb-1.5" style={{ color: 'var(--muted)' }}>{t('intentLabel')}</label>
            <div className="flex flex-col gap-1.5">
              <button type="button" onClick={() => setIntent('claude')}
                className="flex items-start gap-2.5 p-2.5 rounded-xl text-left"
                style={{
                  border: `1px solid ${intent === 'claude' ? 'var(--accent)' : 'var(--border)'}`,
                  background: intent === 'claude' ? 'var(--accent-light)' : 'transparent',
                }}>
                <span className="text-xl leading-none mt-0.5">🤖</span>
                <span className="flex-1">
                  <span className="block text-[13px] font-medium">{t('intentAgentTitle')}</span>
                  <span className="block text-[11px] mt-0.5" style={{ color: 'var(--muted)' }}>
                    {t('intentAgentBody')}
                  </span>
                  {intent === 'claude' && (
                    <span className="mt-2.5 flex flex-wrap gap-1.5">
                      {([
                        { id: 'claude-code', label: '🤖 Claude' },
                        { id: 'gemini-cli',  label: '✨ Gemini' },
                        { id: 'codex-cli',   label: '⌘ Codex' },
                      ] as const).map((c) => {
                        const on = preferredAgent === c.id;
                        return (
                          <button key={c.id} type="button"
                            onClick={(e) => { e.stopPropagation(); setPreferredAgent(c.id); }}
                            className="text-[11.5px] px-2.5 py-1 rounded-full"
                            style={{
                              background: on ? 'var(--accent)' : 'var(--surface)',
                              color: on ? 'var(--bg)' : 'var(--fg-2)',
                              border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`,
                            }}>
                            {c.label}
                          </button>
                        );
                      })}
                    </span>
                  )}
                </span>
              </button>
              <button type="button" onClick={() => setIntent('fs-only')}
                className="flex items-start gap-2.5 p-2.5 rounded-xl text-left"
                style={{
                  border: `1px solid ${intent === 'fs-only' ? 'var(--accent)' : 'var(--border)'}`,
                  background: intent === 'fs-only' ? 'var(--accent-light)' : 'transparent',
                }}>
                <span className="text-xl leading-none mt-0.5">📂</span>
                <span className="flex-1">
                  <span className="block text-[13px] font-medium">{t('intentFsTitle')}</span>
                  <span className="block text-[11px] mt-0.5" style={{ color: 'var(--muted)' }}>
                    {t('intentFsBody')}
                  </span>
                </span>
              </button>
            </div>

            {/* Primary: SSH form. Secondary: small link to manual command. */}
            {method === 'command' && (
              <p className="text-[11.5px] mt-4" style={{ color: 'var(--muted)' }}>
                {t('commandHint')}
              </p>
            )}
            {method === 'ssh' && (
              <div className="mt-3 flex flex-col gap-2">
                <p className="text-[11.5px]" style={{ color: 'var(--muted)' }}>
                  {t('sshHint')}
                </p>
                <div className="flex gap-2">
                  <input value={sshHost} onChange={(e) => setSshHost(e.target.value)}
                    placeholder={t('sshHostPlaceholder')}
                    className="flex-1 px-3 py-2 rounded-lg text-sm bg-transparent outline-none"
                    style={{ border: '1px solid var(--border)', color: 'var(--fg)' }} />
                  <input value={sshPort} onChange={(e) => setSshPort(e.target.value)}
                    placeholder="22" inputMode="numeric"
                    className="w-16 px-3 py-2 rounded-lg text-sm bg-transparent outline-none"
                    style={{ border: '1px solid var(--border)', color: 'var(--fg)' }} />
                </div>
                <input value={sshUser} onChange={(e) => setSshUser(e.target.value)}
                  placeholder="root" autoCapitalize="off" autoCorrect="off"
                  className="w-full px-3 py-2 rounded-lg text-sm bg-transparent outline-none"
                  style={{ border: '1px solid var(--border)', color: 'var(--fg)' }} />

                <div className="flex rounded-md overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                  <button type="button" onClick={() => setSshAuthType('password')}
                    className="flex-1 py-1.5 text-[12px]"
                    style={{
                      background: sshAuthType === 'password' ? 'var(--surface-2)' : 'transparent',
                      fontWeight: sshAuthType === 'password' ? 600 : 400,
                    }}>{t('authPassword')}</button>
                  <button type="button" onClick={() => setSshAuthType('key')}
                    className="flex-1 py-1.5 text-[12px]"
                    style={{
                      background: sshAuthType === 'key' ? 'var(--surface-2)' : 'transparent',
                      fontWeight: sshAuthType === 'key' ? 600 : 400,
                      borderLeft: '1px solid var(--border)',
                    }}>{t('authKey')}</button>
                </div>

                {sshAuthType === 'password' ? (
                  <input value={sshPassword} onChange={(e) => setSshPassword(e.target.value)}
                    type="password" placeholder="ssh password"
                    className="w-full px-3 py-2 rounded-lg text-sm bg-transparent outline-none"
                    style={{ border: '1px solid var(--border)', color: 'var(--fg)' }} />
                ) : (
                  <>
                    <textarea value={sshKey} onChange={(e) => setSshKey(e.target.value)}
                      placeholder="-----BEGIN OPENSSH PRIVATE KEY-----&#10;...&#10;-----END OPENSSH PRIVATE KEY-----"
                      rows={4} spellCheck={false} autoCapitalize="off"
                      className="w-full px-3 py-2 rounded-lg text-[10.5px] bg-transparent outline-none font-mono"
                      style={{ border: '1px solid var(--border)', color: 'var(--fg)' }} />
                    <input value={sshPassphrase} onChange={(e) => setSshPassphrase(e.target.value)}
                      type="password" placeholder={t('passphrasePlaceholder')}
                      className="w-full px-3 py-2 rounded-lg text-sm bg-transparent outline-none"
                      style={{ border: '1px solid var(--border)', color: 'var(--fg)' }} />
                  </>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2 mt-4 shrink-0">
              <button onClick={onClose} className="btn-secondary">{t('cancel')}</button>
              <button onClick={method === 'ssh' ? handleSshFlow : handleCommandFlow}
                className="btn-primary">
                {method === 'ssh' ? t('connect') : t('create')}
              </button>
            </div>

            {method === 'ssh' && (
              <button type="button" onClick={() => setMethod('command')}
                className="mt-2 w-full text-[12.5px] underline underline-offset-2"
                style={{ color: 'var(--muted)' }}>
                {t('switchToCommand')}
              </button>
            )}
            {method === 'command' && (
              <button type="button" onClick={() => setMethod('ssh')}
                className="mt-2 w-full text-[12.5px] underline underline-offset-2"
                style={{ color: 'var(--muted)' }}>
                {t('switchToSsh')}
              </button>
            )}
          </>
        )}

        {/* ───── STEP: WAITING (command flow) ───── */}
        {step === 'waiting' && cmd && (
          <>
            <div className="text-xs mb-2" style={{ color: 'var(--muted)' }}>{t('runOnDevice')}</div>
            <div className="relative">
              <pre className="text-[11px] font-mono p-3 rounded-lg whitespace-pre-wrap break-all max-h-[140px] overflow-auto"
                style={{ background: '#1a1a1a', color: '#e5e7eb' }}>{cmd.connect_cmd}</pre>
              <button onClick={() => { navigator.clipboard.writeText(cmd.connect_cmd); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
                className="absolute top-2 right-2 text-[10px] px-2 py-1 rounded"
                style={{ background: 'rgba(255,255,255,.15)', color: '#fff' }}>
                {copied ? t('copied') : t('copy')}
              </button>
            </div>

            {qrSvg && (
              <div className="mt-3">
                <div className="text-[11.5px] mb-1.5" style={{ color: 'var(--muted)' }}>
                  {t('qrHint')}
                </div>
                <div className="flex justify-center p-2 rounded-lg"
                  style={{ background: '#fff', border: '1px solid var(--border)' }}
                  dangerouslySetInnerHTML={{ __html: qrSvg }} />
              </div>
            )}

            <div className="mt-3 flex items-center gap-2 p-3 rounded-lg"
              style={{ background: 'var(--accent-light)', border: '1px solid var(--border)' }}>
              <span className="w-2 h-2 rounded-full" style={{
                background: online ? 'var(--ok)' : '#d97706',
                animation: online ? 'none' : 'pulse 1.4s infinite',
              }} />
              <div className="text-xs">
                {online ? <strong>{t('connectedOk')}</strong> : t('waiting')}
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-4 shrink-0">
              <button onClick={onClose} className="btn-primary">{online ? t('done') : t('close')}</button>
            </div>
          </>
        )}

        {/* ───── STEP: SSH RUNNING ───── */}
        {step === 'ssh-running' && (
          <>
            <div className="flex items-center gap-2 mb-2">
              <span className="w-2 h-2 rounded-full" style={{
                background:
                  sshStatus === 'done' || online ? 'var(--ok)' :
                  sshStatus === 'error' ? 'var(--danger)' :
                  '#d97706',
                animation: (sshStatus === 'connecting' || sshStatus === 'running') ? 'pulse 1.4s infinite' : 'none',
              }} />
              <div className="text-xs">
                {sshStatus === 'connecting' && t('sshConnecting')}
                {sshStatus === 'running' && t('sshInstalling')}
                {sshStatus === 'done' && !online && t('sshDoneWaiting')}
                {sshStatus === 'done' && online && <strong>{t('connectedOk')}</strong>}
                {sshStatus === 'error' && <span style={{ color: 'var(--danger)' }}>{t('sshError')}</span>}
              </div>
            </div>

            <div ref={sshLogRef} className="rounded-lg p-3 font-mono text-[11px] whitespace-pre-wrap break-all overflow-auto max-h-[320px]"
              style={{ background: '#0a0a0a', color: '#e5e7eb', minHeight: 160 }}>
              {sshLog || '...'}
            </div>

            <div className="flex justify-end gap-2 mt-4 shrink-0">
              <button onClick={onClose} className="btn-primary">
                {online ? t('done') : t('close')}
              </button>
            </div>
          </>
        )}

        </div>
      </div>
    </div>
  );
}
