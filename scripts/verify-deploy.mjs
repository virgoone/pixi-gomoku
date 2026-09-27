import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { appendFile, readFile, readdir } from 'node:fs/promises';
import { setTimeout } from 'node:timers/promises';

let result = JSON.parse(await readFile(process.env.DEPLOY_RESULT, 'utf8'));
assert.ok(result.id, 'Netlify must return a deploy ID');
for (let attempt = 0; result.state !== 'ready' && attempt < 60; attempt += 1) {
  assert.ok(!['error', 'failed'].includes(result.state), result.error_message || 'Deploy failed');
  await setTimeout(5000);
  const response = await fetch(`https://api.netlify.com/api/v1/deploys/${encodeURIComponent(result.id)}`, {
    headers: { Authorization: `Bearer ${process.env.NETLIFY_AUTH_TOKEN}` },
    signal: AbortSignal.timeout(30_000),
  });
  assert.ok(response.ok, `Deploy status request failed: ${response.status}`);
  result = await response.json();
}
assert.equal(result.state, 'ready', 'Deploy must become ready within five minutes');
const base = result.links?.permalink ?? result.deploy_ssl_url;
assert.ok(base?.startsWith('https://'), 'Netlify must return an HTTPS deploy URL');

async function verify(directory, prefix = '') {
  let count = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = `${prefix}${entry.name}`;
    if (entry.isDirectory()) {
      count += await verify(`${directory}/${entry.name}`, `${path}/`);
      continue;
    }
    const local = await readFile(`${directory}/${entry.name}`);
    const response = await fetch(`${base}/${path}`, { signal: AbortSignal.timeout(30_000) });
    assert.equal(response.status, 200, `${path} must be available`);
    const remote = Buffer.from(await response.arrayBuffer());
    const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
    assert.equal(hash(remote), hash(local), `${path} must match the tested build`);
    count += 1;
  }
  return count;
}

const count = await verify('dist');
console.log(`Verified ${count} published files against the tested build: ${base}`);
if (process.env.GITHUB_STEP_SUMMARY) {
  await appendFile(process.env.GITHUB_STEP_SUMMARY,
    `Verified all ${count} published files against the tested build.\n\n[Game](https://gomoku.douni.one) · [Immutable deploy](${base})\n`);
}
