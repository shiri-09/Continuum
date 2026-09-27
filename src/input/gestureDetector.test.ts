import { describe, expect, it } from 'vitest';
import { fitCalibration, GestureDetector, type GestureEvent } from './gestureDetector';

const create = () => new GestureDetector({ activationThreshold: 0.6, releaseThreshold: 0.3 });
const neutral = (d: GestureDetector) => [0, 100, 200, 400].flatMap(t => d.observe(0.1, t));

describe('camera completed-gesture detector', () => {
  it('requires neutral, an intentional hold and stable release before activation', () => {
    const d = create(); expect(neutral(d)).toEqual([]);
    expect(d.observe(0.8, 500)[0]?.type).toBe('start');
    expect(d.observe(0.8, 800)).toEqual([]);
    expect(d.observe(0.1, 900)).toEqual([]);
    expect(d.observe(0.1, 1100)).toEqual([{ type: 'activate', at: 1100 }]);
  });
  it('never selects while a gesture is held and aborts a prolonged gesture', () => {
    const d = create(); neutral(d);
    const events = [] as GestureEvent[];
    for (let t = 500; t < 3800; t += 100) events.push(...d.observe(0.9, t));
    expect(events.filter(e => e.type === 'activate')).toHaveLength(0);
    expect(events.some(e => e.reason === 'Gesture held too long')).toBe(true);
    expect(d.observe(0.1, 3800)).toEqual([]);
  });
  it('aborts occluded input mid-gesture and does not select on reacquisition', () => {
    const d = create(); neutral(d); d.observe(0.8, 500); d.observe(0.8, 700);
    expect(d.observe(0.1, 800, false)[0]?.type).toBe('abort');
    expect(d.observe(0.1, 900)).toEqual([]);
    expect(d.observe(0.1, 1100)).toEqual([]);
  });
  it('rejects a stale release or a timestamp that moves backwards', () => {
    for (const releaseTime of [1400, 400]) {
      const d = create(); neutral(d); d.observe(0.8, 500); d.observe(0.8, 700);
      expect(d.observe(0.1, releaseTime)[0]?.type).toBe('abort');
    }
  });
  it('does not arm on an initial active pose or on invalid scores', () => {
    const d = create();
    const events = [0, 100, 200, 300, 400].flatMap(t => d.observe(0.8, t));
    events.push(...d.observe(Number.NaN, 500), ...d.observe(2, 600));
    expect(events).toEqual([]);
  });
  it('rejects brief nuisance movement and cannot immediately repeat', () => {
    const d = create(); neutral(d); d.observe(0.8, 500);
    expect(d.observe(0.1, 600)[0]?.reason).toBe('Gesture too short');
    expect(d.observe(0.8, 700)).toEqual([]);
    expect(d.observe(0.8, 900)).toEqual([]);
  });
  it('keeps hysteresis between activation and release thresholds', () => {
    const d = create(); neutral(d); d.observe(0.8, 500);
    expect(d.observe(0.45, 700)).toEqual([]);
    expect(d.observe(0.45, 900)).toEqual([]);
    expect(d.observe(0.1, 1000)).toEqual([]);
    expect(d.observe(0.1, 1200)[0]?.type).toBe('activate');
  });
});

describe('personal calibration', () => {
  it('fits separated thresholds using nuisance observations as negatives', () => {
    const fit = fitCalibration(Array(40).fill(0.05), Array(40).fill(0.8), Array(40).fill(0.2));
    expect(fit.releaseThreshold).toBeGreaterThan(0.2);
    expect(fit.activationThreshold).toBeGreaterThan(fit.releaseThreshold);
    expect(fit.activationThreshold).toBeLessThan(0.8);
  });
  it('refuses overlapping or insufficient enrollment instead of lowering the threshold', () => {
    expect(() => fitCalibration(Array(40).fill(0.4), Array(40).fill(0.45), Array(40).fill(0.4))).toThrow('did not separate');
    expect(() => fitCalibration([0.1], [0.9], [0.1])).toThrow('Not enough');
  });
});
