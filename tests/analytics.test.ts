import { afterEach, beforeEach, expect, test, vi } from 'vitest';

let queue: IArguments[];
let append: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('PROD', true);
  vi.stubEnv('VITE_GA_MEASUREMENT_ID', 'G-TEST123');
  vi.stubEnv('VITE_ANALYTICS_ORIGIN', 'https://gomoku.douni.one');
  queue = [];
  append = vi.fn();
  vi.stubGlobal('window', { location: new URL('https://gomoku.douni.one/?room=123456&email=private@example.com&utm_source=twitter#secret'), dataLayer: queue });
  vi.stubGlobal('document', {
    referrer: 'https://example.com/private?email=private@example.com',
    createElement: () => ({}), head: { appendChild: append },
  });
});

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

test.each(['development', 'preview', 'missing-id'])('does not report from %s', async (context) => {
  if (context === 'development') vi.stubEnv('PROD', false);
  if (context === 'preview') vi.stubGlobal('window', { location: new URL('https://deploy-preview-4--pixi-gomoku.netlify.app'), dataLayer: queue });
  if (context === 'missing-id') vi.stubEnv('VITE_GA_MEASUREMENT_ID', '');
  const analytics = await import('../src/app/analytics');
  analytics.initAnalytics();
  analytics.trackGameStart('online');
  expect(queue).toHaveLength(0);
  expect(append).not.toHaveBeenCalled();
});

test('reports once, preserves campaign source and removes private URL data', async () => {
  const { initAnalytics } = await import('../src/app/analytics');
  initAnalytics();
  initAnalytics();
  const config = Array.from(queue[1]);
  expect(config).toEqual(['config', 'G-TEST123', expect.objectContaining({
    page_location: 'https://gomoku.douni.one/?utm_source=twitter',
    page_referrer: 'https://example.com',
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
  })]);
  expect(append).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(queue)).not.toMatch(/123456|private|secret/);
});

test('reports gameplay summaries without player identity or moves', async () => {
  const analytics = await import('../src/app/analytics');
  analytics.initAnalytics();
  analytics.trackGameStart('ai', 'owl');
  analytics.trackGameEnd({ mode: 'online', myStone: 1, winner: 2, totalMoves: 12, winnerMoves: 6, reason: 'five', opponentName: 'PRIVATE PLAYER', gameId: 'PRIVATE ID', moves: [[1, 2]] });
  analytics.trackLeaderboardView();
  const events = queue.slice(2).map(entry => Array.from(entry));
  expect(events).toEqual([
    ['event', 'level_start', { level_name: 'ai_owl', game_mode: 'ai' }],
    ['event', 'level_end', { level_name: 'online', game_mode: 'online', success: false, result: 'loss', move_count: 12, end_reason: 'five' }],
    ['event', 'view_leaderboard', {}],
  ]);
  expect(JSON.stringify(events)).not.toContain('PRIVATE');
});

test('blocked analytics cannot stop game startup or events', async () => {
  append.mockImplementation(() => { throw new Error('blocked'); });
  const analytics = await import('../src/app/analytics');
  expect(() => analytics.initAnalytics()).not.toThrow();
  const before = queue.length;
  expect(() => analytics.trackGameStart('local')).not.toThrow();
  expect(queue).toHaveLength(before);
});
