import { query, queryOne } from './db';
import { sendToUser } from './push';
import type { AnyMessage, ClaudeEvent, ClaudeDone, ClaudeError } from '@autmzr/command-protocol';

/**
 * Управление persistent job-ами Claude.
 * Задача: при рестарте мастера, дисконнекте агента, закрытии вкладки —
 * накопленный прогресс сохраняется в БД, и после «нормализации»
 * ответ автоматически оказывается в pc.messages.
 */

export interface StartJobArgs {
  id: string;
  user_id: string;
  session_id: string;
  device_id: string | null;
  prompt: string;
  model?: string;
}

export async function startJob(a: StartJobArgs): Promise<void> {
  await query(
    `INSERT INTO pc.chat_jobs (id, user_id, session_id, device_id, prompt, model, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'running')
     ON CONFLICT (id) DO NOTHING`,
    [a.id, a.user_id, a.session_id, a.device_id, a.prompt, a.model ?? null],
  );
}

/**
 * Обрабатывает событие от Claude:
 *  - UPDATE pc.chat_jobs (накапливает текст и tool_events)
 *  - при done/error — INSERT в pc.messages (идемпотентно: один раз на job)
 */
export async function processClaudeMessage(jobId: string, msg: AnyMessage): Promise<void> {
  if (msg.type === 'claude.event') {
    const ev = (msg as ClaudeEvent).event as any;
    // Тексты и tool_use — accumulate
    if (ev?.type === 'assistant') {
      const content = ev.message?.content;
      if (Array.isArray(content)) {
        for (const c of content) {
          if (c?.type === 'text' && typeof c.text === 'string') {
            await query(
              `UPDATE pc.chat_jobs SET accumulated_text = accumulated_text || $1, last_event_at = NOW() WHERE id = $2`,
              [c.text, jobId],
            );
          } else if (c?.type === 'tool_use') {
            await query(
              `UPDATE pc.chat_jobs
               SET tool_events = tool_events || $1::jsonb, last_event_at = NOW()
               WHERE id = $2`,
              [JSON.stringify([{ tool: c.name, input: c.input }]), jobId],
            );
          }
        }
      }
    }
    if (ev?.type === 'system' && ev?.subtype === 'init' && typeof ev.session_id === 'string') {
      await query(`UPDATE pc.chat_jobs SET claude_session_id = $1, last_event_at = NOW() WHERE id = $2`,
        [ev.session_id, jobId]);
    }
    if (ev?.type === 'stderr' && typeof ev.text === 'string') {
      // Сохраняем stderr в tool_events — для диагностики когда CLI валится
      // без stdout (типичный кейс у Gemini: неизвестный --model → немедленный exit).
      await query(
        `UPDATE pc.chat_jobs
         SET tool_events = tool_events || $1::jsonb, last_event_at = NOW()
         WHERE id = $2`,
        [JSON.stringify([{ tool: '__stderr__', input: ev.text }]), jobId],
      );
    }
    if (ev?.type === 'result' && typeof ev.result === 'string') {
      // resultFinal — перезаписываем accumulated_text если отличается (у нас в stream может быть короче)
      await query(
        `UPDATE pc.chat_jobs
         SET accumulated_text = CASE
           WHEN LENGTH($1) >= LENGTH(accumulated_text) THEN $1
           ELSE accumulated_text END,
         last_event_at = NOW()
         WHERE id = $2`,
        [ev.result, jobId],
      );
    }
  } else if (msg.type === 'claude.done') {
    const done = msg as ClaudeDone;
    await finalizeJob(jobId, 'done', done.result ?? null, done.session_id ?? null);
  } else if (msg.type === 'claude.error') {
    const err = msg as ClaudeError;
    await finalizeJob(jobId, 'error', null, null, err.message);
  }
}

/** Финализирует job и создаёт pc.messages (идемпотентно). */
export async function finalizeJob(
  jobId: string,
  status: 'done' | 'error',
  finalResult: string | null,
  claudeSid: string | null,
  errorText?: string,
): Promise<void> {
  const job = await queryOne<{
    session_id: string; user_id: string; accumulated_text: string; tool_events: any; status: string;
    session_title: string | null;
  }>(`SELECT j.session_id, j.user_id, j.accumulated_text, j.tool_events, j.status, s.title AS session_title
      FROM pc.chat_jobs j LEFT JOIN pc.sessions s ON s.id = j.session_id WHERE j.id = $1`, [jobId]);
  if (!job) return;
  if (job.status !== 'running') return; // уже финализирован

  const text = (finalResult && finalResult.length >= job.accumulated_text.length)
    ? finalResult
    : job.accumulated_text;

  const body = text || (errorText ? `❌ ${errorText}` : '');
  if (body) {
    await query(
      `INSERT INTO pc.messages (session_id, role, content, tool_events) VALUES ($1, 'assistant', $2, $3::jsonb)`,
      [job.session_id, body, JSON.stringify(job.tool_events || [])],
    );
  }
  await query(
    `UPDATE pc.chat_jobs
     SET status = $1, completed_at = NOW(), error = $2,
         claude_session_id = COALESCE($3, claude_session_id),
         accumulated_text = $4
     WHERE id = $5`,
    [status, errorText ?? null, claudeSid, text, jobId],
  );
  if (claudeSid) {
    await query(`UPDATE pc.sessions SET claude_session_id = $1, updated_at = NOW() WHERE id = $2`,
      [claudeSid, job.session_id]);
  } else {
    await query(`UPDATE pc.sessions SET updated_at = NOW() WHERE id = $1`, [job.session_id]);
  }

  // Fire-and-forget push: не блокируем job-finalize, ошибки логируются в push.ts.
  void sendToUser(job.user_id, {
    title: status === 'done' ? '✓ Task done' : '✗ Task failed',
    body: status === 'done'
      ? truncate(text || job.session_title || 'Assistant finished', 140)
      : truncate(errorText || 'See chat for details', 140),
    url: `/app?session=${encodeURIComponent(job.session_id)}`,
    tag: `job-${jobId}`,
  }).catch(() => { /* swallow — already logged */ });
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + '…';
}

/** Список running jobs на устройстве. */
export async function runningJobsForDevice(deviceId: string): Promise<Array<{ id: string; user_id: string }>> {
  return query(
    `SELECT id, user_id FROM pc.chat_jobs WHERE device_id = $1 AND status = 'running'`,
    [deviceId],
  );
}

/** Есть ли running job для сессии (для UI-индикатора «выполняется»). */
export async function runningJobForSession(sessionId: string): Promise<{ id: string; accumulated_text: string } | null> {
  return queryOne(
    `SELECT id, accumulated_text FROM pc.chat_jobs WHERE session_id = $1 AND status = 'running' ORDER BY started_at DESC LIMIT 1`,
    [sessionId],
  );
}
