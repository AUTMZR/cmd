'use client';

/**
 * Модалка для повторной выдачи connect-команды офлайн-устройству.
 *
 * Зачем: когда юзер добавил устройство через DeviceAddModal, увидел QR/curl,
 * но не успел запустить команду на сервере и закрыл окно — токен в БД
 * хранится только хэшем и оригинал восстановить нельзя. Эта модалка вызывает
 * /reissue-token (свежий токен), показывает QR + curl + copy, поллит /api/devices
 * пока агент не выйдет онлайн.
 */

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import QRCode from 'qrcode';

interface Props {
  deviceId: string;
  deviceName: string;
  onClose: () => void;
  /** Вызывается когда агент вышел онлайн — родитель обычно делает onReload(). */
  onConnected?: () => void;
}

export default function DeviceReconnectModal({ deviceId, deviceName, onClose, onConnected }: Props) {
  const t = useTranslations('device.reconnect');
  const td = useTranslations('device.add');
  const [cmd, setCmd] = useState<{ connect_cmd: string; token: string } | null>(null);
  const [qrSvg, setQrSvg] = useState('');
  const [copied, setCopied] = useState(false);
  const [online, setOnline] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const requested = useRef(false);

  // Один раз дёргаем reissue при открытии (StrictMode safe).
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

  // Поллинг online-статуса через /api/devices.
  useEffect(() => {
    if (!cmd || online) return;
    const t = setInterval(async () => {
      try {
        const r = await fetch('/api/devices');
        if (!r.ok) return;
        const { devices } = await r.json();
        const d = devices.find((x: any) => x.id === deviceId);
        if (d?.online) { setOnline(true); clearInterval(t); onConnected?.(); }
      } catch {}
    }, 2000);
    return () => clearInterval(t);
  }, [cmd, online, deviceId, onConnected]);

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
