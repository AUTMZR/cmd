'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';

interface Node { name: string; path: string; type: 'file' | 'dir'; size?: number }
interface TreeResp { root: string; relativePath: string; truncated?: boolean; tree: Node[]; error?: string }

interface Props {
  projectId: string;
  onOpenFile?: (relPath: string) => void;
}

export default function FileTree({ projectId, onOpenFile }: Props) {
  const t = useTranslations();
  const [data, setData] = useState<TreeResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [childrenMap, setChildrenMap] = useState<Record<string, Node[]>>({});

  const loadRoot = useCallback(async () => {
    if (!projectId) return;
    setLoading(true); setError('');
    try {
      const r = await fetch(`/api/fs/tree?projectId=${projectId}`);
      const j = await r.json();
      if (!r.ok) { setError(j.error || 'load failed'); setData(null); }
      else setData(j);
    } finally { setLoading(false); }
  }, [projectId]);

  useEffect(() => { loadRoot(); }, [loadRoot]);

  async function loadDir(relPath: string) {
    if (childrenMap[relPath]) return;
    const r = await fetch(`/api/fs/tree?projectId=${projectId}&path=${encodeURIComponent(relPath)}`);
    if (!r.ok) return;
    const j: TreeResp = await r.json();
    setChildrenMap(prev => ({ ...prev, [relPath]: j.tree }));
  }

  async function toggle(relPath: string) {
    const n = new Set(open);
    if (n.has(relPath)) n.delete(relPath); else { n.add(relPath); await loadDir(relPath); }
    setOpen(n);
  }

  function renderNodes(nodes: Node[], depth = 0): React.ReactElement[] {
    const out: React.ReactElement[] = [];
    for (const n of nodes) {
      const isOpen = open.has(n.path);
      out.push(
        <div key={n.path} className="flex items-center gap-1 px-2 py-0.5 rounded text-[12.5px] hover:bg-[var(--surface-hover)]"
          style={{ paddingLeft: 6 + depth * 12 }}>
          {n.type === 'dir' ? (
            <button onClick={() => toggle(n.path)} className="w-3 text-[9px]" style={{ color: 'var(--muted)' }}>
              {isOpen ? '▾' : '▸'}
            </button>
          ) : <span className="w-3" />}
          <span className="text-[10px]">{n.type === 'dir' ? '📁' : '📄'}</span>
          <button
            onClick={() => n.type === 'dir' ? toggle(n.path) : onOpenFile?.(n.path)}
            className="flex-1 text-left truncate font-mono">
            {n.name}
          </button>
        </div>,
      );
      if (n.type === 'dir' && isOpen && childrenMap[n.path]) {
        out.push(...renderNodes(childrenMap[n.path], depth + 1));
      }
    }
    return out;
  }

  if (!projectId) return <div className="p-4 text-xs" style={{ color: 'var(--muted)' }}>{t('app.selectProjectFirst')}</div>;
  if (loading && !data) return <div className="p-4 text-xs" style={{ color: 'var(--muted)' }}>{t('fileEditor.loading')}</div>;
  if (error) return <div className="p-4 text-xs" style={{ color: 'var(--danger)' }}>{error}</div>;
  if (!data) return null;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-1.5" style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="text-[10.5px] font-mono truncate" style={{ color: 'var(--muted)' }}>{data.root}</div>
        <button onClick={loadRoot} className="text-[11px] px-1.5 py-0.5 rounded" style={{ color: 'var(--muted)' }} title={t('device.list.refresh')}>⟳</button>
      </div>
      <div className="flex-1 overflow-auto py-1">
        {data.tree.length === 0 && <div className="px-3 py-2 text-[11px]" style={{ color: 'var(--muted)' }}>{t('device.browser.folderEmpty')}</div>}
        {renderNodes(data.tree)}
        {data.truncated && <div className="px-3 py-1 text-[10px]" style={{ color: 'var(--muted)' }}>{t('device.browser.truncated')}</div>}
      </div>
    </div>
  );
}
