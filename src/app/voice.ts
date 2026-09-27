import { decodeClip, playClip } from './audio';
import { getProfile } from './storage';
import { VOICE_LINES, type VoiceLineId } from './voiceLines';

/**
 * Spoken announcements. The game ships voice clips rendered with Edge neural
 * TTS (public/voice/<id>.mp3, see `npm run voice:edge`); when a clip is missing or
 * cannot be decoded it falls back to the browser's speech synthesis with the
 * same text. Everything is silent while the game is muted.
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
if (typeof window !== 'undefined') {
  window.addEventListener('pointerdown', () => preloadVoice(), { once: true, capture: true });
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

// ---- bundled clips ---------------------------------------------------------------------

const clips = new Map<VoiceLineId, Promise<AudioBuffer | null>>();
let stopClip: (() => void) | null = null;
/** Bumped by every new line so a slow-loading older line never talks over it. */
let lineToken = 0;

function loadClip(id: VoiceLineId) {
  let clip = clips.get(id);
  if (!clip) {
    clip = fetch(`${import.meta.env.BASE_URL}voice/${id}.mp3`)
      .then((response) => {
        // Dev servers answer unknown paths with the HTML page; only accept audio.
        const type = response.headers.get('content-type') ?? '';
        return response.ok && !type.includes('text/html') ? response.arrayBuffer() : null;
      })
      .then((data) => (data ? decodeClip(data) : null))
      .catch(() => null);
    clips.set(id, clip);
  }
  return clip;
}

/** Fetch and decode every clip ahead of time (after the first tap, when audio may start). */
export function preloadVoice() {
  for (const id of Object.keys(VOICE_LINES) as VoiceLineId[]) void loadClip(id);
}

/**
 * Say one of the game's lines: the bundled clip if there is one, else speech
 * synthesis (unless `fallback` is false). A line cued to an animation beat sets
 * `maxLate`: if the clip is not ready within that many seconds of its cue it is
 * dropped rather than spoken over whatever the screen shows by then.
 */
export function say(id: VoiceLineId, options: { delay?: number; fallback?: boolean; maxLate?: number } = {}) {
  if (getProfile().muted) return;
  const token = ++lineToken;
  const run = async () => {
    const cued = performance.now();
    const buffer = await loadClip(id);
    if (token !== lineToken || getProfile().muted) return;
    if (options.maxLate !== undefined && (performance.now() - cued) / 1000 > options.maxLate) return;
    stopClip?.();
    synth?.cancel();
    if (buffer) stopClip = playClip(buffer, 1.1);
    else if (options.fallback !== false) speak(VOICE_LINES[id]);
  };
  if (options.delay) window.setTimeout(() => void run(), options.delay * 1000);
  else void run();
}

export function stopSpeaking() {
  lineToken += 1;
  stopClip?.();
  stopClip = null;
  synth?.cancel();
}
