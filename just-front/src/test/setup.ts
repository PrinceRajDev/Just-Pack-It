import "@testing-library/jest-dom/vitest";

// No test may contact an unmocked API, including a configured Atlas-backed server.
globalThis.fetch = () => Promise.reject(new Error("Unmocked network request blocked in tests"));

Object.defineProperty(window, "scrollTo", {
  writable: true,
  value: () => {},
});

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});
