'use client';

import { useEffect, useState } from 'react';
import { Ticket, Plus, Copy, Trash2, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface Invite {
  code: string;
  created_at: string;
  used_by: string | null;
  used_at: string | null;
  expires_at: string | null;
  note: string | null;
}

export default function InvitesPanel() {
  const t = useTranslations('invites');
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [note, setNote] = useState('');
  const [ttlDays, setTtlDays] = useState<string>('30');
  const [showForm, setShowForm] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch('/api/auth/invites');
      if (r.ok) setInvites((await r.json()).invites || []);
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function create() {
    setCreating(true);
    try {
      const body: Record<string, unknown> = {};
      if (note.trim()) body.note = note.trim();
      if (ttlDays && ttlDays !== '0') body.ttlDays = Number(ttlDays);
      const r = await fetch('/api/auth/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (r.ok) {
        setNote(''); setShowForm(false);
        await load();
      } else {
        const j = await r.json().catch(() => ({}));
        alert(j.error || t('errorWithCode', { status: r.status }));
      }
    } finally { setCreating(false); }
  }

  async function revoke(code: string) {
    if (!confirm(t('confirmRevoke', { code }))) return;
    const r = await fetch(`/api/auth/invites?code=${encodeURIComponent(code)}`, { method: 'DELETE' });
    if (r.ok) await load();
  }

  function copy(code: string) {
    const link = `${window.location.origin}/?invite=${code}`;
    try {
      navigator.clipboard.writeText(link);
      setCopied(code);
      setTimeout(() => setCopied(null), 1500);
    } catch {}
  }

  return (
    <div className="p-5" style={{ borderBottom: '1px solid var(--border)' }}>
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs uppercase tracking-wider flex items-center gap-2" style={{ color: 'var(--muted)' }}>
          <Ticket size={12} /> {t('title')}
        </div>
        <button onClick={() => setShowForm(!showForm)} className="text-xs px-3 py-1 rounded-full flex items-center gap-1"
          style={{ background: showForm ? 'var(--accent-light)' : 'var(--accent)', color: showForm ? 'var(--fg)' : 'var(--bg)' }}>
          <Plus size={12} /> {showForm ? t('cancel') : t('newInvite')}
        </button>
      </div>

      {showForm && (
        <div className="rounded-xl p-3 mb-3 flex flex-col gap-2" style={{ border: '1px solid var(--border)', background: 'var(--surface-2)' }}>
          <input value={note} onChange={(e) => setNote(e.target.value)}
            className="field text-sm" placeholder={t('notePlaceholder')} />
          <div className="flex gap-2 items-center">
            <label className="text-[11px]" style={{ color: 'var(--muted)' }}>{t('ttlLabel')}</label>
            <select value={ttlDays} onChange={(e) => setTtlDays(e.target.value)}
              className="field text-xs" style={{ width: 100 }}>
              <option value="1">{t('day1')}</option>
              <option value="7">{t('day7')}</option>
              <option value="30">{t('day30')}</option>
              <option value="365">{t('year1')}</option>
              <option value="0">{t('forever')}</option>
            </select>
            <button onClick={create} disabled={creating}
              className="text-xs px-3 py-1.5 rounded-full ml-auto flex items-center gap-1"
              style={{ background: 'var(--accent)', color: 'var(--bg)' }}>
              {creating && <Loader2 size={11} className="animate-spin" />}
              {t('generate')}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-xs py-3 text-center" style={{ color: 'var(--muted)' }}>{t('loading')}</div>
      ) : invites.length === 0 ? (
        <div className="text-xs py-3 text-center" style={{ color: 'var(--muted)' }}>
          {t('emptyHint')}
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {invites.map(inv => {
            const used = !!inv.used_by;
            const expired = inv.expires_at && new Date(inv.expires_at) < new Date();
            const status = used ? t('statusUsed') : expired ? t('statusExpired') : t('statusActive');
            const statusColor = used ? 'var(--muted)' : expired ? 'var(--danger)' : 'var(--ok)';
            return (
              <div key={inv.code} className="rounded-lg px-3 py-2 flex items-center gap-3"
                style={{ border: '1px solid var(--border)', background: used || expired ? 'var(--surface-2)' : 'transparent' }}>
                <div className="flex-1 min-w-0">
                  <div className="font-mono text-[12px] flex items-center gap-2">
                    <span>{inv.code}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: statusColor, color: '#fff' }}>{status}</span>
                  </div>
                  <div className="text-[10.5px]" style={{ color: 'var(--muted)' }}>
                    {inv.note ? `${inv.note} · ` : ''}
                    {inv.expires_at ? t('untilDate', { date: new Date(inv.expires_at).toLocaleDateString() }) : t('noExpiry')}
                  </div>
                </div>
                {!used && !expired && (
                  <>
                    <button onClick={() => copy(inv.code)} title={t('copyLink')}
                      className="text-xs px-2 py-1 rounded-full"
                      style={{ background: 'var(--accent-light)' }}>
                      {copied === inv.code ? '✓' : <Copy size={11} />}
                    </button>
                    <button onClick={() => revoke(inv.code)} title={t('revoke')}
                      className="text-xs px-2 py-1 rounded-full"
                      style={{ background: 'var(--accent-light)', color: 'var(--danger)' }}>
                      <Trash2 size={11} />
                    </button>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
