// jest-dom is optional in this workspace; keep tests runnable when it is absent.
try {
  // eslint-disable-next-line global-require
  require('@testing-library/jest-dom');
} catch {
  // Ignore missing optional test helpers.
}

if (typeof globalThis !== 'undefined') {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
}

if (typeof window !== 'undefined' && !window.IntersectionObserver) {
  window.IntersectionObserver = class IntersectionObserver {
    constructor(callback) {
      this.callback = callback;
    }

    observe(target) {
      this.callback([{ isIntersecting: true, target }]);
    }

    unobserve() {}

    disconnect() {}
  };
}

if (typeof window !== 'undefined' && !window.ResizeObserver) {
  window.ResizeObserver = class ResizeObserver {
    observe() {}

    unobserve() {}

    disconnect() {}
  };
}

if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = function matchMedia() {
    return {
      matches: false,
      media: '',
      onchange: null,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent() { return false; },
    };
  };
}

if (typeof window !== 'undefined' && !window.HTMLElement.prototype.scrollIntoView) {
  window.HTMLElement.prototype.scrollIntoView = function scrollIntoView() {};
}
