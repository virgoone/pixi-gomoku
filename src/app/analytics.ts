import type { BrainId } from '../gomoku/ai';
import type { Outcome } from '../result/scoring';

type AnalyticsWindow = Window & { dataLayer?: IArguments[]; gtag?: (...args: unknown[]) => void };
let send: AnalyticsWindow['gtag'];

/** Only the configured production origin reports. Forks, localhost and deploy
 * previews stay silent unless their owner explicitly configures their own tag. */
export function initAnalytics() {
  if (send || !import.meta.env.PROD || typeof window === 'undefined') return;
  const id = String(import.meta.env.VITE_GA_MEASUREMENT_ID ?? '').trim();
  const origin = String(import.meta.env.VITE_ANALYTICS_ORIGIN ?? 'https://gomoku.douni.one').replace(/\/$/, '');
  if (!/^G-[A-Z0-9]+$/.test(id) || window.location.origin !== origin) return;
  try {
    const target = window as AnalyticsWindow;
    target.dataLayer ??= [];
    target.gtag ??= function (..._args: unknown[]) { target.dataLayer!.push(arguments); };
    const page = new URL(window.location.pathname, origin);
    const query = new URLSearchParams(window.location.search);
    // Keep campaign attribution; never send room codes or arbitrary query data.
    for (const key of ['utm_source', 'utm_medium', 'utm_campaign']) {
      const value = query.get(key);
      if (value && /^[a-z0-9_-]{1,80}$/i.test(value)) page.searchParams.set(key, value);
    }
    let referrer = '';
    try { if (document.referrer) referrer = new URL(document.referrer).origin; } catch { /* No referrer. */ }
    send = target.gtag;
    send('js', new Date());
    send('config', id, {
      page_location: page.href,
      page_referrer: referrer,
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
    });
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${id}`;
    document.head.appendChild(script);
  } catch { send = undefined; } // Blocked analytics must never interrupt a game.
}

function event(name: string, params: Record<string, string | number | boolean> = {}) {
  try { send?.('event', name, params); } catch { /* Measurement is optional. */ }
}

export function trackGameStart(mode: Outcome['mode'], brain?: BrainId) {
  event('level_start', { level_name: mode === 'ai' ? `ai_${brain}` : mode, game_mode: mode });
}

export function trackGameEnd(outcome: Outcome) {
  const result = outcome.winner === null ? 'draw' : outcome.myStone === null ? 'local_win' : outcome.winner === outcome.myStone ? 'win' : 'loss';
  event('level_end', {
    level_name: outcome.mode === 'ai' ? `ai_${outcome.brain}` : outcome.mode,
    game_mode: outcome.mode,
    success: result === 'win' || result === 'local_win',
    result,
    move_count: outcome.totalMoves,
    end_reason: outcome.reason,
  });
}

export function trackLeaderboardView() { event('view_leaderboard'); }
