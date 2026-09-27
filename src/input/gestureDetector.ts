export type GestureEvent = { type: 'start' | 'activate' | 'abort'; reason?: string; at: number };
export interface GestureConfig {
  activationThreshold: number;
  releaseThreshold: number;
  minimumHoldMs?: number;
  maximumHoldMs?: number;
  neutralMs?: number;
  releaseMs?: number;
  cooldownMs?: number;
  maximumGapMs?: number;
}

/** A selection needs valid rest, deliberate hold, and a complete release. */
export class GestureDetector {
  private armed = false;
  private neutralSince: number | null = null;
  private started: number | null = null;
  private released: number | null = null;
  private previous: number | null = null;
  private cooldownUntil = 0;
  readonly config: Required<GestureConfig>;

  constructor(config: GestureConfig) {
    this.config = { minimumHoldMs: 250, maximumHoldMs: 2500, neutralMs: 350,
      releaseMs: 150, cooldownMs: 650, maximumGapMs: 350, ...config };
    if (!(config.releaseThreshold >= 0 && config.releaseThreshold < config.activationThreshold && config.activationThreshold <= 1)) {
      throw new Error('Release threshold must be lower than activation threshold.');
    }
  }

  reset(at: number, reason = 'Input reset'): GestureEvent[] {
    const events: GestureEvent[] = this.started === null ? [] : [{ type: 'abort', reason, at }];
    this.armed = false; this.neutralSince = null; this.started = null;
    this.released = null; this.previous = null;
    this.cooldownUntil = at + this.config.cooldownMs;
    return events;
  }

  observe(score: number, at: number, valid = true): GestureEvent[] {
    if (!valid || !Number.isFinite(score) || score < 0 || score > 1 || !Number.isFinite(at)) {
      return this.reset(Number.isFinite(at) ? at : 0, 'Tracking unavailable');
    }
    if (this.previous !== null && (at <= this.previous || at - this.previous > this.config.maximumGapMs)) {
      const events = this.reset(at, 'Stale or out-of-order observation');
      this.previous = at;
      return events;
    }
    this.previous = at;
    if (this.started !== null) {
      if (at - this.started > this.config.maximumHoldMs) return this.reset(at, 'Gesture held too long');
      if (score <= this.config.releaseThreshold) {
        this.released ??= at;
        if (this.released - this.started < this.config.minimumHoldMs) return this.reset(at, 'Gesture too short');
        if (at - this.released >= this.config.releaseMs) {
          this.reset(at);
          return [{ type: 'activate', at }];
        }
      } else this.released = null;
      return [];
    }
    if (score <= this.config.releaseThreshold) {
      this.neutralSince ??= at;
      if (at - this.neutralSince >= this.config.neutralMs && at >= this.cooldownUntil) this.armed = true;
    } else {
      this.neutralSince = null;
      if (this.armed && score >= this.config.activationThreshold && at >= this.cooldownUntil) {
        this.started = at; this.armed = false;
        return [{ type: 'start', at }];
      }
    }
    return [];
  }
}

export function quantile(values: number[], q: number) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) * q)];
}

export function fitCalibration(rest: number[], active: number[], nuisance: number[]) {
  if ([rest, active, nuisance].some(samples => samples.length < 20 || samples.some(n => !Number.isFinite(n)))) {
    throw new Error('Not enough valid observations. Keep your face visible and repeat setup.');
  }
  const neutral = quantile([...rest, ...nuisance], 0.95);
  const intentional = quantile(active, 0.8);
  if (intentional - neutral < 0.12) throw new Error('This movement did not separate clearly from rest and ordinary movement. Try another comfortable movement or switch access.');
  return {
    activationThreshold: neutral + (intentional - neutral) * 0.62,
    releaseThreshold: neutral + (intentional - neutral) * 0.25,
    neutral, intentional,
  };
}

/** A forgiving fit for secondary fixed-role gestures (Yes/No/Left/Right): adapts to whatever separation
 * exists in the samples and never throws, so a weak but real signal is still usable rather than falling
 * back to a one-size-fits-all default. */
export function fitLenient(rest: number[], active: number[]): { activationThreshold: number; releaseThreshold: number } {
  if (rest.length < 5 || active.length < 5 || rest.some(n => !Number.isFinite(n)) || active.some(n => !Number.isFinite(n))) {
    return { activationThreshold: 0.3, releaseThreshold: 0.12 };
  }
  const neutral = quantile(rest, 0.9);
  const intentional = quantile(active, 0.65);
  const separation = Math.max(0.08, intentional - neutral);
  return {
    activationThreshold: Math.min(0.9, neutral + separation * 0.5),
    releaseThreshold: Math.max(0.02, neutral + separation * 0.18),
  };
}

export type ProfileQuality = 'clear' | 'moderate' | 'unclear';
export interface QuickProfile { separation: number; neutral: number; intentional: number; quality: ProfileQuality }

/** A fast rest-vs-active screening pass used to rank candidate movements before full calibration. */
export function quickProfile(rest: number[], active: number[]): QuickProfile {
  if ([rest, active].some(samples => samples.length < 8 || samples.some(n => !Number.isFinite(n)))) {
    return { separation: 0, neutral: 0, intentional: 0, quality: 'unclear' };
  }
  const neutral = quantile(rest, 0.95);
  const intentional = quantile(active, 0.8);
  const separation = intentional - neutral;
  const quality: ProfileQuality = separation >= 0.22 ? 'clear' : separation >= 0.12 ? 'moderate' : 'unclear';
  return { separation, neutral, intentional, quality };
}
