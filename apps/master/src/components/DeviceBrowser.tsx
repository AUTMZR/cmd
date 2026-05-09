'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';

interface Entry { name: string; path: string; type: 'dir' | 'file'; size?: number }
interface Resp {
  device: string;
  path: string;
  parent: string | null;
  roots: string[];
  entries: Entry[];
  error?: string;
  truncated?: boolean;
}
interface SearchResult {
  results: string[];
  timed_out?: boolean;
}

interface Props {
  deviceId: string;
  deviceName: string;
  /** Если задан — открываем сразу эту папку, а не корни */
  initialPath?: string | null;
  onClose: () => void;
  /** Вернуть выбранную папку — для создания проекта */
  onPick?: (path: string) => void;
  /** Embedded-режим — без модалки/хедера, для вложения в другой контейнер.
   *  В embedded-режиме также спрятана кнопка «+ папка» — создание отдаётся родителю. */
  embedded?: boolean;
  /** Подпись для CTA-кнопки (по умолчанию «Выбрать эту папку»). */
  pickLabel?: string;
}

export default function DeviceBrowser({ deviceId, deviceName, initialPath, onClose, onPick, embedded = false, pickLabel }: Props) {
  const t = useTranslations('device.browser');
  const effectivePickLabel = pickLabel ?? t('pickThisFolder');
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');

  // search
  const [q, setQ] = useState('');
  const [deepResults, setDeepResults] = useState<SearchResult | null>(null);
  const [deepLoading, setDeepLoading] = useState(false);

  async function load(path: string | null) {
    setLoading(true); setError(''); setDeepResults(null); setQ('');
    const url = path
      ? `/api/devices/${deviceId}/browse?path=${encodeURIComponent(path)}`
      : `/api/devices/${deviceId}/browse`;
    const r = await fetch(url);
    const j = await r.json();
    setLoading(false);
    if (!r.ok) { setError(j.error || t('errorGeneric')); return; }
    setData(j);
  }

  useEffect(() => { load(initialPath || null); }, [deviceId, initialPath]); // eslint-disable-line

  async function createFolder() {
    if (!data?.path || !newName.trim()) return;
    const r = await fetch(`/api/devices/${deviceId}/mkdir`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: data.path, name: newName.trim() }),
    });
    if (!r.ok) { const j = await r.json().catch(() => ({})); alert(j.error); return; }
    setShowCreate(false); setNewName('');
    await load(data.path);
  }

  async function deepSearch() {
    if (!data || !q.trim()) return;
    setDeepLoading(true); setDeepResults(null); setError('');
    // Если уже в папке — ищем в ней. Если на экране корней — бегаем по всем корням параллельно.
    const paths = data.path ? [data.path] : (data.roots || []);
    if (paths.length === 0) { setDeepLoading(false); return; }
    try {
      const replies = await Promise.all(paths.map(p =>
        fetch(`/api/devices/${deviceId}/find?path=${encodeURIComponent(p)}&q=${encodeURIComponent(q.trim())}&kind=dir`)
          .then(r => r.json()).catch(() => ({ results: [], timed_out: true }))
      ));
      const all: string[] = [];
      let timed = false;
      for (const j of replies) {
        if (j.error) { setError(j.error); break; }
        for (const p of (j.results || [])) all.push(p);
        if (j.timed_out) timed = true;
      }
      setDeepResults({ results: Array.from(new Set(all)).slice(0, 300), timed_out: timed });
    } finally {
      setDeepLoading(false);
    }
  }

  const breadcrumbs: Array<{ label: string; path: string }> = [];
  if (data?.path) {
    const parts = data.path.split('/').filter(Boolean);
    let acc = '';
    for (const p of parts) { acc += '/' + p; breadcrumbs.push({ label: p, path: acc }); }
  }

  // Локальный instant-фильтр для entries по текущей папке
  const filteredEntries = (data?.entries || []).filter(e =>
    !q.trim() || e.name.toLowerCase().includes(q.trim().toLowerCase())
  );

  const inner = (
    <>
      {!embedded && (
        <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
          <div>
            <div className="text-sm font-semibold">🖥 {deviceName}</div>
            <div className="text-[11px]" style={{ color: 'var(--muted)' }}>{t('subtitle')}</div>
          </div>
          <button onClick={onClose} className="text-xl" style={{ color: 'var(--muted)' }}>×</button>
        </div>
      )}

      {/* crumbs */}
        <div className="px-5 py-2 flex items-center gap-1 text-xs overflow-x-auto whitespace-nowrap"
          style={{ borderBottom: '1px solid var(--border)', color: 'var(--muted)' }}>
          <button onClick={() => load(null)} className="hover:underline">{t('roots')}</button>
          {breadcrumbs.map((b, i) => (
            <span key={b.path} className="flex items-center gap-1">
              <span>/</span>
              <button onClick={() => load(b.path)} className="hover:underline font-mono"
                style={{ color: i === breadcrumbs.length - 1 ? 'var(--fg)' : 'var(--muted)' }}>{b.label}</button>
            </span>
          ))}
        </div>

        {/* search input — всегда доступен (в папке фильтрует имена, на корнях — ищет во всех) */}
        {data && (
          <div className="px-5 py-2 flex items-center gap-2" style={{ borderBottom: '1px solid var(--border)' }}>
            <span className="font-mono text-[13px]" style={{ color: 'var(--muted)' }}>⌕</span>
            <input value={q}
              onChange={e => { setQ(e.target.value); setDeepResults(null); }}
              onKeyDown={e => {
                if (e.key === 'Enter') { e.preventDefault(); deepSearch(); }
                if (e.key === 'Escape') { setQ(''); setDeepResults(null); }
              }}
              placeholder={data.path ? t('searchInFolder') : t('searchAllRoots')}
              className="flex-1 bg-transparent outline-none text-sm font-mono placeholder:opacity-50" />
            {q && (
              <button onClick={() => { setQ(''); setDeepResults(null); }}
                className="text-[11px] font-mono" style={{ color: 'var(--muted)' }}>{t('clear')}</button>
            )}
            {q && !deepResults && (
              <button onClick={deepSearch} disabled={deepLoading}
                className="text-[11px] px-2 py-1 rounded-md font-mono"
                style={{ background: 'var(--accent)', color: 'var(--bg)' }}>
                {deepLoading ? '…' : t('findAction')}
              </button>
            )}
          </div>
        )}

        {/* list */}
        <div className="flex-1 overflow-y-auto">
          {loading && <div className="p-4 text-xs" style={{ color: 'var(--muted)' }}>{t('loading')}</div>}
          {error && <div className="p-4 text-xs" style={{ color: 'var(--danger)' }}>{error}</div>}

          {/* roots (path empty) */}
          {data && !data.path && !deepResults && (
            <div className="p-2">
              <div className="px-3 py-1 text-[10px] uppercase tracking-wider" style={{ color: 'var(--muted)' }}>
                {q ? t('rootsFilter', { q }) : t('rootsTitle')}
              </div>
              {data.roots.filter(r => !q.trim() || r.toLowerCase().includes(q.trim().toLowerCase())).map(r => (
                <button key={r} onClick={() => load(r)}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-[var(--surface-hover)] flex items-center gap-2">
                  <span>📁</span><span className="font-mono text-sm">{r}</span>
                </button>
              ))}
              {q && !deepResults && (
                <div className="px-3 py-2 text-[11px]" style={{ color: 'var(--muted)' }}>
                  {t('enterToSearchRoots')}
                </div>
              )}
            </div>
          )}

          {/* deep-search results */}
          {data && deepResults && (
            <div className="p-1">
              <div className="px-4 py-2 flex items-center gap-2 text-[11px] font-mono" style={{ color: 'var(--muted)' }}>
                <span>{t('found', { count: deepResults.results.length })}{deepResults.timed_out ? ` ${t('truncated')}` : ''}</span>
                <span>·</span>
                <span>{t('searchIn', { path: data.path || (data.roots || []).join(', ') || t('inRoots') })}</span>
              </div>
              {deepResults.results.length === 0 && (
                <div className="px-4 py-3 text-xs" style={{ color: 'var(--muted)' }}>
                  {t('noResults')}
                </div>
              )}
              {deepResults.results.map(p => {
                const rel = data.path && p.startsWith(data.path) ? p.slice(data.path.length).replace(/^\//, '') : p;
                return (
                  <button key={p} onClick={() => load(p)}
                    className="w-full text-left px-4 py-1.5 flex items-center gap-2 text-sm hover:bg-[var(--surface-hover)]">
                    <span>📁</span>
                    <span className="font-mono truncate flex-1" title={p}>{rel || p}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* browse current folder */}
          {data?.path && !deepResults && (
            <div className="p-1">
              {data.parent !== null && !q && (
                <button onClick={() => load(data.parent!)}
                  className="w-full text-left px-4 py-1.5 flex items-center gap-2 hover:bg-[var(--surface-hover)] text-sm">
                  <span>↰</span><span className="font-mono" style={{ color: 'var(--muted)' }}>..</span>
                </button>
              )}
              {filteredEntries.length === 0 && !showCreate && (
                <div className="px-4 py-3 text-xs" style={{ color: 'var(--muted)' }}>
                  {q ? t('emptyHintWithQuery') : t('folderEmpty')}
                </div>
              )}
              {filteredEntries.map(e => (
                <button key={e.path} onClick={() => e.type === 'dir' && load(e.path)}
                  className={`w-full text-left px-4 py-1.5 flex items-center gap-2 text-sm ${e.type === 'dir' ? 'hover:bg-[var(--surface-hover)] cursor-pointer' : 'cursor-default'}`}
                  style={{ color: e.type === 'file' ? 'var(--muted)' : undefined }}>
                  <span>{e.type === 'dir' ? '📁' : '📄'}</span>
                  <span className="font-mono truncate flex-1">{e.name}</span>
                  {e.type === 'file' && e.size != null && (
                    <span className="text-[10px]" style={{ color: 'var(--muted)' }}>{fmtSize(e.size)}</span>
                  )}
                </button>
              ))}
              {showCreate && !embedded && (
                <div className="px-4 py-2 flex items-center gap-2">
                  <span>📁</span>
                  <input autoFocus value={newName} onChange={e => setNewName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') createFolder(); if (e.key === 'Escape') setShowCreate(false); }}
                    placeholder={t('folderNamePlaceholder')} className="flex-1 bg-transparent outline-none text-sm font-mono border-b"
                    style={{ borderColor: 'var(--border)' }} />
                  <button onClick={createFolder} className="text-xs px-2 py-1 rounded"
                    style={{ background: 'var(--accent)', color: 'var(--bg)' }}>OK</button>
                </div>
              )}
              {data.truncated && <div className="px-4 py-2 text-xs" style={{ color: 'var(--muted)' }}>{t('manyFilesTruncated')}</div>}
            </div>
          )}
        </div>

        {/* footer */}
        <div className="px-5 py-3 flex items-center gap-2 flex-wrap" style={{ borderTop: '1px solid var(--border)' }}>
          {data?.path ? (
            <>
              {!embedded && (
                <button onClick={() => setShowCreate(!showCreate)}
                  className="text-xs px-3 py-1.5 rounded-full" style={{ background: 'var(--accent-light)' }}>{t('newFolder')}</button>
              )}
              <div className="flex-1" />
              <div className="text-[11px] truncate font-mono" style={{ color: 'var(--muted)' }}>{data.path}</div>
              {onPick && (
                <button onClick={() => onPick(data.path)}
                  className="text-xs px-3 py-1.5 rounded-full"
                  style={{ background: 'var(--accent)', color: 'var(--bg)' }}>
                  {effectivePickLabel}
                </button>
              )}
            </>
          ) : (
            <div className="text-[11px]" style={{ color: 'var(--muted)' }}>{t('pickRoot')}</div>
          )}
        </div>
    </>
  );

  if (embedded) {
    return (
      <div className="flex flex-col h-[55dvh] min-h-[320px] rounded-xl overflow-hidden"
        style={{ border: '1px solid var(--border)', background: 'var(--surface-2)' }}>
        {inner}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,.5)', backdropFilter: 'blur(6px)' }} onClick={onClose}>
      <div className="w-full max-w-xl h-[80dvh] rounded-2xl flex flex-col overflow-hidden"
        style={{ background: 'var(--surface)', boxShadow: '0 8px 24px rgba(0,0,0,.15)' }}
        onClick={e => e.stopPropagation()}>
        {inner}
      </div>
    </div>
  );
}

function fmtSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
