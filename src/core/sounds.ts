import { useSettings } from '../stores/settings';

let ctx: AudioContext | null = null;

function audioCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) ctx = new Ctor();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function blip(freqFrom: number, freqTo: number, duration: number, type: OscillatorType, volume: number, delay = 0) {
  const ac = audioCtx();
  if (!ac) return;
  const t0 = ac.currentTime + delay;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freqFrom, t0);
  osc.frequency.exponentialRampToValueAtTime(Math.max(40, freqTo), t0 + duration);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(volume, t0 + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(gain).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.05);
}

/** Звуки синтезируются WebAudio — не нужны аудиофайлы и не ломают офлайн. */
export const sounds = {
  enabled(): boolean {
    return useSettings.getState().sound;
  },
  move() {
    if (!this.enabled()) return;
    blip(660, 220, 0.08, 'square', 0.08);
  },
  capture() {
    if (!this.enabled()) return;
    blip(300, 90, 0.1, 'square', 0.1);
    blip(150, 60, 0.12, 'triangle', 0.12, 0.02);
  },
  check() {
    if (!this.enabled()) return;
    blip(880, 880, 0.07, 'sine', 0.09);
    blip(660, 660, 0.09, 'sine', 0.09, 0.09);
  },
  gameEnd() {
    if (!this.enabled()) return;
    blip(523, 523, 0.12, 'sine', 0.09);
    blip(659, 659, 0.12, 'sine', 0.09, 0.13);
    blip(784, 784, 0.2, 'sine', 0.09, 0.26);
  },
};
