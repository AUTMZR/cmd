import test from 'node:test';
import assert from 'node:assert/strict';
import { extractCodexText } from '../src/handlers/codex.js';

test('extractCodexText reads direct text fields', () => {
  assert.equal(extractCodexText({ message: 'hello' }), 'hello');
  assert.equal(extractCodexText({ text: 'world' }), 'world');
  assert.equal(extractCodexText({ delta: '!' }), '!');
});

test('extractCodexText reads nested JSON-RPC params', () => {
  assert.equal(extractCodexText({ params: { message: 'done' } }), 'done');
  assert.equal(extractCodexText({ params: { text: 'chunk' } }), 'chunk');
  assert.equal(extractCodexText({ params: { delta: 'stream' } }), 'stream');
});

test('extractCodexText ignores events without text payloads', () => {
  assert.equal(extractCodexText({ method: 'item/started', params: { item: { type: 'commandExecution' } } }), '');
});
