'use client';

/**
 * Модалка для повторной выдачи connect-команды офлайн-устройству.
 * Зеркалит DeviceAddModal по UX — два таба:
 *   📋 Command — показывает curl + QR (юзер сам запустит на сервере)
 *   🔐 SSH     — мастер сам цепляется по SSH и ставит агент
 *
 * Оба пути сначала зовут /reissue-token (свежий токен), потом расходятся.
 * Поллит /api/devices пока агент не выйдет онлайн.
 */

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import QRCode from 'qrcode';

interface Props {
  deviceId: string;
  deviceName: string;
  onClose: () => void;
  onConnected?: () => void;
}

type Method = 'ssh' | 'command';
type AuthType = 'password' | 'key';

export default function DeviceReconnectModal({ deviceId, deviceName, onClose, onConnected }: Props) {
  const t = useTranslations('device.reconnect');
  const td = useTranslations('device.add');
  const [method, setMethod] = useState<Method>('ssh');
  const [cmd, setCmd] = useState<{ connect_cmd: string; token: string } | null>(null);
  const [qrSvg, setQrSvg] = useState('');
  const [copied, setCopied] = useState(false);
  const [online, setOnline] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const requested = useRef(false);

  // SSH form
  const [sshHost, setSshHost] = useState('');
  const [sshPort, setSshPort] = useState('22');
  const [sshUser, setSshUser] = useState('root');
  const [sshAuthType, setSshAuthType] = useState<AuthType>('password');
  const [sshPassword, setSshPassword] = useState('');
  const [sshKey, setSshKey] = useState('');
  const [sshPassphrase, setSshPassphrase] = useState('');
  const [sshStatus, setSshStatus] = useState<'idle' | 'connecting' | 'running' | 'done' | 'error'>('idle');
  const [sshLog, setSshLog] = useState('');
  const sshLogRef = useRef<HTMLDivElement | null>(null);

  // 1× /reissue-token при открытии — нужен и для command, и для SSH-флоу.
  useEffect(() => {
    if (requested.current) return;
    requested.current = true;
    (async () => {
      try {
        const r = await fetch(`/api/devices/${deviceId}/reissue-token`, { method: 'POST' });
        if (!r.ok) { setErr(`HTTP ${r.status}`); return; }
        const j = await r.json();
        setCmd({ connect_cmd: j.connect_cmd, token: j.token });
        try {
          const svg = await QRCode.toString(j.connect_cmd, {
            type: 'svg', margin: 1, width: 280,
            color: { dark: '#0a0a0a', light: '#ffffff' },
          });
          setQrSvg(svg);
        } catch { /* qr не критичен */ }
      } catch (e) {
        setErr((e as Error).message);
      }
    })();
  }, [deviceId]);

  // Поллинг online через /api/devices.
  useEffect(() => {
    if (!cmd || online) return;
    const tick = setInterval(async () => {
      try {
        const r = await fetch('/api/devices');
        if (!r.ok) return;
        const { devices } = await r.json();
        const d = devices.find((x: any) => x.id === deviceId);
        if (d?.online) { setOnline(true); clearInterval(tick); onConnected?.(); }
      } catch {}
    }, 2000);
    return () => clearInterval(tick);
  }, [cmd, online, deviceId, onConnected]);

  useEffect(() => { sshLogRef.current?.scrollTo({ top: 1e9 }); }, [sshLog]);

  async function runSshFlow() {
    if (!cmd) return;
    if (!sshHost.trim() || !sshUser.trim()) { setErr(td('alertHostUser')); return; }
    if (sshAuthType === 'password' && !sshPassword) { setErr(td('alertPassword')); return; }
    if (sshAuthType === 'key' && !sshKey.trim()) { setErr(td('alertKey')); return; }

    setErr(null);
    setSshStatus('connecting');
    setSshLog('');

    const auth = sshAuthType === 'password'
      ? { type: 'password', password: sshPassword }
      : { type: 'key', privateKey: sshKey, passphrase: sshPassphrase || undefined };

    try {
      const res = await fetch('/api/devices/ssh-install', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          host: sshHost.trim(), port: Number(sshPort) || 22,
          username: sshUser.trim(), auth, deviceId,
        }),
      });
      if (!res.ok || !res.body) {
        setSshStatus('error');
        setErr(`HTTP ${res.status}`);
        return;
      }
      setSshStatus('running');
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
            if (ev.type === 'out' || ev.type === 'err') setSshLog((l) => l + ev.text);
            else if (ev.type === 'exit') {
              setSshLog((l) => l + `\n[exit ${ev.code}]\n`);
              setSshStatus(ev.code === 0 ? 'done' : 'error');
            } else if (ev.type === 'error') {
              setSshLog((l) => l + `\n[error] ${ev.message}\n`);
              setSshStatus('error');
            }
          } catch { /* ignore */ }
        }
      }
    } catch (e) {
      setSshStatus('error');
      setErr((e as Error).message);
    }
  }

  const sshBusy = sshStatus === 'connecting' || sshStatus === 'running';

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,.5)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}>
      <div className="w-full max-w-md max-h-[90dvh] rounded-2xl p-5 flex flex-col overflow-y-auto"
        style={{ background: 'var(--surface)', boxShadow: '0 8px 24px rgba(0,0,0,.15)' }}
        onClick={(e) => e.stopPropagation()}>

        <div className="flex items-center justify-between mb-3">
          <div className="min-w-0">
            <h3 className="text-base font-semibold">{t('title')}</h3>
            <p className="text-[11.5px] truncate" style={{ color: 'var(--muted)' }}>{deviceName}</p>
          </div>
          <button onClick={onClose} className="text-xl shrink-0" style={{ color: 'var(--muted)' }}>×</button>
        </div>

        {err && (
          <div className="text-[12.5px] px-3 py-2 rounded-lg mb-3"
            style={{ background: 'var(--danger-bg)', color: 'var(--danger)' }}>
            {err}
          </div>
        )}

        {!cmd && !err && (
          <div className="text-[13px] py-6 text-center" style={{ color: 'var(--muted)' }}>
            {t('issuing')}
          </div>
        )}

        {cmd && !online && (
          <>
            {/* Primary action: SSH form. Secondary: tiny link to manual command. */}
            {method === 'ssh' && (
              <p className="text-[12.5px] mb-3" style={{ color: 'var(--muted)' }}>
                {t('sshLead')}
              </p>
            )}

            {method === 'command' && (
              <>
                <p className="text-[12.5px] mb-3" style={{ color: 'var(--muted)' }}>
                  {t('intro')}
                </p>

                <div className="rounded-xl p-3 font-mono text-[10.5px] mb-2 break-all whitespace-pre-wrap"
                  style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-2)' }}>
                  {cmd.connect_cmd}
                </div>

                <button onClick={() => {
                    navigator.clipboard.writeText(cmd.connect_cmd);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  }}
                  className="w-full px-3 py-2.5 rounded-lg text-[13px] font-medium mb-3"
                  style={{ background: 'var(--accent)', color: 'var(--bg)' }}>
                  {copied ? td('copied') : td('copy')}
                </button>

                {qrSvg && (
                  <div className="flex flex-col items-center gap-2 mb-3">
                    <div className="rounded-lg overflow-hidden p-2"
                      style={{ background: '#fff' }}
                      dangerouslySetInnerHTML={{ __html: qrSvg }} />
                    <p className="text-[11px]" style={{ color: 'var(--muted)' }}>{td('qrHint')}</p>
                  </div>
                )}

                <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-[12px]"
                  style={{ background: 'var(--accent-light)', color: 'var(--muted)' }}>
                  <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: 'var(--warn)' }} />
                  {td('waitingAgent')}
                </div>

                <button type="button" onClick={() => setMethod('ssh')}
                  className="mt-3 w-full text-[12.5px] underline underline-offset-2"
                  style={{ color: 'var(--muted)' }}>
                  {t('switchToSsh')}
                </button>
              </>
            )}

            {method === 'ssh' && (
              <div className="flex flex-col gap-2">
                <p className="text-[11.5px]" style={{ color: 'var(--muted)' }}>
                  {td('sshHint')}
                </p>
                <div className="flex gap-2">
                  <input value={sshHost} onChange={(e) => setSshHost(e.target.value)}
                    placeholder={td('sshHostPlaceholder')}
                    autoCapitalize="off" autoCorrect="off"
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
                    }}>{td('authPassword')}</button>
                  <button type="button" onClick={() => setSshAuthType('key')}
                    className="flex-1 py-1.5 text-[12px]"
                    style={{
                      background: sshAuthType === 'key' ? 'var(--surface-2)' : 'transparent',
                      fontWeight: sshAuthType === 'key' ? 600 : 400,
                      borderLeft: '1px solid var(--border)',
                    }}>{td('authKey')}</button>
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
                      type="password" placeholder={td('passphrasePlaceholder')}
                      className="w-full px-3 py-2 rounded-lg text-sm bg-transparent outline-none"
                      style={{ border: '1px solid var(--border)', color: 'var(--fg)' }} />
                  </>
                )}

                <button onClick={runSshFlow} disabled={sshBusy}
                  className="mt-1 w-full px-3 py-2.5 rounded-lg text-[13px] font-medium disabled:opacity-40"
                  style={{ background: 'var(--accent)', color: 'var(--bg)' }}>
                  {sshBusy ? td('installing') : td('connect')}
                </button>

                {(sshStatus !== 'idle' || sshLog) && (
                  <pre ref={sshLogRef as any}
                    className="font-mono text-[10.5px] mt-2 p-3 rounded-lg whitespace-pre-wrap break-all max-h-48 overflow-y-auto"
                    style={{ background: '#0a0a0a', color: '#e5e7eb' }}>
                    {sshLog || td('connecting')}
                  </pre>
                )}

                <button type="button" onClick={() => setMethod('command')}
                  className="mt-2 w-full text-[12.5px] underline underline-offset-2"
                  style={{ color: 'var(--muted)' }}>
                  {t('switchToCommand')}
                </button>
              </div>
            )}
          </>
        )}

        {online && (
          <div className="rounded-lg px-4 py-6 text-center"
            style={{ background: 'var(--accent-light)' }}>
            <div className="text-2xl mb-2">✓</div>
            <div className="text-sm font-medium" style={{ color: 'var(--ok)' }}>{t('connected')}</div>
            <button onClick={onClose}
              className="mt-4 px-5 py-2 rounded-full text-[13px] font-semibold"
              style={{ background: 'var(--accent)', color: 'var(--bg)' }}>
              {t('done')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
