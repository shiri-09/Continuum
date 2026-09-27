import { CURATED_PHRASES, SITUATIONS, type Phrase, type Situation } from './vocabulary';
export { CURATED_PHRASES, SITUATIONS, COMMUNICATION_ROUTINES } from './vocabulary';
export type { Phrase, Situation } from './vocabulary';

export type SuggestionKind = 'phrase' | 'word';
export interface Suggestion {
  id: string;
  text: string;
  /** Full replacement draft. Selecting this is not authorization to speak it. */
  replacementText: string;
  kind: SuggestionKind;
  source: 'curated' | 'custom' | 'learned';
  /** Ranking score, NOT a probability, confidence, or inferred intention. */
  score: number;
  reason: string;
}
export interface SuggestRequest { prefix: string; situation?: Situation; limit?: number; kind?: SuggestionKind | 'mixed' }
interface Observation { text: string; situation: Situation; count: number; lastUsed: number }
interface ModelState { version: 1; custom: Phrase[]; observations: Observation[]; confirmations: number }
export interface ModelStatistics {
  model: string; confirmations: number; learnedPhrases: number; learnedWords: number;
  customPhrases: number; curatedPhrases: number; bigrams: number; storageBytes: number;
}
const MAX_PHRASE = 240;
const MAX_CUSTOM = 256;
const MAX_OBSERVATIONS = 512;
const MAX_COUNT = 1_000_000;
const clean = (text: string) => text.trim().replace(/\s+/g, ' ');
const key = (text: string) => clean(text).toLocaleLowerCase('en');
const words = (text: string) => key(text).match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu) ?? [];
const situationValid = (value: unknown): value is Situation => typeof value === 'string' && (SITUATIONS as readonly string[]).includes(value);
const checkedSituation = (value: unknown): Situation => situationValid(value) ? value : 'all';
function checkedText(value: unknown): string {
  if (typeof value !== 'string' || !clean(value) || clean(value).length > MAX_PHRASE || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(value)) {
    throw new Error(`A phrase must contain 1–${MAX_PHRASE} characters of plain text.`);
  }
  return clean(value);
}
const emptyState = (): ModelState => ({ version: 1, custom: [], observations: [], confirmations: 0 });
const inc = (map: Map<string, number>, token: string, amount: number) => map.set(token, (map.get(token) ?? 0) + amount);

/** A bounded, locally trained count-based language model. No network or speech side effects. */
export class PersonalLanguageModel {
  private state: ModelState = emptyState();
  constructor(savedJSON?: string) { if (savedJSON) this.importJSON(savedJSON); }

  /** Call ONLY after the user explicitly confirms the exact spoken message. */
  confirmSpoken(text: string, situation: Situation = 'all'): void {
    const value = checkedText(text);
    const context = checkedSituation(situation);
    if (this.state.confirmations >= MAX_COUNT) throw new Error('The learning counter is full. Reset learning to start a new history.');
    this.state.confirmations = Math.min(MAX_COUNT, this.state.confirmations + 1);
    const existing = this.state.observations.find(item => key(item.text) === key(value) && item.situation === context);
    if (existing) { existing.count = Math.min(MAX_COUNT, existing.count + 1); existing.lastUsed = this.state.confirmations; }
    else {
      if (this.state.observations.length >= MAX_OBSERVATIONS) this.state.observations.sort((a, b) => a.lastUsed - b.lastUsed).shift();
      this.state.observations.push({ text: value, situation: context, count: 1, lastUsed: this.state.confirmations });
    }
  }

  addCustomPhrase(text: string, situation: Situation = 'personal'): Phrase {
    const value = checkedText(text);
    const context = checkedSituation(situation);
    const existing = this.state.custom.find(item => key(item.text) === key(value));
    if (existing) return { ...existing };
    if (this.state.custom.length >= MAX_CUSTOM) throw new Error('The personal phrase limit is 256. Remove a phrase before adding another.');
    let suffix = 1;
    while (this.state.custom.some(item => item.id === `custom-${suffix}`)) suffix++;
    const phrase = { id: `custom-${suffix}`, text: value, situation: context };
    this.state.custom.push(phrase);
    return { ...phrase };
  }

  getCustomPhrases(): Phrase[] { return this.state.custom.map(item => ({ ...item })); }
  removeCustomPhrase(id: string): void {
    const found = this.state.custom.find(item => item.id === id);
    this.state.custom = this.state.custom.filter(item => item.id !== id);
    if (found) this.state.observations = this.state.observations.filter(item => key(item.text) !== key(found.text));
  }
  resetLearning(): void { this.state.observations = []; this.state.confirmations = 0; }
  reset(): void { this.state = emptyState(); }
  exportJSON(): string { return JSON.stringify(this.state); }

  /** Validates the entire file before replacing any current state. Never executes imported text. */
  importJSON(json: string): void {
    if (typeof json !== 'string' || json.length > 512_000) throw new Error('Model file is too large.');
    const parsed: unknown = JSON.parse(json);
    if (!parsed || typeof parsed !== 'object') throw new Error('Invalid model file.');
    const obj = parsed as Record<string, unknown>;
    if (obj.version !== 1 || !Array.isArray(obj.custom) || obj.custom.length > MAX_CUSTOM || !Array.isArray(obj.observations) || obj.observations.length > MAX_OBSERVATIONS) throw new Error('Unsupported or invalid model format.');
    const confirmations = obj.confirmations;
    if (!Number.isSafeInteger(confirmations) || (confirmations as number) < 0 || (confirmations as number) > MAX_COUNT) throw new Error('Invalid confirmation count.');
    const custom: Phrase[] = obj.custom.map((raw: unknown, index: number) => {
      if (!raw || typeof raw !== 'object') throw new Error('Invalid custom phrase.');
      const item = raw as Record<string, unknown>;
      if (!situationValid(item.situation)) throw new Error('Invalid phrase context.');
      return { id: `custom-${index + 1}`, text: checkedText(item.text), situation: item.situation };
    });
    if (new Set(custom.map(item => key(item.text))).size !== custom.length) throw new Error('Duplicate custom phrases.');
    const observations: Observation[] = obj.observations.map((raw: unknown) => {
      if (!raw || typeof raw !== 'object') throw new Error('Invalid learned phrase.');
      const item = raw as Record<string, unknown>;
      if (!situationValid(item.situation) || !Number.isSafeInteger(item.count) || (item.count as number) < 1 || (item.count as number) > MAX_COUNT || !Number.isSafeInteger(item.lastUsed) || (item.lastUsed as number) < 1 || (item.lastUsed as number) > (confirmations as number)) throw new Error('Invalid learning record.');
      return { text: checkedText(item.text), situation: item.situation, count: item.count as number, lastUsed: item.lastUsed as number };
    });
    if (new Set(observations.map(item => `${item.situation}\u0000${key(item.text)}`)).size !== observations.length) throw new Error('Duplicate learning records.');
    if (observations.reduce((sum, item) => sum + item.count, 0) > (confirmations as number)) throw new Error('Learning counts exceed the confirmation count.');
    this.state = { version: 1, custom, observations, confirmations: confirmations as number };
  }

  suggest(request: SuggestRequest): Suggestion[] {
    const prefix = typeof request.prefix === 'string' ? request.prefix.slice(0, MAX_PHRASE) : '';
    const situation = checkedSituation(request.situation);
    const limit = Number.isFinite(request.limit) ? Math.max(0, Math.min(10, Math.floor(request.limit!))) : 3;
    if (limit === 0) return [];
    const kind = request.kind ?? 'phrase';
    const phrases = kind === 'word' ? [] : this.phraseSuggestions(prefix, situation);
    if (kind === 'phrase') return phrases.slice(0, limit);
    const nextWords = this.wordSuggestions(prefix, situation);
    if (kind === 'word') return nextWords.slice(0, limit);
    // Preserve comparable ordering within each model; do not compare their unlike score scales.
    return (phrases.length && nextWords.length ? [phrases[0], nextWords[0], ...phrases.slice(1), ...nextWords.slice(1)] : [...phrases, ...nextWords]).slice(0, limit);
  }

  private phraseSuggestions(prefix: string, situation: Situation): Suggestion[] {
    const candidates = new Map<string, { phrase: Phrase; source: Suggestion['source']; order: number }>();
    const usage = new Map<string, { total: number; contextual: number; lastUsed: number }>();
    CURATED_PHRASES.forEach((phrase, order) => candidates.set(key(phrase.text), { phrase, source: 'curated', order }));
    this.state.custom.forEach((phrase, order) => candidates.set(key(phrase.text), { phrase, source: 'custom', order }));
    this.state.observations.forEach((item, order) => {
      const normalized = key(item.text);
      if (!candidates.has(normalized)) candidates.set(normalized, { phrase: { id: `learned-${order}`, text: item.text, situation: item.situation }, source: 'learned', order });
      const previous = usage.get(normalized) ?? { total: 0, contextual: 0, lastUsed: 0 };
      usage.set(normalized, { total: previous.total + item.count, contextual: previous.contextual + (situation !== 'all' && situation === item.situation ? item.count : 0), lastUsed: Math.max(previous.lastUsed, item.lastUsed) });
    });
    const normalizedPrefix = key(prefix);
    return [...candidates.values()].filter(({ phrase }) => !normalizedPrefix || key(phrase.text).startsWith(normalizedPrefix)).map(({ phrase, source, order }) => {
      const { total, contextual, lastUsed } = usage.get(key(phrase.text)) ?? { total: 0, contextual: 0, lastUsed: 0 };
      const recent = lastUsed / Math.max(1, this.state.confirmations);
      const score = 1 / (1 + order / 30) + (situation !== 'all' && phrase.situation === situation ? 2 : 0) + 2.5 * Math.log1p(total) + 3 * Math.log1p(contextual) + 0.4 * recent + (source === 'custom' ? 0.25 : 0);
      return { id: phrase.id, text: phrase.text, replacementText: phrase.text, kind: 'phrase' as const, source, score, reason: total ? `Confirmed ${total} time${total === 1 ? '' : 's'}${contextual ? `; ${contextual} in this situation` : ''}` : source === 'custom' ? 'Your saved phrase' : 'Starter vocabulary' };
    }).sort((a, b) => b.score - a.score || a.text.localeCompare(b.text));
  }

  private wordSuggestions(prefix: string, situation: Situation): Suggestion[] {
    const unigram = new Map<string, number>();
    const bigram = new Map<string, number>();
    const personalWords = new Set<string>();
    const customWords = new Set(this.state.custom.flatMap(item => words(item.text)));
    const train = (text: string, weight: number, learned: boolean) => {
      const tokens = words(text);
      tokens.forEach((token, index) => { inc(unigram, token, weight); inc(bigram, `${index ? tokens[index - 1] : '<s>'}\u0000${token}`, weight); if (learned) personalWords.add(token); });
    };
    CURATED_PHRASES.forEach(item => train(item.text, situation !== 'all' && item.situation === situation ? 2 : 1, false));
    this.state.custom.forEach(item => train(item.text, 2, false));
    this.state.observations.forEach(item => train(item.text, item.count * (situation !== 'all' && item.situation === situation ? 8 : 4), true));
    const partialMatch = prefix.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*$/u);
    const partial = partialMatch?.[0] ?? '';
    const before = partial ? prefix.slice(0, -partial.length) : prefix;
    const context = words(before).at(-1) ?? '<s>';
    const total = [...unigram.values()].reduce((sum, count) => sum + count, 0);
    const continuations = [...unigram.keys()].reduce((sum, token) => sum + (bigram.get(`${context}\u0000${token}`) ?? 0), 0);
    return [...unigram.entries()].filter(([token]) => !partial || token.startsWith(key(partial))).map(([token, count]) => {
      // Add-one smoothing, interpolated conditional bigram and unigram distributions.
      const score = 0.8 * ((bigram.get(`${context}\u0000${token}`) ?? 0) + 1) / (continuations + unigram.size) + 0.2 * (count + 1) / (total + unigram.size);
      const display = !before.trim() ? token.charAt(0).toUpperCase() + token.slice(1) : token;
      const spacer = before && !/\s$/u.test(before) ? ' ' : '';
      return { id: `word-${token}`, text: display, replacementText: `${before}${spacer}${display} `, kind: 'word' as const, source: personalWords.has(token) ? 'learned' as const : customWords.has(token) ? 'custom' as const : 'curated' as const, score, reason: personalWords.has(token) ? 'Learned from confirmed messages' : 'Local vocabulary completion' };
    }).sort((a, b) => b.score - a.score || a.text.localeCompare(b.text));
  }

  /** Which of two short options the user has confirmed more often before, e.g. Yes vs No. Not a prediction of intention. */
  likelyChoice(options: string[]): string | null {
    const counted = options.map(option => ({ option, count: this.state.observations.find(item => key(item.text) === key(option))?.count ?? 0 }));
    if (!counted.some(item => item.count > 0)) return null;
    return counted.reduce((best, item) => item.count > best.count ? item : best).option;
  }

  stats(): ModelStatistics {
    const vocabulary = new Set<string>();
    const bigrams = new Set<string>();
    this.state.observations.forEach(item => words(item.text).forEach((token, i, tokens) => { vocabulary.add(token); bigrams.add(`${i ? tokens[i - 1] : '<s>'}\u0000${token}`); }));
    return { model: 'Local personal phrase ranker + smoothed bigram language model', confirmations: this.state.confirmations, learnedPhrases: new Set(this.state.observations.map(item => key(item.text))).size, learnedWords: vocabulary.size, customPhrases: this.state.custom.length, curatedPhrases: CURATED_PHRASES.length, bigrams: bigrams.size, storageBytes: new TextEncoder().encode(this.exportJSON()).length };
  }
}
