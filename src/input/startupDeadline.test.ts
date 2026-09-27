import { afterEach, describe, expect, it, vi } from 'vitest';
import { startupDeadline } from './startupDeadline';

afterEach(() => vi.useRealTimers());
describe('camera startup deadline resource cleanup', () => {
  it('times out and releases a stream that arrives after timeout', async () => {
    vi.useFakeTimers();
    let resolve!: (value: { stop: () => void }) => void;
    const pending = new Promise<{ stop: () => void }>(r => { resolve = r; });
    const stop = vi.fn();
    const result = startupDeadline(pending, 15000, 'Permission timed out', () => false, value => value.stop());
    const expectation = expect(result).rejects.toThrow('Permission timed out');
    await vi.advanceTimersByTimeAsync(15000); await expectation;
    resolve({ stop }); await Promise.resolve();
    expect(stop).toHaveBeenCalledOnce();
  });
  it('releases a model returned after the user cancelled startup', async () => {
    let cancelled = false; let resolve!: (value: string) => void;
    const pending = new Promise<string>(r => { resolve = r; });
    const close = vi.fn();
    const result = startupDeadline(pending, 15000, 'Timed out', () => cancelled, close);
    cancelled = true; resolve('model');
    await expect(result).rejects.toThrow('cancelled');
    expect(close).toHaveBeenCalledWith('model');
  });
  it('returns timely resources without disposing them', async () => {
    const dispose = vi.fn();
    await expect(startupDeadline(Promise.resolve('stream'), 15000, 'Timed out', () => false, dispose)).resolves.toBe('stream');
    expect(dispose).not.toHaveBeenCalled();
  });
});
