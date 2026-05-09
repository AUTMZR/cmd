'use client';

/**
 * PtyTerminal — настоящий интерактивный терминал на xterm.js.
 *
 * Связь: WebSocket /ws/pty?device=X&cwd=Y&cols=C&rows=R.
 * Master проксирует байты к агенту (node-pty → bash -il).
 * Каждый таб = одна живая сессия. При закрытии таба shell убивается.
 */

import { useEffect, useRef, useState } from 'react';
import type { Terminal as XTerm } from '@xterm/xterm';
import type { FitAddon as FitAddonT } from '@xterm/addon-fit';
import { useTranslations } from 'next-intl';
import '@xterm/xterm/css/xterm.css';

interface Props {
  deviceId: string;
  deviceName: string;
  cwd?: string;
  /** Показывать мобильный бар с Ctrl/Esc/Tab/стрелками. Если undefined — авто по ширине. */
  mobileBar?: boolean;
  onExit?: () => void;
  /**
   * Если задано — сразу после открытия сессии шлём эти байты + '\n'.
   * Используется для авто-запуска `claude auth login` в модалке логина.
   */
  initialCommand?: string;
}

type Status = 'connecting' | 'ready' | 'error' | 'closed';

export default function PtyTerminal({ deviceId, deviceName, cwd, mobileBar, onExit, initialCommand }: Props) {
  const t = useTranslations('pty');
  const hostRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<XTerm | null>(null);
  const fitRef = useRef<FitAddonT | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState<Status>('connecting');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [ctrlArmed, setCtrlArmed] = useState(false); // «sticky» Ctrl — следующая клавиша с Ctrl

  // Mobile-detect по ширине, если не задано явно.
  const [isMobile, setIsMobile] = useState(false);
  const [pasteModalOpen, setPasteModalOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  /** Список найденных в буфере URL'ов (auto-detected). */
  const [urls, setUrls] = useState<string[]>([]);
  const [urlCopied, setUrlCopied] = useState<string | null>(null);
  const rawBufferRef = useRef<string>('');
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);
  const showMobileBar = mobileBar ?? isMobile;

  useEffect(() => {
    let destroyed = false;
    let term: XTerm | null = null;
    let fit: FitAddonT | null = null;
    let ws: WebSocket | null = null;
    let resizeObs: ResizeObserver | null = null;
    let urlScanTimer: ReturnType<typeof setTimeout> | null = null;

    /** Сырой текстовый буфер последних ~32KB от PTY (до того как xterm wrap'нул).
     *  В нём URL приходит как **одна строка** — никаких visual-line-break'ов нет.
     *  ANSI escape-коды стрипаем regex'ом перед поиском. */
    let rawBuffer = '';
    const appendRaw = (chunk: string) => {
      rawBuffer += chunk;
      if (rawBuffer.length > 32_000) rawBuffer = rawBuffer.slice(-32_000);
      // Также пишем в ref чтобы Debug-кнопка из toolbar могла прочесть
      rawBufferRef.current = rawBuffer;
    };

    const extractUrls = (): string[] => {
      // Стрипаем ANSI escape во всех вариантах:
      const stripped = rawBuffer
        // OSC (Operating System Command): \x1b]…\x07 или \x1b]…\x1b\\
        .replace(/\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)/g, '')
        // CSI (Control Sequence Introducer): \x1b[…любая_буква
        .replace(/\u001b\[[0-9;?<>!]*[a-zA-Z]/g, '')
        // ESC + одиночный символ (charset, keypad, save/restore cursor и т.п.)
        .replace(/\u001b[()*+\-./][a-zA-Z0-9]/g, '')
        .replace(/\u001b[=>]/g, '')
        // DCS \x1bP…\x1b\\
        .replace(/\u001bP[^\u001b]*\u001b\\/g, '')
        // Все остальные control-chars кроме \t \n \r
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
        // \r без \n считаем за \n
        .replace(/\r\n?/g, '\n');

      // Идём по строкам. Как только встретили строку с https:// —
      // начинаем собирать URL. Склеиваем все последующие строки, которые
      // состоят ТОЛЬКО из URL-валидных символов (без пробелов), до первого
      // пробела/пустой строки/переноса.
      const URL_CHAR = /^[a-zA-Z0-9\-_.~!*'();:@&=+$,/?#%[\]]+$/;
      const lines = stripped.split('\n');
      const collected: string[] = [];
      let current: string | null = null;

      // Счётчик подряд идущих "пустых" строк во время сбора — даём 2 lookahead на blank,
      // чтобы пережить претерпеть PTY-double-spacing между wrap-строками URL.
      let blankInRow = 0;
      const FLUSH_AFTER_BLANK = 2; // если 2+ blank подряд после URL — закрываем URL

      for (const raw of lines) {
        const line = raw.trim();

        if (current) {
          if (line === '') {
            blankInRow++;
            if (blankInRow > FLUSH_AFTER_BLANK) {
              collected.push(current);
              current = null;
              blankInRow = 0;
            }
            continue;
          }
          // Продолжение URL? Без пробелов внутри + только URL-символы.
          if (!/\s/.test(line) && URL_CHAR.test(line)) {
            current += line;
            blankInRow = 0;
            continue;
          }
          // Не URL — закрываем накопленное.
          collected.push(current);
          current = null;
          blankInRow = 0;
        }

        // Ищем https:// в текущей строке.
        const idx = line.search(/https?:\/\//);
        if (idx >= 0) {
          const tail = line.slice(idx);
          const spaceIdx = tail.search(/\s/);
          const urlStart = spaceIdx >= 0 ? tail.slice(0, spaceIdx) : tail;
          current = urlStart;
          blankInRow = 0;
          if (spaceIdx >= 0) {
            collected.push(current);
            current = null;
          }
        }
      }
      if (current) collected.push(current);

      // Чистим хвостовые знаки пунктуации, фильтруем короткие, дедуплицируем.
      const cleaned = collected
        .map(u => u.replace(/[.,;:)\]}!?]+$/, ''))
        .filter(u => /^https?:\/\//.test(u) && u.length > 20);
      return Array.from(new Set(cleaned)).slice(-5);
    };

    const scheduleUrlScan = () => {
      if (urlScanTimer) clearTimeout(urlScanTimer);
      urlScanTimer = setTimeout(() => {
        if (destroyed) return;
        const found = extractUrls();
        setUrls(prev => {
          // Обновляем только если набор реально изменился
          if (prev.length === found.length && prev.every((u, i) => u === found[i])) return prev;
          return found;
        });
      }, 250);
    };

    (async () => {
      // Динамический импорт — xterm только на клиенте
      const [{ Terminal }, { FitAddon }, { WebLinksAddon }] = await Promise.all([
        import('@xterm/xterm'),
        import('@xterm/addon-fit'),
        import('@xterm/addon-web-links'),
      ]);
      if (destroyed) return;

      term = new Terminal({
        fontFamily: 'JetBrainsMono-Regular, "JetBrains Mono", Menlo, Consolas, "Liberation Mono", monospace',
        fontSize: 13,
        lineHeight: 1.2,
        cursorBlink: true,
        allowTransparency: false,
        scrollback: 2000,
        // Позволить обычный touch-scroll на мобилах (без этого xterm блокирует
        // свайпы, буфер прокрутки недоступен пальцем)
        scrollOnUserInput: true,
        altClickMovesCursor: false,
        theme: {
          background: '#0a0a0a',
          foreground: '#e5e7eb',
          cursor: '#d4d4aa',
          cursorAccent: '#0a0a0a',
          selectionBackground: '#3c3a2a',
          black: '#1a1a1a', red: '#f87171', green: '#86efac', yellow: '#fde047',
          blue: '#93c5fd', magenta: '#f0abfc', cyan: '#67e8f9', white: '#e5e7eb',
          brightBlack: '#6b7280', brightRed: '#fca5a5', brightGreen: '#bbf7d0',
          brightYellow: '#fef08a', brightBlue: '#bfdbfe', brightMagenta: '#f5d0fe',
          brightCyan: '#a5f3fc', brightWhite: '#f9fafb',
        },
      });
      fit = new FitAddon();
      term.loadAddon(fit);
      term.loadAddon(new WebLinksAddon());

      if (!hostRef.current) return;
      term.open(hostRef.current);
      try { fit.fit(); } catch {}

      termRef.current = term;
      fitRef.current = fit;

      // Коннект WS
      const cols = term.cols || 80;
      const rows = term.rows || 24;
      const qs = new URLSearchParams();
      qs.set('device', deviceId);
      if (cwd) qs.set('cwd', cwd);
      qs.set('cols', String(cols));
      qs.set('rows', String(rows));
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      ws = new WebSocket(`${proto}//${window.location.host}/ws/pty?${qs.toString()}`);
      wsRef.current = ws;

      ws.onopen = () => {
        // Heartbeat — раз в 45s шлём ws-ping. Нужно чтобы nginx (proxy_read_timeout 300s)
        // не рвал тихий коннект (когда пользователь открыл терминал и не трогает).
        const pingTimer = setInterval(() => {
          if (!ws || ws.readyState !== WebSocket.OPEN) { clearInterval(pingTimer); return; }
          try { ws.send(JSON.stringify({ type: '__ping' })); } catch {}
        }, 45_000);
        // Stash для очистки при destroy
        (ws as any).__pingTimer = pingTimer;
      };

      ws.onmessage = (ev) => {
        if (destroyed) return;
        try {
          const m = JSON.parse(ev.data);
          if (m.type === 'pty.opened') {
            setStatus('ready');
            // Фокусируемся на xterm только на desktop. На iOS это сразу
            // поднимет экранную клавиатуру — юзер работает через quick-bar,
            // keyboard будет только мешать.
            if (window.innerWidth >= 768) term!.focus();
            // Авто-запуск начальной команды (например, `claude auth login`).
            // Небольшая задержка чтобы shell успел отрисовать prompt.
            if (initialCommand && ws && ws.readyState === WebSocket.OPEN) {
              setTimeout(() => {
                try {
                  const cmd = initialCommand + '\n';
                  ws!.send(JSON.stringify({
                    type: 'pty.data',
                    data: btoa(unescape(encodeURIComponent(cmd))),
                  }));
                } catch {}
              }, 300);
            }
          } else if (m.type === 'pty.data') {
            const raw = atob(m.data);
            // byte-safe UTF-8 decode
            const bytes = new Uint8Array(raw.length);
            for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
            const decoded = new TextDecoder('utf-8').decode(bytes);
            term!.write(decoded);
            // Параллельно копим в raw-буфер для URL-детектора (без ANSI и без xterm wrap)
            appendRaw(decoded);
            scheduleUrlScan();
          } else if (m.type === 'pty.exit') {
            setStatus('closed');
            term!.write(`\r\n\x1b[90m${t('exitedCode', { code: m.code })}\x1b[0m\r\n`);
          } else if (m.type === 'pty.error') {
            setStatus('error');
            setErrorMsg(m.message || t('errorGeneric'));
            if (m.code === 'missing_node_pty') {
              term!.write(
                `\r\n\x1b[31m${t('nodePtyMissing')}\x1b[0m\r\n` +
                `\x1b[90m${t('runOnServer')}\x1b[0m\r\n` +
                '  \x1b[33msudo npm install -g node-pty\x1b[0m\r\n' +
                `\x1b[90m${t('restartAgent')}\x1b[0m\r\n`,
              );
            } else {
              term!.write(`\r\n\x1b[31m✗ ${m.message}\x1b[0m\r\n`);
            }
          }
        } catch {}
      };

      ws.onclose = () => {
        if (destroyed) return;
        setStatus((s) => s === 'error' ? s : 'closed');
      };

      ws.onerror = () => {
        if (destroyed) return;
        setStatus('error');
        setErrorMsg(t('connectFailed'));
      };

      // Ввод пользователя → base64 → в WS
      term.onData((data) => {
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'pty.data', data: btoa(unescape(encodeURIComponent(data))) }));
        }
      });

      // Cmd+V / Ctrl+V — читаем clipboard и шлём. Перехватываем keyEvent до того
      // как xterm интерпретирует его как обычный ввод литерала 'v'.
      term.attachCustomKeyEventHandler((ev) => {
        if (ev.type !== 'keydown') return true;
        const isPaste =
          (ev.key === 'v' || ev.key === 'V') &&
          (ev.metaKey || ev.ctrlKey) && !ev.shiftKey && !ev.altKey;
        if (!isPaste) return true;
        navigator.clipboard.readText().then((text) => {
          if (text && ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              type: 'pty.data',
              data: btoa(unescape(encodeURIComponent(text))),
            }));
          }
        }).catch(() => {});
        return false;
      });

      // Отправка resize на сервер когда terminal меняет размер
      let lastSize = `${term.cols}x${term.rows}`;
      term.onResize(({ cols, rows }) => {
        const key = `${cols}x${rows}`;
        if (key === lastSize) return;
        lastSize = key;
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'pty.resize', cols, rows }));
        }
      });

      // Подгоняем terminal к размеру контейнера
      const doFit = () => {
        if (!fit || !term) return;
        try { fit.fit(); } catch {}
      };
      resizeObs = new ResizeObserver(doFit);
      if (hostRef.current) resizeObs.observe(hostRef.current);
      window.addEventListener('resize', doFit);
    })();

    return () => {
      destroyed = true;
      try { resizeObs?.disconnect(); } catch {}
      try {
        const t = (ws as any)?.__pingTimer;
        if (t) clearInterval(t);
      } catch {}
      try { if (urlScanTimer) clearTimeout(urlScanTimer); } catch {}
      try { ws?.close(); } catch {}
      try { term?.dispose(); } catch {}
      termRef.current = null;
      fitRef.current = null;
      wsRef.current = null;
    };
  }, [deviceId, cwd, initialCommand]);

  // Уведомление наружу когда сессия закрылась (для UI, например переход назад).
  useEffect(() => {
    if ((status === 'closed' || status === 'error') && onExit) {
      const t = setTimeout(onExit, 800);
      return () => clearTimeout(t);
    }
  }, [status, onExit]);

  function sendKey(data: string): boolean {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      console.warn('[pty] ws not open, cannot send', { readyState: ws?.readyState });
      return false;
    }
    // Большие вставки (URL, многоразмерные пасты) дробим на чанки —
    // чтобы PTY не перегружался и shell успевал echo'ить.
    const CHUNK = 200;
    if (data.length <= CHUNK) {
      ws.send(JSON.stringify({ type: 'pty.data', data: btoa(unescape(encodeURIComponent(data))) }));
    } else {
      let i = 0;
      const sendNext = () => {
        if (!ws || ws.readyState !== WebSocket.OPEN) return;
        const slice = data.slice(i, i + CHUNK);
        ws.send(JSON.stringify({ type: 'pty.data', data: btoa(unescape(encodeURIComponent(slice))) }));
        i += CHUNK;
        if (i < data.length) setTimeout(sendNext, 15);
      };
      sendNext();
    }
    // NB: term.focus() сознательно НЕ вызываем — на iOS это поднимает
    // экранную клавиатуру каждый раз когда юзер тапает quick-bar. На
    // desktop xterm получает фокус при обычном клике на canvas.
    return true;
  }

  function scrollBy(lines: number): void {
    termRef.current?.scrollLines(lines);
  }

  function sendCtrl(letter: string): void {
    // Ctrl+A = \x01, Ctrl+B = \x02, ..., Ctrl+Z = \x1a, Ctrl+C = \x03
    const code = letter.toUpperCase().charCodeAt(0) - 64;
    if (code >= 1 && code <= 26) sendKey(String.fromCharCode(code));
    setCtrlArmed(false);
  }

  /**
   * Открывает модалку с textarea для вставки.
   * Внутри модалки пробуем navigator.clipboard.readText() — если получилось,
   * текст уже в поле. Иначе юзер long-press'ом вставляет сам.
   */
  function pasteFromClipboard(): void {
    setPasteText('');
    setPasteModalOpen(true);
    // Асинхронно пробуем прочитать clipboard — подставим в поле если получится.
    // navigator.clipboard.readText на iOS 16+ при HTTPS и user-gesture работает
    // (тап по кнопке считается gesture'ом).
    navigator.clipboard.readText?.()
      .then((text) => { if (text) setPasteText(text); })
      .catch(() => {}); // не получилось — юзер сам вставит
  }

  function submitPasteModal(): void {
    if (!pasteText) { setPasteModalOpen(false); return; }
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      alert(t('alertNotSentWs', { state: ws ? `state=${ws.readyState}` : 'null' }));
      return;
    }
    const ok = sendKey(pasteText);
    if (!ok) {
      alert(t('alertSendKeyFalse'));
      return;
    }
    // Успех — закрываем модалку
    setPasteModalOpen(false);
    setPasteText('');
  }

  return (
    <div className="flex flex-col h-full" style={{ background: '#0a0a0a', color: '#e5e7eb' }}>
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-1.5 shrink-0"
        style={{ borderBottom: '1px solid #1a1a1a', background: '#080808' }}>
        <span className="font-mono text-[10.5px] uppercase tracking-[0.1em]" style={{ color: '#6b7280' }}>
          pty · {deviceName}
        </span>
        <span className="font-mono text-[10.5px]" style={{ color: '#4b5563' }}>·</span>
        <span className="font-mono text-[10.5px]" style={{
          color: status === 'ready' ? '#10b981' : status === 'connecting' ? '#fbbf24' : '#f87171',
        }}>
          ● {status === 'ready' ? 'connected' : status === 'connecting' ? 'connecting…'
              : status === 'error' ? 'error' : 'closed'}
        </span>
        <div className="flex-1" />
        {/* Всегда доступные: скролл истории (не требует открытой PTY) */}
        <button type="button" onClick={() => scrollBy(-5)}
          title={t('scrollUp')}
          className="font-mono text-[14px] w-7 h-7 rounded hover:bg-[#1a1a1a]"
          style={{ color: '#d4d4aa', border: '1px solid #262626', lineHeight: '1' }}>
          ↑
        </button>
        <button type="button" onClick={() => scrollBy(5)}
          title={t('scrollDown')}
          className="font-mono text-[14px] w-7 h-7 rounded hover:bg-[#1a1a1a]"
          style={{ color: '#d4d4aa', border: '1px solid #262626', lineHeight: '1' }}>
          ↓
        </button>
        {/* Paste — полезна как только WS открыт */}
        <button type="button" onClick={pasteFromClipboard}
          title={t('pasteFromClipboard')}
          className="font-mono text-[11px] px-2 py-1 rounded hover:bg-[#1a1a1a]"
          style={{ color: '#d4d4aa', border: '1px solid #262626' }}>
          📋 Paste
        </button>
        <button type="button" onClick={() => sendKey('\r')}
          title="Enter"
          className="font-mono text-[11px] px-2 py-1 rounded hover:bg-[#1a1a1a]"
          style={{ color: '#d4d4aa', border: '1px solid #262626' }}>
          ↵
        </button>
        <button type="button" onClick={() => sendKey('\x03')}
          title={t('interruptCmd')}
          className="font-mono text-[11px] px-2 py-1 rounded hover:bg-[#1a1a1a]"
          style={{ color: '#fca5a5', border: '1px solid #262626' }}>
          Ctrl+C
        </button>
        {/* Debug: скопировать сырой буфер от PTY (ANSI-стрипнутый) для дебага URL-парсера */}
        <button type="button" onClick={async () => {
            const raw = rawBufferRef.current
              .replace(/\u001b\][^\u0007]*\u0007/g, '')
              .replace(/\u001b\[[0-9;?]*[a-zA-Z]/g, '')
              .replace(/\r\n?/g, '\n');
            const last = raw.slice(-2000);
            try { await navigator.clipboard.writeText(last); alert(t('debugCopied', { count: last.length })); }
            catch { alert(last); }
          }}
          title={t('debugTitle')}
          className="font-mono text-[11px] px-1.5 py-1 rounded hover:bg-[#1a1a1a]"
          style={{ color: '#9ca3af', border: '1px solid #262626' }}>
          🐞
        </button>
      </div>

      {/* Auto-detected URLs — для случаев типа claude /login, где URL в выводе
          разрывается xterm'овским soft-wrap'ом и WebLinksAddon не может его склеить. */}
      {urls.length > 0 && (
        <div className="shrink-0 px-2 py-1.5 flex flex-col gap-1 max-h-[120px] overflow-y-auto"
          style={{ background: '#1a1a0a', borderBottom: '1px solid #262626' }}>
          {urls.map((url) => (
            <div key={url} className="flex items-center gap-1.5">
              <span className="font-mono text-[10.5px] truncate flex-1" style={{ color: '#d4d4aa' }}
                title={url}>
                🔗 {url}
              </span>
              <span className="shrink-0 font-mono text-[9.5px] opacity-60" style={{ color: '#d4d4aa' }}>
                {url.length}c
              </span>
              <button type="button"
                onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}
                className="shrink-0 font-mono text-[10.5px] px-1.5 py-0.5 rounded"
                style={{ background: '#d4d4aa', color: '#0a0a0a' }}>
                {t('openUrl')}
              </button>
              <button type="button"
                onClick={async () => {
                  try { await navigator.clipboard.writeText(url); setUrlCopied(url); setTimeout(() => setUrlCopied(null), 1500); } catch {}
                }}
                className="shrink-0 font-mono text-[10.5px] px-1.5 py-0.5 rounded"
                style={{ background: '#262626', color: '#d4d4aa', border: '1px solid #404040' }}>
                {urlCopied === url ? '✓' : t('copy')}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Xterm host */}
      <div ref={hostRef} className="flex-1 min-h-0 overflow-hidden"
        style={{ padding: '6px 8px 0 8px', background: '#0a0a0a' }} />

      {/* Mobile keyboard bar */}
      {showMobileBar && (
        <div className="flex gap-1 px-2 py-1.5 overflow-x-auto shrink-0"
          style={{ borderTop: '1px solid #262626', background: '#080808' }}>
          <KeyBtn label="Esc" onClick={() => sendKey('\x1b')} />
          <KeyBtn label="Tab" onClick={() => sendKey('\t')} />
          <KeyBtn label="Ctrl" active={ctrlArmed} onClick={() => setCtrlArmed(v => !v)}
            title={t('ctrlTitle')} />
          {ctrlArmed ? (
            <>
              <KeyBtn label="C" onClick={() => sendCtrl('C')} />
              <KeyBtn label="D" onClick={() => sendCtrl('D')} />
              <KeyBtn label="Z" onClick={() => sendCtrl('Z')} />
              <KeyBtn label="L" onClick={() => sendCtrl('L')} />
              <KeyBtn label="R" onClick={() => sendCtrl('R')} />
              <KeyBtn label="A" onClick={() => sendCtrl('A')} />
              <KeyBtn label="E" onClick={() => sendCtrl('E')} />
              <KeyBtn label="W" onClick={() => sendCtrl('W')} />
              <KeyBtn label="U" onClick={() => sendCtrl('U')} />
            </>
          ) : (
            <>
              <KeyBtn label="🔤" onClick={() => { setPasteText(''); setPasteModalOpen(true); }}
                title={t('openKeyboard')} />
              <KeyBtn label="↵ Enter" onClick={() => sendKey('\r')}
                title={t('enterTitle')} />
              <KeyBtn label="📋" onClick={pasteFromClipboard}
                title={t('pasteFromClipboard')} />
              <KeyBtn label="↑" onClick={() => sendKey('\x1b[A')} />
              <KeyBtn label="↓" onClick={() => sendKey('\x1b[B')} />
              <KeyBtn label="←" onClick={() => sendKey('\x1b[D')} />
              <KeyBtn label="→" onClick={() => sendKey('\x1b[C')} />
              {/* Цифры для выбора пунктов меню в interactive CLI (claude wizard,
                  package managers, apt-get и т.п.) */}
              {['1','2','3','4','5','6','7','8','9'].map(n => (
                <KeyBtn key={n} label={n} onClick={() => sendKey(n)} />
              ))}
              <KeyBtn label="exit(q)" onClick={() => sendKey('q')}
                title={t('exitQ')} />
              <KeyBtn label=":q" onClick={() => sendKey('\x1b:q\r')}
                title={t('exitVim')} />
              <KeyBtn label="|" onClick={() => sendKey('|')} />
              <KeyBtn label="/" onClick={() => sendKey('/')} />
              <KeyBtn label="~" onClick={() => sendKey('~')} />
              <KeyBtn label="-" onClick={() => sendKey('-')} />
            </>
          )}
        </div>
      )}

      {status === 'error' && errorMsg && (
        <div className="px-3 py-1.5 text-[11.5px] font-mono shrink-0"
          style={{ background: '#1a0a0a', color: '#fca5a5', borderTop: '1px solid #262626' }}>
          {errorMsg}
        </div>
      )}

      {/* Paste modal — fallback для случая когда clipboard API не сработал */}
      {pasteModalOpen && (
        <div className="fixed inset-0 z-[70] flex items-end md:items-center justify-center p-0 md:p-4"
          style={{ background: 'rgba(0,0,0,.5)', backdropFilter: 'blur(4px)' }}
          onClick={() => setPasteModalOpen(false)}>
          <div className="w-full md:max-w-md md:rounded-2xl p-4 pt-5 flex flex-col gap-3"
            style={{
              background: 'var(--surface)',
              borderTopLeftRadius: 18, borderTopRightRadius: 18,
              boxShadow: '0 -10px 40px rgba(0,0,0,.2)',
              paddingBottom: 'calc(16px + env(safe-area-inset-bottom))',
            }}
            onClick={(e) => e.stopPropagation()}>
            <div className="w-11 h-1 rounded-full mx-auto -mt-1" style={{ background: 'var(--border-strong)' }} />
            <div>
              <div className="text-[15px] font-semibold">{t('pasteModalTitle')}</div>
              <div className="text-[11.5px] mt-0.5" style={{ color: 'var(--muted)' }}>
                {pasteText ? t('pasteModalGotFromBuffer') : t('pasteModalLongPress')}
              </div>
            </div>
            <textarea value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              onInput={(e) => setPasteText((e.target as HTMLTextAreaElement).value)}
              onPaste={(e) => {
                // Ручной хэндлер: react onChange иногда не ловит paste на iOS
                const txt = e.clipboardData?.getData('text');
                if (txt) {
                  e.preventDefault();
                  setPasteText(txt);
                }
              }}
              autoFocus rows={4}
              placeholder={t('pasteModalPlaceholder')}
              spellCheck={false} autoCapitalize="off" autoCorrect="off"
              className="w-full px-3 py-2 rounded-lg text-[15px] bg-transparent outline-none font-mono"
              style={{ border: '1px solid var(--border)', color: 'var(--fg)' }} />
            {pasteText && (
              <div className="text-[11px]" style={{ color: 'var(--muted)' }}
                dangerouslySetInnerHTML={{ __html: t('willSend', { count: pasteText.length }) }} />
            )}
            <div className="flex gap-2">
              <button onClick={() => setPasteModalOpen(false)}
                className="flex-1 px-4 py-2.5 rounded-xl text-[14px]"
                style={{ background: 'var(--surface-2)', color: 'var(--fg-2)' }}>
                {t('cancel')}
              </button>
              <button onClick={submitPasteModal}
                className="flex-1 px-4 py-2.5 rounded-xl text-[14px] font-semibold"
                style={{
                  background: pasteText ? 'var(--accent)' : 'var(--surface-2)',
                  color: pasteText ? 'var(--bg)' : 'var(--muted)',
                }}>
                {t('pasteAction')} {pasteText ? `(${pasteText.length})` : ''}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function KeyBtn({ label, onClick, active, title }: {
  label: string; onClick: () => void; active?: boolean; title?: string;
}) {
  return (
    <button type="button" onClick={onClick} title={title}
      className="shrink-0 h-9 min-w-[40px] px-2.5 rounded-md font-mono text-[14px] font-semibold"
      style={{
        background: active ? '#d4d4aa' : '#1a1a1a',
        color: active ? '#0a0a0a' : '#d4d4aa',
        border: `1px solid ${active ? '#d4d4aa' : '#262626'}`,
      }}>
      {label}
    </button>
  );
}
