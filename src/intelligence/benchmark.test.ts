import { describe, expect, it } from 'vitest';
import { PersonalLanguageModel } from './index';

describe('language model reproducible engineering benchmark', () => {
  it('reports measured warm-request latency at bounded maximum history', () => {
    const model = new PersonalLanguageModel();
    for (let i = 0; i < 512; i++) model.confirmSpoken(`Please read my message number ${i}.`, i % 2 ? 'personal' : 'conversation');
    for (let i = 0; i < 20; i++) model.suggest({ prefix: 'Please ', situation: 'personal', kind: 'mixed' });
    const timings: number[] = [];
    for (let i = 0; i < 200; i++) {
      const started = performance.now();
      const result = model.suggest({ prefix: 'Please ', situation: 'personal', kind: 'mixed' });
      timings.push(performance.now() - started);
      expect(result).toHaveLength(3);
    }
    timings.sort((a, b) => a - b);
    const report = { scenario: '512 learned phrases, mixed phrase/word, warm local JS', requests: timings.length, medianMs: +timings[100].toFixed(3), p95Ms: +timings[189].toFixed(3), maxMs: +timings[199].toFixed(3), modelBytes: model.stats().storageBytes };
    console.info('CONTINUUM_LANGUAGE_BENCHMARK', JSON.stringify(report));
    // Functional check only: printed latency is measured, never a device-independent guarantee.
    expect(timings.every(value => Number.isFinite(value) && value >= 0)).toBe(true);
    expect(model.stats().learnedPhrases).toBe(512);
  });
});
