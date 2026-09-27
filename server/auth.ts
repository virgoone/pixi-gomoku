import type { KV } from './kv';

/**
 * Passwordless email sign-in, the same flow as the meme project: a 6-digit
 * code by email (Resend), valid for 10 minutes; the first sign-in creates the
 * account; the session lives in an HttpOnly cookie. Codes and session tokens
 * are only ever stored hashed.
 */

export type AuthEnv = {
  auth: KV;
  /** Pepper for hashing codes and tokens. Required in production. */
  secret: string;
  resendApiKey?: string;
  emailFrom?: string;
  adminEmails: Set<string>;
  /** Clock override for tests. */
  now?: () => number;
};

export type User = { id: string; email: string; name: string; role: 'admin' | 'user'; createdAt: number };
type OtpRecord = { hash: string; expiresAt: number; attempts: number; sentAt: number };
type SessionRecord = { userId: string; emailKey: string; expiresAt: number };

export const OTP_TTL_MS = 10 * 60 * 1000;
export const OTP_RESEND_MS = 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const SESSION_COOKIE = 'gomoku_session';

const encoder = new TextEncoder();

async function sha256(text: string) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function randomHex(bytes: number) {
  const data = crypto.getRandomValues(new Uint8Array(bytes));
  return [...data].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function randomCode() {
  // Rejection sampling keeps all 10^6 codes equally likely.
  const limit = Math.floor(0xffffffff / 1_000_000) * 1_000_000;
  for (;;) {
    const [n] = crypto.getRandomValues(new Uint32Array(1));
    if (n < limit) return String(n % 1_000_000).padStart(6, '0');
  }
}

/** Constant-time comparison of two equal-length hex strings. */
function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function normalizeEmail(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const email = input.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

/** Stable, non-reversible key for an email address. */
const emailKey = (env: AuthEnv, email: string) => sha256(`email|${env.secret}|${email}`);

function otpEmailHtml(otp: string) {
  return `<!doctype html><html><body style="font-family:ui-sans-serif,system-ui,sans-serif;background:#1b1033;padding:32px">
  <div style="max-width:420px;margin:0 auto;background:#fff;border:3px solid #2a1638;border-radius:18px;padding:28px">
    <h1 style="font-size:20px;margin:0 0 12px;color:#2a1638">五子棋 · 登录验证码</h1>
    <p style="color:#52525b;font-size:14px;margin:0 0 20px">使用下面的验证码登录并上榜，10 分钟内有效。</p>
    <div style="font-size:34px;font-weight:800;letter-spacing:10px;text-align:center;padding:16px;background:#fff3b0;border:3px solid #2a1638;border-radius:12px;color:#2a1638">${otp}</div>
    <p style="color:#a1a1aa;font-size:12px;margin:20px 0 0">如果不是你本人操作，请忽略此邮件。</p>
  </div></body></html>`;
}

async function sendOtpEmail(env: AuthEnv, email: string, otp: string) {
  const apiKey = env.resendApiKey?.trim();
  if (!apiKey) {
    // No mail provider configured (e.g. local dev): log it so sign-in still works.
    console.warn(`[auth] RESEND_API_KEY missing; OTP for ${email}: ${otp}`);
    return;
  }
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: env.emailFrom ?? 'Gomoku <onboarding@resend.dev>',
      to: email,
      subject: '五子棋登录验证码',
      html: otpEmailHtml(otp),
    }),
  });
  if (!response.ok) throw new Error(`Resend ${response.status}: ${(await response.text()).slice(0, 200)}`);
}

export class AuthError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** Step 1: mail a fresh code. Throttled to one per minute per address. */
export async function requestOtp(env: AuthEnv, rawEmail: unknown) {
  const email = normalizeEmail(rawEmail);
  if (!email) throw new AuthError(400, 'invalid_email', '邮箱格式不对');
  const now = env.now?.() ?? Date.now();
  const key = `otp/${await emailKey(env, email)}`;
  const existing = await env.auth.get<OtpRecord>(key);
  if (existing && now - existing.value.sentAt < OTP_RESEND_MS) {
    const wait = Math.ceil((OTP_RESEND_MS - (now - existing.value.sentAt)) / 1000);
    throw new AuthError(429, 'too_soon', `请 ${wait} 秒后再试`);
  }
  const otp = randomCode();
  const record: OtpRecord = { hash: await sha256(`otp|${env.secret}|${email}|${otp}`), expiresAt: now + OTP_TTL_MS, attempts: 0, sentAt: now };
  await env.auth.set(key, record);
  await sendOtpEmail(env, email, otp);
  return { email, otp };
}

/** Step 2: check the code, create the user on first sign-in, open a session. */
export async function verifyOtp(env: AuthEnv, rawEmail: unknown, rawCode: unknown, preferredName?: unknown) {
  const email = normalizeEmail(rawEmail);
  const code = typeof rawCode === 'string' ? rawCode.trim() : '';
  if (!email || !/^\d{6}$/.test(code)) throw new AuthError(400, 'invalid_code', '请输入 6 位验证码');
  const now = env.now?.() ?? Date.now();
  const eKey = await emailKey(env, email);
  const otpKey = `otp/${eKey}`;
  // Reserve an attempt before comparing: every guess, even parallel ones,
  // must win a conditional write that bumps the counter, so no more than
  // OTP_MAX_ATTEMPTS guesses are ever checked against one code.
  let record: OtpRecord | null = null;
  for (let tries = 0; tries < 10 && !record; tries += 1) {
    const entry = await env.auth.get<OtpRecord>(otpKey);
    if (!entry || entry.value.expiresAt < now) throw new AuthError(400, 'expired', '验证码已过期，请重新获取');
    if (entry.value.attempts >= OTP_MAX_ATTEMPTS) {
      await env.auth.delete(otpKey);
      throw new AuthError(429, 'too_many_attempts', '尝试次数过多，请重新获取验证码');
    }
    const reserved = { ...entry.value, attempts: entry.value.attempts + 1 };
    if (await env.auth.set(otpKey, reserved, { onlyIfMatch: entry.etag })) record = reserved;
  }
  if (!record) throw new AuthError(429, 'busy', '请稍后再试');
  const hash = await sha256(`otp|${env.secret}|${email}|${code}`);
  if (!safeEqual(hash, record.hash)) throw new AuthError(400, 'wrong_code', '验证码不对');
  await env.auth.delete(otpKey);

  const userKey = `users/${eKey}`;
  let user = (await env.auth.get<User>(userKey))?.value;
  if (!user) {
    const created: User = {
      id: randomHex(12),
      email,
      name: sanitizeName(preferredName) ?? `棋手${eKey.slice(0, 4).toUpperCase()}`,
      role: env.adminEmails.has(email) ? 'admin' : 'user',
      createdAt: now,
    };
    // Two first sign-ins racing: the second keeps the record the first created.
    if (!(await env.auth.set(userKey, created, { onlyIfNew: true }))) user = (await env.auth.get<User>(userKey))?.value;
    else user = created;
  }
  if (!user) throw new AuthError(500, 'user_missing', '登录失败，请重试');

  const token = randomHex(32);
  const session: SessionRecord = { userId: user.id, emailKey: eKey, expiresAt: now + SESSION_TTL_MS };
  await env.auth.set(`sessions/${await sha256(`session|${env.secret}|${token}`)}`, session);
  return { user, token, expiresAt: session.expiresAt };
}

/** The signed-in user for a session token, or null. */
export async function userForToken(env: AuthEnv, token: string | null): Promise<User | null> {
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return null;
  const key = `sessions/${await sha256(`session|${env.secret}|${token}`)}`;
  const session = await env.auth.get<SessionRecord>(key);
  if (!session) return null;
  if (session.value.expiresAt < (env.now?.() ?? Date.now())) {
    await env.auth.delete(key);
    return null;
  }
  return (await env.auth.get<User>(`users/${session.value.emailKey}`))?.value ?? null;
}

export async function signOut(env: AuthEnv, token: string | null) {
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return;
  await env.auth.delete(`sessions/${await sha256(`session|${env.secret}|${token}`)}`);
}

export async function renameUser(env: AuthEnv, user: User, rawName: unknown) {
  const name = sanitizeName(rawName);
  if (!name) throw new AuthError(400, 'invalid_name', '昵称需要 1–12 个字');
  const eKey = await emailKey(env, user.email);
  const updated = { ...user, name };
  await env.auth.set(`users/${eKey}`, updated);
  return updated;
}

/** 1–12 visible characters, no control characters or angle brackets. */
export function sanitizeName(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const name = [...input.replace(/[\p{C}<>]/gu, '').trim()].slice(0, 12).join('');
  return name.length ? name : null;
}

export function readSessionCookie(request: Request) {
  const cookie = request.headers.get('cookie') ?? '';
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export function sessionCookie(token: string, expiresAt: number, secure: boolean) {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Expires=${new Date(expiresAt).toUTCString()}${secure ? '; Secure' : ''}`;
}

export function clearSessionCookie(secure: boolean) {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`;
}
