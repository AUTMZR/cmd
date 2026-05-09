'use client';

import { useState, useRef } from 'react';
import { ExternalLink, Key, Loader2, Sparkles, Check, X } from 'lucide-react';
import { useTranslations } from 'next-intl';

/**
 * Модалка настройки Gemini CLI на устройстве.
 *   1. Install — `npm i -g @google/gemini-cli` через exec на агенте
 *   2. API key — пользователь вставляет, мы пишем в systemd-override + ~/.bashrc
 *
 * SSE-стрим установки/логина показывается в pre-консоли.
 */
export default function GeminiSetupModal({
  deviceId,
  deviceName,
  alreadyInstalled,
  alreadyLoggedIn,
  onClose,
}: {
  deviceId: string;
  deviceName: string;
  alreadyInstalled: boolean;
  alreadyLoggedIn: boolean;
  onClose: () => void;
}) {
  const t = useTranslations('geminiSetup');
  const [tab, setTab] = useState<'install' | 'key'>(alreadyInstalled ? 'key' : 'install');
  const [apiKey, setApiKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [output, setOutput] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  async function streamSse(url: string, body: Record<string, unknown>) {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setBusy(true);
    setDone(false);
    setErr(null);
    setOutput('');
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) {
        const txt = await res.text().catch(() => '');
        throw new Error(`${res.status} ${txt.slice(0, 200)}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      while (true) {
        const { done: streamDone, value } = await reader.read();
        if (streamDone) break;
        buf += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf('\n\n')) >= 0) {
          const chunk = buf.slice(0, idx).trim();
          buf = buf.slice(idx + 2);
          if (!chunk.startsWith('data:')) continue;
          const json = chunk.slice(5).trim();
          try {
            const msg = JSON.parse(json) as { type: string; text?: string; message?: string; code?: number; version?: string };
            if (msg.type === 'out' || msg.type === 'err') setOutput((o) => o + (msg.text || ''));
            else if (msg.type === 'installed') {
              setOutput((o) => o + `\n[✓] ${t('installedLog', { version: msg.version || '' })}\n`);
              setDone(true);
            } else if (msg.type === 'ok') {
              setOutput((o) => o + `\n[✓] ${msg.message}\n`);
              setDone(true);
            } else if (msg.type === 'error' || msg.type === 'failed' || msg.type === 'timeout') {
              throw new Error(msg.message || `exit ${msg.code}`);
            }
          } catch (e) {
            if (json.length > 0) throw e;
          }
        }
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function runInstall() {
    await streamSse(`/api/devices/${deviceId}/gemini-install`, {});
  }

  async function runSetKey() {
    if (!apiKey.trim()) { setErr(t('alertNoKey')); return; }
    await streamSse(`/api/devices/${deviceId}/gemini-set-api-key`, { apiKey: apiKey.trim() });
    if (!err) setApiKey('');  // очищаем поле после успеха
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,.5)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}
    >
      <div className="w-full max-w-lg rounded-2xl flex flex-col overflow-hidden max-h-[90dvh]"
        style={{ background: 'var(--surface)', boxShadow: 'var(--shadow-lg)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center"
              style={{ background: 'var(--accent-light)', color: 'var(--fg)' }}>
              <Sparkles size={18} />
            </div>
            <div>
              <div className="font-semibold text-[15px]">{t('title')}</div>
              <div className="text-[11.5px] font-mono" style={{ color: 'var(--muted)' }}>
                {t('onDevice', { name: deviceName })}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="text-xl" style={{ color: 'var(--muted)' }}>×</button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-3" style={{ borderBottom: '1px solid var(--border)' }}>
          {(['install', 'key'] as const).map((id) => {
            const active = tab === id;
            const label = id === 'install' ? `📥 ${t('tabInstall')}` : `🔑 ${t('tabKey')}`;
            const badge = id === 'install'
              ? (alreadyInstalled ? '✓' : '')
              : (alreadyLoggedIn ? '✓' : '');
            return (
              <button key={id} onClick={() => { setTab(id); setErr(null); setDone(false); setOutput(''); }}
                className="flex-1 px-3 py-2 rounded-lg text-[13px] font-medium flex items-center justify-center gap-1.5"
                style={{
                  background: active ? 'var(--accent)' : 'var(--surface-2)',
                  color: active ? 'var(--bg)' : 'var(--fg-2)',
                }}>
                {label} {badge}
              </button>
            );
          })}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {tab === 'install' && (
            <div className="flex flex-col gap-4">
              <p className="text-[13.5px] leading-[1.5]" style={{ color: 'var(--fg-2)' }}>
                {t.rich('installDescription', { code: (c) => <code className="font-mono">{c}</code> })}
              </p>
              {alreadyInstalled && !done && (
                <div className="text-[12.5px] px-3 py-2 rounded-lg" style={{ background: 'var(--accent-tint)', color: 'var(--fg)' }}>
                  ℹ️ {t('alreadyInstalled')}
                </div>
              )}
              <button onClick={runInstall} disabled={busy}
                className="btn btn-primary flex items-center justify-center gap-2">
                {busy ? <Loader2 size={14} className="animate-spin" /> : '▶'}
                {alreadyInstalled ? t('reinstall') : t('install')}
              </button>
              {done && !err && (
                <div className="text-[12.5px] px-3 py-2 rounded-lg flex items-start gap-2"
                  style={{ background: 'var(--vibrant-tint)', color: 'var(--vibrant)' }}>
                  <Check size={14} className="mt-0.5 shrink-0" />
                  <span>{t('installedHint')}</span>
                </div>
              )}
            </div>
          )}

          {tab === 'key' && (
            <div className="flex flex-col gap-4">
              <p className="text-[13.5px] leading-[1.5]" style={{ color: 'var(--fg-2)' }}>
                {t('keyDescriptionPrefix')}{' '}
                <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-0.5 underline underline-offset-2"
                  style={{ color: 'var(--vibrant)' }}>
                  aistudio.google.com/apikey
                  <ExternalLink size={11} />
                </a>
                {t('keyDescriptionSuffix')}
              </p>
              <div>
                <label className="field-label flex items-center gap-1.5"><Key size={11} />{t('keyLabel')}</label>
                <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)}
                  className="field font-mono text-[13px]"
                  placeholder="AIzaSy..." autoComplete="off" />
                <p className="text-[10.5px] mt-1.5" style={{ color: 'var(--muted)' }}>
                  {t('keyHint')}
                </p>
              </div>
              <button onClick={runSetKey} disabled={busy || !apiKey.trim()}
                className="btn btn-primary flex items-center justify-center gap-2">
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Key size={14} />}
                {t('saveKey')}
              </button>
              {done && !err && (
                <div className="text-[12.5px] px-3 py-2 rounded-lg flex items-start gap-2"
                  style={{ background: 'var(--vibrant-tint)', color: 'var(--vibrant)' }}>
                  <Check size={14} className="mt-0.5 shrink-0" />
                  <span>{t('keySavedHint')}</span>
                </div>
              )}
            </div>
          )}

          {err && (
            <div className="text-[12px] px-3 py-2 rounded-lg flex items-start gap-2 mt-3"
              style={{ background: 'var(--danger-bg)', color: 'var(--danger)' }}>
              <X size={14} className="mt-0.5 shrink-0" />
              <span>{err}</span>
            </div>
          )}

          {/* Output console */}
          {output && (
            <pre className="font-mono text-[11.5px] mt-4 p-3 rounded-lg whitespace-pre-wrap break-all max-h-60 overflow-y-auto"
              style={{ background: '#0a0a0a', color: '#e5e7eb' }}>
              {output}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
