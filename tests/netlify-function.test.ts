/// <reference types="node" />
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Context } from '@netlify/functions';
import api from '../netlify/functions/api.mts';
import { blobsKV } from '../server/kv';

vi.mock('../server/kv', async (original) => {
  const module = await original<typeof import('../server/kv')>();
  return { ...module, blobsKV: vi.fn(async () => new module.MemoryKV()) };
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('Netlify storage isolation', () => {
  it.each([
    ['production', ''],
    ['deploy-preview', '-preview'],
    ['branch-deploy', '-preview'],
    [undefined, '-preview'],
  ])('uses isolated stores for runtime context %s', async (deployContext, suffix) => {
    vi.stubEnv('AUTH_SECRET', 'test-secret-long-enough');
    // A stale or absent build variable must not override the runtime context.
    vi.stubEnv('CONTEXT', deployContext === 'production' ? 'deploy-preview' : 'production');
    const response = await api(new Request('https://game.test/api/auth/session'), { deploy: { context: deployContext } } as Context);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ user: null });
    expect(blobsKV).toHaveBeenCalledWith(`gomoku-auth${suffix}`);
    expect(blobsKV).toHaveBeenCalledWith(`gomoku-board${suffix}`);
  });

});
