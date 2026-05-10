import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const contentType = 'image/png';
export const size = { width: 1200, height: 630 };

/**
 * Dynamic Open Graph image. Используется в metadata.openGraph.images
 * (через /og — next/og auto-mounts route.tsx).
 *
 * Никаких внешних шрифтов: ImageResponse поддерживает system-default
 * с автоматическим fallback. Для launch-версии хватает.
 */
export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '70px 80px',
          background: 'linear-gradient(135deg, #0b0b0d 0%, #0f1814 100%)',
          color: '#f4f4f5',
        }}
      >
        {/* Brand mark */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 14,
              background: '#0b0b0d',
              border: '2px solid #5fa05f',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 36,
              fontWeight: 800,
              color: '#5fa05f',
            }}
          >
            A
          </div>
          <span style={{ fontSize: 26, fontWeight: 700, letterSpacing: -0.5 }}>Autmzr Command</span>
        </div>

        {/* Headline */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <span
            style={{
              fontSize: 24,
              color: '#5fa05f',
              fontFamily: 'monospace',
              letterSpacing: 2,
              textTransform: 'uppercase',
            }}
          >
            Mobile control panel · self-hosted · open source
          </span>
          <span style={{ fontSize: 64, fontWeight: 800, lineHeight: 1.05, letterSpacing: -1.4 }}>
            Drive your AI coding CLIs
            <br />
            from your phone.
          </span>
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            fontSize: 20,
            color: '#a1a1aa',
          }}
        >
          <span>Claude Code · Gemini CLI · Codex CLI</span>
          <span style={{ fontFamily: 'monospace', color: '#71717a' }}>cmd.autmzr.com</span>
        </div>
      </div>
    ),
    { ...size },
  );
}
