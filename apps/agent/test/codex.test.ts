import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractCodexResult, extractCodexText } from '../src/handlers/codex.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

test('extractCodexText reads Codex agent message frames', () => {
  assert.equal(
    extractCodexText({ id: 'run-1', msg: { type: 'agent_message_delta', delta: 'hello' } }),
    'hello',
  );
  assert.equal(
    extractCodexText({ id: 'run-1', msg: { type: 'agent_message', message: 'hello world' } }),
    'hello world',
  );
});

test('extractCodexResult reads Codex task_complete frame', () => {
  assert.equal(
    extractCodexResult({ id: 'run-1', msg: { type: 'task_complete', last_agent_message: 'final answer' } }),
    'final answer',
  );
});

test('extractCodexText ignores events without text payloads', () => {
  assert.equal(extractCodexText({ id: 'run-1', msg: { type: 'task_started' } }), '');
  assert.equal(extractCodexResult({ id: 'run-1', msg: { type: 'agent_message', message: 'not final' } }), '');
});

test('extractors handle recorded Codex json stream fixture', () => {
  const fixture = readFileSync(join(__dirname, 'fixtures', 'codex-exec.jsonl'), 'utf8');
  const events = fixture
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as Record<string, unknown>);

  assert.deepEqual(events.map(extractCodexText), ['Hi', 'Hi there', '']);
  assert.deepEqual(events.map(extractCodexResult), ['', '', 'Hi there']);
});
