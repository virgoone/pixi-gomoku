import { getProfile, updateProfile } from './storage';

/** Tiny synthesised sound effects: no audio files to load. */

let context: AudioContext | null = null;

function ctx() {
  if (getProfile().muted) return null;
  if (!context) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    context = new Ctor();
  }
  if (context.state === 'suspended') void context.resume();
  return context;
}

function tone(frequency: number, duration: number, options: { type?: OscillatorType; gain?: number; delay?: number; slide?: number } = {}) {
  const audio = ctx();
  if (!audio) return;
  const start = audio.currentTime + (options.delay ?? 0);
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = options.type ?? 'sine';
  osc.frequency.setValueAtTime(frequency, start);
  if (options.slide) osc.frequency.exponentialRampToValueAtTime(options.slide, start + duration);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(options.gain ?? 0.2, start + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain).connect(audio.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

function noise(duration: number, gainValue: number, filterFrequency: number, delay = 0) {
  const audio = ctx();
  if (!audio) return;
  const start = audio.currentTime + delay;
  const buffer = audio.createBuffer(1, Math.ceil(audio.sampleRate * duration), audio.sampleRate);
  const data = buffer.getChannelData(0);
  for (let index = 0; index < data.length; index += 1) data[index] = (Math.random() * 2 - 1) * (1 - index / data.length);
  const source = audio.createBufferSource();
  source.buffer = buffer;
  const filter = audio.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = filterFrequency;
  const gain = audio.createGain();
  gain.gain.value = gainValue;
  source.connect(filter).connect(gain).connect(audio.destination);
  source.start(start);
}

export const sfx = {
  click: () => tone(660, 0.07, { type: 'triangle', gain: 0.12 }),
  stone: () => {
    tone(190, 0.12, { type: 'sine', gain: 0.35, slide: 120 });
    noise(0.05, 0.4, 2400);
  },
  invalid: () => tone(160, 0.14, { type: 'square', gain: 0.06 }),
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.35, { type: 'triangle', gain: 0.18, delay: i * 0.1 })),
  lose: () => [392, 330, 262].forEach((f, i) => tone(f, 0.4, { type: 'sine', gain: 0.16, delay: i * 0.16 })),
  land: () => {
    tone(90, 0.25, { gain: 0.4, slide: 50 });
    noise(0.12, 0.25, 600);
  },
  upgrade: () => {
    tone(300, 0.35, { type: 'sawtooth', gain: 0.06, slide: 1200 });
    [784, 988, 1175].forEach((f, i) => tone(f, 0.25, { type: 'triangle', gain: 0.12, delay: 0.25 + i * 0.06 }));
  },
  open: () => {
    noise(0.3, 0.3, 900);
    [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.6, { type: 'triangle', gain: 0.12, delay: 0.05 + i * 0.05 }));
  },
  reward: () => tone(1320, 0.12, { type: 'triangle', gain: 0.1, slide: 1760 }),
  coin: () => tone(1568, 0.08, { type: 'square', gain: 0.04 }),
};

export function setMuted(muted: boolean) {
  updateProfile({ muted });
  if (muted) void context?.suspend();
}
