'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';

interface Line { id: number; kind: 'cmd' | 'out' | 'err' | 'exit'; text: string }
interface Props { projectId: string | null }

let seq = 1;

export default function Terminal({ projectId }: Props) {
  const t = useTranslations('terminal');
  const [lines, setLines] = useState<Line[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [hIdx, setHIdx] = useState(-1);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => { scrollRef.current?.scrollTo({ top: 1e9 }); }, [lines]);

  const push = (kind: Line['kind'], text: string) => setLines(prev => [...prev, { id: seq++, kind, text }]);

  const run = useCallback(async (cmd: string) => {
    if (!cmd.trim() || busy) return;
    setBusy(true);
    push('cmd', cmd);
    setHistory(h => [...h, cmd].slice(-50)); setHIdx(-1);
    try {
      const res = await fetch('/api/exec', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, command: cmd }),
      });
      if (!res.ok || !res.body) { push('err', `HTTP ${res.status}`); setBusy(false); return; }
      const reader = res.body.getReader(); const dec = new TextDecoder();
      let buf = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lns = buf.split('\n'); buf = lns.pop() || '';
        for (const raw of lns) {
          const ln = raw.trim();
          if (!ln.startsWith('data:')) continue;
          try {
            const ev = JSON.parse(ln.slice(5).trim());
            if (ev.type === 'out') push('out', ev.text);
            else if (ev.type === 'err') push('err', ev.text);
            else if (ev.type === 'exit') push('exit', `[exit ${ev.code}]`);
          } catch {}
        }
      }
    } catch (e: any) { push('err', e.message || t('errorGeneric')); }
    finally { setBusy(false); }
  }, [busy, projectId]);

  const submit = useCallback(() => {
    const v = input; setInput('');
    if (v.trim() === 'clear') { setLines([]); return; }
    run(v);
  }, [input, run]);

  const prevCmd = useCallback(() => {
    if (!history.length) return;
    const idx = hIdx < 0 ? history.length - 1 : Math.max(0, hIdx - 1);
    setHIdx(idx); setInput(history[idx]);
    inputRef.current?.focus();
  }, [history, hIdx]);

  const nextCmd = useCallback(() => {
    if (hIdx < 0) return;
    const idx = hIdx + 1;
    if (idx >= history.length) { setHIdx(-1); setInput(''); }
    else { setHIdx(idx); setInput(history[idx]); }
    inputRef.current?.focus();
  }, [hIdx, history]);

  const insertToken = useCallback((k: string) => {
    setInput(v => {
      if (k.length > 1) {
        // Многосимвольный токен — отбиваем пробелами с обеих сторон для удобства
        return (v && !v.endsWith(' ') ? v + ' ' : v) + k + ' ';
      }
      return v + k;
    });
    inputRef.current?.focus();
  }, []);

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') { e.preventDefault(); submit(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); prevCmd(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); nextCmd(); }
  }

  return (
    <div className="flex flex-col h-full font-mono" style={{ background: '#0a0a0a', color: '#e5e7eb' }}>
      {/* Mini-toolbar */}
      <div className="flex items-center gap-2 px-3 py-1.5 shrink-0"
        style={{ borderBottom: '1px solid #1a1a1a', background: '#080808' }}>
        <span className="font-mono text-[10.5px] uppercase tracking-[0.1em]" style={{ color: '#6b7280' }}>
          {t('label')}
        </span>
        <span className="font-mono text-[10.5px]" style={{ color: '#4b5563' }}>·</span>
        <span className="font-mono text-[10.5px]" style={{ color: busy ? '#fbbf24' : '#10b981' }}>
          {busy ? t('statusBusy') : t('statusIdle')}
        </span>
        <div className="flex-1" />
        {lines.length > 0 && (
          <button type="button" onClick={() => setLines([])}
            className="font-mono text-[11px] px-2 py-1 rounded hover:bg-[#1a1a1a]"
            style={{ color: '#d4d4aa', border: '1px solid #262626' }}>
            {t('clear')}
          </button>
        )}
      </div>

      {/* Log area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 text-[14px] md:text-[12px] leading-[1.45]">
        {lines.length === 0 && (
          <div className="opacity-70 text-[13px] md:text-[12px] leading-relaxed">
            <div>{t('intro')}</div>
            <div className="mt-2 opacity-80">{t('tryIt')}</div>
            <div className="mt-0.5"><span style={{ color: '#d4d4aa' }}>$</span> ls -la</div>
            <div><span style={{ color: '#d4d4aa' }}>$</span> pwd</div>
            <div><span style={{ color: '#d4d4aa' }}>$</span> git status</div>
            <div className="mt-2 opacity-60">
              {t.rich('mobileHint', {
                up: () => <kbd className="px-1 rounded" style={{ background: '#1a1a1a', border: '1px solid #262626' }}>↑</kbd>,
                down: () => <kbd className="px-1 rounded" style={{ background: '#1a1a1a', border: '1px solid #262626' }}>↓</kbd>,
                run: () => <kbd className="px-1 rounded" style={{ background: '#1a1a1a', border: '1px solid #262626' }}>▶</kbd>,
              })}
            </div>
          </div>
        )}
        {lines.map(l => (
          <div key={l.id} className="whitespace-pre-wrap break-words"
            style={{ color: l.kind === 'err' ? '#fca5a5' : l.kind === 'cmd' ? '#d4d4aa' : l.kind === 'exit' ? '#9ca3af' : '#e5e7eb' }}>
            {l.kind === 'cmd' ? `$ ${l.text}` : l.text.replace(/\n$/, '')}
          </div>
        ))}
      </div>

      {/* Quick-keys bar — только mobile. Спец-символы + навигация по истории. */}
      <div className="md:hidden flex gap-1 px-2 pt-1.5 pb-1 overflow-x-auto shrink-0"
        style={{ borderTop: '1px solid #262626' }}>
        <button type="button" onClick={prevCmd} disabled={!history.length}
          className="shrink-0 w-9 h-9 rounded-md font-mono text-[15px] disabled:opacity-30"
          style={{ background: '#1a1a1a', color: '#d4d4aa', border: '1px solid #262626' }}
          aria-label={t('prevCommand')}>↑</button>
        <button type="button" onClick={nextCmd} disabled={hIdx < 0}
          className="shrink-0 w-9 h-9 rounded-md font-mono text-[15px] disabled:opacity-30"
          style={{ background: '#1a1a1a', color: '#d4d4aa', border: '1px solid #262626' }}
          aria-label={t('nextCommand')}>↓</button>
        <div className="shrink-0 w-px" style={{ background: '#262626' }} />
        {['/', '-', '|', '>', '&&', 'sudo', 'cd ..', 'ls'].map(k => (
          <button key={k} type="button" onClick={() => insertToken(k)}
            className="shrink-0 px-2.5 h-9 rounded-md font-mono text-[13px]"
            style={{ background: '#1a1a1a', color: '#d4d4aa', border: '1px solid #262626' }}>
            {k}
          </button>
        ))}
      </div>

      {/* Input row — $ + поле + большая кнопка Run */}
      <div className="flex items-center p-2 gap-2 shrink-0" style={{ borderTop: '1px solid #262626' }}>
        <span style={{ color: '#d4d4aa' }}>$</span>
        <input ref={inputRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={onKey}
          disabled={busy || !projectId}
          spellCheck={false}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          inputMode="text"
          placeholder={busy ? t('placeholderBusy') : projectId ? t('placeholderCommand') : t('placeholderNoProject')}
          className="flex-1 bg-transparent outline-none text-[16px] md:text-[13px] py-1"
          style={{ color: '#e5e7eb' }} />
        <button type="button" onClick={submit}
          disabled={busy || !input.trim() || !projectId}
          className="shrink-0 h-9 px-3 md:h-7 md:px-2 rounded-md font-mono text-[14px] md:text-[12px] font-semibold disabled:opacity-30"
          style={{ background: '#d4d4aa', color: '#0a0a0a' }}
          aria-label={t('run')}>
          {busy ? '…' : '▶'}
        </button>
      </div>
    </div>
  );
}
