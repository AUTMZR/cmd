'use client';

/**
 * Модалка установки Claude CLI на устройстве.
 * Стримит вывод `npm install -g @anthropic-ai/claude-code` (или curl-installer)
 * через SSE-endpoint /api/devices/:id/claude-install.
 */
import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';

interface Props {
  deviceId: string;
  deviceName: string;
  onClose: () => void;
  onInstalled?: (version: string) => void;
}

type Status = 'idle' | 'running' | 'installed' | 'failed' | 'timeout';

export default function ClaudeInstallModal({ deviceId, deviceName, onClose, onInstalled }: Props) {
  const t = useTranslations('claudeInstall');
  const [status, setStatus] = useState<Status>('idle');
  const [version, setVersion] = useState<string>('');
  const [log, setLog] = useState<string>('');
  const logRef = useRef<HTMLDivElement | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const controller = new AbortController();

    (async () => {
      setStatus('running');
      try {
        const res = await fetch(`/api/devices/${deviceId}/claude-install`, {
          method: 'POST', signal: controller.signal,
        });
        if (!res.ok || !res.body) {
          setStatus('failed');
          setLog(l => l + `HTTP ${res.status}\n`);
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
              if (ev.type === 'out' || ev.type === 'err') {
                setLog(l => l + ev.text);
              } else if (ev.type === 'exit') {
                setLog(l => l + `\n[process exit ${ev.code}]\n`);
              } else if (ev.type === 'installed') {
                setStatus('installed');
                setVersion(ev.version);
                if (onInstalled) onInstalled(ev.version);
              } else if (ev.type === 'failed') {
                setStatus('failed');
              } else if (ev.type === 'timeout') {
                setStatus('timeout');
              }
            } catch {}
          }
        }
      } catch (e) {
        if ((e as Error).name !== 'AbortError') {
          setLog(l => l + `\n[error] ${(e as Error).message}\n`);
          setStatus('failed');
        }
      }
    })();

    return () => controller.abort();
  }, [deviceId]); // eslint-disable-line

  useEffect(() => { logRef.current?.scrollTo({ top: 1e9 }); }, [log]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,.5)', backdropFilter: 'blur(6px)' }}
      onClick={() => status !== 'running' && onClose()}>
      <div className="w-full max-w-md max-h-[85dvh] rounded-2xl flex flex-col overflow-hidden"
        style={{ background: 'var(--surface)', boxShadow: '0 8px 24px rgba(0,0,0,.2)' }}
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 shrink-0"
          style={{ borderBottom: '1px solid var(--border)' }}>
          <div>
            <h3 className="text-base font-semibold">{t('title')}</h3>
            <div className="text-[11.5px] font-mono" style={{ color: 'var(--muted)' }}>
              {t('onDevicePrefix')} <b>{deviceName}</b>
            </div>
          </div>
          <button onClick={onClose} disabled={status === 'running'}
            className="text-xl disabled:opacity-30"
            style={{ color: 'var(--muted)' }}>×</button>
        </div>

        {/* Status */}
        <div className="px-5 py-3 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
          {status === 'running' && (
            <div className="flex items-center gap-2 text-[13px]">
              <div className="w-3 h-3 rounded-full animate-pulse" style={{ background: 'var(--warn)' }} />
              <span>{t('installing')}</span>
            </div>
          )}
          {status === 'installed' && (
            <div className="flex items-center gap-2 text-[13px]" style={{ color: 'var(--ok)' }}>
              <span>✓ {t('installed', { version })}</span>
            </div>
          )}
          {status === 'failed' && (
            <div className="flex items-center gap-2 text-[13px]" style={{ color: 'var(--danger)' }}>
              <span>✗ {t('failed')}</span>
            </div>
          )}
          {status === 'timeout' && (
            <div className="flex items-center gap-2 text-[13px]" style={{ color: 'var(--warn)' }}>
              <span>⏱ {t('timeout')}</span>
            </div>
          )}
        </div>

        {/* Log */}
        <div ref={logRef} className="flex-1 overflow-y-auto p-3 font-mono text-[11.5px] whitespace-pre-wrap"
          style={{ background: '#0a0a0a', color: '#e5e7eb', minHeight: 200 }}>
          {log || '...'}
        </div>

        {/* Footer */}
        <div className="flex gap-2 px-5 py-3 shrink-0" style={{ borderTop: '1px solid var(--border)' }}>
          {status === 'installed' && (
            <div className="text-[12px] flex-1" style={{ color: 'var(--muted)' }}>
              {t('nextStep')}
            </div>
          )}
          {status === 'failed' && (
            <div className="text-[12px] flex-1" style={{ color: 'var(--muted)' }}>
              {t('failedHint')}
            </div>
          )}
          <button onClick={onClose} disabled={status === 'running'}
            className="text-[13px] px-4 py-1.5 rounded-full disabled:opacity-30"
            style={{ background: 'var(--accent)', color: 'var(--bg)' }}>
            {status === 'running' ? '...' : t('close')}
          </button>
        </div>
      </div>
    </div>
  );
}
