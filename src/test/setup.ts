import '@testing-library/jest-dom/vitest';

// react-chessboard и ResizeObserver нужны моки в jsdom.
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;

if (!('requestIdleCallback' in globalThis)) {
  (globalThis as Record<string, unknown>).requestIdleCallback = (cb: () => void) =>
    setTimeout(cb, 1) as unknown as number;
  (globalThis as Record<string, unknown>).cancelIdleCallback = (id: number) => clearTimeout(id);
}
