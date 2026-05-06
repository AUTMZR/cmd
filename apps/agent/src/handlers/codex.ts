import { spawn } from 'node:child_process';
import type { ClaudeDone, ClaudeError, ClaudeEvent, ClaudeRequest } from '@autmzr/command-protocol';

type Send = (m: ClaudeEvent | ClaudeDone | ClaudeError) => void;

export function spawnCodex(
  req: ClaudeRequest,
  cwd: string,
  send: Send,
): ReturnType<typeof spawn> {
  const cliPath = process.env.PC_CODEX_PATH || 'codex';
  const prompt = req.system_prompt
    ? `${req.system_prompt}\n\nUser request:\n${req.prompt}`
    : req.prompt;

  const args = ['exec', '--json'];
  if (req.model) args.push('--model', req.model);
  args.push(prompt);

  const proc = spawn(cliPath, args, {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
  });

  let buf = '';
  proc.stdout.on('data', (chunk: Buffer) => {
    buf += chunk.toString('utf8');
    let idx;
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line) continue;
      try {
        const ev = JSON.parse(line) as Record<string, unknown>;
        const text = extractCodexText(ev);
        if (text) {
          send({
            type: 'claude.event',
            correlation_id: req.id,
            event: {
              type: 'assistant',
              message: { content: [{ type: 'text', text }] },
            },
          });
        }
        send({ type: 'claude.event', correlation_id: req.id, event: ev });
      } catch {
        send({
          type: 'claude.event',
          correlation_id: req.id,
          event: { type: 'stderr', text: `${line}\n` },
        });
      }
    }
  });

  return proc;
}

export function extractCodexText(ev: Record<string, unknown>): string {
  if (typeof ev.message === 'string') return ev.message;
  if (typeof ev.text === 'string') return ev.text;
  if (typeof ev.delta === 'string') return ev.delta;

  const params = ev.params as Record<string, unknown> | undefined;
  if (typeof params?.text === 'string') return params.text;
  if (typeof params?.delta === 'string') return params.delta;
  if (typeof params?.message === 'string') return params.message;

  return '';
}
