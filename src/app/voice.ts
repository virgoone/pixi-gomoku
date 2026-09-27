import { getProfile } from './storage';

/**
 * Spoken announcements via the browser's speech synthesis, so no audio files
 * ship with the game. Prefers a Mandarin voice; silently does nothing where
 * speech synthesis is unavailable or the game is muted.
 */

const synth = typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;
let voice: SpeechSynthesisVoice | null = null;

function pickVoice() {
  if (!synth) return;
  const voices = synth.getVoices();
  voice =
    voices.find((v) => /zh[-_]CN/i.test(v.lang) && /xiaoxiao|tingting|google/i.test(v.name)) ??
    voices.find((v) => /zh[-_]CN/i.test(v.lang)) ??
    voices.find((v) => /^zh/i.test(v.lang)) ??
    null;
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
    utterance.rate = options.rate ?? 1.05;
    utterance.pitch = options.pitch ?? 1.1;
    utterance.volume = 1;
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
