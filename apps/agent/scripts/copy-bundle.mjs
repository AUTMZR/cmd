#!/usr/bin/env node
/**
 * Postbuild: копируем apps/agent/dist/index.js → apps/master/public/agent.js
 * чтобы мастер мог раздавать его как статический ассет (connect.sh + auto-update).
 *
 * Также генерим apps/master/public/agent-version.json с текущей версией —
 * ws-hub читает его на старте и отдаёт agent_latest_version в hello.ack.
 */

import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const agentRoot = resolve(__dirname, '..');
const masterPublic = resolve(agentRoot, '..', 'master', 'public');

const pkg = JSON.parse(readFileSync(join(agentRoot, 'package.json'), 'utf8'));
const version = pkg.version;

const src = join(agentRoot, 'dist', 'index.js');
const dst = join(masterPublic, 'agent.js');

mkdirSync(masterPublic, { recursive: true });
copyFileSync(src, dst);
writeFileSync(join(masterPublic, 'agent-version.json'), JSON.stringify({ version }, null, 2) + '\n');

console.log(`[copy-bundle] agent v${version} → ${dst}`);
