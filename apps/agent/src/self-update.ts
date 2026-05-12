/**
 * Self-update с верификацией Ed25519-подписи.
 *
 * Триггерится из ws-client.ts когда master в hello.ack прислал
 * agent_latest_version != AGENT_VERSION.
 *
 * Алгоритм (atomic):
 *   1. Скачиваем bundle и .sig.
 *   2. Верифицируем подпись embedded public key'ом.
 *   3. Пишем bundle в process.argv[1] + ".new".
 *   4. fs.rename → agent.js (атомарно на posix).
 *   5. process.exit(0) → systemd/launchd рестартует с новой версией.
 *
 * Защита (B-02 в REVIEW.md):
 *   • Ed25519-подпись bundle'а — единственный барьер против supply-chain attack
 *     через скомпрометированный master. Приватник держим оффлайн, мастер только
 *     раздаёт agent.js + agent.js.sig.
 *   • Если AGENT_PUBLIC_KEY_PEM пустой (legacy/dev) — апдейт НЕ выполняется
 *     (fail-closed). Чтобы включить апдейты, запусти scripts/agent-keygen.ts.
 *   • bundleUrl должен жить на том же хосте, что и masterUrl — иначе compromised
 *     master не может перенаправить нас на чужой сервер с валидной подписью
 *     от его собственного ключа (но без нашего public key'а это не пройдёт всё равно).
 *   • masterUrl должен быть wss:// — иначе MITM может подменить hello.ack.
 *   • --no-self-update флаг полностью выключает механизм.
 *   • Cooldown 5 минут защищает от расщеплённых reconnect-loop'ов.
 *   • Sanity: bundle >= 10 KB, начинается с шебанга/import/etc.
 */

import { writeFileSync, renameSync, existsSync } from 'node:fs';
import { createPublicKey, verify as edVerify } from 'node:crypto';
import { AGENT_PUBLIC_KEY_PEM } from './agent-public-key.js';

let lastAttempt = 0;
const COOLDOWN_MS = 5 * 60_000;

const NO_SELF_UPDATE = process.argv.includes('--no-self-update')
  || process.env.AUTMZR_NO_SELF_UPDATE === '1';

export async function maybeSelfUpdate(args: {
  currentVersion: string;
  latestVersion?: string;
  bundleUrl?: string;
  masterUrl?: string;
  log: (s: string) => void;
}): Promise<void> {
  const { currentVersion, latestVersion, bundleUrl, masterUrl, log } = args;
  if (NO_SELF_UPDATE) { return; }
  if (!latestVersion || !bundleUrl) return;
  if (latestVersion === currentVersion) return;

  if (!AGENT_PUBLIC_KEY_PEM) {
    log(`self-update: no embedded public key — refuse to update (fail-closed)`);
    return;
  }

  // Origin checks: bundleUrl должен совпадать по host с masterUrl, и оба
  // на TLS (wss://master, https://bundle). В деве на localhost разрешаем cleartext.
  try {
    const b = new URL(bundleUrl);
    const m = masterUrl ? new URL(masterUrl) : null;
    if (m && b.host !== m.host) {
      log(`self-update: bundle host ${b.host} != master host ${m.host} — skip`);
      return;
    }
    const isLocal = b.hostname === 'localhost' || b.hostname === '127.0.0.1';
    if (!isLocal && b.protocol !== 'https:') {
      log(`self-update: bundle URL not https (${b.protocol}) — skip`);
      return;
    }
    if (!isLocal && m && m.protocol !== 'wss:') {
      log(`self-update: master URL not wss (${m.protocol}) — skip`);
      return;
    }
  } catch (e) {
    log(`self-update: bad URL — skip (${(e as Error).message})`);
    return;
  }

  const now = Date.now();
  if (now - lastAttempt < COOLDOWN_MS) {
    log(`self-update: cooldown, last attempt ${Math.round((now - lastAttempt) / 1000)}s ago`);
    return;
  }
  lastAttempt = now;

  const selfPath = process.argv[1];
  if (!selfPath || !existsSync(selfPath)) {
    log(`self-update: cannot resolve own path (${selfPath}) — skip`);
    return;
  }

  log(`self-update: ${currentVersion} → ${latestVersion} from ${bundleUrl}`);
  try {
    const [bundleRes, sigRes] = await Promise.all([
      fetch(bundleUrl),
      fetch(bundleUrl + '.sig'),
    ]);
    if (!bundleRes.ok) {
      log(`self-update: bundle HTTP ${bundleRes.status} — skip`);
      return;
    }
    if (!sigRes.ok) {
      log(`self-update: signature HTTP ${sigRes.status} — refuse (fail-closed)`);
      return;
    }
    const buf = Buffer.from(await bundleRes.arrayBuffer());
    const sig = Buffer.from(await sigRes.arrayBuffer());
    if (buf.length < 10_000) {
      log(`self-update: bundle too small (${buf.length} bytes) — skip`);
      return;
    }
    if (sig.length !== 64) {
      log(`self-update: signature wrong length (${sig.length} != 64) — refuse`);
      return;
    }
    const head = buf.subarray(0, 64).toString('utf8');
    if (!/^(#!|import|"use strict|\(|\/\*|var\s|const\s|let\s|export)/.test(head)) {
      log(`self-update: bundle doesn't look like JS — skip`);
      return;
    }

    const pub = createPublicKey(AGENT_PUBLIC_KEY_PEM);
    const ok = edVerify(null, buf, pub, sig);
    if (!ok) {
      log(`self-update: SIGNATURE VERIFICATION FAILED — refuse (possible supply-chain attack)`);
      return;
    }

    const tmpPath = selfPath + '.new';
    writeFileSync(tmpPath, buf);
    renameSync(tmpPath, selfPath);
    log(`self-update: verified + written ${buf.length} bytes → ${selfPath}; exit(0) for systemd restart`);
    setTimeout(() => process.exit(0), 200);
  } catch (e) {
    log(`self-update: error ${(e as Error).message}`);
  }
}
