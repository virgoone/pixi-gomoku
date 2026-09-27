import { getProfile } from './storage';

/**
 * Spoken announcements via the browser's speech synthesis, so no audio files
 * ship with the game. Prefers a Mandarin voice; silently does nothing where
 * speech synthesis is unavailable or the game is muted.
 */

const synth = typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;
let voice: SpeechSynthesisVoice | null = null;

/**
 * Rank Mandarin voices: neural "natural" voices (Edge/Windows Xiaoxiao,
 * Xiaoyi, Yunxi…), then good platform voices (Google, Apple Tingting/Meijia),
 * then any Chinese voice. The older compact voices sound robotic.
 */
function score(v: SpeechSynthesisVoice) {
  if (!/^zh/i.test(v.lang)) return -1;
  let points = /zh[-_]CN/i.test(v.lang) ? 10 : 0;
  if (/natural|neural|online/i.test(v.name)) points += 100;
  if (/xiaoxiao|xiaoyi|yunxi|xiaohan|xiaomo/i.test(v.name)) points += 50;
  if (/google/i.test(v.name)) points += 40;
  if (/tingting|meijia|lili|yu-shu/i.test(v.name)) points += 30;
  if (/compact|huihui|kangkang|yaoyao/i.test(v.name)) points -= 20;
  return points;
}

function pickVoice() {
  if (!synth) return;
  const ranked = synth
    .getVoices()
    .filter((v) => score(v) >= 0)
    .sort((a, b) => score(b) - score(a));
  voice = ranked[0] ?? null;
}

if (synth) {
  pickVoice();
  synth.addEventListener?.('voiceschanged', pickVoice);
  // iOS only lets a page speak after speech was started from a user gesture:
  // say nothing, silently, on the first tap so later announcements can play.
  const unlock = () => {
    const silent = new SpeechSynthesisUtterance(' ');
    silent.volume = 0;
    synth.speak(silent);
  };
  window.addEventListener('pointerdown', unlock, { once: true, capture: true });
}

export function speak(text: string, options: { rate?: number; pitch?: number; delay?: number } = {}) {
  if (!synth || getProfile().muted) return;
  const say = () => {
    if (getProfile().muted) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = voice?.lang ?? 'zh-CN';
    if (voice) utterance.voice = voice;
    // Natural pace and pitch; pushing them up is what makes TTS sound robotic.
    utterance.rate = options.rate ?? 1;
    utterance.pitch = options.pitch ?? 1;
    utterance.volume = 0.9;
    // A new line replaces whatever is still being said.
    synth.cancel();
    synth.speak(utterance);
  };
  if (options.delay) window.setTimeout(say, options.delay * 1000);
  else say();
}

export function stopSpeaking() {
  synth?.cancel();
}
