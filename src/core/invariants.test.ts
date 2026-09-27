import { describe, expect, it } from 'vitest';
import { canSpeak, initialSession, sessionReducer as reduce, type Action } from './session';

const interrupted = () => {
  let state = reduce(initialSession, { type: 'EDIT', text: 'My first words.' });
  state = reduce(state, { type: 'EDIT', text: 'Please ask me directly.' });
  state = reduce(state, { type: 'SOURCE', source: 'camera' });
  state = reduce(state, { type: 'REVIEW' });
  return reduce(state, { type: 'LOST', reason: 'Camera disconnected during review' });
};

describe('interruption invariants across interaction sequences', () => {
  it('keeps recovery authoritative against background editing and navigation', () => {
    const state = interrupted();
    const actions: Action[] = [
      { type: 'EDIT', text: 'Unexpected background edit' },
      { type: 'UNDO' }, { type: 'BACK' }, { type: 'REVIEW' }, { type: 'START' },
    ];
    for (const action of actions) {
      const next = reduce(state, action);
      expect(next.mode, action.type).toBe('recovery');
      expect(next.draft, action.type).toBe(state.draft);
      expect(next.revision, action.type).toBe(state.revision);
      expect(next.scanning, action.type).toBe(false);
      expect(canSpeak(next, state.revision), action.type).toBe(false);
    }
  });

  it('Keep paused cannot silently exit recovery and restart the failed input', () => {
    let state = interrupted();
    state = reduce(state, { type: 'RECOVER', source: 'switch' });
    state = reduce(state, { type: 'PAUSE' });
    expect(state.mode).toBe('recovery');
    expect(state.scanning).toBe(false);
    expect(reduce(state, { type: 'START' }).scanning).toBe(false);
    expect(state.draft).toBe('Please ask me directly.');
  });

  it('an independent source-change request can scan the recovery choices', () => {
    const original = reduce(initialSession, { type: 'SOURCE', source: 'camera' });
    const requested = reduce(original, { type: 'RECOVER', source: 'switch' });
    expect(requested.mode).toBe('recovery');
    expect(requested.recoverySource).toBe('switch');
    expect(requested.source).toBe('camera');
    expect(requested.scanning).toBe(true);
    expect(requested.selections).toBe(0);
    expect(requested.spoken).toBe(0);
    const resumed = reduce(requested, { type: 'RESUME' });
    expect(resumed.source).toBe('switch');
    expect(resumed.reviewRevision).toBeNull();
  });

  it('recovery and resume invalidate a gesture captured before loss', () => {
    const lost = interrupted();
    const staleGeneration = lost.generation - 1;
    const resumed = reduce(reduce(lost, { type: 'RECOVER', source: 'switch' }), { type: 'RESUME' });
    const stale = reduce(resumed, { type: 'SELECT', generation: staleGeneration });
    expect(stale.selections).toBe(resumed.selections);
    expect(stale.draft).toBe(lost.draft);
    expect(canSpeak(stale, lost.revision)).toBe(false);
  });

  it('pending speech is invalidated by pause, back and source change', () => {
    const draft = reduce(initialSession, { type: 'EDIT', text: 'This is my choice.' });
    const reviewed = reduce(draft, { type: 'REVIEW' });
    for (const action of [{ type: 'PAUSE' }, { type: 'BACK' }, { type: 'SOURCE', source: 'camera' }] as Action[]) {
      const changed = reduce(reviewed, action);
      expect(canSpeak(changed, reviewed.revision), action.type).toBe(false);
      expect(reduce(changed, { type: 'SPOKEN', revision: reviewed.revision }).spoken, action.type).toBe(0);
    }
  });

  it('repeated outages never replay speech or modify draft content', () => {
    let state = interrupted();
    const original = state.draft;
    for (let i = 0; i < 10; i++) {
      state = reduce(state, { type: 'LOST', reason: 'Repeated frame interruption' });
      state = reduce(state, { type: 'SPOKEN', revision: state.revision });
      state = reduce(state, { type: 'RECOVER', source: 'switch' });
      state = reduce(state, { type: 'RESUME' });
      expect(state.draft).toBe(original);
      expect(state.spoken).toBe(0);
    }
  });
});
