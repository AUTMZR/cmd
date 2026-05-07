import { spawn } from 'node:child_process';
import type { ClaudeRequest } from '@autmzr/command-protocol';

export function spawnCodex(
  req: ClaudeRequest,
  cwd: string,
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

  return proc;
}

export function extractCodexText(ev: Record<string, unknown>): string {
  const msg = ev.msg as Record<string, unknown> | undefined;
  if (!msg) return '';

  if (msg.type === 'agent_message_delta' && typeof msg.delta === 'string') {
    return msg.delta;
  }

  if (msg.type === 'agent_message' && typeof msg.message === 'string') {
    return msg.message;
  }

  return '';
}

export function extractCodexResult(ev: Record<string, unknown>): string {
  const msg = ev.msg as Record<string, unknown> | undefined;
  if (msg?.type === 'task_complete' && typeof msg.last_agent_message === 'string') {
    return msg.last_agent_message;
  }
  return '';
}
