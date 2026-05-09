/**
 * git.clone handler — клонирует репозиторий через системный `git`
 *  в parent_path/folder_name. Стримит stderr (там git печатает прогресс)
 *  как git.clone.progress сообщения, в конце шлёт git.clone.reply.
 *
 * Безопасность:
 *   • parent_path прогоняется через safePath() (не даём писать в ~/.claude и пр.)
 *   • folder_name валидируется (только [\w.-], без / и .. — иначе можно
 *     уйти из parent_path)
 *   • repo_url принимает только https://github.com/owner/repo[.git]
 *     (других хостов пока не поддерживаем — расширим позже)
 *   • token подставляется через env GIT_ASKPASS-like подход: пишем URL
 *     с x-access-token прямо в команду, но НЕ в git config — после клона
 *     remote перезаписываем без токена.
 */

import { spawn } from 'node:child_process';
import { mkdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { GitCloneRequest, GitCloneReply, GitCloneProgress } from '@autmzr/command-protocol';
import { safePath, SafetyError } from '../safety.js';

const FOLDER_NAME_RE = /^[A-Za-z0-9_.-]+$/;
const GITHUB_URL_RE = /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?$/;

export type ProgressEmitter = (text: string) => void;

export async function handleGitClone(
  req: GitCloneRequest,
  emit: ProgressEmitter,
): Promise<GitCloneReply> {
  const reply = (over: Partial<GitCloneReply>): GitCloneReply => ({
    type: 'git.clone.reply',
    correlation_id: req.id,
    ok: false,
    ...over,
  });

  // 1. Валидация
  if (!req.repo_url || !GITHUB_URL_RE.test(req.repo_url)) {
    return reply({ error: 'unsupported repo_url (only https://github.com/owner/repo)' });
  }
  if (!req.folder_name || !FOLDER_NAME_RE.test(req.folder_name)) {
    return reply({ error: 'invalid folder_name (allowed: A-Za-z0-9_.-)' });
  }
  let parentAbs: string;
  try {
    parentAbs = safePath(req.parent_path);
  } catch (e) {
    return reply({ error: e instanceof SafetyError ? e.message : 'invalid parent_path' });
  }

  // 2. Папка должна существовать; целевая — НЕ должна.
  try {
    const s = await stat(parentAbs);
    if (!s.isDirectory()) return reply({ error: 'parent_path is not a directory' });
  } catch {
    // создадим parent recursively (UX: можно показать "Where to create" → новая папка)
    try { await mkdir(parentAbs, { recursive: true }); }
    catch (e) { return reply({ error: `cannot create parent: ${(e as Error).message}` }); }
  }
  const target = join(parentAbs, req.folder_name);
  try {
    await stat(target);
    return reply({ error: 'target folder already exists' });
  } catch { /* expected — папки нет */ }

  // 3. Подменяем URL на токен-эмбеддед если есть token (приватные репо).
  const cloneUrl = req.token
    ? req.repo_url.replace('https://', `https://x-access-token:${req.token}@`)
    : req.repo_url;
  const depth = Number.isFinite(req.depth) ? Math.max(1, Number(req.depth)) : 1;

  const args = ['clone', '--progress', '--depth', String(depth), cloneUrl, target];
  return new Promise<GitCloneReply>((resolve) => {
    const child = spawn('git', args, { env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
    child.stderr.setEncoding('utf8');
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => emit(chunk));
    child.stderr.on('data', (chunk: string) => emit(chunk));
    child.on('error', (err) => {
      resolve(reply({ error: `git not available: ${err.message}` }));
    });
    child.on('exit', async (code) => {
      if (code !== 0) {
        return resolve(reply({ error: `git exited with code ${code}` }));
      }
      // 4. Чистим токен из remote (если был): после успешного clone
      //    переписываем URL на чистый.
      if (req.token) {
        await new Promise<void>((res) => {
          const c = spawn('git', ['-C', target, 'remote', 'set-url', 'origin', req.repo_url]);
          c.on('exit', () => res());
          c.on('error', () => res());
        });
      }
      resolve({ type: 'git.clone.reply', correlation_id: req.id, ok: true, path: target });
    });
  });
}

export function makeProgressEmitter(
  send: (msg: GitCloneProgress) => void,
  correlationId: string,
): ProgressEmitter {
  return (text) => send({ type: 'git.clone.progress', correlation_id: correlationId, text });
}
