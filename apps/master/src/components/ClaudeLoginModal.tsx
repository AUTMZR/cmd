'use client';

/**
 * Авторизация Claude Code на устройстве. Три способа:
 *
 *  1. 🎯 Подписка (default) — копируем ~/.claude/.credentials.json с локального
 *     Mac/Linux юзера на remote. Работает через Pro/Max-подписку, без оплаты API.
 *  2. 🔑 API-ключ — ANTHROPIC_API_KEY пишем в systemd-env агента.
 *  3. 🌐 OAuth — claude auth login через PTY. Только для local устройств (Mac),
 *     на remote не работает из-за OAuth-callback на localhost сервера.
 */

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';

const PtyTerminal = dynamic(() => import('./PtyTerminal'), { ssr: false, loading: () => null });

interface Props {
  deviceId: string;
  deviceName: string;
  onClose: () => void;
}

type Method = 'subscription' | 'api-key' | 'oauth';
type Status = 'idle' | 'saving' | 'ok' | 'error';

export default function ClaudeLoginModal({ deviceId, deviceName, onClose }: Props) {
  const t = useTranslations('claudeLogin');
  const [method, setMethod] = useState<Method>('subscription');
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [credsJson, setCredsJson] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [log, setLog] = useState<string>('');
  const logRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => { logRef.current?.scrollTo({ top: 1e9 }); }, [log]);

  async function streamSSE(url: string, body: unknown) {
    setStatus('saving');
    setLog('');
    try {
      const res = await fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok || !res.body) {
        setStatus('error');
        const text = await res.text().catch(() => '');
        setLog(`HTTP ${res.status}\n${text}\n`);
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
            if (ev.type === 'out' || ev.type === 'err') setLog(l => l + ev.text);
            else if (ev.type === 'exit') setLog(l => l + `\n[exit ${ev.code}]\n`);
            else if (ev.type === 'ok') { setStatus('ok'); setLog(l => l + `\n✓ ${ev.message || t('done')}\n`); }
            else if (ev.type === 'error') { setStatus('error'); setLog(l => l + `\n✗ ${ev.message}\n`); }
          } catch {}
        }
      }
    } catch (e) {
      setStatus('error');
      setLog(l => l + `\n[error] ${(e as Error).message}\n`);
    }
  }

  async function saveApiKey() {
    if (!apiKey.trim().startsWith('sk-ant-')) {
      alert(t('alertBadApiKey'));
      return;
    }
    await streamSSE(`/api/devices/${deviceId}/claude-set-api-key`, { apiKey: apiKey.trim() });
    setApiKey('');
  }

  async function saveCredentials() {
    if (!credsJson.trim()) { alert(t('alertPasteCreds')); return; }
    try { JSON.parse(credsJson.trim()); }
    catch { alert(t('alertNotJson')); return; }
    await streamSSE(`/api/devices/${deviceId}/claude-set-credentials`, { credentials: credsJson.trim() });
    setCredsJson('');
  }

  return (
    <div className="fixed inset-0 z-[60] flex md:items-center md:justify-center md:p-4"
      style={{ background: 'rgba(0,0,0,.5)', backdropFilter: 'blur(6px)' }}
      onClick={() => status !== 'saving' && onClose()}>
      <div className="w-full h-dvh md:h-auto md:max-w-md md:max-h-[85dvh] md:rounded-2xl flex flex-col overflow-hidden"
        style={{ background: 'var(--surface)', boxShadow: '0 8px 24px rgba(0,0,0,.2)' }}
        onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 shrink-0"
          style={{ borderBottom: '1px solid var(--border)' }}>
          <div>
            <h3 className="text-base font-semibold">{t('title')}</h3>
            <div className="text-[11.5px]" style={{ color: 'var(--muted)' }}>
              {t('onDevicePrefix')} <b>{deviceName}</b>
            </div>
          </div>
          <button onClick={onClose} disabled={status === 'saving'}
            className="text-xl disabled:opacity-30"
            style={{ color: 'var(--muted)' }}>×</button>
        </div>

        {/* Method tabs */}
        <div className="grid grid-cols-3 gap-px m-3 mb-2 shrink-0 rounded-lg overflow-hidden"
          style={{ background: 'var(--border)' }}>
          {([
            { id: 'subscription' as const, label: `🎯 ${t('subscriptionTab')}`, hint: t('subscriptionHint') },
            { id: 'api-key'      as const, label: `🔑 ${t('apiKeyTab')}`, hint: t('apiKeyHint') },
            { id: 'oauth'        as const, label: `🌐 ${t('oauthTab')}`,  hint: t('oauthHint') },
          ]).map(tab => (
            <button key={tab.id} onClick={() => setMethod(tab.id)}
              className="py-2 px-1 text-[11.5px] font-medium flex flex-col items-center"
              style={{
                background: method === tab.id ? 'var(--accent)' : 'var(--surface)',
                color: method === tab.id ? 'var(--bg)' : 'var(--fg-2)',
              }}>
              <span>{tab.label}</span>
              <span className="text-[9.5px] opacity-70">{tab.hint}</span>
            </button>
          ))}
        </div>

        {/* ───── Subscription — OAuth через PTY ───── */}
        {method === 'subscription' && (
          <>
            {/* Короткая инструкция — свёрнутая по умолчанию */}
            <details className="shrink-0"
              style={{ background: 'var(--accent-light)', borderBottom: '1px solid var(--border)' }}>
              <summary className="px-4 py-2 text-[12.5px] cursor-pointer flex items-center justify-between"
                style={{ listStyle: 'none' }}>
                <span>❓ <b>{t('subInstructionsTitle')}</b> <span style={{ color: 'var(--muted)' }}>{t('subInstructionsSteps')}</span></span>
                <span className="text-[11px]" style={{ color: 'var(--muted)' }}>▾</span>
              </summary>
              <ol className="list-decimal list-inside space-y-0.5 text-[12px] px-4 pb-3 pt-1 leading-snug">
                <li>{t.rich('subStep1', { code: (c) => <code className="font-mono text-[11px]">{c}</code> })}</li>
                <li>{t.rich('subStep2', { b: (c) => <b>{c}</b> })}</li>
                <li>{t.rich('subStep3', { b: (c) => <b>{c}</b> })}</li>
                <li>{t.rich('subStep4', { b: (c) => <b>{c}</b> })}</li>
              </ol>
            </details>

            {/* PTY во весь экран модалки — как было изначально.
                mobileBar=true принудительно: в модалке всегда показываем
                управление (Enter/стрелки/цифры/🔤) независимо от размеров окна. */}
            <div className="flex-1 min-h-0">
              <PtyTerminal
                deviceId={deviceId}
                deviceName={deviceName}
                initialCommand="claude /login"
                mobileBar={true}
                onExit={onClose}
              />
            </div>

            {/* Маленький fallback внизу — если OAuth не подошёл */}
            <details className="shrink-0"
              style={{ borderTop: '1px solid var(--border)', background: 'var(--surface-2)' }}>
              <summary className="px-4 py-2 text-[11.5px] cursor-pointer"
                style={{ color: 'var(--muted)', listStyle: 'none' }}>
                🔧 {t('alternativeTitle')} ▾
              </summary>
              <div className="px-4 py-3 text-[11.5px]" style={{ color: 'var(--fg-2)' }}>
                <div className="mb-2">{t.rich('copyCredsHint', { code: (c) => <code className="font-mono">{c}</code> })}</div>
                <label className="inline-block px-3 py-1.5 rounded-md text-[12px] cursor-pointer mr-2"
                  style={{ background: 'var(--surface)', color: 'var(--fg)', border: '1px solid var(--border)' }}>
                  📂 {t('pickFile')}
                  <input type="file" accept=".json,application/json" hidden
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const text = await file.text();
                      try { JSON.parse(text); }
                      catch { alert(t('alertFileNotJson', { name: file.name })); return; }
                      await streamSSE(`/api/devices/${deviceId}/claude-set-credentials`, { credentials: text });
                      e.target.value = '';
                    }} />
                </label>
                <span className="text-[10.5px]" style={{ color: 'var(--muted)' }}>{t('pathHint')}</span>
                {log && (
                  <div ref={logRef} className="mt-2 rounded p-2 font-mono text-[10.5px] whitespace-pre-wrap max-h-[100px] overflow-y-auto"
                    style={{ background: '#0a0a0a', color: '#e5e7eb' }}>
                    {log}
                  </div>
                )}
              </div>
            </details>
          </>
        )}

        {/* ───── API Key ───── */}
        {method === 'api-key' && (
          <div className="flex-1 overflow-y-auto px-4 pb-4 min-h-0">
            <details className="mb-3 rounded-xl"
              style={{ background: 'var(--accent-light)', border: '1px solid var(--border)' }}>
              <summary className="px-3 py-2 text-[12.5px] cursor-pointer"
                style={{ listStyle: 'none' }}>
                ❓ <b>{t('apiKeyHowTo')}</b> <span style={{ color: 'var(--muted)' }}>▾</span>
              </summary>
              <ol className="list-decimal list-inside space-y-0.5 text-[11.5px] px-3 pb-2 pt-1 leading-snug">
                <li>{t.rich('apiKeyStep1', {
                  link: (c) => <a href="https://console.anthropic.com/settings/keys" target="_blank"
                    className="underline" style={{ color: 'var(--accent)' }}>{c}</a>,
                })}</li>
                <li>{t.rich('apiKeyStep2', { b: (c) => <b>{c}</b> })}</li>
                <li>{t.rich('apiKeyStep3', { code: (c) => <code className="font-mono text-[10.5px]">{c}</code> })}</li>
                <li>{t('apiKeyStep4')}</li>
              </ol>
            </details>

            <label className="block text-[11.5px] mb-1" style={{ color: 'var(--muted)' }}>ANTHROPIC_API_KEY</label>
            <div className="relative">
              <input value={apiKey} onChange={(e) => setApiKey(e.target.value)}
                type={showKey ? 'text' : 'password'}
                placeholder="sk-ant-api03-……"
                spellCheck={false} autoCapitalize="off" autoCorrect="off"
                className="w-full px-3 py-2 pr-16 rounded-lg text-[14px] bg-transparent outline-none font-mono"
                style={{ border: '1px solid var(--border)', color: 'var(--fg)' }} />
              <button type="button" onClick={() => setShowKey(v => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] px-1.5 py-0.5 rounded"
                style={{ background: 'var(--surface-2)', color: 'var(--muted)' }}>
                {showKey ? '🙈' : '👁'}
              </button>
            </div>

            {log && (
              <div ref={logRef} className="mt-3 rounded-lg p-2 font-mono text-[11px] whitespace-pre-wrap max-h-[140px] overflow-y-auto"
                style={{ background: '#0a0a0a', color: '#e5e7eb' }}>
                {log}
              </div>
            )}

            <div className="flex gap-2 mt-4">
              <button onClick={onClose}
                className="flex-1 px-4 py-2.5 rounded-xl text-[14px]"
                style={{ background: 'var(--surface-2)', color: 'var(--fg-2)' }}>
                {t('close')}
              </button>
              <button onClick={saveApiKey} disabled={status === 'saving' || !apiKey.trim()}
                className="flex-1 px-4 py-2.5 rounded-xl text-[14px] font-semibold disabled:opacity-40"
                style={{
                  background: status === 'ok' ? 'var(--ok)' : 'var(--accent)',
                  color: 'var(--bg)',
                }}>
                {status === 'saving' ? t('saving') : status === 'ok' ? t('saved') : t('save')}
              </button>
            </div>
          </div>
        )}

        {/* ───── OAuth (PTY) ───── */}
        {method === 'oauth' && (
          <>
            <div className="px-4 py-2.5 shrink-0 text-[12px] leading-snug"
              style={{ background: '#fef3c7', borderBottom: '1px solid var(--border)', color: '#854d0e' }}>
              ⚠ {t.rich('oauthWarning', { code: (c) => <code className="font-mono">{c}</code> })}
            </div>
            <div className="flex-1 min-h-0">
              <PtyTerminal
                deviceId={deviceId}
                deviceName={deviceName}
                initialCommand="claude auth login"
                onExit={onClose}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
