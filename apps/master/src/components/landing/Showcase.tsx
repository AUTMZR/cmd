'use client';

/**
 * Showcase — секция «Built mobile-first». Показывает реальные экраны приложения:
 *   • 4 phone-frame mock'а: Chat / Devices / Project create / Billing
 *   • 1 browser-frame mock: desktop split-pane (sidebar + chat)
 *
 * CSS — inline + ln-* классы из linear.css. Никакой внешний CSS не нужен.
 * Все mock-данные статичные, чтоб лендинг не зависел от runtime.
 */

import { Smartphone, Monitor, ChevronRight, Folder, MessageSquare, Settings as SettingsIcon, Zap } from 'lucide-react';
import { useTranslations } from 'next-intl';

export default function Showcase() {
  const t = useTranslations('showcase');
  return (
    <section className="ln-section" id="showcase">
      <div className="ln-container">
        <div className="ln-section-head center">
          <span className="ln-eyebrow">
            <Smartphone size={11} strokeWidth={1.8} style={{ verticalAlign: '-1px', marginRight: 4 }} />
            {t('eyebrowMobile')}
          </span>
          <h2 className="ln-h2">
            {t('title')}
            <br />
            <span className="accent">{t('titleAccent')}</span>
          </h2>
          <p className="ln-lede" style={{ textAlign: 'center', maxWidth: 580, margin: '14px auto 0' }}>
            {t('lede')}
          </p>
        </div>

        {/* Mobile row — 4 phones, scroll-snap on small screens */}
        <div
          style={{
            marginTop: 56,
            display: 'flex',
            gap: 24,
            overflowX: 'auto',
            scrollSnapType: 'x mandatory',
            paddingBottom: 16,
            justifyContent: 'flex-start',
            WebkitOverflowScrolling: 'touch',
          }}
          className="showcase-phones"
        >
          <PhoneFrame label={t('labels.chat')} icon={MessageSquare}>
            <ChatMock />
          </PhoneFrame>
          <PhoneFrame label={t('labels.devices')} icon={Zap}>
            <DevicesMock />
          </PhoneFrame>
          <PhoneFrame label={t('labels.newProject')} icon={Folder}>
            <ProjectWizardMock />
          </PhoneFrame>
          <PhoneFrame label={t('labels.subscription')} icon={SettingsIcon}>
            <BillingMock />
          </PhoneFrame>
        </div>

        {/* Mobile-first hint строкой */}
        <p
          className="ln-mono"
          style={{
            marginTop: 12,
            textAlign: 'center',
            color: 'var(--muted)',
            fontSize: 11,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          {t('scrollHint')}
        </p>

        {/* Desktop view — wide browser frame */}
        <div style={{ marginTop: 80 }}>
          <div className="ln-section-head center" style={{ marginBottom: 32 }}>
            <span className="ln-eyebrow">
              <Monitor size={11} strokeWidth={1.8} style={{ verticalAlign: '-1px', marginRight: 4 }} />
              {t('eyebrowDesktop')}
            </span>
            <h3 className="ln-h2" style={{ fontSize: 26 }}>
              {t('desktopTitle')}
            </h3>
          </div>

          <BrowserFrame>
            <DesktopMock />
          </BrowserFrame>
        </div>
      </div>
    </section>
  );
}

/* ============================== Frames ================================== */

function PhoneFrame({
  label,
  icon: Icon,
  children,
}: {
  label: string;
  icon: typeof Folder;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        flex: '0 0 auto',
        scrollSnapAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 10,
      }}
    >
      <div
        style={{
          width: 250,
          height: 540,
          borderRadius: 36,
          background: '#111',
          padding: 8,
          boxShadow: '0 24px 60px rgba(0,0,0,.45), inset 0 0 0 1.5px rgba(255,255,255,.06)',
          position: 'relative',
        }}
      >
        <div
          aria-hidden
          style={{
            position: 'absolute',
            top: 16,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 80,
            height: 22,
            borderRadius: 12,
            background: '#000',
            zIndex: 2,
          }}
        />
        <div
          style={{
            width: '100%',
            height: '100%',
            borderRadius: 28,
            overflow: 'hidden',
            background: '#0f0f12',
            display: 'flex',
            flexDirection: 'column',
            color: '#e5e5e7',
            fontSize: 11.5,
          }}
        >
          {children}
        </div>
      </div>
      <div
        className="ln-mono"
        style={{
          fontSize: 11,
          color: 'var(--muted)',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <Icon size={11} strokeWidth={1.8} />
        {label}
      </div>
    </div>
  );
}

function BrowserFrame({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        maxWidth: 1000,
        margin: '0 auto',
        borderRadius: 12,
        overflow: 'hidden',
        background: '#0f0f12',
        boxShadow: '0 30px 80px rgba(0,0,0,.5), inset 0 0 0 1px rgba(255,255,255,.05)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '10px 14px',
          background: '#191919',
          borderBottom: '1px solid rgba(255,255,255,.06)',
        }}
      >
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#ff5f56' }} />
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#ffbd2e' }} />
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#27c93f' }} />
        <span
          style={{
            marginLeft: 16,
            fontFamily: 'var(--font-mono)',
            fontSize: 11.5,
            color: '#888',
          }}
        >
          cmd.autmzr.com/app
        </span>
      </div>
      <div style={{ aspectRatio: '16 / 9', display: 'flex' }}>{children}</div>
    </div>
  );
}

/* ============================== Mock screens ============================ */

function ChatHeader({ project, agent = 'claude' }: { project: string; agent?: string }) {
  return (
    <div
      style={{
        padding: '16px 14px 10px',
        borderBottom: '1px solid rgba(255,255,255,.06)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: 38,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#5fa05f' }} />
        <span style={{ fontWeight: 600 }}>home-mac</span>
        <span style={{ color: '#777' }}>· {project}</span>
      </div>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#777' }}>{agent}</span>
    </div>
  );
}

function ChatMock() {
  const t = useTranslations('showcase.mocks');
  return (
    <>
      <ChatHeader project="autmzr-command" />
      <div style={{ flex: 1, padding: 12, display: 'flex', flexDirection: 'column', gap: 10, overflow: 'hidden' }}>
        <Bubble role="user">{t('chatMsg1')}</Bubble>
        <Bubble role="assistant">{t('chatMsg2')}</Bubble>
        <Bubble role="tool">edit · src/api/upload.ts · +18 -2</Bubble>
        <Bubble role="assistant">{t('chatMsg3')}</Bubble>
      </div>
      <FakeComposer placeholder={t('chatComposer')} />
    </>
  );
}

function DevicesMock() {
  const t = useTranslations('showcase.mocks');
  const devices = [
    { name: 'home-mac', kind: 'Mac mini · M4', online: true },
    { name: 'vps-fra-1', kind: 'Hetzner · 4GB · Frankfurt', online: true },
    { name: 'work-laptop', kind: 'MBP M3 Pro', online: false },
    { name: 'gaming-pc', kind: 'Ryzen 9 · WSL2', online: true },
  ];
  return (
    <>
      <div style={{ paddingTop: 38, padding: '38px 14px 12px', borderBottom: '1px solid rgba(255,255,255,.06)' }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{t('devicesTitle')}</div>
        <div style={{ fontSize: 11, color: '#777', marginTop: 2 }}>{t('devicesStatus')}</div>
      </div>
      <div style={{ flex: 1, padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {devices.map((d) => (
          <div
            key={d.name}
            style={{
              padding: '10px 12px',
              borderRadius: 10,
              background: 'rgba(255,255,255,.03)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: d.online ? '#5fa05f' : '#555',
                  flexShrink: 0,
                }}
              />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600 }}>{d.name}</div>
                <div style={{ fontSize: 10, color: '#777' }}>{d.kind}</div>
              </div>
            </div>
            <ChevronRight size={14} color="#555" />
          </div>
        ))}
      </div>
      <div style={{ padding: 12, borderTop: '1px solid rgba(255,255,255,.06)' }}>
        <div
          style={{
            background: '#5fa05f',
            color: '#0a0a0c',
            borderRadius: 10,
            padding: '10px',
            textAlign: 'center',
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          {t('addDevice')}
        </div>
      </div>
    </>
  );
}

function ProjectWizardMock() {
  const t = useTranslations('showcase.mocks');
  return (
    <>
      <div
        style={{
          padding: '38px 14px 12px',
          borderBottom: '1px solid rgba(255,255,255,.06)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 12,
        }}
      >
        <span style={{ color: '#777' }}>{t('newProjectStep')}</span>
        <span style={{ color: '#444' }}>·</span>
        <span style={{ color: '#aaa' }}>vps-fra-1</span>
        <span style={{ color: '#444' }}>·</span>
        <span style={{ color: '#5fa05f' }}>{t('newProjectFolder')}</span>
      </div>
      <div style={{ flex: 1, padding: 12, display: 'flex', flexDirection: 'column', gap: 4, overflow: 'hidden' }}>
        <div style={{ fontSize: 10, color: '#777', padding: '4px 8px', fontFamily: 'var(--font-mono)' }}>
          /home/user/projects
        </div>
        {['autmzr-command', 'logistics-calc', 'pocket-claude', 'rfs-mcp', 'experiments'].map((d, i) => (
          <div
            key={d}
            style={{
              padding: '9px 12px',
              borderRadius: 8,
              background: i === 0 ? 'rgba(95,160,95,.12)' : 'rgba(255,255,255,.03)',
              border: i === 0 ? '1px solid rgba(95,160,95,.3)' : '1px solid transparent',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <Folder size={12} color={i === 0 ? '#5fa05f' : '#777'} strokeWidth={1.6} />
            <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)' }}>{d}</span>
          </div>
        ))}
      </div>
      <div style={{ padding: 10, borderTop: '1px solid rgba(255,255,255,.06)', display: 'flex', gap: 6 }}>
        <div
          style={{
            flex: 1,
            background: 'rgba(255,255,255,.05)',
            padding: '9px',
            borderRadius: 8,
            textAlign: 'center',
            fontSize: 11.5,
            color: '#999',
          }}
        >
          {t('back')}
        </div>
        <div
          style={{
            flex: 2,
            background: '#5fa05f',
            color: '#0a0a0c',
            padding: '9px',
            borderRadius: 8,
            textAlign: 'center',
            fontSize: 11.5,
            fontWeight: 600,
          }}
        >
          {t('selectFolder')}
        </div>
      </div>
    </>
  );
}

function BillingMock() {
  const t = useTranslations('showcase.mocks');
  return (
    <>
      <div
        style={{
          padding: '38px 14px 12px',
          borderBottom: '1px solid rgba(255,255,255,.06)',
          fontSize: 14,
          fontWeight: 600,
        }}
      >
        {t('subscriptionTitle')}
      </div>
      <div style={{ flex: 1, padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div
          style={{
            padding: 12,
            borderRadius: 10,
            background: 'rgba(255,255,255,.04)',
            border: '1px solid rgba(255,255,255,.06)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{t('trialName')}</span>
            <span
              className="ln-mono"
              style={{ fontSize: 9.5, color: '#5fa05f', textTransform: 'uppercase', letterSpacing: '0.08em' }}
            >
              {t('trialLeft')}
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 10 }}>
            <div>
              <div className="ln-mono" style={{ fontSize: 9, color: '#777', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                {t('trialUntilLabel')}
              </div>
              <div style={{ fontSize: 11, marginTop: 2 }}>{t('trialUntilDate')}</div>
            </div>
            <div>
              <div className="ln-mono" style={{ fontSize: 9, color: '#777', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                {t('limitLabel')}
              </div>
              <div style={{ fontSize: 11, marginTop: 2 }}>{t('limitValue')}</div>
            </div>
          </div>
        </div>
        <div style={{ fontSize: 10.5, color: '#777', lineHeight: 1.5 }}>
          {t('subscriptionTagline')}
        </div>
      </div>
    </>
  );
}

function DesktopMock() {
  return (
    <>
      {/* Sidebar */}
      <div
        style={{
          width: 220,
          background: '#0a0a0c',
          borderRight: '1px solid rgba(255,255,255,.06)',
          padding: '14px 10px',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          fontSize: 12,
        }}
      >
        <div style={{ fontSize: 11.5, fontWeight: 700, color: '#fff', padding: '0 6px' }}>
          autmzr command
        </div>
        <div className="ln-mono" style={{ fontSize: 9.5, color: '#777', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '0 6px' }}>
          Devices
        </div>
        {['home-mac', 'vps-fra-1', 'work-laptop'].map((d, i) => (
          <div
            key={d}
            style={{
              padding: '4px 6px',
              borderRadius: 6,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: i === 0 ? 'rgba(95,160,95,.1)' : 'transparent',
            }}
          >
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: i === 2 ? '#555' : '#5fa05f' }} />
            <span style={{ fontSize: 11.5 }}>{d}</span>
          </div>
        ))}
        <div className="ln-mono" style={{ fontSize: 9.5, color: '#777', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '8px 6px 0' }}>
          Projects
        </div>
        {['autmzr-command', 'logistics-calc', 'pocket-claude'].map((p, i) => (
          <div
            key={p}
            style={{
              padding: '4px 6px',
              borderRadius: 6,
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              color: i === 0 ? '#fff' : '#aaa',
              background: i === 0 ? 'rgba(255,255,255,.06)' : 'transparent',
            }}
          >
            {p}
          </div>
        ))}
      </div>
      {/* Chat */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div
          style={{
            padding: '12px 16px',
            borderBottom: '1px solid rgba(255,255,255,.06)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>autmzr-command</span>
            <span style={{ fontSize: 11, color: '#777' }}>· home-mac</span>
          </div>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#777' }}>claude</span>
        </div>
        <div style={{ flex: 1, padding: 16, display: 'flex', flexDirection: 'column', gap: 10, overflow: 'hidden' }}>
          <Bubble role="user">Refactor the auth flow into a hook</Bubble>
          <Bubble role="assistant">
            Looking at <code>AuthScreen.tsx</code>. I&rsquo;ll extract:
            <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
              <li>
                <code>useAuth()</code> — state + submit
              </li>
              <li>
                <code>useInviteCode()</code> — URL parse
              </li>
            </ul>
          </Bubble>
          <Bubble role="tool">edit · src/hooks/useAuth.ts · +47 -3</Bubble>
          <Bubble role="assistant">Done. Tests pass. Want me to wire it into the page?</Bubble>
        </div>
        <FakeComposer placeholder="Reply to claude…" />
      </div>
    </>
  );
}

/* ============================== Bits =================================== */

function Bubble({ role, children }: { role: 'user' | 'assistant' | 'tool'; children: React.ReactNode }) {
  if (role === 'tool') {
    return (
      <div
        style={{
          padding: '6px 10px',
          borderRadius: 8,
          background: 'rgba(255,255,255,.04)',
          border: '1px solid rgba(255,255,255,.06)',
          fontSize: 10.5,
          fontFamily: 'var(--font-mono)',
          color: '#999',
        }}
      >
        {children}
      </div>
    );
  }
  if (role === 'user') {
    return (
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <div
          style={{
            maxWidth: '78%',
            padding: '8px 12px',
            borderRadius: 14,
            borderTopRightRadius: 4,
            background: '#3a3631',
            color: '#fff',
            fontSize: 11.5,
            lineHeight: 1.45,
          }}
        >
          {children}
        </div>
      </div>
    );
  }
  return (
    <div
      style={{
        maxWidth: '88%',
        padding: '8px 12px',
        borderRadius: 14,
        borderTopLeftRadius: 4,
        background: 'rgba(255,255,255,.05)',
        border: '1px solid rgba(255,255,255,.05)',
        fontSize: 11.5,
        lineHeight: 1.45,
      }}
    >
      {children}
    </div>
  );
}

function FakeComposer({ placeholder }: { placeholder: string }) {
  return (
    <div
      style={{
        padding: 10,
        borderTop: '1px solid rgba(255,255,255,.06)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 12px',
          borderRadius: 14,
          background: 'rgba(255,255,255,.04)',
          border: '1px solid rgba(255,255,255,.06)',
          fontSize: 11.5,
          color: '#777',
        }}
      >
        <span>{placeholder}</span>
        <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 3 }}>
          <span style={{ width: 4, height: 4, borderRadius: '50%', background: '#777', animation: 'pulse 1s infinite alternate' }} />
          <span style={{ width: 4, height: 4, borderRadius: '50%', background: '#777', animation: 'pulse 1s infinite alternate .2s' }} />
          <span style={{ width: 4, height: 4, borderRadius: '50%', background: '#777', animation: 'pulse 1s infinite alternate .4s' }} />
        </span>
      </div>
    </div>
  );
}
