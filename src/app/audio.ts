import { getProfile, updateProfile } from './storage';
import { stopSpeaking } from './voice';

/**
 * Synthesised sound effects, no audio files. Everything is built from soft
 * sine "bell" partials, filtered noise and gentle envelopes, then sent through
 * a warm low-pass, a short generated reverb and a compressor so nothing
 * sounds raw or harsh.
 */

type Bus = { audio: AudioContext; dry: AudioNode; wet: AudioNode };

let bus: Bus | null = null;

function makeImpulse(audio: AudioContext, seconds: number, decay: number) {
  const length = Math.ceil(audio.sampleRate * seconds);
  const buffer = audio.createBuffer(2, length, audio.sampleRate);
  for (let channel = 0; channel < 2; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** decay;
  }
  return buffer;
}

function getBus(): Bus | null {
  if (getProfile().muted) return null;
  if (!bus) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    const audio = new Ctor();
    const compressor = audio.createDynamicsCompressor();
    compressor.threshold.value = -18;
    compressor.ratio.value = 3;
    compressor.attack.value = 0.005;
    compressor.release.value = 0.2;
    const master = audio.createGain();
    master.gain.value = 1.8;
    const warm = audio.createBiquadFilter();
    warm.type = 'lowpass';
    warm.frequency.value = 7000;
    warm.Q.value = 0.5;
    warm.connect(compressor).connect(master).connect(audio.destination);
    const reverb = audio.createConvolver();
    reverb.buffer = makeImpulse(audio, 1.4, 3);
    const wetGain = audio.createGain();
    wetGain.gain.value = 0.22;
    reverb.connect(wetGain).connect(warm);
    bus = { audio, dry: warm, wet: reverb };
  }
  if (bus.audio.state === 'suspended') void bus.audio.resume();
  return bus;
}

/** Route a voice to the dry path and (a little of it) to the reverb. */
function send(b: Bus, node: AudioNode, reverb = 0.6) {
  node.connect(b.dry);
  if (reverb > 0) {
    const g = b.audio.createGain();
    g.gain.value = reverb;
    node.connect(g).connect(b.wet);
  }
}

/** Soft bell: a sine fundamental with a quiet octave and fifth, quick attack, long decay. */
function bell(frequency: number, options: { gain?: number; delay?: number; decay?: number; reverb?: number; pan?: number } = {}) {
  const b = getBus();
  if (!b) return;
  const { audio } = b;
  const start = audio.currentTime + (options.delay ?? 0);
  const decay = options.decay ?? 0.6;
  const out = audio.createGain();
  out.gain.setValueAtTime(0.0001, start);
  out.gain.linearRampToValueAtTime(options.gain ?? 0.12, start + 0.008);
  out.gain.exponentialRampToValueAtTime(0.0001, start + decay);
  let tail: AudioNode = out;
  if (options.pan && audio.createStereoPanner) {
    const panner = audio.createStereoPanner();
    panner.pan.value = options.pan;
    out.connect(panner);
    tail = panner;
  }
  for (const [ratio, level] of [[1, 1], [2, 0.18], [3, 0.06]] as const) {
    const osc = audio.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = frequency * ratio;
    const g = audio.createGain();
    g.gain.value = level;
    osc.connect(g).connect(out);
    osc.start(start);
    osc.stop(start + decay + 0.05);
  }
  send(b, tail, options.reverb ?? 0.6);
}

/** Pitched sine with a smooth glide; for thumps and gentle risers. */
function glide(from: number, to: number, duration: number, options: { gain?: number; delay?: number; attack?: number; reverb?: number } = {}) {
  const b = getBus();
  if (!b) return;
  const { audio } = b;
  const start = audio.currentTime + (options.delay ?? 0);
  const osc = audio.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(from, start);
  osc.frequency.exponentialRampToValueAtTime(to, start + duration);
  const g = audio.createGain();
  g.gain.setValueAtTime(0.0001, start);
  g.gain.linearRampToValueAtTime(options.gain ?? 0.15, start + (options.attack ?? 0.01));
  g.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(g);
  osc.start(start);
  osc.stop(start + duration + 0.05);
  send(b, g, options.reverb ?? 0.2);
}

/** Band-passed noise; `to` sweeps the band for whooshes. */
function hiss(duration: number, options: { gain?: number; from?: number; to?: number; q?: number; delay?: number; attack?: number; reverb?: number } = {}) {
  const b = getBus();
  if (!b) return;
  const { audio } = b;
  const start = audio.currentTime + (options.delay ?? 0);
  const buffer = audio.createBuffer(1, Math.ceil(audio.sampleRate * duration), audio.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  const source = audio.createBufferSource();
  source.buffer = buffer;
  const filter = audio.createBiquadFilter();
  filter.type = 'bandpass';
  filter.Q.value = options.q ?? 1.2;
  filter.frequency.setValueAtTime(options.from ?? 1200, start);
  if (options.to) filter.frequency.exponentialRampToValueAtTime(options.to, start + duration);
  const g = audio.createGain();
  g.gain.setValueAtTime(0.0001, start);
  g.gain.linearRampToValueAtTime(options.gain ?? 0.1, start + (options.attack ?? 0.005));
  g.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  source.connect(filter).connect(g);
  source.start(start);
  send(b, g, options.reverb ?? 0.3);
}

/** Decode a compressed clip (e.g. a bundled voice line); null if audio is unavailable. */
export async function decodeClip(data: ArrayBuffer): Promise<AudioBuffer | null> {
  const audio = getBus()?.audio;
  if (!audio) return null;
  return await audio.decodeAudioData(data);
}

/** Play a decoded clip through the effects chain (dry, a touch of reverb). Returns a stopper. */
export function playClip(buffer: AudioBuffer, gain = 1): (() => void) | null {
  const b = getBus();
  if (!b) return null;
  const source = b.audio.createBufferSource();
  source.buffer = buffer;
  const g = b.audio.createGain();
  g.gain.value = gain;
  source.connect(g);
  send(b, g, 0.12);
  source.start();
  return () => {
    try {
      source.stop();
    } catch {
      /* already finished */
    }
  };
}

// Notes (Hz).
const C5 = 523.25;
const E5 = 659.25;
const G5 = 783.99;
const A5 = 880;
const C6 = 1046.5;
const D6 = 1174.66;
const E6 = 1318.51;
const G6 = 1567.98;
const A4 = 440;
const F4 = 349.23;
const D4 = 293.66;

export const sfx = {
  /** Soft bubble pop. */
  click: () => glide(620, 900, 0.07, { gain: 0.18, reverb: 0.1 }),
  /** Stone on wood: a short tock with a little body. */
  stone: () => {
    glide(260, 150, 0.1, { gain: 0.42, reverb: 0.15 });
    hiss(0.035, { gain: 0.34, from: 2600, q: 2.5, reverb: 0.2 });
  },
  /** Gentle "nope". */
  invalid: () => {
    glide(300, 240, 0.12, { gain: 0.14 });
    glide(240, 200, 0.14, { gain: 0.1, delay: 0.1 });
  },
  win: () => {
    [C5, E5, G5, C6].forEach((f, i) => bell(f, { gain: 0.12, delay: i * 0.11, decay: 0.9, pan: (i - 1.5) * 0.2 }));
    [C6, E6, G6].forEach((f) => bell(f, { gain: 0.06, delay: 0.5, decay: 1.6 }));
  },
  lose: () => {
    [A4, F4, D4].forEach((f, i) => bell(f, { gain: 0.1, delay: i * 0.2, decay: 1.1 }));
  },
  /** Chest landing: soft thud and a puff. */
  land: () => {
    glide(140, 60, 0.28, { gain: 0.3, reverb: 0.2 });
    hiss(0.2, { gain: 0.08, from: 500, to: 200, q: 0.8 });
  },
  /** Sparkling rise for a tier upgrade. */
  upgrade: () => {
    hiss(0.45, { gain: 0.07, from: 500, to: 4000, q: 1.5, attack: 0.2, reverb: 0.5 });
    [G5, C6, E6, G6].forEach((f, i) => bell(f, { gain: 0.1, delay: 0.18 + i * 0.07, decay: 0.8, pan: (i - 1.5) * 0.25 }));
  },
  /** Building whoosh while the chest rattles before opening. */
  charge: () => {
    hiss(0.85, { gain: 0.09, from: 300, to: 2600, q: 2, attack: 0.6, reverb: 0.3 });
    glide(220, 520, 0.85, { gain: 0.06, attack: 0.5 });
  },
  /** Opening: a soft boom and a cascade of bells. */
  open: () => {
    glide(110, 50, 0.5, { gain: 0.3, reverb: 0.4 });
    hiss(0.5, { gain: 0.08, from: 3000, to: 800, q: 0.7, reverb: 0.6 });
    [C6, D6, E6, G6, A5 * 2].forEach((f, i) => bell(f, { gain: 0.08, delay: 0.08 + i * 0.06, decay: 1.2, pan: (Math.random() - 0.5) * 0.6 }));
  },
  reward: () => bell(E6, { gain: 0.16, decay: 0.4, pan: (Math.random() - 0.5) * 0.4 }),
  /** Tiny coin chime; played many times in a row, so it is quiet and varies a little. */
  coin: () => bell([G6, A5 * 2, E6, D6][Math.floor(Math.random() * 4)], { gain: 0.12, decay: 0.3, reverb: 0.3, pan: (Math.random() - 0.5) * 0.5 }),
};

export function setMuted(muted: boolean) {
  updateProfile({ muted });
  if (muted) {
    void bus?.audio.suspend();
    stopSpeaking();
  }
}
