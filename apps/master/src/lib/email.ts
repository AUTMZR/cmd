/**
 * Email-отправка через Resend HTTP API.
 *
 * Конфигурация — три env-переменные:
 *   RESEND_API_KEY  — секрет с https://resend.com/api-keys.
 *   RESEND_FROM     — адрес отправителя, default `onboarding@resend.dev`
 *                      (Resend dev-sandbox — работает без верификации домена,
 *                      но шлёт только на email регистратора аккаунта).
 *                      Для прод поставить `noreply@autmzr.com` после verify домена.
 *   PUBLIC_URL      — базовый URL мастера (используется в ссылках). Required.
 *
 * Если RESEND_API_KEY не задан → emails не отправляются, ссылки логируются
 * (dev/self-host режим). Юзер видит ссылку в логах сервера и кликает руками.
 *
 * AGPL-friendly: self-host юзеры могут вообще не настраивать Resend и работать
 * через логи; cloud-instance Autmzr использует свой Resend account.
 */

import { log } from './log';

const RESEND_API = 'https://api.resend.com/emails';

interface SendEmailArgs {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface EmailResult {
  delivered: boolean;
  reason?: string;
  /** В stub-режиме здесь будет URL чтобы дев увидел в логах. */
  stubLink?: string;
}

function getFrom(): string {
  return process.env.RESEND_FROM || 'Autmzr <onboarding@resend.dev>';
}

function getPublicUrl(): string {
  const url = process.env.PUBLIC_URL;
  if (!url) throw new Error('PUBLIC_URL is required for email links');
  return url.replace(/\/$/, '');
}

async function sendEmail({ to, subject, html, text }: SendEmailArgs): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    // Stub mode: ничего не шлём, только логируем содержимое.
    log.warn('email: RESEND_API_KEY not set, skipping send', { to, subject });
    return { delivered: false, reason: 'no_api_key' };
  }

  try {
    const resp = await fetch(RESEND_API, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: getFrom(), to, subject, html, text }),
    });
    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      log.warn('email: resend non-2xx', { to, subject, status: resp.status, body: body.slice(0, 300) });
      return { delivered: false, reason: `resend_${resp.status}` };
    }
    log.info('email: sent', { to, subject });
    return { delivered: true };
  } catch (e) {
    log.warn('email: resend threw', { to, subject, err: (e as Error).message });
    return { delivered: false, reason: 'network_error' };
  }
}

export async function sendVerificationEmail(to: string, name: string | null, token: string): Promise<EmailResult> {
  const link = `${getPublicUrl()}/verify-email?token=${encodeURIComponent(token)}`;
  const greeting = name ? `Hi ${name},` : 'Hi,';

  const text = `${greeting}

Welcome to Autmzr Command. Confirm your email by opening this link:

${link}

The link expires in 24 hours. If you didn't sign up, ignore this email.

— Autmzr`;

  const html = `<!doctype html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Inter',sans-serif;background:#0b0b0d;color:#f4f4f5;padding:32px;">
  <div style="max-width:480px;margin:0 auto;background:#131318;border:1px solid #26262e;border-radius:14px;padding:32px;">
    <h1 style="font-size:22px;font-weight:600;margin:0 0 16px;letter-spacing:-0.01em;">Confirm your email</h1>
    <p style="color:#d4d4d8;line-height:1.55;margin:0 0 20px;">${greeting} welcome to Autmzr Command. Click the button below to confirm your email and unlock the full account.</p>
    <p style="margin:0 0 24px;">
      <a href="${link}" style="display:inline-block;background:#5fb878;color:#0a1c12;padding:12px 24px;border-radius:999px;font-weight:600;text-decoration:none;">Confirm email →</a>
    </p>
    <p style="color:#71717a;font-size:13px;line-height:1.55;margin:0 0 8px;">Or copy this link into your browser:</p>
    <p style="color:#7dd6a3;font-size:12px;word-break:break-all;font-family:monospace;margin:0 0 24px;">${link}</p>
    <p style="color:#71717a;font-size:12px;line-height:1.55;margin:0;">The link expires in 24 hours. If you didn't sign up for Autmzr, just ignore this email — your address won't be used.</p>
  </div>
</body></html>`;

  // Дополнительно логируем ссылку — критично для self-host без RESEND_API_KEY.
  log.info('email: verification link issued', { to, link });

  const result = await sendEmail({ to, subject: 'Confirm your Autmzr email', html, text });
  if (!result.delivered) result.stubLink = link;
  return result;
}

export async function sendWelcomeEmail(to: string, name: string | null): Promise<EmailResult> {
  const link = `${getPublicUrl()}/app`;
  const greeting = name ? `${name},` : 'There,';

  const text = `${greeting}

Welcome aboard. Your Autmzr Command account is verified and ready.

What's next:
1. Open the app: ${link}
2. Connect your first server with one curl command (instructions inside).
3. Sign in to Claude Code or Gemini CLI on that server.
4. Start sending tasks from your phone.

You have 14 days of free trial. No card needed yet.

Questions? Reply to this email — it goes straight to me.

— Autmzr`;

  const html = `<!doctype html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Inter',sans-serif;background:#0b0b0d;color:#f4f4f5;padding:32px;">
  <div style="max-width:480px;margin:0 auto;background:#131318;border:1px solid #26262e;border-radius:14px;padding:32px;">
    <h1 style="font-size:22px;font-weight:600;margin:0 0 16px;letter-spacing:-0.01em;">Welcome aboard 👋</h1>
    <p style="color:#d4d4d8;line-height:1.55;margin:0 0 20px;">${greeting} your Autmzr Command account is verified and ready. You have 14 days of free trial — no card needed yet.</p>
    <h2 style="font-size:14px;font-weight:600;margin:24px 0 8px;color:#f4f4f5;">What's next</h2>
    <ol style="color:#d4d4d8;line-height:1.6;margin:0 0 24px;padding-left:20px;">
      <li>Open the app and connect your first server with one curl command.</li>
      <li>Sign in to Claude Code or Gemini CLI on that server.</li>
      <li>Send your first task from your phone.</li>
    </ol>
    <p style="margin:0 0 24px;">
      <a href="${link}" style="display:inline-block;background:#5fb878;color:#0a1c12;padding:12px 24px;border-radius:999px;font-weight:600;text-decoration:none;">Open Autmzr →</a>
    </p>
    <p style="color:#71717a;font-size:12px;line-height:1.55;margin:0;">Questions? Just reply to this email — it goes straight to a real person.</p>
  </div>
</body></html>`;

  return sendEmail({ to, subject: 'Welcome to Autmzr — your account is ready', html, text });
}
