# Autmzr Plugin API v1

Status: **experimental** — API can change in v0.3. Built for community contributors who want to add support for AI CLIs/SDKs that aren't built into core (Claude/Gemini/Codex).

---

## What a plugin is

An ESM JavaScript module that default-exports an `AIProvider`. The agent scans `~/.autmzr-command/plugins/` at startup, dynamically imports each plugin, and registers its providers. Each provider becomes a selectable option in the device's "Default agent" picker.

Plugins run in the agent process — same privileges as the agent itself. There is **no sandboxing** in v1. Treat plugin authors with the same trust level you'd give an npm dependency.

## Installation layout

The agent looks for plugins under `~/.autmzr-command/plugins/`:

```
~/.autmzr-command/plugins/
├── aider.js                 # single-file plugin
├── cursor/
│   └── index.js              # multi-file plugin (when you need deps)
└── deepseek-cli/
    └── index.mjs             # explicit ESM
```

Hidden entries (`.foo`, `_disabled`) are skipped.

## The contract

```ts
// packages/plugin-api/src/index.ts

export interface AIProvider {
  id: string;           // unique, used in URLs/DB
  label: string;        // shown in UI
  apiVersion: number;   // must equal PLUGIN_API_VERSION (1)
  models: ModelSpec[];

  status(): Promise<ProviderStatus>;
  chat(req: ChatRequest, emit: Emit, cancel: CancelToken): Promise<void>;
}

export interface ProviderStatus {
  installed: boolean;
  logged_in: boolean;
  version?: string;
  note?: string;
}

export type ChatEvent =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; name: string; input?: unknown }
  | { type: 'tool_result'; tool_use_id?: string; output?: unknown; error?: string }
  | { type: 'session'; session_id: string }
  | { type: 'error'; message: string; code?: string }
  | { type: 'done'; result?: string; session_id?: string };
```

See [`packages/plugin-api/src/index.ts`](../packages/plugin-api/src/index.ts) for the full type definitions.

## Minimal example: `echo`

A reference implementation lives at [`packages/example-plugin-echo/src/index.js`](../packages/example-plugin-echo/src/index.js). It echoes the user prompt back word-by-word, useful as a smoke test.

To install it on a device:

```bash
mkdir -p ~/.autmzr-command/plugins/echo
cp packages/example-plugin-echo/src/index.js ~/.autmzr-command/plugins/echo/
# Then restart the agent — systemctl restart autmzr-command-agent (or user-service)
```

After restart, open the device sheet in the UI — you'll see "Echo (demo)" alongside Claude/Gemini/Codex in the Default-agent picker.

## Authoring guidelines

- **Be fast in `status()`.** It's polled by the master and blocks UI rendering. Cache results internally if you need to shell out.
- **Honor `cancel.signal`.** Long-running chats must abort quickly when the user hits Stop. Use `AbortSignal` on `fetch`, kill child processes, etc.
- **Always emit a terminal event.** Either `{ type: 'done' }` or `{ type: 'error' }`. The master treats lack of one as a hung job.
- **Keep `id` stable.** It's persisted as `pc.devices.preferred_agent`. Renaming breaks user setups.
- **No relative imports outside your plugin folder.** The agent imports your default export — anything inside the folder is fine, but `import '../private'` won't reach the agent's internals (and shouldn't — that contract isn't stable).

## What plugins can NOT do (v1)

- Custom UI panels — UI is fixed. Plugins surface via `label` + `models`.
- Install/login flows — users configure the underlying CLI manually. The plugin only reports `status()`.
- Override built-in providers (Claude/Gemini/Codex). They're hardcoded for now.

## Roadmap

- v0.3: refactor built-in providers (Claude/Gemini/Codex) onto this same interface — plugins become first-class.
- v0.3+: plugin install UI in Settings (browse, enable, update from a registry).
- Eventually: `@autmzr/plugin-*` namespace on npm and a curated marketplace.

## Versioning

`PLUGIN_API_VERSION = 1`. Breaking changes will bump the version and the loader will refuse to load plugins built against older versions, surfacing a clear log line.
