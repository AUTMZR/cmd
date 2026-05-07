# Codex CLI

Autmzr can run OpenAI Codex CLI on a connected agent device and stream the
result back through the existing chat UI.

## Install

```bash
npm install -g @openai/codex
```

Or install the binary from the OpenAI Codex releases.

## Auth

Codex supports Sign in with ChatGPT and API-key based auth. For headless agent
devices, the simplest setup is:

```bash
export OPENAI_API_KEY=sk-...
codex --version
```

If you use Codex's interactive sign-in flow, run `codex` once on the same
device before connecting it to Autmzr.

## Models

Autmzr passes the selected model through Codex's `--model` flag. The default is
`gpt-5.3-codex`, with `gpt-5-codex` available as a faster balanced option.

## Current limitations

- Codex proxy-mode via MCP is not wired yet; filesystem proxy projects run
  without MCP when Codex is selected.
- Codex session resume is not wired yet; each request starts a fresh
  `codex exec` run.
- Codex does not expose a `--system-prompt` flag. When a project has a system
  prompt, Autmzr prepends it to the user prompt before starting `codex exec`.
