/**
 * In-memory регистр загруженных plugin-providers.
 * Один раз заполняется при старте агента (`bootstrapPlugins`),
 * дальше handlers на provider.chat / provider.chat.cancel читают отсюда.
 */

import type { AIProvider, ChatEvent, CancelToken } from '@autmzr/plugin-api';
import { loadPlugins } from './plugin-loader.js';

interface RunningChat {
  cancel: () => void;
}

const providers = new Map<string, AIProvider>();
const runningChats = new Map<string, RunningChat>();

export async function bootstrapPlugins(log: (s: string) => void): Promise<void> {
  const loaded = await loadPlugins(log);
  for (const { provider } of loaded) {
    if (providers.has(provider.id)) {
      log(`plugin "${provider.id}" already registered, skipping duplicate`);
      continue;
    }
    providers.set(provider.id, provider);
  }
}

export function listProviders(): AIProvider[] {
  return [...providers.values()];
}

/** Снэпшот провайдеров для hello-message: id/label/models + быстрый status(). */
export async function snapshotProviders(): Promise<Array<{
  id: string; label: string;
  models: AIProvider['models'];
  status: { installed: boolean; logged_in: boolean; version?: string; note?: string };
}>> {
  const items = listProviders();
  return Promise.all(items.map(async (p) => {
    let status;
    try { status = await p.status(); }
    catch (e) {
      status = { installed: false, logged_in: false, note: (e as Error).message };
    }
    return { id: p.id, label: p.label, models: p.models, status };
  }));
}

export function startChat(args: {
  providerId: string;
  correlationId: string;
  prompt: string;
  cwd: string;
  instructions?: string;
  model?: string;
  effort?: 'low' | 'medium' | 'high' | 'extra-high' | 'max';
  permission_mode?: 'default' | 'plan' | 'accept-edits' | 'bypass';
  session_id?: string;
  emit: (event: ChatEvent) => void;
}): { ok: true } | { ok: false; reason: string } {
  const p = providers.get(args.providerId);
  if (!p) return { ok: false, reason: `unknown provider "${args.providerId}"` };

  const ctrl = new AbortController();
  const cancelToken: CancelToken = {
    signal: ctrl.signal,
    get cancelled() { return ctrl.signal.aborted; },
  };
  runningChats.set(args.correlationId, { cancel: () => ctrl.abort() });

  // Async — возвращаемся синхронно с ok=true; стрим идёт через emit().
  void p.chat(
    {
      id: args.correlationId,
      prompt: args.prompt,
      cwd: args.cwd,
      instructions: args.instructions,
      model: args.model,
      effort: args.effort,
      permission_mode: args.permission_mode,
      session_id: args.session_id,
    },
    args.emit,
    cancelToken,
  ).catch((e: unknown) => {
    args.emit({ type: 'error', message: (e as Error).message });
  }).finally(() => {
    runningChats.delete(args.correlationId);
  });

  return { ok: true };
}

export function cancelChat(correlationId: string): void {
  const r = runningChats.get(correlationId);
  if (r) r.cancel();
}
