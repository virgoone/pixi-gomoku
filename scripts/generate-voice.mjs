#!/usr/bin/env node
/**
 * Render the game's voice lines with Fish Audio TTS into public/voice/.
 *
 *   FISH_API_KEY=... npm run voice            # only new or changed lines
 *   FISH_API_KEY=... npm run voice -- --force # re-render everything
 *
 * Optional: FISH_VOICE_ID (default: the cute voice in src/app/voiceLines.ts),
 * FISH_TTS_MODEL (default: the API default model).
 *
 * public/voice/manifest.json records the text and voice of each clip so a
 * later run only re-renders lines whose text or voice changed.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEFAULT_VOICE_ID, VOICE_LINES } from '../src/app/voiceLines.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'voice');
const manifestPath = join(outDir, 'manifest.json');

const apiKey = process.env.FISH_API_KEY;
const voiceId = process.env.FISH_VOICE_ID || DEFAULT_VOICE_ID;
const model = process.env.FISH_TTS_MODEL;
const force = process.argv.includes('--force');

if (!apiKey) {
  console.error('FISH_API_KEY is not set. Create a key at https://fish.audio/app/api-keys and run:\n  FISH_API_KEY=... npm run voice');
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : { lines: {} };
const fingerprint = (text) => createHash('sha1').update(`${voiceId}|${model ?? ''}|${text}`).digest('hex').slice(0, 12);

async function render(text) {
  const headers = { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' };
  if (model) headers.model = model;
  for (let attempt = 1; ; attempt += 1) {
    const response = await fetch('https://api.fish.audio/v1/tts', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        text,
        reference_id: voiceId,
        format: 'mp3',
        mp3_bitrate: 128,
        latency: 'normal',
        normalize: true,
        prosody: { speed: 1.0, normalize_loudness: true },
      }),
    });
    if (response.ok) return Buffer.from(await response.arrayBuffer());
    const detail = (await response.text()).slice(0, 300);
    // Overloaded or rate limited: back off and retry a few times.
    if ((response.status === 503 || response.status === 429) && attempt < 4) {
      await new Promise((resolve) => setTimeout(resolve, 1500 * attempt));
      continue;
    }
    throw new Error(`HTTP ${response.status}: ${detail}`);
  }
}

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
  let audio;
  try {
    audio = await render(text);
  } catch (error) {
    console.log('failed');
    console.error(`\n${error.message}`);
    if (String(error.message).startsWith('HTTP 401')) console.error('The API key was rejected; check FISH_API_KEY.');
    if (String(error.message).startsWith('HTTP 402')) console.error('The Fish Audio account is out of credit.');
    process.exitCode = 1;
    break;
  }
  writeFileSync(file, audio);
  manifest.lines[id] = { text, voiceId, fingerprint: print, bytes: audio.length };
  rendered += 1;
  console.log(`${(audio.length / 1024).toFixed(1)} KB`);
}
manifest.voiceId = voiceId;
manifest.lines = Object.fromEntries(Object.entries(manifest.lines).filter(([id]) => id in VOICE_LINES));
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Done: ${rendered} rendered, ${skipped} unchanged → public/voice/`);
