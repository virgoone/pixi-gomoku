import type { IncomingMessage, ServerResponse } from 'node:http';

import { defineConfig, type Plugin } from 'vitest/config';

/**
 * Local stand-in for the Netlify Function: serves /api/* from the same code
 * with in-memory storage, and returns sign-in codes in the response (no mail).
 */
function localApi(): Plugin {
  return {
    name: 'local-api',
    apply: 'serve',
    async configureServer(server) {
      const { MemoryKV } = (await server.ssrLoadModule('/server/kv.ts')) as typeof import('./server/kv');
      const env = { auth: new MemoryKV(), board: new MemoryKV(), secret: 'local-dev-secret-not-for-production', adminEmails: new Set(['admin@example.com']), exposeDevCode: true };
      server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
        if (!req.url?.startsWith('/api/')) return next();
        const { handleApi } = (await server.ssrLoadModule('/server/api.ts')) as typeof import('./server/api');
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(chunk as Buffer);
        const headers = new Headers();
        for (const [key, value] of Object.entries(req.headers)) if (typeof value === 'string') headers.set(key, value);
        const request = new Request(`http://${req.headers.host}${req.url}`, {
          method: req.method,
          headers,
          body: req.method === 'GET' || req.method === 'HEAD' ? undefined : Buffer.concat(chunks),
        });
        const response = await handleApi(request, env);
        res.statusCode = response.status;
        response.headers.forEach((value, key) => res.setHeader(key, value));
        res.end(Buffer.from(await response.arrayBuffer()));
      });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [localApi()],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1200,
  },
  worker: { format: 'es' },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
