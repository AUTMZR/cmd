#!/usr/bin/env node
/**
 * Postbuild step: подписывает apps/master/public/agent.js Ed25519-приватником
 * из secrets/agent-signing-key.pem и пишет рядом agent.js.sig (raw 64-byte signature).
 *
 * Скрипт fail-soft: если приватника нет (dev на чистом checkout или CI без секрета) —
 * НЕ пишет .sig и предупреждает. Агенты с прописанным public key откажутся
 * апдейтиться без подписи (fail-closed).
 *
 * Env override: AGENT_SIGNING_KEY_PATH — альтернативный путь до приватника.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createSign, createPrivateKey, sign as edSign } from 'node:crypto';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const agentRoot = resolve(__dirname, '..');
const repoRoot = resolve(agentRoot, '..', '..');
const masterPublic = resolve(agentRoot, '..', 'master', 'public');
const bundlePath = join(masterPublic, 'agent.js');
const sigPath = join(masterPublic, 'agent.js.sig');
const keyPath = process.env.AGENT_SIGNING_KEY_PATH || join(repoRoot, 'secrets', 'agent-signing-key.pem');

if (!existsSync(bundlePath)) {
  console.error(`[sign-bundle] no bundle at ${bundlePath} — did you run tsup first?`);
  process.exit(1);
}
if (!existsSync(keyPath)) {
  console.warn(`[sign-bundle] no signing key at ${keyPath}`);
  console.warn(`[sign-bundle] skip signing — agent.js.sig NOT written`);
  console.warn(`[sign-bundle] agents with embedded public key will refuse this build`);
  console.warn(`[sign-bundle] generate key with: npx tsx scripts/agent-keygen.ts`);
  process.exit(0);
}

const bundle = readFileSync(bundlePath);
const privPem = readFileSync(keyPath, 'utf8');
const priv = createPrivateKey(privPem);

// Ed25519: sign expects null algorithm; output is 64 bytes raw.
const signature = edSign(null, bundle, priv);
writeFileSync(sigPath, signature);

console.log(`[sign-bundle] signed ${bundle.length} bytes → ${sigPath} (${signature.length} bytes sig)`);
