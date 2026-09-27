import { getProfile, updateProfile } from './storage';
import { stopSpeaking } from './voice';

/**
 * Synthesised sound effects, no audio files. Everything is built from soft
 * sine "bell" partials, filtered noise and gentle envelopes, then sent through
 * a warm low-pass, a short generated reverb and a compressor so nothing
 * sounds raw or harsh. A limiter at the very end keeps stacked cues from
 * clipping.
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
    // warm low-pass → gain → gentle compressor → brick-wall limiter. The make-up
    // gain sits before the dynamics so stacked cues (boom + bells + voice) never clip.
    const warm = audio.createBiquadFilter();
    warm.type = 'lowpass';
    warm.frequency.value = 7000;
    warm.Q.value = 0.5;
    const master = audio.createGain();
    master.gain.value = 1.5;
    const compressor = audio.createDynamicsCompressor();
    compressor.threshold.value = -18;
    compressor.ratio.value = 3;
    compressor.attack.value = 0.005;
    compressor.release.value = 0.2;
    const limiter = audio.createDynamicsCompressor();
    limiter.threshold.value = -2;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.001;
    limiter.release.value = 0.1;
    warm.connect(master).connect(compressor).connect(limiter).connect(audio.destination);
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

/**
 * A filtered harmonic tone (saw/square/triangle through a low-pass that opens
 * with the attack): brassy for fanfares, plucky for ticks.
 */
function tone(frequency: number, duration: number, options: { type?: OscillatorType; gain?: number; delay?: number; attack?: number; cutoff?: number; detune?: number; reverb?: number; pan?: number; glideTo?: number } = {}) {
  const b = getBus();
  if (!b) return;
  const { audio } = b;
  const start = audio.currentTime + (options.delay ?? 0);
  const attack = options.attack ?? 0.02;
  const filter = audio.createBiquadFilter();
  filter.type = 'lowpass';
  filter.Q.value = 1.4;
  const cutoff = options.cutoff ?? 2400;
  filter.frequency.setValueAtTime(cutoff * 0.25, start);
  filter.frequency.exponentialRampToValueAtTime(cutoff, start + attack + 0.04);
  filter.frequency.exponentialRampToValueAtTime(cutoff * 0.4, start + duration);
  const g = audio.createGain();
  g.gain.setValueAtTime(0.0001, start);
  g.gain.linearRampToValueAtTime(options.gain ?? 0.08, start + attack);
  g.gain.setValueAtTime(options.gain ?? 0.08, start + Math.max(attack, duration * 0.6));
  g.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  // Two slightly detuned voices for a fuller, ensemble sound.
  for (const cents of [-(options.detune ?? 7), options.detune ?? 7]) {
    const osc = audio.createOscillator();
    osc.type = options.type ?? 'sawtooth';
    osc.frequency.setValueAtTime(frequency, start);
    if (options.glideTo) osc.frequency.exponentialRampToValueAtTime(options.glideTo, start + duration);
    osc.detune.value = cents;
    osc.connect(filter);
    osc.start(start);
    osc.stop(start + duration + 0.05);
  }
  filter.connect(g);
  let tail: AudioNode = g;
  if (options.pan && audio.createStereoPanner) {
    const panner = audio.createStereoPanner();
    panner.pan.value = options.pan;
    g.connect(panner);
    tail = panner;
  }
  send(b, tail, options.reverb ?? 0.35);
}

/** Low-passed noise burst whose cutoff falls: the body of an explosion. */
function rumble(duration: number, options: { gain?: number; from?: number; to?: number; delay?: number } = {}) {
  const b = getBus();
  if (!b) return;
  const { audio } = b;
  const start = audio.currentTime + (options.delay ?? 0);
  const buffer = audio.createBuffer(1, Math.ceil(audio.sampleRate * duration), audio.sampleRate);
  const data = buffer.getChannelData(0);
  // Brown-ish noise: integrated white noise has the weight a boom needs.
  let last = 0;
  for (let i = 0; i < data.length; i += 1) {
    last = (last + 0.04 * (Math.random() * 2 - 1)) / 1.04;
    data[i] = last * 3.5;
  }
  const source = audio.createBufferSource();
  source.buffer = buffer;
  const filter = audio.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(options.from ?? 1800, start);
  filter.frequency.exponentialRampToValueAtTime(options.to ?? 90, start + duration);
  const g = audio.createGain();
  g.gain.setValueAtTime(0.0001, start);
  g.gain.linearRampToValueAtTime(options.gain ?? 0.5, start + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  source.connect(filter).connect(g);
  source.start(start);
  send(b, g, 0.35);
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
const G4 = 392;
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
  /** Crouch-and-leap: a springy upward boing and a short whoosh. */
  jump: () => {
    glide(180, 620, 0.22, { gain: 0.12, attack: 0.02, reverb: 0.15 });
    hiss(0.25, { gain: 0.05, from: 700, to: 2600, q: 1.2, attack: 0.08 });
  },
  /** The mid-air turn: an airy swish. */
  spin: () => hiss(0.3, { gain: 0.07, from: 1200, to: 4200, q: 2.2, attack: 0.1, reverb: 0.25 }),
  /** Tier-up: a bright major arpeggio that sits higher with every tier (0..3). */
  upgrade: (tier = 1) => {
    const up = 2 ** ((tier - 1) * 2 / 12);
    hiss(0.4, { gain: 0.06, from: 600, to: 4200, q: 1.5, attack: 0.15, reverb: 0.5 });
    [C5, E5, G5, C6].forEach((f, i) => bell(f * up, { gain: 0.1, delay: 0.04 + i * 0.06, decay: 0.9, pan: (i - 1.5) * 0.25 }));
    [C5, E5, G5].forEach((f) => tone(f * up, 0.5, { type: 'triangle', gain: 0.035, delay: 0.24, attack: 0.02, cutoff: 3200 }));
  },
  /** Charge before opening: a riser whose pitch keeps climbing, with a trembling whoosh. */
  charge: (duration = 1) => {
    hiss(duration, { gain: 0.1, from: 300, to: 3200, q: 2.5, attack: duration * 0.8, reverb: 0.3 });
    glide(160, 900, duration, { gain: 0.08, attack: duration * 0.7 });
    tone(110, duration, { type: 'sawtooth', gain: 0.05, attack: duration * 0.8, cutoff: 900, glideTo: 330, reverb: 0.2 });
  },
  /** The burst: sub-bass drop, a noise blast and a shower of bells; `strength` 0..1 scales it. */
  open: (strength = 1) => {
    glide(120, 38, 0.7, { gain: 0.34 + 0.12 * strength, reverb: 0.4 });
    rumble(0.9 + 0.5 * strength, { gain: 0.32 + 0.25 * strength, from: 2400, to: 70 });
    hiss(0.5, { gain: 0.08, from: 3000, to: 800, q: 0.7, reverb: 0.6, delay: 0.02 });
    [C6, D6, E6, G6, A5 * 2].forEach((f, i) => bell(f, { gain: 0.07, delay: 0.12 + i * 0.06, decay: 1.2, pan: (Math.random() - 0.5) * 0.6 }));
  },
  /** Victory horn for the reveal: a brassy call, then a held major chord. Bigger chests get the long version. */
  fanfare: (tier = 0) => {
    const notes: Array<[number, number, number]> = tier >= 2
      ? [[G4, 0, 0.14], [C5, 0.14, 0.14], [E5, 0.28, 0.14], [G5, 0.42, 0.9]]
      : [[C5, 0, 0.14], [G5, 0.14, 0.7]];
    for (const [f, delay, length] of notes) tone(f, length, { type: 'sawtooth', gain: 0.07, delay, attack: 0.03, cutoff: 2600 });
    const hold = notes[notes.length - 1][1];
    for (const f of [C5, E5, G5]) tone(f, 1.1, { type: 'sawtooth', gain: 0.035, delay: hold, attack: 0.06, cutoff: 1800, detune: 10 });
    bell(C6 * 2, { gain: 0.05, delay: hold, decay: 1.4 });
  },
  /** A reward card pops out. */
  pop: () => {
    glide(420, 980, 0.09, { gain: 0.16, reverb: 0.15 });
    bell(E6, { gain: 0.06, delay: 0.03, decay: 0.3 });
  },
  /** One count-up tick; soft and short because it repeats quickly. */
  tick: (step = 0) => tone(1600 + (step % 6) * 90, 0.045, { type: 'square', gain: 0.02, attack: 0.002, cutoff: 5000, detune: 0, reverb: 0.05 }),
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
