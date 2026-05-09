'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';

interface Props { projectId: string; filePath: string; onClose: () => void }
interface R { path: string; size: number; binary?: boolean; content?: string; error?: string }

export default function FileEditor({ projectId, filePath, onClose }: Props) {
  const t = useTranslations('fileEditor');
  const [file, setFile] = useState<R | null>(null);
  const [content, setContent] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setLoading(true); setErr('');
    fetch(`/api/fs/content?projectId=${projectId}&path=${encodeURIComponent(filePath)}`)
      .then(r => r.json().then(j => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (!ok) { setErr(j.error || 'load error'); return; }
        setFile(j); setContent(j.content || ''); setDirty(false);
      })
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, [projectId, filePath]);

  async function save() {
    setSaving(true); setErr('');
    const r = await fetch('/api/fs/content', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, path: filePath, content }),
    });
    setSaving(false);
    if (!r.ok) { const j = await r.json().catch(() => ({})); setErr(j.error || 'save failed'); return; }
    setDirty(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,.5)', backdropFilter: 'blur(6px)' }} onClick={onClose}>
      <div className="w-full max-w-4xl h-[85dvh] rounded-2xl flex flex-col overflow-hidden"
        style={{ background: 'var(--surface)', boxShadow: '0 8px 24px rgba(0,0,0,.15)' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-3 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2 min-w-0">
            <span>📄</span>
            <span className="text-sm font-mono truncate">{filePath}</span>
            {dirty && <span className="text-xs" style={{ color: 'var(--danger)' }}>● {t('unsaved')}</span>}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={save} disabled={!dirty || saving || file?.binary}
              className="text-xs px-3 py-1.5 btn-primary disabled:opacity-40">
              {saving ? '...' : t('save')}
            </button>
            <button onClick={onClose} className="text-xl" style={{ color: 'var(--muted)' }}>×</button>
          </div>
        </div>
        <div className="flex-1 flex flex-col min-h-0">
          {loading && <div className="p-4 text-sm" style={{ color: 'var(--muted)' }}>{t('loading')}</div>}
          {err && <div className="p-4 text-sm" style={{ color: 'var(--danger)' }}>{err}</div>}
          {file?.binary && (
            <div className="p-6 text-center" style={{ color: 'var(--muted)' }}>
              <p className="text-sm">{t('binaryFile', { size: file.size })}</p>
            </div>
          )}
          {file && !file.binary && (
            <textarea value={content} onChange={e => { setContent(e.target.value); setDirty(true); }}
              spellCheck={false}
              className="flex-1 w-full p-4 outline-none resize-none font-mono text-[13px] bg-transparent"
              style={{ color: 'var(--fg)', lineHeight: 1.5 }} />
          )}
        </div>
      </div>
    </div>
  );
}
