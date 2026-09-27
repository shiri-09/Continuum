// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CameraInputOptions } from '../input/useCameraInput';
import App from '../App';

vi.mock('../intelligence/voiceEngine', async (importOriginal) => ({ ...(await importOriginal<object>()), speakHuman: (_text: string, { onError }: { onError?: (e: unknown) => void } = {}) => { onError?.(new Error('Kokoro unavailable in tests')); return { cancel: () => {} } } }));

const cameraMock = vi.hoisted(() => ({ options: null as CameraInputOptions | null }));
vi.mock('../input/useCameraInput', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useCameraInput: (options: CameraInputOptions) => {
    cameraMock.options = options;
    return { status: 'running', ready: true, tracking: true, gesture: 'mouth', calibrationStage: 'complete',
      rawScore: 0, threshold: 0.6, releaseThreshold: 0.3, qualityMessage: 'Test camera adapter', error: '', remainingSeconds: 0,
      measurements: { validFrames: 0, invalidFrames: 0, completedGestures: 0, abortedGestures: 0, lastInferenceMs: 0, practiceGestures: 3 },
      videoRef: { current: null }, attachPreview: () => {}, start: vi.fn(), stop: vi.fn(), setGesture: vi.fn(), beginCalibration: vi.fn(),
      captureRest: vi.fn(), captureActive: vi.fn(), captureNuisance: vi.fn(), finishCalibration: vi.fn(),
      profileStage: 'idle', profileIndex: 0, profileCandidate: { gesture: 'mouth', label: 'Open your mouth', instruction: 'Open your mouth comfortably, then close it.' },
      profileResults: [], startProfiling: vi.fn(), chooseProfiledGesture: vi.fn(), applySavedCalibration: vi.fn(), driftWarning: false,
    };
  },
}));

class TestUtterance {
  voice: unknown = null; rate = 1;
  onstart: (() => void) | null = null;
  onend: (() => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  constructor(public text: string) {}
}
let utterances: TestUtterance[] = [];
let speak: ReturnType<typeof vi.fn>;
let cancel: ReturnType<typeof vi.fn>;

beforeEach(() => {
  localStorage.clear(); localStorage.setItem('continuum.onboarded', 'true'); cameraMock.options = null; utterances = [];
  speak = vi.fn((utterance: TestUtterance) => utterances.push(utterance));
  cancel = vi.fn();
  vi.stubGlobal('SpeechSynthesisUtterance', TestUtterance);
  Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
    speak, cancel, getVoices: () => [{ name: 'Test local voice', lang: 'en-US', localService: true, voiceURI: 'test-local' }],
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
  } });
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });
const draft = () => screen.getByRole('textbox', { name: 'Your message' }) as HTMLTextAreaElement;
function renderSpeak() { render(<App />); fireEvent.click(screen.getAllByRole('button', { name: 'Speak' })[0]); speak.mockClear(); utterances = []; }
function write(text: string) { fireEvent.change(draft(), { target: { value: text } }); }
function space(repeat = false) { fireEvent.keyDown(window, { key: ' ', code: 'Space', repeat }); }
function release() { fireEvent.keyUp(window, { key: ' ', code: 'Space' }); }
function press() { space(); release(); }
function interrupt() {
  fireEvent.click(screen.getByRole('button', { name: 'Show instructions' }));
  fireEvent.click(screen.getByRole('button', { name: 'Test input interruption (simulation)' }));
}

describe('rendered communication workflows (camera and speech adapters are simulated)', () => {
  it('lets a switch user return from spelling to chat with the composed draft intact', () => {
    vi.useFakeTimers(); render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Spell a reply' }));
    write('Please give me time.');
    press();
    const back = screen.getByRole('button', { name: 'Return to assistant' });
    for (let i = 0; i < 50 && !back.classList.contains('scan-active'); i++) {
      act(() => { vi.advanceTimersByTime(1600); });
    }
    expect(back.classList.contains('scan-active')).toBe(true);
    press();
    expect(screen.getByRole('region', { name: 'Conversation with Continuum' }).textContent).toContain('Please give me time.');
    expect(screen.getByRole('button', { name: 'Send to assistant' })).toBeTruthy();
  });
  it('restores an opted-in saved draft into a paused, unarmed session', () => {
    localStorage.setItem('continuum.persist', 'true');
    localStorage.setItem('continuum.draft', 'A message saved before restarting.');
    renderSpeak();
    expect(draft().value).toBe('A message saved before restarting.');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('button', { name: 'Start scanning' })).toBeTruthy();
    expect(speak).not.toHaveBeenCalled();
  });

  it('requires fresh confirmation, speaks exact draft, and learns only on playback start', () => {
    renderSpeak(); write('Please ask me directly.');
    fireEvent.click(screen.getByRole('button', { name: 'Review & speak' }));
    expect(speak).not.toHaveBeenCalled();
    const dialog = screen.getByRole('dialog', { name: 'Confirm this message' });
    expect(dialog.textContent).toContain('Please ask me directly.');
    expect(localStorage.getItem('continuum.model')).toBeNull();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Speak this message' }));
    expect(speak).toHaveBeenCalledTimes(1);
    expect(utterances[0].text).toBe('Please ask me directly.');
    expect(localStorage.getItem('continuum.model')).toBeNull();
    act(() => { utterances[0].onstart?.(); });
    expect(JSON.parse(localStorage.getItem('continuum.model')!).confirmations).toBe(1);
    act(() => { utterances[0].onend?.(); });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(draft().value).toBe('Please ask me directly.');
  });

  it('completes phrase selection, review and fresh speech confirmation using only the switch', () => {
    vi.useFakeTimers(); renderSpeak();
    press(); press();
    const composed = draft().value;
    expect(composed.length).toBeGreaterThan(0);
    const reviewButton = screen.getByRole('button', { name: 'Review & speak' });
    for (let i = 0; i < 30 && !reviewButton.classList.contains('scan-active'); i++) {
      act(() => { vi.advanceTimersByTime(1600); });
    }
    expect(reviewButton.classList.contains('scan-active')).toBe(true);
    press();
    expect(screen.getByRole('dialog', { name: 'Confirm this message' })).toBeTruthy();
    expect(speak).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(1600); });
    expect(screen.getByRole('button', { name: 'Speak this message' }).classList.contains('scan-active')).toBe(true);
    press();
    expect(speak).toHaveBeenCalledTimes(1);
    expect(utterances[0].text).toBe(composed);
  });

  it('uses first backup activation only to connect recovery and preserves the draft', () => {
    renderSpeak(); write('Let me finish my thought.'); interrupt();
    press();
    expect(screen.getByRole('dialog', { name: 'Your draft is preserved.' })).toBeTruthy();
    expect(screen.getByText('Switch connected · ready to resume')).toBeTruthy();
    expect(draft().value).toBe('Let me finish my thought.');
    expect(speak).not.toHaveBeenCalled();
    press();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(draft().value).toBe('Let me finish my thought.');
  });

  it('can resume recovery scanning using only Space after Keep paused', () => {
    renderSpeak(); write('A retained thought.'); interrupt(); press();
    fireEvent.click(screen.getByRole('button', { name: 'Keep paused' }));
    press();
    expect(screen.getByRole('dialog')).toBeTruthy();
    press();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(draft().value).toBe('A retained thought.');
    expect(speak).not.toHaveBeenCalled();
  });

  it('does not turn held-key repetition into repeated selections', () => {
    vi.useFakeTimers(); renderSpeak();
    space();
    expect(draft().value).toBe('');
    act(() => { vi.advanceTimersByTime(1600); });
    space(true); space(true); space(false);
    expect(draft().value).toBe('');
    release(); space();
    const selected = draft().value;
    expect(selected.length).toBeGreaterThan(0);
    act(() => { vi.advanceTimersByTime(1600); });
    space(true); space(true);
    expect(draft().value).toBe(selected);
    release(); expect(speak).not.toHaveBeenCalled();
  });

  it('keeps background regions inert and wraps keyboard focus inside review', () => {
    renderSpeak(); write('My own words.');
    fireEvent.click(screen.getByRole('button', { name: 'Review & speak' }));
    expect(document.querySelector('main')?.hasAttribute('inert')).toBe(true);
    expect(document.querySelector('.sidebar')?.hasAttribute('inert')).toBe(true);
    const buttons = within(screen.getByRole('dialog')).getAllByRole('button');
    expect(document.activeElement).toBe(buttons[0]);
    buttons.at(-1)!.focus(); fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(buttons[0]);
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(buttons.at(-1));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Keep editing' }));
    expect(document.querySelector('main')?.hasAttribute('inert')).toBe(false);
  });

  it('requires explicit clear confirmation and can undo the cleared text', () => {
    renderSpeak(); write('This message matters.');
    fireEvent.click(screen.getByRole('button', { name: 'Clear draft' }));
    expect(draft().value).toBe('This message matters.');
    fireEvent.click(screen.getByRole('button', { name: 'Keep my message' }));
    expect(draft().value).toBe('This message matters.');
    fireEvent.click(screen.getByRole('button', { name: 'Clear draft' }));
    fireEvent.click(screen.getByRole('button', { name: 'Clear message' }));
    expect(draft().value).toBe('');
    fireEvent.click(screen.getByRole('button', { name: 'Undo last change' }));
    expect(draft().value).toBe('This message matters.');
    expect(speak).not.toHaveBeenCalled();
  });

  it('adds a personal phrase and selects it without automatically speaking or learning it', () => {
    renderSpeak();
    fireEvent.click(screen.getByRole('button', { name: 'Open settings' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'New personal phrase' }), { target: { value: 'I want to talk about astronomy.' } });
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Add' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Close settings' })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'My phrases' }));
    fireEvent.click(screen.getByRole('button', { name: 'I want to talk about astronomy.' }));
    expect(draft().value).toBe('I want to talk about astronomy.');
    expect(speak).not.toHaveBeenCalled();
    expect(JSON.parse(localStorage.getItem('continuum.model')!).confirmations).toBe(0);
  });

  it('advances a conversation routine and exposes its next action to scanning', () => {
    renderSpeak();
    fireEvent.click(screen.getAllByRole('button', { name: 'Prepared conversations' })[0]);
    fireEvent.click(screen.getByRole('button', { name: /Correct a misunderstanding/ }));
    expect(draft().value).toBe('That is not what I meant.');
    fireEvent.click(screen.getByRole('button', { name: 'Next phrase' }));
    expect(draft().value).toBe('Please give me time.');
    expect(speak).not.toHaveBeenCalled();
    vi.useFakeTimers(); press();
    let found = false;
    for (let i = 0; i < 30; i++) {
      if (screen.getByRole('button', { name: 'Next phrase' }).classList.contains('scan-active')) { found = true; break; }
      act(() => { vi.advanceTimersByTime(1600); });
    }
    expect(found).toBe(true); press();
    expect(draft().value).toBe('I want to say something else.');
    expect(speak).not.toHaveBeenCalled();
  });

  it('rejects a stale camera activation after interruption during review', () => {
    vi.useFakeTimers(); renderSpeak(); write('An exact message.');
    fireEvent.click(screen.getByRole('button', { name: 'Camera' }));
    fireEvent.click(screen.getByRole('button', { name: 'Use my camera signal' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start scanning' }));
    fireEvent.click(screen.getByRole('button', { name: 'Review & speak' }));
    act(() => { vi.advanceTimersByTime(1600); });
    expect(screen.getByRole('button', { name: 'Speak this message' }).classList.contains('scan-active')).toBe(true);
    act(() => { cameraMock.options?.onGestureStart(); });
    act(() => { cameraMock.options?.onUnavailable('Test tracking lost'); });
    act(() => { cameraMock.options?.onActivate(); });
    expect(speak).not.toHaveBeenCalled();
    expect(draft().value).toBe('An exact message.');
    expect(screen.getByRole('dialog', { name: 'Your draft is preserved.' })).toBeTruthy();
  });

  it('Use switch instead changes the active source while retaining the message', () => {
    renderSpeak(); write('Keep this message.');
    fireEvent.click(screen.getByRole('button', { name: 'Camera' }));
    fireEvent.click(screen.getByRole('button', { name: 'Use my camera signal' }));
    expect(screen.getByRole('button', { name: 'Camera' }).classList.contains('selected')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Camera' }));
    fireEvent.click(screen.getByRole('button', { name: 'Use switch instead' }));
    expect(screen.getByRole('button', { name: 'Switch' }).classList.contains('selected')).toBe(true);
    expect(cameraMock.options?.enabled).toBe(false);
    expect(draft().value).toBe('Keep this message.');
    expect(speak).not.toHaveBeenCalled();
  });

  it('cancels queued speech on timeout and ignores a late playback-start callback', () => {
    vi.useFakeTimers(); renderSpeak(); write('A delayed message.');
    fireEvent.click(screen.getByRole('button', { name: 'Review & speak' }));
    fireEvent.click(screen.getByRole('button', { name: 'Speak this message' }));
    const cancels = cancel.mock.calls.length;
    act(() => { vi.advanceTimersByTime(5000); });
    expect(cancel.mock.calls.length).toBeGreaterThan(cancels);
    act(() => { utterances[0].onstart?.(); });
    expect(localStorage.getItem('continuum.model')).toBeNull();
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('cancels pending speech when the user returns to editing before playback', () => {
    renderSpeak(); write('A message I reconsidered.');
    fireEvent.click(screen.getByRole('button', { name: 'Review & speak' }));
    fireEvent.click(screen.getByRole('button', { name: 'Speak this message' }));
    const cancels = cancel.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(cancel.mock.calls.length).toBeGreaterThan(cancels);
    act(() => { utterances[0].onstart?.(); });
    expect(localStorage.getItem('continuum.model')).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(draft().value).toBe('A message I reconsidered.');
  });
});
