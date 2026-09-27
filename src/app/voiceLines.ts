/**
 * Every spoken line in the game. `npm run voice` renders each one with Fish
 * Audio TTS into public/voice/<id>.mp3; the game plays those clips and falls
 * back to the browser's speech synthesis (with the same text) when a clip is
 * missing. Keep this file free of imports so the Node script can load it.
 */
export const VOICE_LINES = {
  win: '漂亮，你赢了！',
  winResign: '对手认输啦，你赢了！',
  lose: '差一点点，再来一局吧。',
  loseResign: '没关系，下一局再来。',
  draw: '平局，棋逢对手。',
  blackWins: '五子连珠，黑棋赢了！',
  whiteWins: '五子连珠，白棋赢了！',
  blackWinsResign: '黑棋赢了，对方认输。',
  whiteWinsResign: '白棋赢了，对方认输。',
  upgrade: '升级！',
  chest0: '哇，是普通宝箱！',
  chest1: '哇，是稀有宝箱！',
  chest2: '哇，是史诗宝箱！',
  chest3: '哇，是传说宝箱！',
} as const;

export type VoiceLineId = keyof typeof VOICE_LINES;

/** The Fish Audio voice used for the bundled clips: "萝莉萌妹", a sweet, cute public voice. */
export const DEFAULT_VOICE_ID = 'f82e3885ac22468eb6c773b96f2c5752';
