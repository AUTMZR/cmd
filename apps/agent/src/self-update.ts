/**
 * Self-update.
 *
 * Триггерится из ws-client.ts когда master в hello.ack прислал
 * agent_latest_version != AGENT_VERSION.
 *
 * Алгоритм (atomic):
 *   1. Скачиваем bundle в process.argv[1] + ".new" (рядом с agent.js).
 *   2. fs.rename → agent.js (атомарно на posix).
 *   3. process.exit(0) → systemd/launchd рестартует с новой версией.
 *
 * Защита:
 *   • Не апдейтимся чаще раза в 5 минут (защита от расщеплённых reconnect-loop'ов).
 *   • Скачанный файл должен быть >= 10 KB и начинаться с шебанга/import (sanity).
 *   • Если bundle_url или текущий путь к agent.js не определимы — no-op.
 */

import { writeFileSync, renameSync, existsSync } from 'node:fs';

let lastAttempt = 0;
const COOLDOWN_MS = 5 * 60_000;

export async function maybeSelfUpdate(args: {
  currentVersion: string;
  latestVersion?: string;
  bundleUrl?: string;
  log: (s: string) => void;
}): Promise<void> {
  const { currentVersion, latestVersion, bundleUrl, log } = args;
  if (!latestVersion || !bundleUrl) return;
  if (latestVersion === currentVersion) return;

  const now = Date.now();
  if (now - lastAttempt < COOLDOWN_MS) {
    log(`self-update: cooldown, last attempt ${Math.round((now - lastAttempt) / 1000)}s ago`);
    return;
  }
  lastAttempt = now;

  // process.argv[1] — путь до запущенного скрипта (agent.js). Только так
  // мы можем себя перезаписать "по месту" — без знания install-пути из конфига.
  const selfPath = process.argv[1];
  if (!selfPath || !existsSync(selfPath)) {
    log(`self-update: cannot resolve own path (${selfPath}) — skip`);
    return;
  }

  log(`self-update: ${currentVersion} → ${latestVersion} from ${bundleUrl}`);
  try {
    const res = await fetch(bundleUrl);
    if (!res.ok) {
      log(`self-update: HTTP ${res.status} — skip`);
      return;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 10_000) {
      log(`self-update: bundle too small (${buf.length} bytes) — skip`);
      return;
    }
    const head = buf.subarray(0, 64).toString('utf8');
    if (!/^(#!|import|"use strict|\(|\/\*|var\s|const\s|let\s|export)/.test(head)) {
      log(`self-update: bundle doesn't look like JS — skip`);
      return;
    }
    const tmpPath = selfPath + '.new';
    writeFileSync(tmpPath, buf);
    renameSync(tmpPath, selfPath);
    log(`self-update: written ${buf.length} bytes → ${selfPath}; exit(0) for systemd restart`);
    // Даём WS закрыться чисто.
    setTimeout(() => process.exit(0), 200);
  } catch (e) {
    log(`self-update: error ${(e as Error).message}`);
  }
}
