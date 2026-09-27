// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { useTaskAssistant } from './useTaskAssistant';
import { TaskWorkspace } from '../components/TaskWorkspace';

const proposal = { id: 'server-generated-id-17', name: 'create_note', arguments: { title: 'My thought', text: 'Please give me time.' }, summary: 'Create this note locally.' };
const reply = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
let fetchMock: ReturnType<typeof vi.fn<(url: string, options?: RequestInit) => Promise<Response>>>;
const callsTo = (path: string) => fetchMock.mock.calls.filter(call => call[0] === path);
beforeEach(() => {
  fetchMock = vi.fn((url: string) => {
    if (url === '/api/model-status') return Promise.resolve(reply({ available: true, models: [{ name: 'qwen3:0.6b' }] }));
    if (url === '/api/plan') return Promise.resolve(reply({ proposal, model: 'qwen3:0.6b', elapsedMs: 24 }));
    if (url === '/api/execute') return Promise.resolve(reply({ receipt: { message: 'Note saved.', path: 'notes/my-thought.txt' } }));
    if (url === '/api/cancel') return Promise.resolve(reply({ cancelled: true }));
    throw new Error(`Unexpected test request: ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('local task planning and explicit authorization', () => {
  it('requests a proposal without executing, then sends only its exact server ID on confirmation', async () => {
    const { result } = renderHook(() => useTaskAssistant('Create a note.', 1, true));
    await act(async () => { await result.current.plan(); });
    expect(result.current.proposal).toEqual(proposal);
    expect(callsTo('/api/execute')).toHaveLength(0);
    expect(JSON.parse(callsTo('/api/plan')[0][1]!.body as string)).toEqual({ request: 'Create a note.' });
    await act(async () => { await result.current.execute(); });
    expect(callsTo('/api/execute')).toHaveLength(1);
    expect(JSON.parse(callsTo('/api/execute')[0][1]!.body as string)).toEqual({ proposalId: proposal.id });
    expect(result.current.receipt).toEqual({ message: 'Note saved.', path: 'notes/my-thought.txt' });
    expect(result.current.proposal).toBeNull();
  });

  it('aborts an in-flight plan on draft change and cancels a late stale server proposal', async () => {
    const pending = deferred<Response>();
    const defaultFetch = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation((url: string, options?: RequestInit) => url === '/api/plan' ? pending.promise : defaultFetch(url, options));
    const { result, rerender } = renderHook(({ draft, revision }) => useTaskAssistant(draft, revision, true), { initialProps: { draft: 'Create a note.', revision: 1 } });
    let planning!: Promise<void>;
    act(() => { planning = result.current.plan(); });
    const signal = callsTo('/api/plan')[0][1]!.signal as AbortSignal;
    rerender({ draft: 'No, open calculator.', revision: 2 });
    expect(signal.aborted).toBe(true);
    await act(async () => { pending.resolve(reply({ proposal })); await planning; });
    expect(result.current.proposal).toBeNull();
    expect(callsTo('/api/execute')).toHaveLength(0);
    expect(JSON.parse(callsTo('/api/cancel')[0][1]!.body as string)).toEqual({ proposalId: proposal.id });
  });

  it('input loss invalidates an existing unapproved proposal and never executes it', async () => {
    const { result, rerender } = renderHook(({ available }) => useTaskAssistant('Create a note.', 1, available), { initialProps: { available: true } });
    await act(async () => { await result.current.plan(); });
    rerender({ available: false });
    expect(result.current.proposal).toBeNull();
    await act(async () => { await result.current.execute(); });
    expect(callsTo('/api/execute')).toHaveLength(0);
    expect(JSON.parse(callsTo('/api/cancel')[0][1]!.body as string)).toEqual({ proposalId: proposal.id });
  });

  it('cancel invalidates a pending request even if a noncooperative transport resolves later', async () => {
    const pending = deferred<Response>();
    const defaultFetch = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation((url: string, options?: RequestInit) => url === '/api/plan' ? pending.promise : defaultFetch(url, options));
    const { result } = renderHook(() => useTaskAssistant('Create a note.', 1, true));
    let planning!: Promise<void>;
    act(() => { planning = result.current.plan(); });
    act(() => { result.current.cancel(); });
    await act(async () => { pending.resolve(reply({ proposal })); await planning; });
    expect(result.current.proposal).toBeNull();
    expect(callsTo('/api/execute')).toHaveLength(0);
    expect(callsTo('/api/cancel')).toHaveLength(1);
  });

  it('refuses an unknown tool returned by the server', async () => {
    const defaultFetch = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation((url: string, options?: RequestInit) => url === '/api/plan' ? Promise.resolve(reply({ proposal: { ...proposal, name: 'run_shell' } })) : defaultFetch(url, options));
    const { result } = renderHook(() => useTaskAssistant('Run something.', 1, true));
    await act(async () => { await result.current.plan(); });
    expect(result.current.proposal).toBeNull();
    expect(result.current.message).toContain('supported action');
    await act(async () => { await result.current.execute(); });
    expect(callsTo('/api/execute')).toHaveLength(0);
  });

  it('does not submit duplicate execution requests from two confirmations in the same event turn', async () => {
    const { result } = renderHook(() => useTaskAssistant('Create a note.', 1, true));
    await act(async () => { await result.current.plan(); });
    const confirm = result.current.execute;
    await act(async () => { await Promise.all([confirm(), confirm()]); });
    expect(callsTo('/api/execute')).toHaveLength(1);
  });

  it.each([
    { ...proposal, arguments: null },
    { ...proposal, arguments: [] },
    { ...proposal, id: '' },
    { ...proposal, summary: undefined },
  ])('refuses malformed proposal metadata before it can render or execute: %j', async (malformed) => {
    const defaultFetch = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation((url: string, options?: RequestInit) => url === '/api/plan' ? Promise.resolve(reply({ proposal: malformed })) : defaultFetch(url, options));
    const { result } = renderHook(() => useTaskAssistant('Create a note.', 1, true));
    await act(async () => { await result.current.plan(); });
    expect(result.current.proposal).toBeNull();
    expect(result.current.message).toContain('supported action');
    await act(async () => { await result.current.execute(); });
    expect(callsTo('/api/execute')).toHaveLength(0);
  });

  it('renders the exact proposal before an explicit confirmation, then a receipt', async () => {
    function Harness() {
      const assistant = useTaskAssistant('Create a note.', 1, true);
      return <TaskWorkspace assistant={assistant} scan={() => ''} choose={() => {}} canRequest />;
    }
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: /Propose an action/i }));
    await screen.findByText('Create this note locally.');
    expect(screen.getByText('My thought')).toBeTruthy();
    expect(screen.getByText('Please give me time.')).toBeTruthy();
    expect(callsTo('/api/execute')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: /Confirm this action/i }));
    await waitFor(() => expect(screen.getByText('Action completed.')).toBeTruthy());
    expect(screen.getByText('Note saved.')).toBeTruthy();
    expect(callsTo('/api/execute')).toHaveLength(1);
  });
});

