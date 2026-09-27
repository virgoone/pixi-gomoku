import type { Config } from '@netlify/functions';

import { handleApi } from '../../server/api';
import { blobsKV } from '../../server/kv';

/**
 * Netlify Function serving every /api/* route. Storage is Netlify Blobs
 * (stores "gomoku-auth" and "gomoku-board"; "-preview" variants outside
 * production), configured automatically on Netlify. Environment variables:
 *   AUTH_SECRET     required: long random string used to hash codes and sessions
 *   RESEND_API_KEY  required for real email; without it codes are only logged
 *   EMAIL_FROM      sender on a Resend-verified domain, e.g. "五子棋 <login@example.com>"
 *   ADMIN_EMAILS    optional, comma-separated: may remove players from the board
 */
export default async (request: Request) => {
  const secret = process.env.AUTH_SECRET?.trim();
  if (!secret || secret.length < 16) {
    console.error('[api] AUTH_SECRET is missing or too short');
    return new Response(JSON.stringify({ error: { code: 'not_configured', message: '服务器未配置 AUTH_SECRET' } }), {
      status: 500,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  }
  // Blobs stores are shared by every deploy of the site; keep previews and branch
  // deploys from writing test accounts and scores into the production board.
  const suffix = process.env.CONTEXT && process.env.CONTEXT !== 'production' ? '-preview' : '';
  const [auth, board] = await Promise.all([blobsKV(`gomoku-auth${suffix}`), blobsKV(`gomoku-board${suffix}`)]);
  return handleApi(request, {
    auth,
    board,
    secret,
    resendApiKey: process.env.RESEND_API_KEY,
    emailFrom: process.env.EMAIL_FROM,
    adminEmails: new Set(
      (process.env.ADMIN_EMAILS ?? '')
        .split(',')
        .map((email: string) => email.trim().toLowerCase())
        .filter(Boolean),
    ),
  });
};

export const config: Config = { path: '/api/*' };
