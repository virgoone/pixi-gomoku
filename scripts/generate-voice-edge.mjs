#!/usr/bin/env node
/**
 * Render the game's voice lines with Microsoft Edge's online neural TTS
 * (https://github.com/rany2/edge-tts, no API key) into public/voice/.
 *
 *   npm run voice:edge              # only new or changed lines
 *   npm run voice:edge -- --force   # re-render everything
 *
 * Needs `uvx` (https://docs.astral.sh/uv/) or an `edge-tts` executable on PATH.
 * Optional: EDGE_VOICE (default zh-CN-XiaoyiNeural, a lively cartoon voice),
 * EDGE_RATE (default +6%), EDGE_PITCH (default +0Hz).
 *
 * Writes the same public/voice/manifest.json as `npm run voice`, so a later
 * run only re-renders lines whose text or voice settings changed.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { VOICE_LINES } from '../src/app/voiceLines.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'voice');
const manifestPath = join(outDir, 'manifest.json');

const voice = process.env.EDGE_VOICE || 'zh-CN-XiaoyiNeural';
const rate = process.env.EDGE_RATE || '+6%';
const pitch = process.env.EDGE_PITCH || '+0Hz';
const force = process.argv.includes('--force');

const hasCommand = (command) => spawnSync(command, ['--version'], { stdio: 'ignore' }).status === 0;
const [command, prefix] = hasCommand('edge-tts') ? ['edge-tts', []] : hasCommand('uvx') ? ['uvx', ['edge-tts']] : [null, []];
if (!command) {
  console.error('edge-tts is not available. Install uv (https://docs.astral.sh/uv/) or run `pipx install edge-tts`.');
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : { lines: {} };
const voiceId = `edge:${voice}|${rate}|${pitch}`;
const fingerprint = (text) => createHash('sha1').update(`${voiceId}|${text}`).digest('hex').slice(0, 12);

let rendered = 0;
let skipped = 0;
for (const [id, text] of Object.entries(VOICE_LINES)) {
  const file = join(outDir, `${id}.mp3`);
  const print = fingerprint(text);
  if (!force && existsSync(file) && manifest.lines[id]?.fingerprint === print) {
    skipped += 1;
    continue;
  }
  process.stdout.write(`  ${id}: ${text} … `);
  // `--rate=+6%` form: a value starting with "-" would otherwise be read as a flag.
  execFileSync(command, [...prefix, '--voice', voice, `--rate=${rate}`, `--pitch=${pitch}`, '--text', text, '--write-media', file], { stdio: ['ignore', 'ignore', 'inherit'] });
  const bytes = statSync(file).size;
  manifest.lines[id] = { text, voiceId, fingerprint: print, bytes };
  rendered += 1;
  console.log(`${(bytes / 1024).toFixed(1)} KB`);
}
manifest.voiceId = voiceId;
manifest.lines = Object.fromEntries(Object.entries(manifest.lines).filter(([id]) => id in VOICE_LINES));
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Done: ${rendered} rendered, ${skipped} unchanged → public/voice/`);
