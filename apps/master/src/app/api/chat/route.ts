import { NextRequest } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { requireActiveAccess } from '@/lib/access';
import { query, queryOne } from '@/lib/db';
import { hub } from '@/lib/ws-hub';
import { v4 as uuidv4 } from 'uuid';
import type {
  ClaudeRequest, ClaudeEvent, ClaudeDone, ClaudeError, McpServerSpec,
  FsReadRequest, FsReadReply,
} from '@autmzr/command-protocol';
import { processClaudeMessage, startJob } from '@/lib/job-tracker';
import { issueRfsToken } from '@/lib/rfs-tokens';
import { effectiveIntent } from '@/lib/device-intent';
import { normalizeProvider, resolveModel, type Provider } from '@/lib/models';
import { parseCliError } from '@/lib/cli-error-parser';

/**
 * В proxy-режиме claude запускается в пустом /tmp на worker'е — там нет CLAUDE.md проекта.
 * Поэтому читаем `<project.path>/CLAUDE.md` (если есть) с fs-device и подкладываем в system prompt.
 * Мягкая ошибка: файла нет — идём дальше без него.
 */
async function fetchProjectMemory(userId: string, fsDeviceId: string, path: string): Promise<string | null> {
  if (!path) return null;
  const candidates = [`${path.replace(/\/$/, '')}/CLAUDE.md`, `${path.replace(/\/$/, '')}/.claude/CLAUDE.md`];
  for (const p of candidates) {
    try {
      const req: FsReadRequest = { type: 'fs.read', id: uuidv4(), path: p, max_bytes: 64 * 1024 };
      const reply = await hub().request<FsReadReply>(fsDeviceId, userId, req, 'fs.read.reply', 10_000);
      if (!reply.error && !reply.binary && reply.content) return reply.content;
    } catch { /* ignore, try next */ }
  }
  return null;
}

/**
 * POST /api/chat
 * body: { message, sessionId?, projectId?, model? }
 * Шлёт claude-запрос через hub на устройство проекта, стримит события как SSE.
 */
export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  const blocked = requireActiveAccess(user);
  if (blocked) return blocked;

  const { message, sessionId, projectId, model: requestedModel,
          permissionMode = 'acceptEdits', effort = 'medium' } = await req.json();
  if (!message || typeof message !== 'string') return new Response('message required', { status: 400 });

  // Загружаем проект и устройство — включая intent/agent_logged_in для выбора режима.
  const project = projectId ? await queryOne<any>(
    `SELECT p.id, p.name, p.path, p.device_id, p.claude_device_id, p.instructions, p.default_model as project_default_model,
            d.name as device_name, d.intent as device_intent, d.agent_logged_in as device_agent_logged_in,
            d.preferred_agent as device_preferred_agent,
            cd.name as claude_device_name, cd.preferred_agent as claude_device_preferred_agent
     FROM pc.projects p
     LEFT JOIN pc.devices d  ON d.id  = p.device_id
     LEFT JOIN pc.devices cd ON cd.id = p.claude_device_id
     WHERE p.id = $1 AND p.user_id = $2`,
    [projectId, user.id],
  ) : null;

  if (projectId && !project) return new Response('project not found', { status: 404 });
  if (projectId && !project?.device_id) {
    return new Response(JSON.stringify({ error: 'Project has no device attached' }), { status: 400 });
  }

  // Определяем proxy-режим по effective intent устройства проекта:
  //   fs-only device → обязательно нужен claude_device_id, иначе ошибка
  //   claude device  → используем его самого для claude
  const fsDeviceRole = effectiveIntent({
    intent: project!.device_intent,
    agent_logged_in: project!.device_agent_logged_in,
  });
  const isProxy: boolean = fsDeviceRole === 'fs-only';
  if (isProxy && !project!.claude_device_id) {
    return new Response(JSON.stringify({
      error: `Project device "${project!.device_name}" is files-only but no claude-device is configured for this project.`,
    }), { status: 400 });
  }
  const fsDeviceId: string = project!.device_id;
  const claudeDeviceId: string = project!.claude_device_id || project!.device_id;

  if (!hub().isOnline(fsDeviceId)) {
    return new Response(JSON.stringify({ error: `Device "${project!.device_name}" is offline` }), { status: 503 });
  }
  if (isProxy && !hub().isOnline(claudeDeviceId)) {
    return new Response(JSON.stringify({ error: `Claude device "${project!.claude_device_name}" is offline` }), { status: 503 });
  }

  const deviceId = claudeDeviceId; // куда уедет claude-запрос

  // Выбор провайдера (claude-code | gemini-cli). Берём из preferred_agent того
  // устройства которое реально будет крутить AI (cd в proxy-режиме, d иначе).
  const provider: Provider = normalizeProvider(
    isProxy ? project!.claude_device_preferred_agent : project!.device_preferred_agent,
  );

  // Session: загружаем model из БД, либо создаём с наследованием.
  // Fallback-цепочка для итогового model:
  //   1. requested (явный pick в этом запросе — «только для этого сообщения»)
  //   2. session.model (ранее выбранная для чата)
  //   3. project.default_model (дефолт проекта)
  //   4. DEFAULT_MODEL[provider] (hardcoded fallback)
  let sid = sessionId as string | undefined;
  let claudeSessionId: string | null = null;
  let sessionModel: string | null = null;
  if (sid) {
    const s = await queryOne<{ id: string; claude_session_id: string | null; model: string | null }>(
      `SELECT id, claude_session_id, model FROM pc.sessions WHERE id = $1 AND user_id = $2`, [sid, user.id]);
    if (!s) return new Response('session not found', { status: 404 });
    claudeSessionId = s.claude_session_id;
    sessionModel = s.model;
  } else {
    const title = message.slice(0, 60) + (message.length > 60 ? '...' : '');
    // Если юзер явно указал модель на первом сообщении — сохраняем её. Иначе
    // копируем project.default_model. Если и его нет — оставляем NULL, чтобы
    // следующий запрос снова пошёл по fallback-цепочке (наследование от проекта).
    const initialModel = requestedModel || project?.project_default_model || null;
    const rows = await query<{ id: string }>(
      `INSERT INTO pc.sessions (user_id, project_id, title, model)
       VALUES ($1, $2, $3, COALESCE($4, 'sonnet')) RETURNING id`,
      [user.id, projectId || null, title, initialModel],
    );
    sid = rows[0].id;
    sessionModel = initialModel;
  }

  // Итоговая модель для этого запроса
  const model = resolveModel(provider, requestedModel || sessionModel, project?.project_default_model);

  // Если юзер явно переключил модель в composer-пилюле — персистим выбор в сессию,
  // чтобы следующий запрос в этот чат шёл на той же модели (иначе бы он снова
  // откатился на project.default_model, что выглядит как глюк в UI).
  if (requestedModel && requestedModel !== sessionModel) {
    await query(`UPDATE pc.sessions SET model = $1 WHERE id = $2 AND user_id = $3`,
      [model, sid, user.id]);
  }

  await query(`INSERT INTO pc.messages (session_id, role, content) VALUES ($1, 'user', $2)`, [sid, message]);

  // Build Claude request.
  // В proxy-режиме на claude-device нет файлов проекта, поэтому CLAUDE.md надо
  // притащить явно через fs-device и положить в system prompt.
  const projectMemory = isProxy && project?.path
    ? await fetchProjectMemory(user.id, fsDeviceId, project.path)
    : null;
  const systemPrompt = buildSystemPrompt(user, project, effort, isProxy, projectMemory);
  const requestId = uuidv4();

  // Proxy mode — готовим rfs-токен, конфиг MCP и блокируем встроенные file/bash инструменты.
  let mcp_servers: Record<string, McpServerSpec> | undefined;
  let built_in_tools: string | null | undefined;
  let strict_mcp_config: boolean | undefined;
  let allowed_tools: string[] | undefined;
  let disallowed_tools: string[] | undefined;
  let cwd = project?.path || '/tmp';

  if (isProxy) {
    const rfsToken = await issueRfsToken(user.id, project!.id, fsDeviceId);
    const masterUrl = process.env.PUBLIC_URL || 'http://localhost:3100';
    // ВАЖНО: оставляем sentinel 'pocket-claude-rfs', т.к. уже задеплоенные
    // прод-агенты работают на СТАРОМ bundle и не знают 'autmzr-command-rfs'.
    // Новые агенты (после rebrand) принимают оба варианта — см.
    // apps/agent/src/handlers/claude.ts (resolveRfsScriptPath).
    // Когда все агенты обновятся — можно безопасно переключить на новый sentinel.
    mcp_servers = {
      rfs: {
        command: 'pocket-claude-rfs',
        args: [],
        env: {
          // Новые имена. POCKET_CLAUDE_* шлём дублем — старый rfs-mcp
          // (если он уже задеплоен на claude-устройстве) умеет читать только их.
          AUTMZR_COMMAND_MASTER_URL: masterUrl,
          AUTMZR_COMMAND_RFS_TOKEN: rfsToken,
          AUTMZR_COMMAND_RFS_LABEL: `${project!.name}@${project!.device_name || 'fs'}`,
          POCKET_CLAUDE_MASTER_URL: masterUrl,
          POCKET_CLAUDE_RFS_TOKEN: rfsToken,
          POCKET_CLAUDE_RFS_LABEL: `${project!.name}@${project!.device_name || 'fs'}`,
        },
      },
    };
    // Отключаем ВСЕ встроенные file/bash тулы. Разрешаем только rfs_* и web/search.
    built_in_tools = ''; // --tools ""
    strict_mcp_config = true;
    allowed_tools = [
      'mcp__rfs__rfs_list', 'mcp__rfs__rfs_read', 'mcp__rfs__rfs_write',
      'mcp__rfs__rfs_edit', 'mcp__rfs__rfs_bash',
      'WebFetch', 'WebSearch',
    ];
    disallowed_tools = ['Read', 'Write', 'Edit', 'MultiEdit', 'Bash', 'Glob', 'Grep', 'NotebookEdit'];
    // В proxy-режиме реальный path лежит на fs-device. claude-device может
    // не иметь такой папки — запускаем в /tmp, cwd для тулов передаётся явно.
    cwd = '/tmp';
  }

  const claudeReq: ClaudeRequest = {
    type: 'claude',
    id: requestId,
    cwd,
    prompt: message,
    provider,
    model,
    resume_session_id: claudeSessionId,
    system_prompt: systemPrompt,
    allowed_tools: allowed_tools || ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep', 'WebFetch', 'WebSearch'],
    disallowed_tools,
    built_in_tools,
    strict_mcp_config,
    mcp_servers,
    permission_mode: permissionMode,
    effort,
    timeout_ms: 1_800_000,
  };

  // Persistent job row — пережить рестарт мастера и дисконнект агента.
  // В proxy-режиме device_id в job-таблице — это fs-device (куда пойдут recap/resume).
  await startJob({
    id: requestId,
    user_id: user.id,
    session_id: sid!,
    device_id: claudeDeviceId,
    prompt: message,
    model,
  });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      let assistantText = '';
      let newClaudeSid: string | undefined;
      const toolEvents: any[] = [];

      const push = (obj: any) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ ...obj, sessionId: sid })}\n\n`));
      };
      const keepAlive = setInterval(() => {
        if (closed) return;
        try { controller.enqueue(encoder.encode(': keep-alive\n\n')); } catch {}
      }, 15_000);

      // Сохранение (идемпотентное) — вызывается по done или error.
      // При abort (закрытие окна) НЕ вызываем — задача продолжается на агенте,
      // подписчик в hub живёт до прихода claude.done и сохраняет полный ответ.
      let finalized = false;
      const finalize = (errorText?: string) => {
        if (finalized) return;
        finalized = true;
        const body = assistantText || (errorText ? `❌ ${errorText}` : '');
        if (body) {
          query(
            `INSERT INTO pc.messages (session_id, role, content, tool_events) VALUES ($1, 'assistant', $2, $3::jsonb)`,
            [sid, body, JSON.stringify(toolEvents)],
          ).then(() => query(
            `UPDATE pc.sessions SET updated_at = NOW()${newClaudeSid ? ', claude_session_id = $2' : ''} WHERE id = $1`,
            newClaudeSid ? [sid, newClaudeSid] : [sid],
          )).catch((e) => console.error('[chat] save failed:', e.message));
        }
      };
      req.signal?.addEventListener('abort', () => {
        // Только закрываем стрим в браузер — backend задача продолжается.
        closed = true;
        clearInterval(keepAlive);
        try { controller.close(); } catch {}
      });

      try {
        const unsub = hub().send(claudeDeviceId, user.id, claudeReq, async (msg) => {
          // Persist progress в БД на каждое событие. Выживает при рестарте мастера.
          try {
            await processClaudeMessage(requestId, msg);
          } catch (e) {
            console.error('[chat] persist error:', (e as Error).message);
          }
          if (msg.type === 'claude.event') {
            const e = (msg as ClaudeEvent).event as any;
            if (e?.type === 'system' && e?.subtype === 'init' && typeof e?.session_id === 'string') {
              newClaudeSid = e.session_id;
            }
            if (e?.type === 'assistant') {
              const content = e.message?.content;
              if (Array.isArray(content)) {
                for (const c of content) {
                  if (c?.type === 'text' && typeof c.text === 'string') {
                    assistantText += c.text;
                    push({ type: 'text', text: c.text });
                  } else if (c?.type === 'tool_use') {
                    toolEvents.push({ tool: c.name, input: c.input });
                    push({ type: 'tool_use', tool: c.name, toolInput: typeof c.input === 'string' ? c.input : JSON.stringify(c.input).slice(0, 300) });
                  }
                }
              }
            }
            if (e?.type === 'result' && typeof e.result === 'string') {
              // Claude часто шлёт финальный текст только в `result`, минуя `assistant` events.
              // Дополняем недостающую часть, чтобы пользователь всегда видел итог.
              if (e.result && e.result !== assistantText) {
                if (assistantText && e.result.startsWith(assistantText)) {
                  const diff = e.result.slice(assistantText.length);
                  if (diff) { assistantText = e.result; push({ type: 'text', text: diff }); }
                } else {
                  // полная замена если префикс не совпадает
                  const missing = e.result;
                  if (!assistantText) {
                    assistantText = missing;
                    push({ type: 'text', text: missing });
                  } else {
                    // текст расходится — дошлём целиком, UI перепишет последнее сообщение
                    assistantText = missing;
                    push({ type: 'replace', text: missing });
                  }
                }
              }
            }
          } else if (msg.type === 'claude.done') {
            const done = msg as ClaudeDone;
            if (done.session_id) newClaudeSid = done.session_id;
            if (!assistantText && done.result) assistantText = done.result;
            closed = true;
            clearInterval(keepAlive);
            unsub();
            finalize();
            push({ type: 'done' });
            try { controller.close(); } catch {}
          } else if (msg.type === 'claude.error') {
            const err = msg as ClaudeError;
            // Парсим сырой stderr в структурированную ошибку с подсказкой
            // и action-кнопками (напр. «переключиться на Flash» при quota).
            const parsed = parseCliError(err.message || '', provider, model);
            closed = true;
            clearInterval(keepAlive);
            unsub();
            // В БД сохраняем только title — это то что видно при reload истории.
            finalize(parsed.title);
            push({ type: 'error', error: parsed.title, details: parsed });
            try { controller.close(); } catch {}
          }
        });
      } catch (e: any) {
        closed = true;
        clearInterval(keepAlive);
        push({ type: 'error', error: e.message || 'send failed' });
        try { controller.close(); } catch {}
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-store',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

const EFFORT: Record<string, string> = {
  low: '\n\nОтвечай максимально кратко и по существу.',
  medium: '',
  high: '\n\nРассуждай пошагово, анализируй все аспекты задачи подробно.',
  extra_high: '\n\nПодумай очень тщательно. Рассмотри несколько подходов, взвесь плюсы и минусы каждого, обоснуй выбор.',
  max: '\n\nМаксимально глубокий анализ. Разбери задачу по пунктам, рассмотри крайние случаи, проверь своё решение.',
};

function buildSystemPrompt(user: any, project: any, effort: string, proxy: boolean, projectMemory: string | null): string {
  let sp = `Ты — личный AI-ассистент. Отвечай на языке пользователя.`;
  if (project?.instructions) sp += `\n\n--- ПРОЕКТ "${project.name}" ---\n${project.instructions}`;
  if (project?.path) sp += `\n\nРабочая директория проекта: ${project.path}`;
  if (user.name) sp += `\n\nИмя пользователя: ${user.name}`;

  if (proxy) {
    sp += `

--- REMOTE FILESYSTEM MODE ---
Файлы проекта и shell-команды живут НЕ на твоей локальной машине, а на удалённом fs-устройстве "${project.device_name}".
Используй ТОЛЬКО следующие инструменты через MCP:
  • mcp__rfs__rfs_list(path)          — список файлов в директории
  • mcp__rfs__rfs_read(path)          — читать файл
  • mcp__rfs__rfs_write(path, content) — создать или перезаписать файл
  • mcp__rfs__rfs_edit(path, old_string, new_string, replace_all?) — точечная правка
  • mcp__rfs__rfs_bash(cmd, cwd?)     — выполнить shell-команду на fs-устройстве

Все пути — абсолютные на fs-устройстве. Проект лежит в: ${project.path || '(см. инструкции)'}.
Встроенные Read/Write/Edit/Bash/Glob/Grep на этом хосте тебе НЕ ДОСТУПНЫ — они работают с пустой временной папкой, а не с проектом. Всегда используй mcp__rfs__*.`;
  }

  // Подкладываем CLAUDE.md проекта (актуально и в обычном режиме для облегчения:
  // claude сам может его прочитать, но отдельная инжекция обходит мусор в cwd worker'а и,
  // главное, работает в proxy-режиме где CLAUDE.md не на worker'е).
  if (projectMemory) {
    sp += `\n\n--- PROJECT MEMORY (${project.path}/CLAUDE.md) ---\n${projectMemory.trim()}`;
  }

  sp += EFFORT[effort] || '';
  return sp;
}
