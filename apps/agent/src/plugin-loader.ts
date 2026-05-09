/**
 * Plugin loader. Сканит ~/.autmzr-command/plugins/ при старте агента,
 * динамически импортит каждый плагин и регистрирует его AIProvider.
 *
 * Структура папки:
 *   ~/.autmzr-command/plugins/
 *     ├── aider.js                — single-file plugin
 *     ├── cursor/index.js          — multi-file plugin (если нужны деpendencies)
 *     └── deepseek-cli/index.mjs   — ESM явно
 *
 * Плагины — обычные ESM-модули, default-export'ят AIProvider.
 * Никакой sandboxing'а нет — плагин запускается с правами агента,
 * пользователь сам решает кому доверять (как с npm-пакетами).
 */

import { readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { pathToFileURL } from 'node:url';
import type { AIProvider, PluginModule } from '@autmzr/plugin-api';
import { PLUGIN_API_VERSION } from '@autmzr/plugin-api';

const PLUGIN_ROOT = join(homedir(), '.autmzr-command', 'plugins');

interface LoadedPlugin {
  /** Путь до файла, для логов / ошибок. */
  source: string;
  provider: AIProvider;
}

/** Скан + dynamic import. Возвращает только успешно загруженные плагины. */
export async function loadPlugins(log: (s: string) => void): Promise<LoadedPlugin[]> {
  if (!existsSync(PLUGIN_ROOT)) {
    log(`plugins: ${PLUGIN_ROOT} not found, skipping`);
    return [];
  }
  const out: LoadedPlugin[] = [];
  let entries: string[];
  try {
    entries = readdirSync(PLUGIN_ROOT);
  } catch (e) {
    log(`plugins: read ${PLUGIN_ROOT} failed: ${(e as Error).message}`);
    return [];
  }

  for (const name of entries) {
    if (name.startsWith('.') || name.startsWith('_')) continue;
    const candidate = resolveEntry(name);
    if (!candidate) continue;
    try {
      const url = pathToFileURL(candidate).href;
      const mod = (await import(url)) as PluginModule;
      const provider = mod.default;
      if (!provider) {
        log(`plugin "${name}": no default export, skip`);
        continue;
      }
      if (provider.apiVersion !== PLUGIN_API_VERSION) {
        log(`plugin "${name}": apiVersion ${provider.apiVersion} != ${PLUGIN_API_VERSION}, skip`);
        continue;
      }
      if (!provider.id || !provider.label) {
        log(`plugin "${name}": missing id/label, skip`);
        continue;
      }
      out.push({ source: candidate, provider });
      log(`plugin loaded: ${provider.id} (${provider.label}) from ${name}`);
    } catch (e) {
      log(`plugin "${name}" load failed: ${(e as Error).message}`);
    }
  }
  return out;
}

/** Куда смотреть для каждого entry в плагин-папке. */
function resolveEntry(name: string): string | null {
  const direct = join(PLUGIN_ROOT, name);
  let s;
  try { s = statSync(direct); } catch { return null; }
  if (s.isFile()) {
    return name.endsWith('.js') || name.endsWith('.mjs') ? direct : null;
  }
  if (s.isDirectory()) {
    for (const entry of ['index.mjs', 'index.js']) {
      const p = join(direct, entry);
      if (existsSync(p)) return p;
    }
  }
  return null;
}
