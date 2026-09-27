import { describe, expect, it } from 'vitest';
import { PersonalLanguageModel, type Situation } from './index';

describe('local personal language model', () => {
  it('keeps previewing, suggestions and custom vocabulary separate from confirmed learning', () => {
    const model = new PersonalLanguageModel();
    const initial = model.stats();
    model.suggest({ prefix: 'I', situation: 'care' });
    model.addCustomPhrase('Let us visit the library.', 'social');
    expect(model.stats().confirmations).toBe(0);
    expect(model.stats().learnedWords).toBe(initial.learnedWords);
    expect(model.stats().customPhrases).toBe(1);
  });

  it('adapts future held-out preference requests after explicitly confirmed training messages', () => {
    // Synthetic preference replay, NOT clinical/user-performance evidence.
    const model = new PersonalLanguageModel();
    const fixtures: { situation: Situation; desired: string }[] = [
      { situation: 'care', desired: 'Please stay with me.' },
      { situation: 'social', desired: 'Would you like to listen to music?' },
      { situation: 'autonomy', desired: 'I changed my mind.' },
    ];
    const before = fixtures.filter(test => model.suggest({ prefix: '', situation: test.situation, limit: 1 })[0]?.text === test.desired).length;
    for (const training of fixtures) for (let i = 0; i < 4; i++) model.confirmSpoken(training.desired, training.situation);
    const after = fixtures.filter(test => model.suggest({ prefix: '', situation: test.situation, limit: 1 })[0]?.text === test.desired).length;
    expect(after).toBe(fixtures.length);
    expect(after).toBeGreaterThan(before);
  });

  it('learns next words and completes prefixes without altering the earlier draft', () => {
    const model = new PersonalLanguageModel();
    for (let i = 0; i < 3; i++) model.confirmSpoken('Please call Ananya.', 'personal');
    const suggestions = model.suggest({ prefix: 'Please call An', situation: 'personal', kind: 'word' });
    expect(suggestions[0].text).toBe('ananya');
    expect(suggestions[0].replacementText).toBe('Please call ananya ');
    expect(suggestions[0].source).toBe('learned');
    expect(model.suggest({ prefix: 'Please call ', kind: 'word' })[0].text).toBe('ananya');
    expect(model.suggest({ prefix: 'zzzz', kind: 'word' })).toEqual([]);
  });

  it('honors phrase prefixes, limits and selected context without guessing unknown text', () => {
    const model = new PersonalLanguageModel();
    expect(model.suggest({ prefix: '', situation: 'social', limit: 3 })).toHaveLength(3);
    expect(model.suggest({ prefix: 'Please ', limit: 10 }).every(item => item.text.toLowerCase().startsWith('please'))).toBe(true);
    expect(model.suggest({ prefix: 'unseen phrase with no match' })).toEqual([]);
    expect(model.suggest({ prefix: '', limit: 0 })).toEqual([]);
  });

  it('round trips learning and supports learning-only reset and complete reset', () => {
    const model = new PersonalLanguageModel();
    model.addCustomPhrase('Let us visit the library.', 'social');
    model.confirmSpoken('Let us visit the library.', 'social');
    const restored = new PersonalLanguageModel(model.exportJSON());
    expect(restored.stats()).toEqual(model.stats());
    expect(restored.suggest({ prefix: '', situation: 'social' })[0].text).toBe('Let us visit the library.');
    restored.resetLearning();
    expect(restored.stats().confirmations).toBe(0);
    expect(restored.stats().customPhrases).toBe(1);
    restored.reset();
    expect(restored.stats().customPhrases).toBe(0);
  });

  it('rejects malformed imports atomically and bounds accepted text', () => {
    const model = new PersonalLanguageModel();
    model.confirmSpoken('Thank you.', 'social');
    const original = model.exportJSON();
    const invalidStates = [
      '{', 'null', JSON.stringify({ version: 2 }),
      JSON.stringify({ version: 1, custom: [], confirmations: 0, observations: [{ text: 'No.', situation: 'all', count: 10, lastUsed: 1 }] }),
      JSON.stringify({ version: 1, custom: [{ text: 'Test', situation: '__proto__' }], confirmations: 0, observations: [] }),
    ];
    for (const invalid of invalidStates) { expect(() => model.importJSON(invalid)).toThrow(); expect(model.exportJSON()).toBe(original); }
    expect(() => model.addCustomPhrase('')).toThrow();
    expect(() => model.confirmSpoken('a'.repeat(241))).toThrow();
    expect(() => model.importJSON('x'.repeat(512001))).toThrow();
  });

  it('removes a deleted custom phrase and associated learned history', () => {
    const model = new PersonalLanguageModel();
    const phrase = model.addCustomPhrase('My private phrase.', 'personal');
    model.confirmSpoken(phrase.text, 'personal');
    model.removeCustomPhrase(phrase.id);
    expect(model.suggest({ prefix: 'My private' })).toEqual([]);
    expect(model.stats().learnedPhrases).toBe(0);
  });
});
