/** @vitest-environment jsdom */
import { act, cleanup, render } from '@testing-library/react';
import { useWakeLock } from './useWakeLock';

function Probe({ active }: { active: boolean }) {
  useWakeLock(active);
  return null;
}

/** A stand-in for the browser's lock: remembers its listeners so the test can let go of it. */
function fakeSentinel() {
  const target = new EventTarget();
  const sentinel = Object.assign(target, {
    released: false,
    release: vi.fn(async () => {
      sentinel.released = true;
      target.dispatchEvent(new Event('release'));
    }),
  });
  return sentinel;
}

const setVisibility = (state: 'visible' | 'hidden') => {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
};

/** Let the promise a request returns settle. */
const settle = () => act(async () => {});

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(navigator, 'wakeLock');
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
});

describe('useWakeLock', () => {
  it('holds the screen on while active and lets go after', async () => {
    const sentinel = fakeSentinel();
    const request = vi.fn(async () => sentinel);
    Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true });

    const view = render(<Probe active={false} />);
    expect(request).not.toHaveBeenCalled();
    view.rerender(<Probe active />);
    await settle();
    expect(request).toHaveBeenCalledExactlyOnceWith('screen');
    expect(sentinel.release).not.toHaveBeenCalled();

    view.rerender(<Probe active={false} />);
    expect(sentinel.release).toHaveBeenCalledOnce();
  });

  it('asks again when the page comes back, since hiding it drops the lock', async () => {
    const sentinels = [fakeSentinel(), fakeSentinel()];
    let next = 0;
    const request = vi.fn(async () => sentinels[next++]!);
    Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true });

    render(<Probe active />);
    await settle();
    expect(request).toHaveBeenCalledTimes(1);
    // The browser releases it when the page is hidden; nothing is asked for while it stays so.
    setVisibility('hidden');
    await act(() => sentinels[0]!.release());
    expect(request).toHaveBeenCalledTimes(1);
    setVisibility('visible');
    await settle();
    expect(request).toHaveBeenCalledTimes(2);
    // Still held: coming back again doesn't ask twice.
    setVisibility('visible');
    await settle();
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('carries on where the lock is refused or does not exist', async () => {
    render(<Probe active />);
    await settle();

    const request = vi.fn(() => Promise.reject(new DOMException('no', 'NotAllowedError')));
    Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true });
    cleanup();
    render(<Probe active />);
    await settle();
    expect(request).toHaveBeenCalledOnce();
  });
});
